#include "updater.hpp"

#include <fcntl.h>
#include <sys/file.h>
#include <sys/random.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

#include <array>
#include <cerrno>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <vector>

namespace {
int instance_lock = -1;

std::filesystem::path home_directory() {
  const char *home = std::getenv("HOME");
  if (!home || !*home)
    throw std::runtime_error("HOME is required to store updater state");
  return home;
}

std::filesystem::path state_directory() {
  const char *configured = std::getenv("XDG_STATE_HOME");
  return configured && *configured
             ? std::filesystem::path(configured) / "ordis-prime-updater"
             : home_directory() / ".local/state/ordis-prime-updater";
}

std::filesystem::path credential_path() {
  return state_directory() / "device-v1";
}

std::filesystem::path autostart_path() {
  const char *configured = std::getenv("XDG_CONFIG_HOME");
  const auto config = configured && *configured
                          ? std::filesystem::path(configured)
                          : home_directory() / ".config";
  return config / "autostart/ordis-prime-updater.desktop";
}

std::filesystem::path executable_path() {
  std::vector<char> path(4096);
  const auto length = readlink("/proc/self/exe", path.data(), path.size());
  if (length <= 0 || static_cast<size_t>(length) == path.size())
    throw std::runtime_error("Could not locate the updater executable");
  return std::string(path.data(), static_cast<size_t>(length));
}

std::string desktop_quote(const std::string &value) {
  std::string result = "\"";
  for (const char character : value) {
    if (character == '\\' || character == '"' || character == '`' ||
        character == '$')
      result.push_back('\\');
    result.push_back(character);
  }
  return result + "\"";
}

void write_all(int file, std::string_view bytes) {
  size_t offset = 0;
  while (offset < bytes.size()) {
    const auto written =
        write(file, bytes.data() + offset, bytes.size() - offset);
    if (written < 0) {
      if (errno == EINTR)
        continue;
      throw std::runtime_error("Could not write updater state");
    }
    offset += static_cast<size_t>(written);
  }
}

void atomic_write(const std::filesystem::path &path, std::string_view bytes,
                  mode_t mode) {
  std::filesystem::create_directories(path.parent_path());
  const auto temporary = path.string() + ".tmp-" + std::to_string(getpid());
  const int file =
      open(temporary.c_str(),
           O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW, mode);
  if (file < 0)
    throw std::runtime_error("Could not create updater state");
  bool closed = false;
  try {
    write_all(file, bytes);
    if (fsync(file) != 0)
      throw std::runtime_error("Could not save updater state");
    const int close_status = close(file);
    closed = true;
    if (close_status != 0)
      throw std::runtime_error("Could not close updater state");
    if (rename(temporary.c_str(), path.c_str()) != 0)
      throw std::runtime_error("Could not replace updater state");
  } catch (...) {
    if (!closed)
      close(file);
    unlink(temporary.c_str());
    throw;
  }
}
} // namespace

void platform_secure_random(std::span<unsigned char> bytes) {
  size_t offset = 0;
  while (offset < bytes.size()) {
    const auto received =
        getrandom(bytes.data() + offset, bytes.size() - offset, 0);
    if (received < 0) {
      if (errno == EINTR)
        continue;
      throw std::runtime_error("Could not create secure random data");
    }
    offset += static_cast<size_t>(received);
  }
}

void save_credential(const DeviceCredential &credential) {
  const auto directory = state_directory();
  std::filesystem::create_directories(directory);
  std::filesystem::permissions(directory, std::filesystem::perms::owner_all,
                               std::filesystem::perm_options::replace);
  auto serialized = serialize_credential(credential);
  try {
    atomic_write(credential_path(), serialized, S_IRUSR | S_IWUSR);
  } catch (...) {
    secure_clear(serialized);
    throw;
  }
  secure_clear(serialized);
}

std::optional<DeviceCredential> load_credential() {
  const auto path = credential_path();
  const int file = open(path.c_str(), O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
  if (file < 0) {
    if (errno == ENOENT)
      return std::nullopt;
    throw std::runtime_error("Could not open the stored updater credential");
  }
  struct stat metadata {};
  if (fstat(file, &metadata) != 0 || !S_ISREG(metadata.st_mode) ||
      metadata.st_uid != getuid() || (metadata.st_mode & 0077) != 0) {
    close(file);
    throw std::runtime_error("The stored updater credential must be a private "
                             "file owned by this user");
  }
  std::string serialized;
  std::array<char, 1024> buffer{};
  while (true) {
    const auto received = read(file, buffer.data(), buffer.size());
    if (received < 0) {
      if (errno == EINTR)
        continue;
      close(file);
      throw std::runtime_error("Could not read the stored updater credential");
    }
    if (!received)
      break;
    if (serialized.size() + static_cast<size_t>(received) > 4096) {
      close(file);
      throw std::runtime_error("The stored updater credential is invalid");
    }
    serialized.append(buffer.data(), static_cast<size_t>(received));
  }
  close(file);
  return deserialize_credential(std::move(serialized));
}

void delete_credential() {
  if (unlink(credential_path().c_str()) != 0 && errno != ENOENT)
    throw std::runtime_error("Could not remove the stored device credential");
}

std::string default_device_name() {
  std::array<char, 256> name{};
  if (gethostname(name.data(), name.size()) == 0)
    return name.data();
  return "Linux PC";
}

bool startup_enabled() {
  return std::filesystem::is_regular_file(autostart_path());
}

void set_startup_enabled(bool enabled) {
  const auto path = autostart_path();
  if (!enabled) {
    std::error_code error;
    std::filesystem::remove(path, error);
    if (error)
      throw std::runtime_error("Could not disable launch at sign-in");
    return;
  }
  const auto contents =
      std::string(
          "[Desktop Entry]\nType=Application\nName=Ordis Prime Updater\n") +
      "Comment=Synchronize Warframe inventory with Ordis Prime\nExec=" +
      desktop_quote(executable_path().string()) +
      " --tray\nTerminal=false\nX-GNOME-Autostart-enabled=true\n";
  atomic_write(path, contents, S_IRUSR | S_IWUSR | S_IRGRP | S_IROTH);
}

bool acquire_single_instance() {
  const char *runtime = std::getenv("XDG_RUNTIME_DIR");
  const auto lock_path =
      runtime && *runtime
          ? std::filesystem::path(runtime) / "ordis-prime-updater.lock"
          : std::filesystem::path("/tmp") /
                ("ordis-prime-updater-" + std::to_string(getuid()) + ".lock");
  instance_lock =
      open(lock_path.c_str(), O_RDWR | O_CREAT | O_CLOEXEC | O_NOFOLLOW,
           S_IRUSR | S_IWUSR);
  if (instance_lock < 0)
    throw std::runtime_error("Could not create the updater process lock");
  if (flock(instance_lock, LOCK_EX | LOCK_NB) == 0)
    return true;
  if (errno == EWOULDBLOCK)
    return false;
  throw std::runtime_error("Could not lock the updater process lock");
}

void show_already_running() {
  std::cerr << "Ordis Prime Updater is already running.\n";
}

void show_missing_credential() {
  std::cerr << "No paired updater device was found. Run the updater normally "
               "and pair it from the Operator page first.\n";
}

void enter_tray_mode() {}
