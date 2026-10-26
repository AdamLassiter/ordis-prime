#include "tray.hpp"

#include "api.hpp"
#include "scheduler.hpp"
#include "updater.hpp"
#include "windows_support.hpp"

#include <shellapi.h>

#include <atomic>
#include <ctime>
#include <mutex>
#include <thread>

namespace {
class TrayApp {
public:
  int run() {
    instance_ = this;
    if (const auto credential = load_credential()) {
      last_success_ = credential->last_success;
      const auto now = static_cast<std::int64_t>(std::time(nullptr));
      if (last_success_ && now - last_success_ < 60 * 60) {
        try {
          if (warframe_running()) {
            static_cast<void>(
                schedule_.observe_process(true, SyncSchedule::Clock::now()));
            schedule_.mark_sync_attempt(SyncSchedule::Clock::now());
          }
        } catch (...) {
        }
      }
    }
    WNDCLASSW window_class{};
    window_class.lpfnWndProc = window_proc;
    window_class.hInstance = GetModuleHandleW(nullptr);
    window_class.lpszClassName = L"OrdisPrimeUpdaterTray";
    if (!RegisterClassW(&window_class) &&
        GetLastError() != ERROR_CLASS_ALREADY_EXISTS)
      throw std::runtime_error("Could not initialize the system tray window");
    window_ = CreateWindowExW(0, window_class.lpszClassName,
                              L"Ordis Prime Updater", 0, 0, 0, 0, 0, nullptr,
                              nullptr, window_class.hInstance, nullptr);
    if (!window_)
      throw std::runtime_error("Could not create the system tray window");
    icon_.cbSize = sizeof(icon_);
    icon_.hWnd = window_;
    icon_.uID = 1;
    icon_.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    icon_.uCallbackMessage = WM_APP + 1;
    icon_.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
    update_tooltip();
    if (!Shell_NotifyIconW(NIM_ADD, &icon_))
      throw std::runtime_error("Could not add the system tray icon");
    SetTimer(window_, 1, 60'000, nullptr);
    PostMessageW(window_, WM_TIMER, 1, 0);
    MSG message{};
    while (GetMessageW(&message, nullptr, 0, 0) > 0) {
      TranslateMessage(&message);
      DispatchMessageW(&message);
    }
    if (worker_.joinable())
      worker_.join();
    return 0;
  }

private:
  static constexpr UINT sync_complete_message = WM_APP + 2;
  static constexpr UINT command_sync = 1001;
  static constexpr UINT command_startup = 1002;
  static constexpr UINT command_exit = 1003;
  inline static TrayApp *instance_ = nullptr;
  HWND window_ = nullptr;
  NOTIFYICONDATAW icon_{};
  SyncSchedule schedule_{};
  std::thread worker_;
  std::mutex result_mutex_;
  std::atomic<bool> busy_{false};
  std::string state_ = "Waiting for Warframe";
  std::string error_;
  std::int64_t last_success_ = 0;

  static LRESULT CALLBACK window_proc(HWND window, UINT message, WPARAM wparam,
                                      LPARAM lparam) {
    return instance_
               ? instance_->handle_message(window, message, wparam, lparam)
               : DefWindowProcW(window, message, wparam, lparam);
  }

  LRESULT handle_message(HWND window, UINT message, WPARAM wparam,
                         LPARAM lparam) {
    if (message == WM_TIMER && wparam == 1) {
      automatic_tick();
      return 0;
    }
    if (message == icon_.uCallbackMessage &&
        (lparam == WM_RBUTTONUP || lparam == WM_LBUTTONUP)) {
      show_menu();
      return 0;
    }
    if (message == WM_COMMAND) {
      if (LOWORD(wparam) == command_sync)
        start_sync();
      if (LOWORD(wparam) == command_startup) {
        try {
          set_startup_enabled(!startup_enabled());
        } catch (const std::exception &exception) {
          set_error(exception.what());
        }
      }
      if (LOWORD(wparam) == command_exit) {
        Shell_NotifyIconW(NIM_DELETE, &icon_);
        KillTimer(window_, 1);
        if (worker_.joinable())
          worker_.join();
        DestroyWindow(window_);
      }
      return 0;
    }
    if (message == sync_complete_message) {
      if (worker_.joinable())
        worker_.join();
      update_tooltip();
      return 0;
    }
    if (message == WM_DESTROY) {
      PostQuitMessage(0);
      return 0;
    }
    return DefWindowProcW(window, message, wparam, lparam);
  }

  void automatic_tick() {
    if (busy_ || !schedule_.process_probe_due(SyncSchedule::Clock::now()))
      return;
    try {
      const bool running = warframe_running();
      if (schedule_.observe_process(running, SyncSchedule::Clock::now()))
        start_sync();
      else {
        state_ = running ? "Warframe detected; next hourly sync pending"
                         : "Waiting for Warframe";
        update_tooltip();
      }
    } catch (const std::exception &exception) {
      set_error(exception.what());
    }
  }

  void start_sync() {
    if (busy_.exchange(true))
      return;
    if (worker_.joinable())
      worker_.join();
    try {
      if (!warframe_running()) {
        static_cast<void>(
            schedule_.observe_process(false, SyncSchedule::Clock::now()));
        busy_ = false;
        state_ = "Waiting for Warframe";
        error_.clear();
        update_tooltip();
        return;
      }
    } catch (const std::exception &exception) {
      busy_ = false;
      set_error(exception.what());
      return;
    }
    schedule_.mark_sync_attempt(SyncSchedule::Clock::now());
    state_ = "Synchronizing inventory";
    error_.clear();
    update_tooltip();
    worker_ = std::thread([this] {
      try {
        auto credential = load_credential();
        if (!credential)
          throw std::runtime_error(
              "No paired device credential; pair again on the Operator page");
        const auto result = synchronize(*credential);
        std::lock_guard lock(result_mutex_);
        last_success_ = result.succeeded_at;
        state_ = "Last synchronization succeeded";
        error_.clear();
      } catch (const WarframeNotRunning &) {
        std::lock_guard lock(result_mutex_);
        state_ = "Waiting for Warframe";
        error_.clear();
      } catch (const std::exception &exception) {
        std::lock_guard lock(result_mutex_);
        state_ = "Synchronization failed; waiting to retry";
        error_ = bounded_error(exception.what());
      }
      busy_ = false;
      PostMessageW(window_, sync_complete_message, 0, 0);
    });
  }

  void set_error(const std::string &error) {
    state_ = "Updater error";
    error_ = bounded_error(error);
    update_tooltip();
  }

  void update_tooltip() {
    std::lock_guard lock(result_mutex_);
    std::wstring text = L"Ordis Prime: " + widen(state_);
    if (!error_.empty())
      text += L" - " + widen(error_);
    if (text.size() >= std::size(icon_.szTip))
      text.resize(std::size(icon_.szTip) - 1);
    std::wmemset(icon_.szTip, 0, std::size(icon_.szTip));
    std::wmemcpy(icon_.szTip, text.data(), text.size());
    if (window_)
      Shell_NotifyIconW(NIM_MODIFY, &icon_);
  }

  void show_menu() {
    POINT cursor{};
    GetCursorPos(&cursor);
    HMENU menu = CreatePopupMenu();
    std::string state_value;
    std::string error_value;
    std::int64_t success_value = 0;
    {
      std::lock_guard lock(result_mutex_);
      state_value = state_;
      error_value = error_;
      success_value = last_success_;
    }
    const auto state = L"State: " + widen(state_value);
    const auto success = L"Last success: " + widen(format_time(success_value));
    AppendMenuW(menu, MF_STRING | MF_GRAYED, 0, state.c_str());
    AppendMenuW(menu, MF_STRING | MF_GRAYED, 0, success.c_str());
    if (!error_value.empty()) {
      const auto error = L"Last error: " + widen(error_value);
      AppendMenuW(menu, MF_STRING | MF_GRAYED, 0, error.c_str());
    }
    AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(menu, MF_STRING | (busy_ ? MF_GRAYED : 0), command_sync,
                L"Sync now");
    AppendMenuW(menu,
                MF_STRING | (startup_enabled() ? MF_CHECKED : MF_UNCHECKED),
                command_startup, L"Launch at Windows sign-in");
    AppendMenuW(menu, MF_STRING, command_exit, L"Exit");
    SetForegroundWindow(window_);
    TrackPopupMenu(menu, TPM_RIGHTBUTTON, cursor.x, cursor.y, 0, window_,
                   nullptr);
    DestroyMenu(menu);
  }
};
} // namespace

int run_tray() { return TrayApp{}.run(); }
