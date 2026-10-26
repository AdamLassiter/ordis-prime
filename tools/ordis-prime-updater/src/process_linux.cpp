#include "updater.hpp"

#include <dirent.h>
#include <fcntl.h>
#include <sys/types.h>
#include <unistd.h>

#include <algorithm>
#include <cerrno>
#include <charconv>
#include <cstring>
#include <fstream>
#include <map>
#include <optional>
#include <sstream>
#include <vector>

namespace {
std::optional<pid_t> locate_warframe_process() {
  DIR *directory = opendir("/proc");
  if (!directory)
    throw std::runtime_error("Could not enumerate /proc");
  std::optional<pid_t> result;
  while (const auto *entry = readdir(directory)) {
    int pid_value = 0;
    const std::string_view name(entry->d_name);
    const auto parsed =
        std::from_chars(name.data(), name.data() + name.size(), pid_value);
    if (parsed.ec != std::errc{} || parsed.ptr != name.data() + name.size() ||
        pid_value <= 0)
      continue;
    std::ifstream comm("/proc/" + std::to_string(pid_value) + "/comm");
    std::string process_name;
    std::getline(comm, process_name);
    if (process_name == "Warframe.x64.exe" ||
        process_name == "Warframe.x64.ex") {
      result = static_cast<pid_t>(pid_value);
      break;
    }
  }
  closedir(directory);
  return result;
}

struct FileDescriptor {
  int value = -1;
  explicit FileDescriptor(int next = -1) : value(next) {}
  FileDescriptor(const FileDescriptor &) = delete;
  FileDescriptor &operator=(const FileDescriptor &) = delete;
  ~FileDescriptor() {
    if (value >= 0)
      close(value);
  }
};

std::string scan_credentials(pid_t pid) {
  const auto prefix = "/proc/" + std::to_string(pid);
  std::ifstream maps(prefix + "/maps");
  if (!maps)
    throw std::runtime_error("Could not read Warframe memory maps");
  FileDescriptor memory(open((prefix + "/mem").c_str(), O_RDONLY | O_CLOEXEC));
  if (memory.value < 0) {
    if (errno == EACCES || errno == EPERM)
      throw std::runtime_error("Linux blocked Warframe memory access. See the "
                               "updater README for ptrace_scope setup");
    if (!locate_warframe_process())
      throw WarframeNotRunning();
    throw std::runtime_error("Could not open Warframe process memory");
  }

  constexpr size_t chunk_size = 1024 * 1024;
  constexpr size_t overlap_size = 128;
  static constexpr std::string_view marker = "?accountId=";
  std::map<std::string, unsigned int> candidates;
  std::string line;
  while (std::getline(maps, line)) {
    std::istringstream parser(line);
    std::string range;
    std::string permissions;
    parser >> range >> permissions;
    if (permissions.empty() || permissions[0] != 'r')
      continue;
    const auto separator = range.find('-');
    if (separator == std::string::npos)
      continue;
    std::uint64_t start = 0;
    std::uint64_t end = 0;
    const auto start_result =
        std::from_chars(range.data(), range.data() + separator, start, 16);
    const auto end_result = std::from_chars(
        range.data() + separator + 1, range.data() + range.size(), end, 16);
    if (start_result.ec != std::errc{} || end_result.ec != std::errc{} ||
        end <= start)
      continue;
    std::string carry;
    for (std::uint64_t address = start; address < end;) {
      const auto remaining = end - address;
      const size_t requested =
          static_cast<size_t>(std::min<std::uint64_t>(chunk_size, remaining));
      std::vector<char> buffer(requested);
      const auto received = pread(memory.value, buffer.data(), requested,
                                  static_cast<off_t>(address));
      address += requested;
      if (received <= 0) {
        carry.clear();
        continue;
      }
      std::string searchable = carry;
      searchable.append(buffer.data(), static_cast<size_t>(received));
      size_t position = 0;
      while ((position = searchable.find(marker, position)) !=
             std::string::npos) {
        if (auto candidate = credential_at(searchable, position)) {
          auto &count = candidates[*candidate];
          if (++count >= 3)
            return *candidate;
        }
        position += marker.size();
      }
      carry = searchable.substr(searchable.size() > overlap_size
                                    ? searchable.size() - overlap_size
                                    : 0);
    }
  }
  throw std::runtime_error("Could not find live credentials. Log in or pass "
                           "through a loading screen and retry");
}
} // namespace

bool warframe_running() { return locate_warframe_process().has_value(); }

std::string find_live_warframe_credentials() {
  const auto pid = locate_warframe_process();
  if (!pid)
    throw WarframeNotRunning();
  try {
    return scan_credentials(*pid);
  } catch (const std::runtime_error &) {
    if (!warframe_running())
      throw WarframeNotRunning();
    throw;
  }
}
