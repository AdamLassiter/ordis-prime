#include "pairing.hpp"
#include "scheduler.hpp"

#include <windows.h>
#include <bcrypt.h>
#include <shellapi.h>
#include <wincred.h>
#include <tlhelp32.h>
#include <winhttp.h>

#include <algorithm>
#include <array>
#include <cctype>
#include <chrono>
#include <atomic>
#include <ctime>
#include <iomanip>
#include <iostream>
#include <map>
#include <mutex>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>
#include <vector>

namespace {
struct Handle {
  HANDLE value = nullptr;
  Handle() = default;
  explicit Handle(HANDLE handle) : value(handle) {}
  Handle(const Handle&) = delete;
  Handle& operator=(const Handle&) = delete;
  Handle(Handle&& other) noexcept : value(other.value) { other.value = nullptr; }
  ~Handle() {
    if (value && value != INVALID_HANDLE_VALUE) CloseHandle(value);
  }
  explicit operator bool() const {
    return value && value != INVALID_HANDLE_VALUE;
  }
};

struct HttpHandle {
  HINTERNET value = nullptr;
  explicit HttpHandle(HINTERNET handle = nullptr) : value(handle) {}
  HttpHandle(const HttpHandle&) = delete;
  HttpHandle& operator=(const HttpHandle&) = delete;
  ~HttpHandle() {
    if (value) WinHttpCloseHandle(value);
  }
  explicit operator bool() const { return value != nullptr; }
};

struct HttpResponse {
  DWORD status = 0;
  std::string body;
};

struct SensitiveString {
  std::string value;
  SensitiveString() = default;
  explicit SensitiveString(std::string next) : value(std::move(next)) {}
  SensitiveString(const SensitiveString&) = delete;
  SensitiveString& operator=(const SensitiveString&) = delete;
  ~SensitiveString() {
    if (!value.empty()) SecureZeroMemory(value.data(), value.size());
  }
};

struct DeviceCredential {
  std::string origin;
  std::string device_id;
  std::string token;
  std::string pending_token;
  std::string pending_request_id;
  std::int64_t last_success = 0;
};

std::wstring widen(std::string_view value) {
  if (value.empty()) return {};
  const int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS,
                                         value.data(),
                                         static_cast<int>(value.size()),
                                         nullptr, 0);
  if (!length) throw std::runtime_error("Text was not valid UTF-8");
  std::wstring result(static_cast<size_t>(length), L'\0');
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
                      static_cast<int>(value.size()), result.data(), length);
  return result;
}

std::string narrow(std::wstring_view value) {
  if (value.empty()) return {};
  const int length = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS,
                                         value.data(),
                                         static_cast<int>(value.size()),
                                         nullptr, 0, nullptr, nullptr);
  if (!length) throw std::runtime_error("Text could not be encoded as UTF-8");
  std::string result(static_cast<size_t>(length), '\0');
  WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(),
                      static_cast<int>(value.size()), result.data(), length,
                      nullptr, nullptr);
  return result;
}

std::optional<DWORD> locate_warframe_process() {
  Handle snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0));
  if (!snapshot) throw std::runtime_error("Could not enumerate processes");
  PROCESSENTRY32W entry{};
  entry.dwSize = sizeof(entry);
  if (!Process32FirstW(snapshot.value, &entry))
    throw std::runtime_error("Could not enumerate processes");
  do {
    if (_wcsicmp(entry.szExeFile, L"Warframe.x64.exe") == 0 ||
        _wcsicmp(entry.szExeFile, L"Warframe.x64.ex") == 0)
      return entry.th32ProcessID;
  } while (Process32NextW(snapshot.value, &entry));
  return std::nullopt;
}

DWORD find_warframe_process() {
  const auto process = locate_warframe_process();
  if (!process) throw std::runtime_error("Warframe is not running");
  return *process;
}

bool readable(DWORD protection) {
  if (protection & (PAGE_GUARD | PAGE_NOACCESS)) return false;
  const auto base = protection & 0xffU;
  return base == PAGE_READONLY || base == PAGE_READWRITE ||
         base == PAGE_WRITECOPY || base == PAGE_EXECUTE_READ ||
         base == PAGE_EXECUTE_READWRITE || base == PAGE_EXECUTE_WRITECOPY;
}

std::optional<std::string> credential_at(std::string_view bytes, size_t start) {
  static constexpr std::string_view marker = "?accountId=";
  constexpr size_t account_length = 24;
  const size_t account_start = start + marker.size();
  const size_t nonce_marker = account_start + account_length;
  if (nonce_marker + 7 >= bytes.size() ||
      bytes.substr(nonce_marker, 7) != "&nonce=")
    return std::nullopt;
  const auto account = bytes.substr(account_start, account_length);
  if (!std::all_of(account.begin(), account.end(), [](char character) {
        return std::isalnum(static_cast<unsigned char>(character));
      }))
    return std::nullopt;
  size_t end = nonce_marker + 7;
  while (end < bytes.size() &&
         std::isdigit(static_cast<unsigned char>(bytes[end])))
    ++end;
  if (end == nonce_marker + 7) return std::nullopt;
  return std::string(bytes.substr(start, end - start));
}

std::string find_credentials(HANDLE process) {
  SYSTEM_INFO system{};
  GetSystemInfo(&system);
  auto address = reinterpret_cast<uintptr_t>(system.lpMinimumApplicationAddress);
  const auto maximum =
      reinterpret_cast<uintptr_t>(system.lpMaximumApplicationAddress);
  constexpr SIZE_T chunk_size = 1024 * 1024;
  constexpr size_t overlap_size = 128;
  static constexpr std::string_view marker = "?accountId=";
  std::map<std::string, unsigned int> candidates;
  while (address < maximum) {
    MEMORY_BASIC_INFORMATION region{};
    if (!VirtualQueryEx(process, reinterpret_cast<LPCVOID>(address), &region,
                        sizeof(region)))
      break;
    const auto region_start = reinterpret_cast<uintptr_t>(region.BaseAddress);
    const auto region_size = region.RegionSize;
    if (region.State == MEM_COMMIT && readable(region.Protect)) {
      std::string carry;
      for (SIZE_T offset = 0; offset < region_size; offset += chunk_size) {
        const SIZE_T requested = std::min(chunk_size, region_size - offset);
        std::vector<char> buffer(requested);
        SIZE_T received = 0;
        ReadProcessMemory(process,
                          reinterpret_cast<LPCVOID>(region_start + offset),
                          buffer.data(), requested, &received);
        if (!received) {
          carry.clear();
          continue;
        }
        std::string searchable = carry;
        searchable.append(buffer.data(), received);
        size_t position = 0;
        while ((position = searchable.find(marker, position)) !=
               std::string::npos) {
          if (auto candidate = credential_at(searchable, position)) {
            auto& count = candidates[*candidate];
            if (++count >= 3) return *candidate;
          }
          position += marker.size();
        }
        carry = searchable.substr(
            searchable.size() > overlap_size
                ? searchable.size() - overlap_size
                : 0);
      }
    }
    const auto next = region_start + region_size;
    if (next <= address) break;
    address = next;
  }
  throw std::runtime_error(
      "Could not find live credentials. Log in or pass through a loading screen and retry");
}

HttpResponse http_request(const std::string& method, const std::string& url,
                          const std::wstring& extra_headers = {},
                          const std::string& body = {}) {
  const auto wide_url = widen(url);
  URL_COMPONENTS components{};
  components.dwStructSize = sizeof(components);
  components.dwSchemeLength = static_cast<DWORD>(-1);
  components.dwHostNameLength = static_cast<DWORD>(-1);
  components.dwUrlPathLength = static_cast<DWORD>(-1);
  components.dwExtraInfoLength = static_cast<DWORD>(-1);
  if (!WinHttpCrackUrl(wide_url.c_str(), 0, 0, &components))
    throw std::runtime_error("Request URL is invalid");
  const std::wstring host(components.lpszHostName, components.dwHostNameLength);
  const bool secure = components.nScheme == INTERNET_SCHEME_HTTPS;
  if (!secure &&
      (components.nScheme != INTERNET_SCHEME_HTTP ||
       _wcsicmp(host.c_str(), L"localhost") != 0))
    throw std::runtime_error("Request URL must use HTTPS");
  std::wstring path(components.lpszUrlPath, components.dwUrlPathLength);
  if (components.dwExtraInfoLength)
    path.append(components.lpszExtraInfo, components.dwExtraInfoLength);
  HttpHandle session(WinHttpOpen(
      L"OrdisPrimeUpdater/0.1", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
      WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0));
  if (!session) throw std::runtime_error("Could not initialize HTTPS");
  WinHttpSetTimeouts(session.value, 10'000, 10'000, 30'000, 30'000);
  HttpHandle connection(
      WinHttpConnect(session.value, host.c_str(), components.nPort, 0));
  if (!connection) throw std::runtime_error("Could not connect to server");
  HttpHandle request(WinHttpOpenRequest(
      connection.value, widen(method).c_str(), path.c_str(), nullptr,
      WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES,
      secure ? WINHTTP_FLAG_SECURE : 0));
  if (!request) throw std::runtime_error("Could not create HTTPS request");
  DWORD redirect_policy = WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
  if (!WinHttpSetOption(request.value, WINHTTP_OPTION_REDIRECT_POLICY,
                        &redirect_policy, sizeof(redirect_policy)))
    throw std::runtime_error("Could not secure HTTPS redirect handling");
  const auto headers = extra_headers.empty() ? WINHTTP_NO_ADDITIONAL_HEADERS
                                              : extra_headers.c_str();
  const auto header_length = extra_headers.empty()
                                 ? 0U
                                 : static_cast<DWORD>(extra_headers.size());
  auto* request_body = body.empty()
                           ? WINHTTP_NO_REQUEST_DATA
                           : const_cast<char*>(body.data());
  if (!WinHttpSendRequest(request.value, headers, header_length, request_body,
                          static_cast<DWORD>(body.size()),
                          static_cast<DWORD>(body.size()), 0) ||
      !WinHttpReceiveResponse(request.value, nullptr))
    throw std::runtime_error("HTTPS request failed");
  DWORD status = 0;
  DWORD status_size = sizeof(status);
  WinHttpQueryHeaders(request.value,
                      WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                      WINHTTP_HEADER_NAME_BY_INDEX, &status, &status_size,
                      WINHTTP_NO_HEADER_INDEX);
  std::string response;
  while (true) {
    DWORD available = 0;
    if (!WinHttpQueryDataAvailable(request.value, &available))
      throw std::runtime_error("Could not read HTTPS response");
    if (!available) break;
    if (response.size() + available > 12 * 1024 * 1024)
      throw std::runtime_error("HTTPS response was too large");
    const auto offset = response.size();
    response.resize(offset + available);
    DWORD received = 0;
    if (!WinHttpReadData(request.value, response.data() + offset, available,
                         &received))
      throw std::runtime_error("Could not read HTTPS response");
    response.resize(offset + received);
  }
  return {status, std::move(response)};
}

std::string random_base64url_token() {
  static constexpr char alphabet[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  std::array<unsigned char, 32> bytes{};
  if (BCryptGenRandom(nullptr, bytes.data(), static_cast<ULONG>(bytes.size()),
                      BCRYPT_USE_SYSTEM_PREFERRED_RNG) != 0)
    throw std::runtime_error("Could not create a secure device credential");
  std::string result;
  result.reserve(43);
  unsigned int accumulator = 0;
  int bits = 0;
  for (const auto byte : bytes) {
    accumulator = (accumulator << 8U) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      result.push_back(alphabet[(accumulator >> bits) & 0x3fU]);
    }
  }
  if (bits > 0) result.push_back(alphabet[(accumulator << (6 - bits)) & 0x3fU]);
  SecureZeroMemory(bytes.data(), bytes.size());
  return result;
}

std::string random_request_id() {
  std::array<unsigned char, 16> bytes{};
  if (BCryptGenRandom(nullptr, bytes.data(), static_cast<ULONG>(bytes.size()),
                      BCRYPT_USE_SYSTEM_PREFERRED_RNG) != 0)
    throw std::runtime_error("Could not create a request identifier");
  bytes[6] = static_cast<unsigned char>((bytes[6] & 0x0fU) | 0x40U);
  bytes[8] = static_cast<unsigned char>((bytes[8] & 0x3fU) | 0x80U);
  std::ostringstream stream;
  stream << std::hex << std::setfill('0');
  for (size_t index = 0; index < bytes.size(); ++index) {
    if (index == 4 || index == 6 || index == 8 || index == 10) stream << '-';
    stream << std::setw(2) << static_cast<unsigned int>(bytes[index]);
  }
  return stream.str();
}

constexpr wchar_t credential_target[] = L"OrdisPrimeUpdater.Device.v1";

std::string serialize_credential(const DeviceCredential& credential) {
  return credential.origin + "\n" + credential.device_id + "\n" +
         credential.token + "\n" + credential.pending_token + "\n" +
         credential.pending_request_id + "\n" +
         std::to_string(credential.last_success);
}

void save_credential(const DeviceCredential& credential) {
  auto serialized = serialize_credential(credential);
  CREDENTIALW value{};
  value.Type = CRED_TYPE_GENERIC;
  value.TargetName = const_cast<wchar_t*>(credential_target);
  value.Persist = CRED_PERSIST_LOCAL_MACHINE;
  value.CredentialBlobSize = static_cast<DWORD>(serialized.size());
  value.CredentialBlob = reinterpret_cast<LPBYTE>(serialized.data());
  value.UserName = const_cast<wchar_t*>(L"Ordis Prime inventory sync");
  if (!CredWriteW(&value, 0)) {
    SecureZeroMemory(serialized.data(), serialized.size());
    throw std::runtime_error("Could not store the device credential in Windows Credential Manager");
  }
  SecureZeroMemory(serialized.data(), serialized.size());
}

std::optional<DeviceCredential> load_credential() {
  PCREDENTIALW stored = nullptr;
  if (!CredReadW(credential_target, CRED_TYPE_GENERIC, 0, &stored)) {
    if (GetLastError() == ERROR_NOT_FOUND) return std::nullopt;
    throw std::runtime_error("Could not read Windows Credential Manager");
  }
  std::string serialized(
      reinterpret_cast<const char*>(stored->CredentialBlob),
      stored->CredentialBlobSize);
  CredFree(stored);
  std::vector<std::string> fields;
  size_t start = 0;
  while (fields.size() < 5) {
    const auto end = serialized.find('\n', start);
    if (end == std::string::npos) break;
    fields.push_back(serialized.substr(start, end - start));
    start = end + 1;
  }
  fields.push_back(serialized.substr(start));
  SecureZeroMemory(serialized.data(), serialized.size());
  if (fields.size() != 6 || fields[0].empty() || fields[1].empty() ||
      fields[2].size() != 43)
    throw std::runtime_error("The stored updater credential is invalid");
  DeviceCredential result{std::move(fields[0]), std::move(fields[1]),
                          std::move(fields[2]), std::move(fields[3]),
                          std::move(fields[4])};
  try {
    result.last_success = std::stoll(fields[5]);
  } catch (...) {
    result.last_success = 0;
  }
  return result;
}

void delete_credential() {
  if (!CredDeleteW(credential_target, CRED_TYPE_GENERIC, 0) &&
      GetLastError() != ERROR_NOT_FOUND)
    throw std::runtime_error("Could not remove the Windows device credential");
}

std::string json_string(const std::string& body, std::string_view name) {
  const auto key = "\"" + std::string(name) + "\":\"";
  const auto start = body.find(key);
  if (start == std::string::npos) return {};
  const auto value_start = start + key.size();
  const auto end = body.find('"', value_start);
  return end == std::string::npos ? std::string{}
                                  : body.substr(value_start, end - value_start);
}

std::string json_message(const std::string& body) {
  return json_string(body, "message");
}

std::string default_device_name() {
  std::array<wchar_t, MAX_COMPUTERNAME_LENGTH + 1> name{};
  DWORD length = static_cast<DWORD>(name.size());
  if (GetComputerNameW(name.data(), &length))
    return narrow(std::wstring_view(name.data(), length));
  return "Windows PC";
}

struct SyncOutcome {
  std::string message;
  std::int64_t succeeded_at;
};

SyncOutcome synchronize(DeviceCredential& device) {
  if (device.pending_token.empty()) {
    device.pending_token = random_base64url_token();
    device.pending_request_id = random_request_id();
    save_credential(device);
  }
  Handle process(OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
                             FALSE, find_warframe_process()));
  if (!process) throw std::runtime_error("Could not open the Warframe process");
  SensitiveString game_credentials(find_credentials(process.value));
  auto inventory_response = http_request(
      "GET", "https://mobile.warframe.com/api/inventory.php" +
                 game_credentials.value);
  if (inventory_response.status != 200)
    throw std::runtime_error("Warframe inventory request was rejected");
  const auto first_content =
      inventory_response.body.find_first_not_of(" \t\r\n");
  if (first_content == std::string::npos ||
      inventory_response.body[first_content] != '{')
    throw std::runtime_error("Warframe returned an invalid inventory response");
  const auto headers =
      L"Content-Type: application/json\r\nAuthorization: Bearer " +
      widen(device.token) + L"\r\nX-Ordis-Device-Id: " +
      widen(device.device_id) + L"\r\nX-Ordis-Next-Token: " +
      widen(device.pending_token) + L"\r\nX-Ordis-Request-Id: " +
      widen(device.pending_request_id) + L"\r\n";
  const auto result = http_request(
      "POST",
      device.origin + "/api/account/import/warframe-api-helper/sync", headers,
      inventory_response.body);
  SecureZeroMemory(inventory_response.body.data(),
                   inventory_response.body.size());
  const auto message = json_message(result.body);
  if (result.status == 401) {
    delete_credential();
    throw std::runtime_error(
        message.empty() ? "This updater device was revoked" : message);
  }
  if (result.status < 200 || result.status >= 300)
    throw std::runtime_error(message.empty()
                                 ? "Ordis Prime rejected the synchronization"
                                 : message);
  SecureZeroMemory(device.token.data(), device.token.size());
  device.token = std::move(device.pending_token);
  device.pending_token.clear();
  device.pending_request_id.clear();
  device.last_success = static_cast<std::int64_t>(std::time(nullptr));
  save_credential(device);
  return {message.empty() ? "Synchronization complete." : message,
          device.last_success};
}

std::pair<DeviceCredential, SyncOutcome> pair_and_synchronize(
    const Pairing& pairing, const std::string& device_name) {
  if (device_name.empty() || device_name.size() > 80 ||
      device_name.find_first_of("\r\n") != std::string::npos)
    throw std::runtime_error("Device name must be 1 to 80 characters");
  Handle process(OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
                             FALSE, find_warframe_process()));
  if (!process) throw std::runtime_error("Could not open the Warframe process");
  SensitiveString game_credentials(find_credentials(process.value));
  auto inventory_response = http_request(
      "GET", "https://mobile.warframe.com/api/inventory.php" +
                 game_credentials.value);
  if (inventory_response.status != 200)
    throw std::runtime_error("Warframe inventory request was rejected");
  auto next_token = random_base64url_token();
  const auto request_id = random_request_id();
  const auto headers =
      L"Content-Type: application/json\r\nAuthorization: Bearer " +
      widen(pairing.token) + L"\r\nX-Ordis-Next-Token: " +
      widen(next_token) + L"\r\nX-Ordis-Request-Id: " + widen(request_id) +
      L"\r\nX-Ordis-Device-Name: " + widen(device_name) + L"\r\n";
  const auto result = http_request(
      "POST",
      pairing.origin + "/api/account/import/warframe-api-helper/sync",
      headers, inventory_response.body);
  SecureZeroMemory(inventory_response.body.data(),
                   inventory_response.body.size());
  const auto message = json_message(result.body);
  if (result.status < 200 || result.status >= 300)
    throw std::runtime_error(message.empty() ? "Ordis Prime rejected the pairing"
                                             : message);
  const auto device_id = json_string(result.body, "deviceId");
  if (device_id.empty())
    throw std::runtime_error("Ordis Prime returned an invalid device record");
  DeviceCredential device{pairing.origin, device_id, std::move(next_token),
                          {}, {}, 0};
  device.last_success = static_cast<std::int64_t>(std::time(nullptr));
  save_credential(device);
  return {std::move(device),
          {message.empty() ? "Synchronization complete." : message,
           static_cast<std::int64_t>(std::time(nullptr))}};
}

std::wstring executable_path() {
  std::vector<wchar_t> path(32768);
  const auto length = GetModuleFileNameW(nullptr, path.data(),
                                         static_cast<DWORD>(path.size()));
  if (!length || length >= path.size())
    throw std::runtime_error("Could not locate the updater executable");
  return std::wstring(path.data(), length);
}

constexpr wchar_t startup_key[] =
    L"Software\\Microsoft\\Windows\\CurrentVersion\\Run";
constexpr wchar_t startup_value[] = L"Ordis Prime Updater";

bool startup_enabled() {
  HKEY key = nullptr;
  if (RegOpenKeyExW(HKEY_CURRENT_USER, startup_key, 0, KEY_QUERY_VALUE, &key) !=
      ERROR_SUCCESS)
    return false;
  const auto status = RegQueryValueExW(key, startup_value, nullptr, nullptr,
                                       nullptr, nullptr);
  RegCloseKey(key);
  return status == ERROR_SUCCESS;
}

void set_startup_enabled(bool enabled) {
  HKEY key = nullptr;
  if (RegCreateKeyExW(HKEY_CURRENT_USER, startup_key, 0, nullptr, 0,
                      KEY_SET_VALUE, nullptr, &key, nullptr) != ERROR_SUCCESS)
    throw std::runtime_error("Could not update Windows sign-in startup");
  LONG status = ERROR_SUCCESS;
  if (enabled) {
    const auto command = L"\"" + executable_path() + L"\" --tray";
    status = RegSetValueExW(
        key, startup_value, 0, REG_SZ,
        reinterpret_cast<const BYTE*>(command.c_str()),
        static_cast<DWORD>((command.size() + 1) * sizeof(wchar_t)));
  } else {
    status = RegDeleteValueW(key, startup_value);
    if (status == ERROR_FILE_NOT_FOUND) status = ERROR_SUCCESS;
  }
  RegCloseKey(key);
  if (status != ERROR_SUCCESS)
    throw std::runtime_error("Could not update Windows sign-in startup");
}

std::string bounded_error(std::string value) {
  std::replace(value.begin(), value.end(), '\r', ' ');
  std::replace(value.begin(), value.end(), '\n', ' ');
  if (value.size() > 160) value.resize(160);
  return value;
}

std::wstring format_time(std::int64_t timestamp) {
  if (!timestamp) return L"Never";
  const auto value = static_cast<std::time_t>(timestamp);
  std::tm local{};
  localtime_s(&local, &value);
  std::wostringstream stream;
  stream << std::put_time(&local, L"%Y-%m-%d %H:%M");
  return stream.str();
}

class TrayApp {
 public:
  int run() {
    instance_ = this;
    if (const auto credential = load_credential()) {
      last_success_ = credential->last_success;
      const auto now = static_cast<std::int64_t>(std::time(nullptr));
      if (last_success_ && now - last_success_ < 60 * 60) {
        try {
          if (locate_warframe_process()) {
            static_cast<void>(
                schedule_.observe_process(true, SyncSchedule::Clock::now()));
            schedule_.mark_sync_attempt(SyncSchedule::Clock::now());
          }
        } catch (...) {
          // The first scheduled probe will report an enumeration failure.
        }
      }
    }
    WNDCLASSW window_class{};
    window_class.lpfnWndProc = window_proc;
    window_class.hInstance = GetModuleHandleW(nullptr);
    window_class.lpszClassName = L"OrdisPrimeUpdaterTray";
    if (!RegisterClassW(&window_class) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS)
      throw std::runtime_error("Could not initialize the system tray window");
    window_ = CreateWindowExW(0, window_class.lpszClassName,
                              L"Ordis Prime Updater", 0, 0, 0, 0, 0,
                              nullptr, nullptr, window_class.hInstance, nullptr);
    if (!window_) throw std::runtime_error("Could not create the system tray window");
    icon_.cbSize = sizeof(icon_);
    icon_.hWnd = window_;
    icon_.uID = 1;
    icon_.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    icon_.uCallbackMessage = WM_APP + 1;
    icon_.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
    update_tooltip();
    if (!Shell_NotifyIconW(NIM_ADD, &icon_))
      throw std::runtime_error("Could not add the system tray icon");
    SetTimer(window_, 1, 60'000, nullptr);
    PostMessageW(window_, WM_TIMER, 1, 0);
    MSG message{};
    while (GetMessageW(&message, nullptr, 0, 0) > 0) {
      TranslateMessage(&message);
      DispatchMessageW(&message);
    }
    if (worker_.joinable()) worker_.join();
    return 0;
  }

 private:
  static constexpr UINT sync_complete_message = WM_APP + 2;
  static constexpr UINT command_sync = 1001;
  static constexpr UINT command_startup = 1002;
  static constexpr UINT command_exit = 1003;
  inline static TrayApp* instance_ = nullptr;
  HWND window_ = nullptr;
  NOTIFYICONDATAW icon_{};
  SyncSchedule schedule_{};
  std::thread worker_;
  std::mutex result_mutex_;
  std::atomic<bool> busy_{false};
  std::string state_ = "Waiting for Warframe";
  std::string error_;
  std::int64_t last_success_ = 0;

  static LRESULT CALLBACK window_proc(HWND window, UINT message, WPARAM wparam,
                                      LPARAM lparam) {
    return instance_ ? instance_->handle_message(window, message, wparam, lparam)
                     : DefWindowProcW(window, message, wparam, lparam);
  }

  LRESULT handle_message(HWND window, UINT message, WPARAM wparam,
                         LPARAM lparam) {
    if (message == WM_TIMER && wparam == 1) {
      automatic_tick();
      return 0;
    }
    if (message == icon_.uCallbackMessage &&
        (lparam == WM_RBUTTONUP || lparam == WM_LBUTTONUP)) {
      show_menu();
      return 0;
    }
    if (message == WM_COMMAND) {
      if (LOWORD(wparam) == command_sync) start_sync();
      if (LOWORD(wparam) == command_startup) {
        try {
          set_startup_enabled(!startup_enabled());
        } catch (const std::exception& exception) {
          set_error(exception.what());
        }
      }
      if (LOWORD(wparam) == command_exit) {
        Shell_NotifyIconW(NIM_DELETE, &icon_);
        KillTimer(window_, 1);
        if (worker_.joinable()) worker_.join();
        DestroyWindow(window_);
      }
      return 0;
    }
    if (message == sync_complete_message) {
      if (worker_.joinable()) worker_.join();
      update_tooltip();
      return 0;
    }
    if (message == WM_DESTROY) {
      PostQuitMessage(0);
      return 0;
    }
    return DefWindowProcW(window, message, wparam, lparam);
  }

  void automatic_tick() {
    if (busy_ || !schedule_.process_probe_due(SyncSchedule::Clock::now()))
      return;
    try {
      const bool running = locate_warframe_process().has_value();
      if (schedule_.observe_process(running, SyncSchedule::Clock::now()))
        start_sync();
      else {
        state_ = running ? "Warframe detected; next hourly sync pending"
                         : "Waiting for Warframe";
        update_tooltip();
      }
    } catch (const std::exception& exception) {
      set_error(exception.what());
    }
  }

  void start_sync() {
    if (busy_.exchange(true)) return;
    if (worker_.joinable()) worker_.join();
    schedule_.mark_sync_attempt(SyncSchedule::Clock::now());
    state_ = "Synchronizing inventory";
    error_.clear();
    update_tooltip();
    worker_ = std::thread([this] {
      try {
        auto credential = load_credential();
        if (!credential)
          throw std::runtime_error(
              "No paired device credential; pair again on the Operator page");
        const auto result = synchronize(*credential);
        std::lock_guard lock(result_mutex_);
        last_success_ = result.succeeded_at;
        state_ = "Last synchronization succeeded";
        error_.clear();
      } catch (const std::exception& exception) {
        std::lock_guard lock(result_mutex_);
        state_ = "Synchronization failed; waiting to retry";
        error_ = bounded_error(exception.what());
      }
      busy_ = false;
      PostMessageW(window_, sync_complete_message, 0, 0);
    });
  }

  void set_error(const std::string& error) {
    state_ = "Updater error";
    error_ = bounded_error(error);
    update_tooltip();
  }

  void update_tooltip() {
    std::lock_guard lock(result_mutex_);
    std::wstring text = L"Ordis Prime: " + widen(state_);
    if (!error_.empty()) text += L" - " + widen(error_);
    if (text.size() >= std::size(icon_.szTip))
      text.resize(std::size(icon_.szTip) - 1);
    std::wmemset(icon_.szTip, 0, std::size(icon_.szTip));
    std::wmemcpy(icon_.szTip, text.data(), text.size());
    if (window_) Shell_NotifyIconW(NIM_MODIFY, &icon_);
  }

  void show_menu() {
    POINT cursor{};
    GetCursorPos(&cursor);
    HMENU menu = CreatePopupMenu();
    std::string state_value;
    std::string error_value;
    std::int64_t success_value = 0;
    {
      std::lock_guard lock(result_mutex_);
      state_value = state_;
      error_value = error_;
      success_value = last_success_;
    }
    const auto state = L"State: " + widen(state_value);
    const auto success = L"Last success: " + format_time(success_value);
    AppendMenuW(menu, MF_STRING | MF_GRAYED, 0, state.c_str());
    AppendMenuW(menu, MF_STRING | MF_GRAYED, 0, success.c_str());
    if (!error_value.empty()) {
      const auto error = L"Last error: " + widen(error_value);
      AppendMenuW(menu, MF_STRING | MF_GRAYED, 0, error.c_str());
    }
    AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(menu, MF_STRING | (busy_ ? MF_GRAYED : 0), command_sync,
                L"Sync now");
    AppendMenuW(menu,
                MF_STRING | (startup_enabled() ? MF_CHECKED : MF_UNCHECKED),
                command_startup, L"Launch at Windows sign-in");
    AppendMenuW(menu, MF_STRING, command_exit, L"Exit");
    SetForegroundWindow(window_);
    TrackPopupMenu(menu, TPM_RIGHTBUTTON, cursor.x, cursor.y, 0, window_,
                   nullptr);
    DestroyMenu(menu);
  }
};

bool affirmative(const std::string& value) {
  return !value.empty() && (value[0] == 'y' || value[0] == 'Y');
}
}  // namespace

int main(int argc, char** argv) {
  try {
    Handle single_instance(
        CreateMutexW(nullptr, FALSE, L"Local\\OrdisPrimeUpdater.v1"));
    if (!single_instance)
      throw std::runtime_error("Could not create the updater process lock");
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
      MessageBoxW(nullptr, L"Ordis Prime Updater is already running.",
                  L"Ordis Prime Updater", MB_OK | MB_ICONINFORMATION);
      return 0;
    }
    if (argc > 1 && std::string_view(argv[1]) == "--tray") {
      ShowWindow(GetConsoleWindow(), SW_HIDE);
      if (!load_credential()) {
        MessageBoxW(nullptr,
                    L"No paired updater device was found. Run the updater "
                    L"normally and pair it from the Operator page first.",
                    L"Ordis Prime Updater", MB_OK | MB_ICONERROR);
        return 1;
      }
      return TrayApp{}.run();
    }
    std::cout << "Ordis Prime Updater\n";
    auto device = load_credential();
    SyncOutcome outcome;
    if (device) {
      std::cout << "Using the device credential stored in Windows Credential Manager.\n";
      outcome = synchronize(*device);
    } else {
      std::cout << "Paste the one-time pairing code from your Operator page:\n> ";
      std::string code;
      std::getline(std::cin, code);
      const auto pairing = parse_pairing_code(code);
      const auto suggested_name = default_device_name();
      std::cout << "Device name [" << suggested_name << "]:\n> ";
      std::string device_name;
      std::getline(std::cin, device_name);
      if (device_name.empty()) device_name = suggested_name;
      std::cout << "Locating Warframe and synchronizing inventory...\n";
      auto paired = pair_and_synchronize(pairing, device_name);
      device = std::move(paired.first);
      outcome = std::move(paired.second);
    }
    std::cout << outcome.message
              << "\nKeep the updater running in the system tray? [y/N]\n> ";
    std::string tray;
    std::getline(std::cin, tray);
    if (!affirmative(tray)) return 0;
    std::cout << "Launch the tray updater when you sign in to Windows? [y/N]\n> ";
    std::string startup;
    std::getline(std::cin, startup);
    set_startup_enabled(affirmative(startup));
    ShowWindow(GetConsoleWindow(), SW_HIDE);
    return TrayApp{}.run();
  } catch (const std::exception& error) {
    std::cerr << "Updater failed: " << error.what() << '\n';
    return 1;
  }
}
