---
name: opencode-troubleshoot
description: Diagnose and resolve OpenCode issues including startup failures, authentication problems, plugin conflicts, performance issues, and provider errors. Use when OpenCode won't start, shows errors, runs slowly, has connection issues, or when plugins/cache/storage need investigation. Provides log analysis, cache clearing, storage inspection, and step-by-step troubleshooting procedures.
---

# OpenCode Troubleshoot

Comprehensive troubleshooting toolkit for OpenCode issues.

## Quick Diagnosis

Use these scripts for immediate investigation:

```bash
# Check logs for errors
.opencode/skills/opencode-troubleshoot/scripts/check_logs.sh [number_of_files]

# Inspect storage structure and authentication
.opencode/skills/opencode-troubleshoot/scripts/check_storage.sh

# Clear cache to resolve plugin/provider issues
.opencode/skills/opencode-troubleshoot/scripts/clear_cache.sh
```

## Common Troubleshooting Workflows

### Workflow 1: OpenCode Won't Start

1. Check logs:
   ```bash
   .opencode/skills/opencode-troubleshoot/scripts/check_logs.sh
   ```
2. Try running with debug logging:
   ```bash
   opencode --log-level DEBUG
   ```
3. Check for plugin conflicts (see [references/troubleshooting-guide.md](references/troubleshooting-guide.md#disable-plugins))
4. Clear cache if needed:
   ```bash
   .opencode/skills/opencode-troubleshoot/scripts/clear_cache.sh
   ```

### Workflow 2: Performance Issues / Slow Response

1. Check storage size:
   ```bash
   .opencode/skills/opencode-troubleshoot/scripts/check_storage.sh
   ```
2. Clear cache (forces reinstall of provider packages):
   ```bash
   .opencode/skills/opencode-troubleshoot/scripts/clear_cache.sh
   ```
3. Restart OpenCode

### Workflow 3: Plugin Causing Crashes

1. Disable all plugins in config:
   - Edit `~/.config/opencode/opencode.jsonc`
   - Set `"plugin": []`
2. Restart OpenCode
3. Re-enable plugins one at a time
4. Identify problematic plugin

### Workflow 4: Authentication / Provider Errors

1. Check authentication status:
   ```bash
   .opencode/skills/opencode-troubleshoot/scripts/check_storage.sh
   ```
   (Verify `auth.json` exists)
2. Clear provider package cache:
   ```bash
   .opencode/skills/opencode-troubleshoot/scripts/clear_cache.sh
   ```
3. Re-authenticate:
   ```bash
   opencode
   # Then use /connect command
   ```

## Detailed Reference

For comprehensive troubleshooting procedures including:
- Desktop app specific issues
- Platform-specific problems (Linux Wayland/X11, Windows WebView2)
- Server connection issues
- Notifications not showing
- Storage reset procedures

See: [references/troubleshooting-guide.md](references/troubleshooting-guide.md)

## Script Reference

| Script | Purpose | Usage |
|--------|---------|-------|
| `check_logs.sh` | View recent log files and latest log content | `./check_logs.sh [number_of_files]` |
| `check_storage.sh` | Inspect storage directory structure and key files | `./check_storage.sh` |
| `clear_cache.sh` | Clear OpenCode cache (interactive confirmation) | `./clear_cache.sh` |

All scripts are cross-platform (macOS, Linux, Windows).
