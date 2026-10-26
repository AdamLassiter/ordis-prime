#pragma once

#include <string>

struct Pairing {
  std::string origin;
  std::string token;
};

Pairing parse_pairing_code(const std::string &value);
