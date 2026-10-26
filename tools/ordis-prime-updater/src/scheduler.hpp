#pragma once

#include <chrono>

class SyncSchedule {
public:
  using Clock = std::chrono::steady_clock;
  explicit SyncSchedule(Clock::time_point now = Clock::now());

  bool process_probe_due(Clock::time_point now) const;
  bool observe_process(bool running, Clock::time_point now);
  void mark_sync_attempt(Clock::time_point now);
  bool game_running() const;

private:
  static constexpr auto absent_interval = std::chrono::minutes(1);
  static constexpr auto present_interval = std::chrono::minutes(1);
  static constexpr auto sync_interval = std::chrono::hours(1);
  Clock::time_point next_probe_;
  Clock::time_point last_sync_attempt_{};
  bool has_sync_attempt_ = false;
  bool game_running_ = false;
};
