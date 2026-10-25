#include "scheduler.hpp"

#include <cassert>
#include <chrono>

int main() {
  using namespace std::chrono_literals;
  const SyncSchedule::Clock::time_point start{};
  SyncSchedule schedule(start);
  assert(schedule.process_probe_due(start));
  assert(!schedule.observe_process(false, start));
  assert(!schedule.process_probe_due(start + 59s));
  assert(schedule.process_probe_due(start + 1min));
  assert(schedule.observe_process(true, start + 1min));
  schedule.mark_sync_attempt(start + 1min);
  assert(schedule.process_probe_due(start + 2min));
  assert(!schedule.observe_process(true, start + 2min));
  assert(!schedule.observe_process(true, start + 60min));
  assert(schedule.observe_process(true, start + 61min));
  schedule.mark_sync_attempt(start + 61min);
  assert(!schedule.observe_process(false, start + 62min));
  assert(!schedule.process_probe_due(start + 62min + 59s));
  assert(schedule.process_probe_due(start + 63min));
  assert(schedule.observe_process(true, start + 63min));
}
