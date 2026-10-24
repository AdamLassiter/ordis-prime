#include "pairing.hpp"

#include <windows.h>
#include <tlhelp32.h>
#include <winhttp.h>

#include <algorithm>
#include <cctype>
#include <iostream>
#include <map>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
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

DWORD find_warframe_process() {
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
  throw std::runtime_error("Warframe is not running");
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

std::string json_message(const std::string& body) {
  static constexpr std::string_view key = "\"message\":\"";
  const auto start = body.find(key);
  if (start == std::string::npos) return {};
  const auto value_start = start + key.size();
  const auto end = body.find('"', value_start);
  return end == std::string::npos ? std::string{} : body.substr(value_start, end - value_start);
}
}  // namespace

int main() {
  try {
    std::cout << "Ordis Prime Updater\n"
                 "Paste the one-time pairing code from your Operator page:\n> ";
    std::string code;
    std::getline(std::cin, code);
    const auto pairing = parse_pairing_code(code);
    std::cout << "Locating Warframe and reading temporary credentials...\n";
    Handle process(OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
                               FALSE, find_warframe_process()));
    if (!process) throw std::runtime_error("Could not open the Warframe process");
    auto credentials = find_credentials(process.value);
    std::cout << "Downloading current inventory...\n";
    auto inventory_response = http_request(
        "GET", "https://mobile.warframe.com/api/inventory.php" + credentials);
    SecureZeroMemory(credentials.data(), credentials.size());
    if (inventory_response.status != 200)
      throw std::runtime_error("Warframe inventory request was rejected");
    const auto first_content = inventory_response.body.find_first_not_of(" \t\r\n");
    if (first_content == std::string::npos ||
        inventory_response.body[first_content] != '{')
      throw std::runtime_error("Warframe returned an invalid inventory response");
    std::cout << "Synchronizing with Ordis Prime...\n";
    const auto headers = L"Content-Type: application/json\r\nAuthorization: Bearer " +
                         widen(pairing.token) + L"\r\n";
    const auto result = http_request(
        "POST",
        pairing.origin +
            "/api/account/import/warframe-api-helper/sync",
        headers, inventory_response.body);
    SecureZeroMemory(inventory_response.body.data(), inventory_response.body.size());
    const auto message = json_message(result.body);
    if (result.status < 200 || result.status >= 300)
      throw std::runtime_error(message.empty() ? "Ordis Prime rejected the import"
                                               : message);
    std::cout << (message.empty() ? "Synchronization complete." : message)
              << "\nYou may close this window.\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "Updater failed: " << error.what() << '\n';
    return 1;
  }
}
