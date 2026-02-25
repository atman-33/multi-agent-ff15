# MCP Setup Guide

MCP (Model Context Protocol) servers extend OpenCode functionality.

---

## What is MCP?

MCP servers provide OpenCode with access to external tools:
- **Memory MCP** → Retain memory across sessions
- **Playwright MCP** (Optional) → Browser automation, screenshots, web scraping *(Note: Consumes significant context; install only if needed)*

---

## Installing MCP Servers

OpenCode manages MCP servers via project-local config file (`opencode.json` in project root).

The project's `opencode.json` already includes Memory MCP and Playwright MCP configurations. No manual setup required.

To override MCP configuration globally, edit `~/.config/opencode/opencode.json` (optional):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "memory": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-memory"],
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
