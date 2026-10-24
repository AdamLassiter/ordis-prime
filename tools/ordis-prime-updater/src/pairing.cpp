#include "pairing.hpp"

#include <array>
#include <cctype>
#include <stdexcept>
#include <string_view>

namespace {
std::string decode_base64url(std::string_view input) {
  static constexpr std::string_view alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  if (input.empty() || input.size() % 4 == 1)
    throw std::runtime_error("Pairing code contains invalid base64url data");
  std::string output;
  output.reserve((input.size() * 3) / 4);
  unsigned int accumulator = 0;
  int bits = 0;
  for (const char character : input) {
    const auto position = alphabet.find(character);
    if (position == std::string_view::npos)
      throw std::runtime_error("Pairing code contains invalid base64url data");
    accumulator = (accumulator << 6U) | static_cast<unsigned int>(position);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output.push_back(
          static_cast<char>((accumulator >> static_cast<unsigned int>(bits)) & 0xffU));
    }
  }
  return output;
}

bool valid_token(std::string_view token) {
  if (token.size() != 43) return false;
  for (const char character : token)
    if (!std::isalnum(static_cast<unsigned char>(character)) &&
        character != '-' && character != '_')
      return false;
  return true;
}
}  // namespace

Pairing parse_pairing_code(const std::string& value) {
  static constexpr std::string_view prefix = "ordis-prime:v1:";
  if (!value.starts_with(prefix))
    throw std::runtime_error("Pairing code has an unsupported format");
  const auto separator = value.find(':', prefix.size());
  if (separator == std::string::npos)
    throw std::runtime_error("Pairing code is incomplete");
  auto origin = decode_base64url(
      std::string_view(value).substr(prefix.size(), separator - prefix.size()));
  const auto token = value.substr(separator + 1);
  if (!origin.starts_with("https://") &&
      !origin.starts_with("http://localhost"))
    throw std::runtime_error("Pairing server must use HTTPS");
  const auto authority_start = origin.find("://") + 3;
  if (origin.find_first_of("/?#", authority_start) != std::string::npos)
    throw std::runtime_error("Pairing server origin is invalid");
  if (!valid_token(token)) throw std::runtime_error("Pairing token is invalid");
  return {std::move(origin), token};
}
