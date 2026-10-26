# 0114: Updater platform boundaries support Linux through procfs and XDG

## Status

Accepted. Extends ADR 0113 and supersedes its Windows-only consequences.

## Context

The updater originally combined HTTP, process scanning, credential storage,
startup registration, tray UI, and orchestration in one Windows-only source
file. That made Linux support risky and made the security boundaries hard to
review independently. Wine and Proton expose Warframe as a normal Linux process,
so the inventory acquisition itself does not need launcher- or distro-specific
paths.

Linux distributions do differ in package names, desktop tray support, and
ptrace policy. Those differences should not leak into game detection.

## Decision

The executable is split into platform-neutral API orchestration and explicit
platform implementations for HTTP, process memory, credential persistence,
startup registration, and tray UI. Windows keeps WinHTTP, Toolhelp/
`ReadProcessMemory`, Credential Manager, the Run key, and Shell NotifyIcon.

Linux enumerates numeric procfs entries, recognizes both `Warframe.x64.exe` and
Wine's truncated `Warframe.x64.ex`, reads only mappings marked readable, and
uses positional reads from `/proc/<pid>/mem`. It does not search Steam libraries,
Wine prefixes, or launcher configuration. HTTPS uses libcurl. Tray integration
uses Ayatana AppIndicator and GTK 3. Sign-in startup uses the XDG autostart
standard.

Linux stores the rotating Ordis Prime device credential in XDG state as a
regular file owned by the current user with mode `0600`. Writes are atomic and
symlinks are rejected. This is less protective than Windows Credential Manager,
but avoids silently depending on an unlocked Secret Service implementation that
is not universal across Linux desktops.

## Consequences

- One scheduling and synchronization policy is shared by both platforms.
- Linux works across conventional distributions and Wine/Proton launchers as
  long as procfs, the desktop libraries, and permission to read process memory
  are available.
- Common Yama defaults block same-user memory reads. Users must explicitly relax
  `kernel.yama.ptrace_scope` or use the file importer; the updater never asks for
  root and never attempts to change system policy.
- Runtime package names and GNOME tray visibility remain distribution/desktop
  documentation concerns. A dependency-bundled AppImage is not yet produced.
- Linux filesystem credential theft by another process already running as the
  same user is not prevented. Server-side scope, rotation, and revocation remain
  the second security boundary.
