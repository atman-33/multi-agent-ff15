# MCP Setup Guide

MCP (Model Context Protocol) servers extend OpenCode functionality.

---

## What is MCP?

MCP servers provide OpenCode with access to external tools:
- **Memory MCP** → Retain memory across sessions
- **Playwright MCP** (Optional) → Browser automation, screenshots, web scraping *(Note: Consumes significant context; install only if needed)*

---

## Installing MCP Servers

OpenCode manages MCP servers via config file. Add to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "memory": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-memory"],
      "environment": {
        "MEMORY_FILE_PATH": "$PWD/memory/noctis_memory.jsonl"
      },
      "enabled": true
    },
    "playwright": {
      "type": "local",
      "command": ["npx", "@playwright/mcp@latest"],
      "enabled": false
    }
  }
}
```

**Note:** Playwright MCP is disabled by default because it consumes significant context tokens. Enable (`"enabled": true`) only if you need browser automation features.

---

## Verify Installation

```bash
opencode mcp list
```

Check MCP server status.

---

## Memory MCP Usage

Memory MCP automatically saves and loads preferences across sessions. No manual intervention needed.

### What gets saved

- Your preferences (e.g., "I prefer simple approaches")
- Project-specific knowledge
- Cross-session context

### How to use

Just tell Noctis your preferences once:

```
You: "I prefer simple approaches over complex ones"
```

Next session, Noctis will remember and apply this preference automatically.

---

## Playwright MCP Usage (Optional)

If you need browser automation, enable Playwright MCP:

1. Edit `~/.config/opencode/opencode.json`
2. Set `"enabled": true` for playwright
3. Restart OpenCode

### Use cases

- Taking screenshots of web pages
- Scraping web content
- Automating browser interactions

### Warning

Playwright MCP consumes significant context tokens. Only enable if you actively need browser automation features.
