#include "updater.hpp"
#include "windows_support.hpp"

#include <tlhelp32.h>

#include <algorithm>
#include <map>
#include <optional>
#include <vector>

namespace {
std::optional<DWORD> locate_warframe_process() {
  WindowsHandle snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0));
  if (!snapshot)
    throw std::runtime_error("Could not enumerate processes");
  PROCESSENTRY32W entry{};
  entry.dwSize = sizeof(entry);
  if (!Process32FirstW(snapshot.value, &entry))
    throw std::runtime_error("Could not enumerate processes");
  do {
    if (_wcsicmp(entry.szExeFile, L"Warframe.x64.exe") == 0 ||
        _wcsicmp(entry.szExeFile, L"Warframe.x64.ex") == 0)
      return entry.th32ProcessID;
  } while (Process32NextW(snapshot.value, &entry));
  return std::nullopt;
}

bool readable(DWORD protection) {
  if (protection & (PAGE_GUARD | PAGE_NOACCESS))
    return false;
  const auto base = protection & 0xffU;
  return base == PAGE_READONLY || base == PAGE_READWRITE ||
         base == PAGE_WRITECOPY || base == PAGE_EXECUTE_READ ||
         base == PAGE_EXECUTE_READWRITE || base == PAGE_EXECUTE_WRITECOPY;
}

std::string scan_credentials(HANDLE process) {
  SYSTEM_INFO system{};
  GetSystemInfo(&system);
  auto address =
      reinterpret_cast<uintptr_t>(system.lpMinimumApplicationAddress);
  const auto maximum =
      reinterpret_cast<uintptr_t>(system.lpMaximumApplicationAddress);
  constexpr SIZE_T chunk_size = 1024 * 1024;
  constexpr size_t overlap_size = 128;
  static constexpr std::string_view marker = "?accountId=";
  std::map<std::string, unsigned int> candidates;
  while (address < maximum) {
    MEMORY_BASIC_INFORMATION region{};
    if (!VirtualQueryEx(process, reinterpret_cast<LPCVOID>(address), &region,
                        sizeof(region)))
      break;
    const auto region_start = reinterpret_cast<uintptr_t>(region.BaseAddress);
    const auto region_size = region.RegionSize;
    if (region.State == MEM_COMMIT && readable(region.Protect)) {
      std::string carry;
      for (SIZE_T offset = 0; offset < region_size; offset += chunk_size) {
        const SIZE_T requested = std::min(chunk_size, region_size - offset);
        std::vector<char> buffer(requested);
        SIZE_T received = 0;
        ReadProcessMemory(process,
                          reinterpret_cast<LPCVOID>(region_start + offset),
                          buffer.data(), requested, &received);
        if (!received) {
          carry.clear();
          continue;
        }
        std::string searchable = carry;
        searchable.append(buffer.data(), received);
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
    const auto next = region_start + region_size;
    if (next <= address)
      break;
    address = next;
  }
  throw std::runtime_error("Could not find live credentials. Log in or pass "
                           "through a loading screen and retry");
}
} // namespace

bool warframe_running() { return locate_warframe_process().has_value(); }

std::string find_live_warframe_credentials() {
  const auto process_id = locate_warframe_process();
  if (!process_id)
    throw WarframeNotRunning();
  WindowsHandle process(OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
                                    FALSE, *process_id));
  if (!process) {
    if (!warframe_running())
      throw WarframeNotRunning();
    throw std::runtime_error("Could not open the Warframe process");
  }
  try {
    return scan_credentials(process.value);
  } catch (const std::runtime_error &) {
    if (!warframe_running())
      throw WarframeNotRunning();
    throw;
  }
}
