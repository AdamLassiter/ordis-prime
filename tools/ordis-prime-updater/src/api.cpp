#include "api.hpp"

#include <ctime>

SyncOutcome synchronize(DeviceCredential &device) {
  if (device.pending_token.empty()) {
    device.pending_token = random_base64url_token();
    device.pending_request_id = random_request_id();
    save_credential(device);
  }
  SensitiveString game_credentials(find_live_warframe_credentials());
  auto inventory_response =
      http_request("GET", "https://mobile.warframe.com/api/inventory.php" +
                              game_credentials.value);
  if (inventory_response.status != 200)
    throw std::runtime_error("Warframe inventory request was rejected");
  const auto first_content =
      inventory_response.body.find_first_not_of(" \t\r\n");
  if (first_content == std::string::npos ||
      inventory_response.body[first_content] != '{')
    throw std::runtime_error("Warframe returned an invalid inventory response");
  const HttpHeaders headers{
      {"Content-Type", "application/json"},
      {"Authorization", "Bearer " + device.token},
      {"X-Ordis-Device-Id", device.device_id},
      {"X-Ordis-Next-Token", device.pending_token},
      {"X-Ordis-Request-Id", device.pending_request_id},
  };
  const auto result = http_request(
      "POST", device.origin + "/api/account/import/warframe-api-helper/sync",
      headers, inventory_response.body);
  secure_clear(inventory_response.body);
  const auto message = json_message(result.body);
  if (result.status == 401) {
    delete_credential();
    throw std::runtime_error(message.empty() ? "This updater device was revoked"
                                             : message);
  }
  if (result.status < 200 || result.status >= 300)
    throw std::runtime_error(
        message.empty() ? "Ordis Prime rejected the synchronization" : message);
  secure_clear(device.token);
  device.token = std::move(device.pending_token);
  device.pending_token.clear();
  device.pending_request_id.clear();
  device.last_success = static_cast<std::int64_t>(std::time(nullptr));
  save_credential(device);
  return {message.empty() ? "Synchronization complete." : message,
          device.last_success};
}

DeviceCredential pair_device(const Pairing &pairing,
                             const std::string &device_name) {
  if (device_name.empty() || device_name.size() > 80 ||
      device_name.find_first_of("\r\n") != std::string::npos)
    throw std::runtime_error("Device name must be 1 to 80 characters");
  auto device_token = random_base64url_token();
  const HttpHeaders headers{
      {"Authorization", "Bearer " + pairing.token},
      {"X-Ordis-Device-Token", device_token},
      {"X-Ordis-Device-Name", device_name},
  };
  const auto result = http_request(
      "POST",
      pairing.origin + "/api/account/import/warframe-api-helper/register",
      headers);
  const auto message = json_message(result.body);
  if (result.status < 200 || result.status >= 300)
    throw std::runtime_error(
        message.empty() ? "Ordis Prime rejected the pairing" : message);
  const auto device_id = json_string(result.body, "deviceId");
  if (device_id.empty())
    throw std::runtime_error("Ordis Prime returned an invalid device record");
  DeviceCredential device{
      pairing.origin, device_id, std::move(device_token), {}, {}, 0};
  save_credential(device);
  return device;
}
