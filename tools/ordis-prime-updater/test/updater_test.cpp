#include "updater.hpp"

#include <algorithm>
#include <cassert>

void platform_secure_random(std::span<unsigned char> bytes) {
  std::fill(bytes.begin(), bytes.end(), 1);
}

int main() {
  const std::string credentials =
      "?accountId=0123456789abcdefABCDEF12&nonce=123456789";
  assert(credential_at("prefix" + credentials + "suffix", 6) == credentials);
  assert(!credential_at("?accountId=too-short&nonce=123", 0));
  assert(!credential_at("?accountId=0123456789abcdefABCDEF12&nonce=", 0));

  const DeviceCredential original{
      "https://ordis.example.test", "device-id",  "A" + std::string(42, 'a'),
      "B" + std::string(42, 'b'),   "request-id", 123456789};
  const auto restored = deserialize_credential(serialize_credential(original));
  assert(restored.origin == original.origin);
  assert(restored.device_id == original.device_id);
  assert(restored.token == original.token);
  assert(restored.pending_token == original.pending_token);
  assert(restored.pending_request_id == original.pending_request_id);
  assert(restored.last_success == original.last_success);

  assert(random_base64url_token().size() == 43);
  const auto request_id = random_request_id();
  assert(request_id.size() == 36);
  assert(request_id[14] == '4');
  assert(request_id[19] == '8');
  assert(bounded_error("one\ntwo\rthree") == "one two three");
}
