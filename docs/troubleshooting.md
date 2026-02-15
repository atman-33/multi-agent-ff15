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

---

## Messaging System Issues

### flock timeout (YAML write fails)

Symptom: `[FLOCK ERROR]` in agent output, YAML file not updated.

```bash
# Check for stale lock files
ls -la queue/tasks/*.lock queue/inbox/*.lock 2>/dev/null

# Remove stale locks (only if no agents are running)
rm -f queue/tasks/*.lock queue/inbox/*.lock
```

Common causes:
- Another process holds the lock for >5 seconds
- WSL2 symlink pointing to Windows filesystem (flock requires Linux FS)

### Inbox messages not delivered

```bash
# Check inbox file exists and is valid YAML
python3 -c "import yaml; print(yaml.safe_load(open('queue/inbox/ignis.yaml')))"

# Check unread count
bash scripts/inbox_read.sh ignis --peek

# Reinitialize corrupted inbox
echo "messages: []" > queue/inbox/ignis.yaml
```

### Agent not responding to messages

1. Check busy state: `bash scripts/busy_detect.sh ignis`
2. If BUSY — agent is working, message saved to inbox (delivered after current task)
3. If IDLE but unresponsive — manually wake: `.opencode/skills/send-message/scripts/send.sh ignis "Check your inbox"`

### Escalation plugin not triggering

The `inbox-watcher.ts` plugin:
- Only runs on the **noctis** agent
- Only monitors **Comrades** (Ignis, Gladiolus, Prompto)
- Requires 4 minutes of continuous unread messages before `/clear`
- Has 5-minute cooldown per agent

```bash
# Check escalation logs
cat queue/metrics/ignis_escalation.yaml 2>/dev/null
cat queue/metrics/gladiolus_escalation.yaml 2>/dev/null
cat queue/metrics/prompto_escalation.yaml 2>/dev/null
```

### Inbox overflow (too many messages)

Inbox auto-prunes to 50 messages (all unread + newest 30 read). If inbox grows unexpectedly:

```bash
# Check message count
python3 -c "import yaml; msgs=yaml.safe_load(open('queue/inbox/noctis.yaml'))['messages']; print(f'Total: {len(msgs)}, Unread: {sum(1 for m in msgs if not m.get(\"read\", False))}')"

# Reset inbox (loses history)
echo "messages: []" > queue/inbox/noctis.yaml
```
