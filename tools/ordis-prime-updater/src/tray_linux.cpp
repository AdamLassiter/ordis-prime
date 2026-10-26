#include "tray.hpp"

#include "api.hpp"
#include "scheduler.hpp"
#include "updater.hpp"

#include <gtk/gtk.h>
#include <libayatana-appindicator/app-indicator.h>

#include <atomic>
#include <ctime>
#include <mutex>
#include <thread>

namespace {
class TrayApp {
public:
  int run() {
    if (!gtk_init_check(nullptr, nullptr))
      throw std::runtime_error(
          "Could not connect to a graphical desktop for the system tray");
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

    indicator_ = app_indicator_new("ordis-prime-updater", "system-run-symbolic",
                                   APP_INDICATOR_CATEGORY_APPLICATION_STATUS);
    if (!indicator_)
      throw std::runtime_error("Could not initialize the system tray icon");
    app_indicator_set_status(indicator_, APP_INDICATOR_STATUS_ACTIVE);
    app_indicator_set_title(indicator_, "Ordis Prime Updater");

    menu_ = gtk_menu_new();
    state_item_ = gtk_menu_item_new_with_label("");
    success_item_ = gtk_menu_item_new_with_label("");
    error_item_ = gtk_menu_item_new_with_label("");
    gtk_widget_set_sensitive(state_item_, false);
    gtk_widget_set_sensitive(success_item_, false);
    gtk_widget_set_sensitive(error_item_, false);
    gtk_menu_shell_append(GTK_MENU_SHELL(menu_), state_item_);
    gtk_menu_shell_append(GTK_MENU_SHELL(menu_), success_item_);
    gtk_menu_shell_append(GTK_MENU_SHELL(menu_), error_item_);
    gtk_menu_shell_append(GTK_MENU_SHELL(menu_), gtk_separator_menu_item_new());

    sync_item_ = gtk_menu_item_new_with_label("Sync now");
    startup_item_ =
        gtk_check_menu_item_new_with_label("Launch at Linux sign-in");
    gtk_check_menu_item_set_active(GTK_CHECK_MENU_ITEM(startup_item_),
                                   startup_enabled());
    auto *exit_item = gtk_menu_item_new_with_label("Exit");
    g_signal_connect(sync_item_, "activate", G_CALLBACK(sync_selected), this);
    g_signal_connect(startup_item_, "toggled", G_CALLBACK(startup_toggled),
                     this);
    g_signal_connect(exit_item, "activate", G_CALLBACK(exit_selected), this);
    gtk_menu_shell_append(GTK_MENU_SHELL(menu_), sync_item_);
    gtk_menu_shell_append(GTK_MENU_SHELL(menu_), startup_item_);
    gtk_menu_shell_append(GTK_MENU_SHELL(menu_), exit_item);
    gtk_widget_show_all(menu_);
    app_indicator_set_menu(indicator_, GTK_MENU(menu_));
    update_ui();
    g_timeout_add_seconds(60, timer_tick, this);
    g_idle_add(initial_tick, this);
    gtk_main();
    if (worker_.joinable())
      worker_.join();
    app_indicator_set_status(indicator_, APP_INDICATOR_STATUS_PASSIVE);
    g_object_unref(indicator_);
    return 0;
  }

private:
  AppIndicator *indicator_ = nullptr;
  GtkWidget *menu_ = nullptr;
  GtkWidget *state_item_ = nullptr;
  GtkWidget *success_item_ = nullptr;
  GtkWidget *error_item_ = nullptr;
  GtkWidget *sync_item_ = nullptr;
  GtkWidget *startup_item_ = nullptr;
  SyncSchedule schedule_{};
  std::thread worker_;
  std::mutex result_mutex_;
  std::atomic<bool> busy_{false};
  std::atomic<bool> stopping_{false};
  bool changing_startup_ = false;
  std::string state_ = "Waiting for Warframe";
  std::string error_;
  std::int64_t last_success_ = 0;

  static gboolean initial_tick(gpointer data) {
    static_cast<TrayApp *>(data)->automatic_tick();
    return G_SOURCE_REMOVE;
  }

  static gboolean timer_tick(gpointer data) {
    auto &app = *static_cast<TrayApp *>(data);
    if (app.stopping_)
      return G_SOURCE_REMOVE;
    app.automatic_tick();
    return G_SOURCE_CONTINUE;
  }

  static gboolean sync_completed(gpointer data) {
    auto &app = *static_cast<TrayApp *>(data);
    if (app.worker_.joinable())
      app.worker_.join();
    app.update_ui();
    return G_SOURCE_REMOVE;
  }

  static void sync_selected(GtkMenuItem *, gpointer data) {
    static_cast<TrayApp *>(data)->start_sync();
  }

  static void startup_toggled(GtkCheckMenuItem *item, gpointer data) {
    auto &app = *static_cast<TrayApp *>(data);
    if (app.changing_startup_)
      return;
    try {
      set_startup_enabled(gtk_check_menu_item_get_active(item));
    } catch (const std::exception &exception) {
      app.set_error(exception.what());
      app.changing_startup_ = true;
      gtk_check_menu_item_set_active(item, startup_enabled());
      app.changing_startup_ = false;
    }
  }

  static void exit_selected(GtkMenuItem *, gpointer data) {
    auto &app = *static_cast<TrayApp *>(data);
    app.stopping_ = true;
    gtk_widget_set_sensitive(app.sync_item_, false);
    if (app.worker_.joinable())
      app.worker_.join();
    gtk_main_quit();
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
        update_ui();
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
        update_ui();
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
    update_ui();
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
      g_idle_add(sync_completed, this);
    });
  }

  void set_error(const std::string &error) {
    state_ = "Updater error";
    error_ = bounded_error(error);
    update_ui();
  }

  void update_ui() {
    std::lock_guard lock(result_mutex_);
    const auto state_label = "State: " + state_;
    const auto success_label = "Last success: " + format_time(last_success_);
    gtk_menu_item_set_label(GTK_MENU_ITEM(state_item_), state_label.c_str());
    gtk_menu_item_set_label(GTK_MENU_ITEM(success_item_),
                            success_label.c_str());
    if (error_.empty()) {
      gtk_widget_hide(error_item_);
    } else {
      const auto error_label = "Last error: " + error_;
      gtk_menu_item_set_label(GTK_MENU_ITEM(error_item_), error_label.c_str());
      gtk_widget_show(error_item_);
    }
    gtk_widget_set_sensitive(sync_item_, !busy_);
    app_indicator_set_label(indicator_, state_.c_str(),
                            "Synchronizing inventory");
  }
};
} // namespace

int run_tray() { return TrayApp{}.run(); }
