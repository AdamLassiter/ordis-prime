#pragma once

#include <cstdint>
#include <optional>
#include <span>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

struct DeviceCredential {
  std::string origin;
  std::string device_id;
  std::string token;
  std::string pending_token;
  std::string pending_request_id;
  std::int64_t last_success = 0;
};

struct HttpResponse {
  long status = 0;
  std::string body;
};

using HttpHeaders = std::vector<std::pair<std::string, std::string>>;

struct SyncOutcome {
  std::string message;
  std::int64_t succeeded_at;
};

class WarframeNotRunning : public std::runtime_error {
public:
  WarframeNotRunning();
};

class SensitiveString {
public:
  explicit SensitiveString(std::string value = {});
  SensitiveString(const SensitiveString &) = delete;
  SensitiveString &operator=(const SensitiveString &) = delete;
  ~SensitiveString();

  std::string value;
};

void secure_clear(std::string &value);
void platform_secure_random(std::span<unsigned char> bytes);
std::optional<std::string> credential_at(std::string_view bytes, size_t start);
std::string random_base64url_token();
std::string random_request_id();
std::string serialize_credential(const DeviceCredential &credential);
DeviceCredential deserialize_credential(std::string serialized);
std::string json_string(const std::string &body, std::string_view name);
std::string json_message(const std::string &body);
std::string bounded_error(std::string value);
std::string format_time(std::int64_t timestamp);

HttpResponse http_request(const std::string &method, const std::string &url,
                          const HttpHeaders &headers = {},
                          const std::string &body = {});
bool warframe_running();
std::string find_live_warframe_credentials();
void save_credential(const DeviceCredential &credential);
std::optional<DeviceCredential> load_credential();
void delete_credential();
std::string default_device_name();
bool startup_enabled();
void set_startup_enabled(bool enabled);
bool acquire_single_instance();
void show_already_running();
void show_missing_credential();
void enter_tray_mode();
