#include "scheduler.hpp"

SyncSchedule::SyncSchedule(Clock::time_point now) : next_probe_(now) {}

bool SyncSchedule::process_probe_due(Clock::time_point now) const {
  return now >= next_probe_;
}

bool SyncSchedule::observe_process(bool running, Clock::time_point now) {
  const bool first_detection = running && !game_running_;
  game_running_ = running;
  next_probe_ = now + (running ? present_interval : absent_interval);
  if (!running) return false;
  return first_detection || !has_sync_attempt_ ||
         now - last_sync_attempt_ >= sync_interval;
}

void SyncSchedule::mark_sync_attempt(Clock::time_point now) {
  last_sync_attempt_ = now;
  has_sync_attempt_ = true;
}

bool SyncSchedule::game_running() const { return game_running_; }
