#include "updater.hpp"
#include "windows_support.hpp"

#include <bcrypt.h>
#include <wincred.h>

#include <array>
#include <vector>

namespace {
constexpr wchar_t credential_target[] = L"OrdisPrimeUpdater.Device.v1";
constexpr wchar_t startup_key[] =
    L"Software\\Microsoft\\Windows\\CurrentVersion\\Run";
constexpr wchar_t startup_value[] = L"Ordis Prime Updater";
HANDLE instance_mutex = nullptr;

std::wstring executable_path() {
  std::vector<wchar_t> path(32768);
  const auto length =
      GetModuleFileNameW(nullptr, path.data(), static_cast<DWORD>(path.size()));
  if (!length || length >= path.size())
    throw std::runtime_error("Could not locate the updater executable");
  return std::wstring(path.data(), length);
}
} // namespace

void platform_secure_random(std::span<unsigned char> bytes) {
  if (BCryptGenRandom(nullptr, bytes.data(), static_cast<ULONG>(bytes.size()),
                      BCRYPT_USE_SYSTEM_PREFERRED_RNG) != 0)
    throw std::runtime_error("Could not create secure random data");
}

void save_credential(const DeviceCredential &credential) {
  auto serialized = serialize_credential(credential);
  CREDENTIALW value{};
  value.Type = CRED_TYPE_GENERIC;
  value.TargetName = const_cast<wchar_t *>(credential_target);
  value.Persist = CRED_PERSIST_LOCAL_MACHINE;
  value.CredentialBlobSize = static_cast<DWORD>(serialized.size());
  value.CredentialBlob = reinterpret_cast<LPBYTE>(serialized.data());
  value.UserName = const_cast<wchar_t *>(L"Ordis Prime inventory sync");
  if (!CredWriteW(&value, 0)) {
    secure_clear(serialized);
    throw std::runtime_error(
        "Could not store the device credential in Windows Credential Manager");
  }
  secure_clear(serialized);
}

std::optional<DeviceCredential> load_credential() {
  PCREDENTIALW stored = nullptr;
  if (!CredReadW(credential_target, CRED_TYPE_GENERIC, 0, &stored)) {
    if (GetLastError() == ERROR_NOT_FOUND)
      return std::nullopt;
    throw std::runtime_error("Could not read Windows Credential Manager");
  }
  std::string serialized(reinterpret_cast<const char *>(stored->CredentialBlob),
                         stored->CredentialBlobSize);
  CredFree(stored);
  return deserialize_credential(std::move(serialized));
}

void delete_credential() {
  if (!CredDeleteW(credential_target, CRED_TYPE_GENERIC, 0) &&
      GetLastError() != ERROR_NOT_FOUND)
    throw std::runtime_error("Could not remove the Windows device credential");
}

std::string default_device_name() {
  std::array<wchar_t, MAX_COMPUTERNAME_LENGTH + 1> name{};
  DWORD length = static_cast<DWORD>(name.size());
  if (GetComputerNameW(name.data(), &length))
    return narrow(std::wstring_view(name.data(), length));
  return "Windows PC";
}

bool startup_enabled() {
  HKEY key = nullptr;
  if (RegOpenKeyExW(HKEY_CURRENT_USER, startup_key, 0, KEY_QUERY_VALUE, &key) !=
      ERROR_SUCCESS)
    return false;
  const auto status =
      RegQueryValueExW(key, startup_value, nullptr, nullptr, nullptr, nullptr);
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
        reinterpret_cast<const BYTE *>(command.c_str()),
        static_cast<DWORD>((command.size() + 1) * sizeof(wchar_t)));
  } else {
    status = RegDeleteValueW(key, startup_value);
    if (status == ERROR_FILE_NOT_FOUND)
      status = ERROR_SUCCESS;
  }
  RegCloseKey(key);
  if (status != ERROR_SUCCESS)
    throw std::runtime_error("Could not update Windows sign-in startup");
}

bool acquire_single_instance() {
  instance_mutex = CreateMutexW(nullptr, FALSE, L"Local\\OrdisPrimeUpdater.v1");
  if (!instance_mutex)
    throw std::runtime_error("Could not create the updater process lock");
  return GetLastError() != ERROR_ALREADY_EXISTS;
}

void show_already_running() {
  MessageBoxW(nullptr, L"Ordis Prime Updater is already running.",
              L"Ordis Prime Updater", MB_OK | MB_ICONINFORMATION);
}

void show_missing_credential() {
  MessageBoxW(nullptr,
              L"No paired updater device was found. Run the updater normally "
              L"and pair it from the Operator page first.",
              L"Ordis Prime Updater", MB_OK | MB_ICONERROR);
}

void enter_tray_mode() { ShowWindow(GetConsoleWindow(), SW_HIDE); }
