#include "scheduler.hpp"

#include <cassert>
#include <chrono>

int main() {
  using namespace std::chrono_literals;
  const SyncSchedule::Clock::time_point start{};
  SyncSchedule schedule(start);
  assert(schedule.process_probe_due(start));
  assert(!schedule.observe_process(false, start));
  assert(!schedule.process_probe_due(start + 59min));
  assert(schedule.process_probe_due(start + 1h));
  assert(schedule.observe_process(true, start + 1h));
  schedule.mark_sync_attempt(start + 1h);
  assert(schedule.process_probe_due(start + 61min));
  assert(!schedule.observe_process(true, start + 61min));
  assert(!schedule.observe_process(true, start + 119min));
  assert(schedule.observe_process(true, start + 2h));
  schedule.mark_sync_attempt(start + 2h);
  assert(!schedule.observe_process(false, start + 121min));
  assert(!schedule.process_probe_due(start + 180min));
  assert(schedule.process_probe_due(start + 181min));
  assert(schedule.observe_process(true, start + 181min));
}
