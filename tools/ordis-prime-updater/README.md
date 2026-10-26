# Ordis Prime Updater

This optional Windows and Linux x64 utility performs live inventory imports.
Paste the ten-minute code shown on Ordis Prime's Operator page to register a
named, revocable updater device. Warframe does not need to be running during
pairing. The updater then remains in the system tray, checks once per minute,
synchronizes when it detects a new game session, and syncs at most hourly while
that session remains open.

The tray menu exposes Sync now, launch-at-sign-in, status, last success, the
latest bounded error, and Exit. Closing or not yet running Warframe is a normal
waiting state. The updater never writes temporary Warframe credentials or raw
inventory to disk. Device credentials rotate after successful requests and
revocation from the Operator page makes the next request fail.

## Linux support

The Linux build supports Warframe running through Wine or Proton. Process
discovery and memory scanning use procfs directly and are not tied to a
particular distribution, Steam path, Wine prefix, or launcher. The desktop
integration follows XDG paths and uses Ayatana AppIndicator with GTK 3.

Install the runtime libraries for your distribution:

```text
# Debian / Ubuntu
sudo apt install libayatana-appindicator3-1 libcurl4

# Fedora
sudo dnf install libayatana-appindicator-gtk3 libcurl

# Arch Linux
sudo pacman -S libayatana-appindicator curl
```

Mark the downloaded binary executable and run it:

```text
chmod +x ordis-prime-updater-linux-x64
./ordis-prime-updater-linux-x64
```

Most Linux distributions prevent an unrelated process from reading another
process's memory. If the tray reports that Linux blocked memory access, allow
same-user tracing until reboot with:

```text
sudo sysctl kernel.yama.ptrace_scope=0
```

To persist that setting, create a local sysctl configuration according to your
distribution's policy. Lowering `ptrace_scope` allows every process owned by
your user to inspect other same-user processes, so it is a real security
tradeoff. The AlecaFrame file import remains available if you do not want to
make that change.

On Linux the rotating device credential is stored in
`$XDG_STATE_HOME/ordis-prime-updater/device-v1`, or
`~/.local/state/ordis-prime-updater/device-v1`, as a user-owned `0600` file.
Launch at sign-in creates the standard XDG autostart file
`~/.config/autostart/ordis-prime-updater.desktop`. GNOME may require an
AppIndicator extension before tray icons are visible.

## Build and test

Windows:

```text
cmake -S tools/ordis-prime-updater -B build/updater -A x64
cmake --build build/updater --config Release
ctest --test-dir build/updater -C Release --output-on-failure
```

Linux build dependencies are CMake, a C++20 compiler, libcurl development
headers, GTK 3 development headers, and Ayatana AppIndicator development
headers. Then run:

```text
cmake -S tools/ordis-prime-updater -B build/updater -DCMAKE_BUILD_TYPE=Release
cmake --build build/updater --parallel
ctest --test-dir build/updater --output-on-failure
```

GitHub Actions builds and tests both platforms. An `updater-v*` tag publishes
both executables, SHA-256 checksums, and third-party notices. The production web
container also builds both executables and serves instance-local downloads.

## Security and compatibility

Release builds require HTTPS, except that `http://localhost` is accepted for
local development. Windows releases are unsigned and may trigger SmartScreen.
The memory signature and inventory endpoint are undocumented and may change;
failures stop the import rather than falling back to guessed data.

See `THIRD_PARTY_NOTICES.md` before redistribution. In particular, the source
algorithm's Commons Clause restriction requires review before commercial use.
