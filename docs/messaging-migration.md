# Messaging System Architecture

The inbox-based messaging system with automatic agent notification.

## Architecture

| Component | Implementation |
|-----------|---------------|
| YAML writes | `scripts/yaml_write_flock.sh` (atomic flock + tmp + rename) |
| Message delivery | `scripts/inbox_write.sh` → `queue/inbox/{agent}.yaml` |
| Agent wake | `inbox-auto-notify.ts` plugin (file watcher on inbox directory) |
| Message history | `queue/inbox/{agent}.yaml` (persistent, pruned to 50) |
| Race protection | flock (fd 200) via `yaml_write_flock.sh` and `inbox_write.sh` |
| Stuck agents | Auto-escalation via `inbox-watcher.ts` plugin (4min → `/clear`) |
| Busy detection | `busy_detect.sh` checks tmux pane before nudge |

## Message Flow

```
Noctis → Comrade:   scripts/send_task.sh <name> "<desc>"    → queue/inbox/{name}.yaml
Comrade → Noctis:   scripts/send_report.sh "<id>" "<s>" ... → queue/inbox/noctis.yaml
Luna → Noctis:      scripts/luna_to_noctis.sh "<desc>"      → queue/inbox/noctis.yaml
Noctis → Luna:      scripts/noctis_to_luna.sh "<desc>"      → queue/inbox/lunafreya.yaml
Iris → Noctis:      scripts/inbox_write.sh noctis iris ...   → queue/inbox/noctis.yaml
```

All scripts write to `queue/inbox/{target}.yaml`. The `inbox-auto-notify` plugin detects file changes and wakes target agents via tmux automatically.

## Plugins

| Plugin | Runs On | Purpose |
|--------|---------|---------|
| `inbox-auto-notify.ts` | Noctis | Watches inbox file changes, wakes target agents via tmux |
| `inbox-watcher.ts` | Noctis | Escalation: sends `/clear` after 4min unread messages |
| `iris-watcher.ts` | Noctis | Detects report messages in Noctis inbox, notifies Iris |
| `yaml-write-validator.ts` | All | Prevents self-inbox writes and legacy path usage |

## Setup

### Prerequisites

```bash
command -v flock && echo "OK" || echo "MISSING: sudo apt install util-linux"
python3 -c "import yaml; print('OK')" || echo "MISSING: pip3 install pyyaml"
ls -la scripts/yaml_write_flock.sh scripts/inbox_write.sh scripts/inbox_read.sh scripts/busy_detect.sh
```

### Initialize Inbox Files

Inbox files are created automatically by `standby.sh --clean`. For manual initialization:

```bash
mkdir -p queue/inbox
for agent in noctis lunafreya ignis gladiolus prompto iris; do
    echo "messages: []" > queue/inbox/${agent}.yaml
done
```

### Deploy

```bash
./standby.sh --clean    # Clean start (resets inbox + dashboard)
./standby.sh            # Preserve state
```

## Verifying

```bash
bash tests/test_phase4_integration.sh
```

Expected: 8 passed, 0 failed (4 skipped tests require live tmux agents).

Individual component tests:

```bash
bash tests/stress_test_flock.sh
bash tests/stress_test_inbox_concurrent.sh
bash tests/test_inbox_overflow.sh
bash tests/test_phase3_busy_detect.sh
```
