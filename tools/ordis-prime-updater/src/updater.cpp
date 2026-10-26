#include "updater.hpp"

#include <algorithm>
#include <array>
#include <cctype>
#include <ctime>
#include <iomanip>
#include <sstream>
#include <vector>

WarframeNotRunning::WarframeNotRunning()
    : std::runtime_error("Warframe is not running") {}

SensitiveString::SensitiveString(std::string next) : value(std::move(next)) {}
SensitiveString::~SensitiveString() { secure_clear(value); }

void secure_clear(std::string &value) {
  volatile char *cursor = value.empty() ? nullptr : value.data();
  for (size_t index = 0; index < value.size(); ++index)
    cursor[index] = 0;
  value.clear();
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
  if (end == nonce_marker + 7)
    return std::nullopt;
  return std::string(bytes.substr(start, end - start));
}

std::string random_base64url_token() {
  static constexpr char alphabet[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  std::array<unsigned char, 32> bytes{};
  platform_secure_random(bytes);
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
  if (bits > 0)
    result.push_back(alphabet[(accumulator << (6 - bits)) & 0x3fU]);
  volatile unsigned char *cursor = bytes.data();
  for (size_t index = 0; index < bytes.size(); ++index)
    cursor[index] = 0;
  return result;
}

std::string random_request_id() {
  std::array<unsigned char, 16> bytes{};
  platform_secure_random(bytes);
  bytes[6] = static_cast<unsigned char>((bytes[6] & 0x0fU) | 0x40U);
  bytes[8] = static_cast<unsigned char>((bytes[8] & 0x3fU) | 0x80U);
  std::ostringstream stream;
  stream << std::hex << std::setfill('0');
  for (size_t index = 0; index < bytes.size(); ++index) {
    if (index == 4 || index == 6 || index == 8 || index == 10)
      stream << '-';
    stream << std::setw(2) << static_cast<unsigned int>(bytes[index]);
  }
  return stream.str();
}

std::string serialize_credential(const DeviceCredential &credential) {
  return credential.origin + "\n" + credential.device_id + "\n" +
         credential.token + "\n" + credential.pending_token + "\n" +
         credential.pending_request_id + "\n" +
         std::to_string(credential.last_success);
}

DeviceCredential deserialize_credential(std::string serialized) {
  std::vector<std::string> fields;
  size_t start = 0;
  while (fields.size() < 5) {
    const auto end = serialized.find('\n', start);
    if (end == std::string::npos)
      break;
    fields.push_back(serialized.substr(start, end - start));
    start = end + 1;
  }
  fields.push_back(serialized.substr(start));
  secure_clear(serialized);
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

std::string json_string(const std::string &body, std::string_view name) {
  std::string key;
  key.reserve(name.size() + 4);
  key.push_back('"');
  key.append(name);
  key.append("\":\"");
  const auto start = body.find(key);
  if (start == std::string::npos)
    return {};
  const auto value_start = start + key.size();
  const auto end = body.find('"', value_start);
  return end == std::string::npos ? std::string{}
                                  : body.substr(value_start, end - value_start);
}

std::string json_message(const std::string &body) {
  return json_string(body, "message");
}

std::string bounded_error(std::string value) {
  std::replace(value.begin(), value.end(), '\r', ' ');
  std::replace(value.begin(), value.end(), '\n', ' ');
  if (value.size() > 160)
    value.resize(160);
  return value;
}

std::string format_time(std::int64_t timestamp) {
  if (!timestamp)
    return "Never";
  const auto value = static_cast<std::time_t>(timestamp);
  std::tm local{};
#ifdef _WIN32
  localtime_s(&local, &value);
#else
  localtime_r(&value, &local);
#endif
  std::ostringstream stream;
  stream << std::put_time(&local, "%Y-%m-%d %H:%M");
  return stream.str();
}
