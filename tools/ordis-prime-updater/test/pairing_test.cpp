#include "pairing.hpp"

#include <cassert>
#include <stdexcept>
#include <string>

int main() {
  const std::string token(43, 'A');
  const auto pairing = parse_pairing_code(
      "ordis-prime:v1:aHR0cHM6Ly9vcmRpcy5leGFtcGxlLnRlc3Q:" + token);
  assert(pairing.origin == "https://ordis.example.test");
  assert(pairing.token == token);
  assert(parse_pairing_code(
             "ordis-prime:v1:aHR0cDovL2xvY2FsaG9zdDozMDAw:" + token)
             .origin == "http://localhost:3000");

  for (const auto& invalid : {
           "ordis-prime:v2:aHR0cHM6Ly9vcmRpcy5leGFtcGxlLnRlc3Q:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
           "ordis-prime:v1:aHR0cDovL29yZGlzLmV4YW1wbGUudGVzdA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
           "ordis-prime:v1:aHR0cHM6Ly9vcmRpcy5leGFtcGxlLnRlc3QvcGF0aA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
           "ordis-prime:v1:not-base64!:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
           "ordis-prime:v1:aHR0cHM6Ly9vcmRpcy5leGFtcGxlLnRlc3Q:short",
       }) {
    bool rejected = false;
    try {
      static_cast<void>(parse_pairing_code(invalid));
    } catch (const std::runtime_error&) {
      rejected = true;
    }
    assert(rejected);
  }
}
