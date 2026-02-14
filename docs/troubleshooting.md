# Troubleshooting

## MCP tools not working?

MCP tools are "lazy-loaded" and must be loaded first:

```
# Wrong - tool not loaded
mcp__memory__read_graph()  ← Error!

# Correct - load first
ToolSearch("select:mcp__memory__read_graph")
mcp__memory__read_graph()  ← Works!
```

---

## Agent requesting permissions?

Confirm you're starting with `--dangerously-skip-permissions`:

```bash
opencode
```

---

## Worker stuck?

Check worker pane:
```bash
tmux attach-session -t ff15
# Ctrl+B then numbers to switch panes
```

---

## Noctis or agent crashed? (OpenCode process killed)

**Do NOT use the `ffa` alias to restart.** This alias is for attaching to tmux sessions. Running it inside an existing tmux pane causes session nesting, breaking input and making the pane unusable.

### Correct restart methods

```bash
# Method 1: Execute opencode directly in pane
opencode

# Method 2: Force restart with respawn-pane (also resolves nesting)
tmux respawn-pane -t ff15:0 -k 'opencode'
```

### If you accidentally nested tmux

1. Press `Ctrl+B` then `d` to detach (exit inner session)
2. Then run `opencode` directly (don't use `ffa`)
3. If detach doesn't work, force reset from another pane with `tmux respawn-pane -k`

---

## WSL2 Issues

### WSL2 not installed

Run PowerShell as administrator:
```powershell
wsl --install
```

Then restart your computer.

### Ubuntu not set as default

```powershell
wsl --set-default Ubuntu
```

### Can't access files in WSL

Windows files are accessible from WSL at `/mnt/c/`, `/mnt/d/`, etc.

Example:
```bash
cd /mnt/c/tools/multi-agent-ff15
```

---

## OpenCode Issues

### OpenCode not found

Make sure you've run `source ~/.bashrc` after `first_setup.sh`:

```bash
source ~/.bashrc
opencode --version
```

### Authentication issues

Re-run authentication:

```bash
opencode
# Follow authentication prompts
# Type /exit to quit
```

---

## tmux Issues

### Session already exists

Kill the existing session and start fresh:

```bash
tmux kill-session -t ff15
./standby.sh
```

### Can't see panes

Make sure your terminal window is large enough. Resize the window or use `Ctrl+B` then arrow keys to navigate.

### Mouse not working

Check if mouse mode is enabled in `~/.tmux.conf`:

```bash
grep "set -g mouse on" ~/.tmux.conf
```

If not present, add it:

```bash
echo "set -g mouse on" >> ~/.tmux.conf
```

Then restart tmux.
