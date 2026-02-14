# OpenCode Troubleshooting Reference Guide

Complete troubleshooting procedures for OpenCode issues.

## Table of Contents

1. [Log Analysis](#log-analysis)
2. [Storage Management](#storage-management)
3. [Desktop App Issues](#desktop-app-issues)
4. [Common Problems](#common-problems)

---

## Log Analysis

### Log File Location

| Platform | Path |
|----------|------|
| macOS/Linux | `~/.local/share/opencode/log/` |
| Windows | `%USERPROFILE%\.local\share\opencode\log` |

### Log File Naming

Files are named with timestamps (e.g., `2025-01-09T123456.log`)
Most recent 10 log files are retained

### Viewing Logs

Use the included script:
```bash
.opencode/skills/opencode-troubleshoot/scripts/check_logs.sh [number_of_files]
```

Or manually:
```bash
# View latest log
tail -f ~/.local/share/opencode/log/$(ls -t ~/.local/share/opencode/log/*.log | head -n 1)
```

### Debug Level Logging

Run OpenCode with debug logging for detailed information:
```bash
opencode --log-level DEBUG
```

Available log levels: DEBUG, INFO, WARN, ERROR

---

## Storage Management

### Storage Location

| Platform | Path |
|----------|------|
| macOS/Linux | `~/.local/share/opencode/` |
| Windows | `%USERPROFILE%\.local\share\opencode` |

### Storage Structure

```
~/.local/share/opencode/
├── auth.json          # Authentication data (API keys, OAuth tokens)
├── log/               # Application logs
└── project/           # Project-specific data
    ├── <project-slug>/storage/  # Git repo projects
    └── global/storage/          # Non-repo projects
```

### Checking Storage

Use the included script:
```bash
.opencode/skills/opencode-troubleshoot/scripts/check_storage.sh
```

---

## Desktop App Issues

### Quick Checks (Always Try First)

1. Fully quit and relaunch the app
2. If error screen appears, click **Restart** and copy error details
3. macOS only: `OpenCode` menu → **Reload Webview** (for blank/frozen UI)

### Disable Plugins

#### Check Global Config

Open global config file:
- **macOS/Linux**: `~/.config/opencode/opencode.jsonc` (or `.json`)
- **Windows**: `%USERPROFILE%\.config\opencode\opencode.jsonc`

Disable plugins temporarily:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": []
}
```

#### Check Plugin Directories

Temporarily move or rename these directories:

**Global plugins:**
- **macOS/Linux**: `~/.config/opencode/plugins/`
- **Windows**: `%USERPROFILE%\.config\opencode\plugins`

**Project plugins:**
- `<your-project>/.opencode/plugins/`

Re-enable plugins one at a time to identify the problematic one.

### Clear Cache

If plugins aren't the issue or plugin install is stuck:

1. Quit OpenCode Desktop completely
2. Delete cache directory:
   - **macOS**: `~/.cache/opencode`
   - **Linux**: `~/.cache/opencode`
   - **Windows**: `%USERPROFILE%\.cache\opencode`
3. Restart OpenCode Desktop

Or use the included script:
```bash
.opencode/skills/opencode-troubleshoot/scripts/clear_cache.sh
```

### Fix Server Connection Issues

#### Clear Default Server URL

From Home screen → Click server name (with status dot) → **Clear** in **Default server** section

#### Remove Server Config

If `opencode.json(c)` contains a `server` section, temporarily remove it:
```json
{
  "server": {
    "port": 3000,
    "hostname": "localhost"
  }
}
```

#### Check Environment Variables

If `OPENCODE_PORT` is set, the desktop app will try to use that port:
- Unset `OPENCODE_PORT` or pick a free port
- Restart the app

### Platform-Specific Issues

#### Linux: Wayland / X11

- On Wayland with blank windows/crashes: Try `OC_ALLOW_WAYLAND=1`
- If that makes things worse: Remove it and launch under X11 session

#### Windows: WebView2 Runtime

OpenCode Desktop requires Microsoft Edge WebView2 Runtime.
If app shows blank window or won't start:
1. Download WebView2 Runtime from Microsoft
2. Install/update WebView2
3. Restart OpenCode Desktop

#### Windows: General Performance Issues

For slow performance, file access issues, or terminal problems:
- Consider using WSL (Windows Subsystem for Linux)
- WSL provides better compatibility with OpenCode features

### Notifications Not Showing

OpenCode Desktop only shows system notifications when:
1. Notifications are enabled for OpenCode in OS settings
2. App window is not focused

### Reset Desktop App Storage (Last Resort)

If app won't start and you can't clear settings from UI:

1. Quit OpenCode Desktop
2. Find and delete these files:
   - `opencode.settings.dat` (desktop default server URL)
   - `opencode.global.dat` and `opencode.workspace.*.dat` (UI state)

**File locations:**
- **macOS**: `~/Library/Application Support` (search for filenames)
- **Linux**: `~/.local/share` (search for filenames)
- **Windows**: `%APPDATA%` (search for filenames)

---

## Common Problems

### OpenCode Won't Start

1. Check logs for error messages
2. Run with `--print-logs` to see terminal output:
   ```bash
   opencode --print-logs
   ```
3. Ensure latest version:
   ```bash
   opencode upgrade
   ```

### Authentication Issues

1. Re-authenticate with `/connect` command in TUI
2. Check API keys are valid
3. Ensure network allows connections to provider API

### Model Not Available

1. Check authentication with provider
2. Verify model name in config is correct
3. Some models require specific access/subscriptions

**ProviderModelNotFoundError:**
Models must be referenced as `<providerId>/<modelId>`

Examples:
- `openai/gpt-4.1`
- `openrouter/google/gemini-2.5-flash`
- `opencode/kimi-k2`

Check available models:
```bash
opencode models
```

### ProviderInitError

Invalid or corrupted configuration.

**Resolution:**
1. Verify provider setup (see providers guide)
2. Clear stored configuration:
   ```bash
   rm -rf ~/.local/share/opencode
   ```
   (Windows: Delete `%USERPROFILE%\.local\share\opencode`)
3. Re-authenticate with `/connect` command

### AI_APICallError and Provider Package Issues

Outdated provider packages may cause API call errors.

**Resolution:**
1. Clear provider package cache:
   ```bash
   rm -rf ~/.cache/opencode
   ```
   (Windows: Delete `%USERPROFILE%\.cache\opencode`)
2. Restart OpenCode to reinstall latest provider packages

### Copy/Paste Not Working on Linux

Linux requires clipboard utilities:

**For X11 systems:**
```bash
apt install -y xclip
# or
apt install -y xsel
```

**For Wayland systems:**
```bash
apt install -y wl-clipboard
```

**For headless environments:**
```bash
apt install -y xvfb
# and run:
Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 &
export DISPLAY=:99.0
```

OpenCode will detect Wayland and prefer `wl-clipboard`, otherwise try `xclip` then `xsel`.
