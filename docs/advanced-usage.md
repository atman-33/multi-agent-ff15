# Advanced Usage

## Script Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Initial Setup (run once)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  install.bat (Windows)                                              │
│      │                                                              │
│      ├── Check/guide WSL2 installation                              │
│      └── Check/guide Ubuntu installation                            │
│                                                                     │
│  first_setup.sh (run manually in Ubuntu/WSL)                        │
│      │                                                              │
│      ├── Check/install tmux                                         │
│      ├── Check/install Node.js v20+ (via nvm)                       │
│      ├── Check/install OpenCode CLI                                 │
│      │       ※ Suggests migration to native version if npm detected │
│      └── Setup Memory MCP server                                    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                      Daily Startup (run daily)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  standby.sh                                                          │
│      │                                                              │
│      ├──▶ Create tmux sessions                                      │
│      │         • "ff15" session (6 panes)                           │
│      │                                                              │
│      ├──▶ Reset queue files and dashboard                           │
│      │                                                              │
│      └──▶ Start OpenCode on all agents                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## standby.sh Options

```bash
# Default: Full startup (tmux session + OpenCode startup)
./standby.sh

# Session setup only (no OpenCode startup)
./standby.sh -s
./standby.sh --setup-only

# Clear task queues (preserve command history)
./standby.sh -c
./standby.sh --clean

# Full Power: Start all Comrades with premium models (max capability, high cost)
./standby.sh --fullpower

# Lite: Start with budget models
./standby.sh --lite

# Full startup + open Windows Terminal tabs
./standby.sh -t
./standby.sh --terminal

# Show help
./standby.sh -h
./standby.sh --help
```

---

## Common Workflows

### Normal daily use

```bash
./standby.sh                      # Start everything
ffa                               # Connect and give commands
```

### Debug mode (manual control)

```bash
./standby.sh -s       # Create session only

# Manually start OpenCode on specific agents
tmux send-keys -t ff15:0 'opencode' Enter
tmux send-keys -t ff15:2 'opencode' Enter
```

### Restart after crash

```bash
# Kill existing session
tmux kill-session -t ff15

# Start fresh
./standby.sh
```

---

## Convenient Aliases

Running `first_setup.sh` automatically adds these aliases to `~/.bashrc` (or `~/.zshrc`):

```bash
alias ffa='tmux attach-session -t ff15'  # Connect to ff15 session
```

To apply aliases, run `source ~/.bashrc` or run `wsl --shutdown` in PowerShell and reopen terminal.

---

## Script Reference

| Script | Purpose | When to run |
|--------|---------|-------------|
| `install.bat` | Windows: Setup WSL2 + Ubuntu | First time only |
| `first_setup.sh` | Install tmux, dependencies, OpenCode CLI + Memory MCP setup | First time only |
| `standby.sh` | Create tmux session + Start OpenCode + Load instructions | Daily |

### What `install.bat` does automatically

- ✅ Check if WSL2 is installed (guide if not)
- ✅ Check if Ubuntu is installed (guide if not)
- ✅ Guide to next step (how to run `first_setup.sh`)

### What `standby.sh` does

- ✅ Create tmux session (ff15)
- ✅ Start OpenCode on all agents
- ✅ Auto-load instructions for each agent
- ✅ Reset queue files to fresh state

**After running, all agents are ready to receive commands!**

---

## Required Environment (for manual setup)

If manually installing dependencies:

| Requirement | Installation method | Notes |
|-------------|---------------------|-------|
| WSL2 + Ubuntu | `wsl --install` in PowerShell | Windows only |
| Set Ubuntu as default | `wsl --set-default Ubuntu` | Required for script operation |
| tmux | `sudo apt install tmux` | Terminal multiplexer |
| Node.js v20+ | `nvm install 20` | Required for MCP servers |
| OpenCode CLI | `npm install -g opencode` or from official site | Official OpenCode CLI |

---

## tmux Quick Reference

| Command | Description |
|---------|-------------|
| `ffa` (alias) | Connect to ff15 session |
| `tmux attach -t ff15` | Connect to ff15 session (full command) |
| `Ctrl+B` then `0-5` | Switch between panes |
| `Ctrl+B` then `d` | Detach (keeps running) |
| `tmux kill-session -t ff15` | Stop ff15 session |

### Mouse Operations

`first_setup.sh` automatically sets `set -g mouse on` in `~/.tmux.conf`, enabling intuitive mouse operations:

| Operation | Description |
|-----------|-------------|
| Mouse wheel | Scroll within pane (check output history) |
| Click pane | Switch focus between panes |
| Drag pane border | Resize panes |

Even if unfamiliar with keyboard operations, you can switch panes, scroll, and resize using only the mouse.
