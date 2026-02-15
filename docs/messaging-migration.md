# Messaging System Migration Guide

Migration from the legacy direct-write messaging to the new inbox-based messaging system.

## What Changed

| Component | Before | After |
|-----------|--------|-------|
| YAML writes | Direct `cat >` | `scripts/yaml_write_flock.sh` (atomic flock + tmp + rename) |
| Message delivery | `tmux send-keys` only | `inbox_write.sh` + busy detection + `tmux send-keys` |
| Message history | None (overwritten each time) | `queue/inbox/{agent}.yaml` (persistent, pruned to 50) |
| Race protection | Organizational rule (RACE-001) | Technical enforcement via flock (fd 200) |
| Stuck agents | Manual intervention | Auto-escalation via `inbox-watcher.ts` plugin (4min → `/clear`) |
| Busy detection | None (Enter key could be lost) | `busy_detect.sh` checks tmux pane before nudge |

## Cutover Steps

### Step 1: Verify Prerequisites

```bash
# flock must be available
command -v flock && echo "OK" || echo "MISSING: sudo apt install util-linux"

# Python 3 with PyYAML
python3 -c "import yaml; print('OK')" || echo "MISSING: pip3 install pyyaml"

# All scripts are executable
ls -la scripts/yaml_write_flock.sh scripts/inbox_write.sh scripts/inbox_read.sh scripts/busy_detect.sh
```

### Step 2: Initialize Inbox Files

Inbox files are created automatically by `standby.sh --clean`. For manual initialization:

```bash
mkdir -p queue/inbox
for agent in noctis lunafreya ignis gladiolus prompto iris; do
    echo "messages: []" > queue/inbox/${agent}.yaml
done
```

### Step 3: Verify Skills Are Updated

All skills should already use the new messaging:

| Skill | flock | Inbox dual-write | Busy detection |
|-------|-------|-------------------|----------------|
| `send-message` | N/A | ✅ `inbox_write.sh` | ✅ `busy_detect.sh` |
| `send-task` | ✅ `yaml_write_flock.sh` | ✅ inbox to target agent | N/A |
| `send-report` | ✅ `yaml_write_flock.sh` | ✅ inbox to noctis | N/A |
| `luna-to-noctis` | ✅ `yaml_write_flock.sh` | ✅ inbox to noctis | N/A |
| `noctis-to-luna` | ✅ `yaml_write_flock.sh` | N/A | N/A |

### Step 4: Verify Plugin Is Active

```bash
# inbox-watcher.ts should be in plugins directory
ls -la .opencode/plugins/inbox-watcher.ts
```

The plugin activates automatically when OpenCode starts on the noctis agent. It:
- Polls every 30s
- Only monitors Comrades (Ignis, Gladiolus, Prompto)
- Sends `/clear` after 4 minutes of unread messages
- 5-minute cooldown per agent

### Step 5: Deploy

```bash
# Clean start (resets queues + inbox + dashboard)
./standby.sh --clean

# Or preserve state
./standby.sh
```

## Backward Compatibility

The new system runs **alongside** the existing task/report YAML workflow:

- `queue/tasks/{agent}.yaml` — Still the authoritative source for task content
- `queue/reports/{agent}_report.yaml` — Still the authoritative source for reports
- `queue/inbox/{agent}.yaml` — **Additive** message history + unread tracking

Agents check inbox first (for unread notifications), then read task/report YAMLs for actual content.

## Rollback

Each phase can be rolled back independently:

| Phase | Rollback Steps |
|-------|---------------|
| Phase 1 (flock) | Revert skill scripts to direct `cat >` writes. Remove `scripts/yaml_write_flock.sh`. |
| Phase 2 (inbox) | Remove `inbox_write.sh` calls from skills. Delete `queue/inbox/` directory. Revert agent prompts. |
| Phase 3 (busy + escalation) | Delete `.opencode/plugins/inbox-watcher.ts`. Remove `busy_detect.sh` calls from `send.sh`. |

No data loss in any rollback scenario — existing task/report YAMLs are unaffected.

## Verifying the Migration

Run the integration test suite:

```bash
bash tests/test_phase4_integration.sh
```

Expected: 8 passed, 0 failed (4 skipped tests require live tmux agents).

Individual component tests:

```bash
# flock stress test (10 parallel writers, 100 iterations)
bash tests/stress_test_flock.sh

# Inbox concurrent write test (3 senders, 20 iterations)
bash tests/stress_test_inbox_concurrent.sh

# Inbox overflow pruning test
bash tests/test_inbox_overflow.sh

# Busy detection validation (12 tests)
bash tests/test_phase3_busy_detect.sh
```
