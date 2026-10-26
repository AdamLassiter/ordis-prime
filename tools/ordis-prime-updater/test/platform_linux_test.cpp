#include "updater.hpp"

#include <sys/stat.h>

#include <cassert>
#include <cstdlib>
#include <filesystem>
#include <string>

int main() {
  std::string pattern = "/tmp/ordis-updater-platform-XXXXXX";
  char *root = mkdtemp(pattern.data());
  assert(root);
  const auto state = std::filesystem::path(root) / "state";
  const auto config = std::filesystem::path(root) / "config";
  const auto runtime = std::filesystem::path(root) / "runtime";
  std::filesystem::create_directory(runtime);
  setenv("XDG_STATE_HOME", state.c_str(), 1);
  setenv("XDG_CONFIG_HOME", config.c_str(), 1);
  setenv("XDG_RUNTIME_DIR", runtime.c_str(), 1);

  assert(!load_credential());
  const DeviceCredential expected{
      "https://ordis.example.test", "device-id",  std::string(43, 'A'),
      std::string(43, 'B'),         "request-id", 987654321};
  save_credential(expected);
  const auto stored = load_credential();
  assert(stored);
  assert(stored->origin == expected.origin);
  assert(stored->device_id == expected.device_id);
  assert(stored->token == expected.token);
  assert(stored->pending_token == expected.pending_token);
  assert(stored->pending_request_id == expected.pending_request_id);
  assert(stored->last_success == expected.last_success);
  struct stat metadata {};
  assert(stat((state / "ordis-prime-updater/device-v1").c_str(), &metadata) ==
         0);
  assert((metadata.st_mode & 0777) == 0600);
  delete_credential();
  assert(!load_credential());

  assert(!startup_enabled());
  set_startup_enabled(true);
  assert(startup_enabled());
  set_startup_enabled(false);
  assert(!startup_enabled());
  assert(acquire_single_instance());

  std::filesystem::remove_all(root);
}
