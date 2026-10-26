#include "api.hpp"
#include "pairing.hpp"
#include "tray.hpp"
#include "updater.hpp"

#include <iostream>
#include <string>
#include <string_view>

int main(int argc, char **argv) {
  try {
    if (!acquire_single_instance()) {
      show_already_running();
      return 0;
    }
    const bool tray_launch = argc > 1 && std::string_view(argv[1]) == "--tray";
    if (tray_launch) {
      if (!load_credential()) {
        show_missing_credential();
        return 1;
      }
      enter_tray_mode();
      return run_tray();
    }

    std::cout << "Ordis Prime Updater\n";
    if (load_credential()) {
      std::cout << "Using the stored device credential.\n";
    } else {
      std::cout
          << "Paste the one-time pairing code from your Operator page:\n> ";
      std::string code;
      std::getline(std::cin, code);
      const auto pairing = parse_pairing_code(code);
      const auto suggested_name = default_device_name();
      std::cout << "Device name [" << suggested_name << "]:\n> ";
      std::string device_name;
      std::getline(std::cin, device_name);
      if (device_name.empty())
        device_name = suggested_name;
      std::cout << "Pairing this updater with Ordis Prime...\n";
      static_cast<void>(pair_device(pairing, device_name));
      std::cout << "Device paired successfully.\n";
    }
    std::cout << "Waiting for Warframe in the system tray.\n";
    enter_tray_mode();
    return run_tray();
  } catch (const std::exception &error) {
    std::cerr << "Updater failed: " << error.what() << '\n';
    return 1;
  }
}
