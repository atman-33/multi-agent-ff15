## Context

The current multi-agent-ff15 system uses a 3-layer hierarchy inspired by FFXV:
- User (King) → Noctis (Prince) → Ignis (Strategist) → Comrades (4 workers)
- 2 tmux sessions: `noctis` (1 pane) + `kingsglaive` (5 panes: Ignis + 4 Comrades)
- Communication via YAML files + tmux send-keys

This structure creates unnecessary indirection:
- User commands go through 2 intermediaries before execution (Noctis → Ignis → Workers)
- Ignis's primary role is task distribution, which could be absorbed by Noctis
- Maintenance overhead: 2 sessions, 6 agents, complex communication paths

Simplifying to 2 layers reduces API costs, complexity, and cognitive load while maintaining parallel execution capabilities.

## Goals / Non-Goals

**Goals:**
- Reduce hierarchy from 3 to 2 layers (User → Noctis → Workers)
- Consolidate tmux into single session with intuitive layout
- Maintain parallel task execution (3 workers available)
- Preserve Lunafreya's special independent status
- Keep YAML + send-keys communication pattern intact

**Non-Goals:**
- Change communication protocol (still YAML + send-keys)
- Modify OpenCode integration or model selection logic
- Alter dashboard.md format or reporting structure
- Change Memory MCP or context persistence layers

## Decisions

### D1: Noctis absorbs Ignis's task management role

**Rationale**: Ignis's primary function (task breakdown and delegation) can be handled by Noctis directly. This eliminates one entire layer of message passing.

**Alternatives considered**:
- Keep Ignis, remove Noctis: Would lose the "prince/king" narrative alignment
- Keep both with different roles: Adds complexity without clear benefit

**Implementation**: 
- Move Ignis's workflow (task decomposition, worker assignment, dashboard updates) into noctis.md
- Repurpose ignis.md as a worker role definition

### D2: Single tmux session with visual hierarchy

**Rationale**: Having 2 sessions requires switching between them. Single session allows seeing all agents at once.

**Layout**:
```
┌──────────────┬──────────────┐
│    Noctis    │  Lunafreya   │  ← Top row: Command layer
├──────────────┼──────────────┤
│ Ignis   │ Gladiolus │ Prompto │  ← Bottom row: Workers (3 wide)
```

**Alternatives considered**:
- All 5 in one row: Too cramped horizontally
- Noctis in own row, 4 workers in grid: Wastes vertical space

### D3: Remove Iris, keep 5 agents

**Rationale**: User requested 3 workers. Removing Iris (the newest addition) keeps core team intact.

**Alternatives considered**:
- Remove Prompto or Gladiolus: Less narrative alignment (both are core FFXV party members)

### D4: Lunafreya remains independent but connected

**Rationale**: User specified Lunafreya should be independent for direct consultations, but can command Noctis.

**Implementation**:
- lunafreya.md instructions emphasize autonomy
- Preserve direct user interaction
- Add capability to write to a new `lunafreya_to_noctis.yaml` queue file when needed

### D5: Reuse existing queue structure

**Rationale**: Existing YAML queue pattern works well. Only paths change.

**Changes**:
- Rename: `queue/noctis_to_ignis.yaml` → `queue/noctis_to_workers.yaml`
- Remove: `queue/tasks/iris.yaml`, `queue/reports/iris_report.yaml`
- Add: `queue/lunafreya_to_noctis.yaml` (optional, for Lunafreya→Noctis commands)

## Risks / Trade-offs

### R1: Reduced parallel capacity (4→3 workers)
**Mitigation**: User explicitly requested 3 workers. Can be scaled back up if needed.

### R2: Noctis becomes a bottleneck
**Mitigation**: Noctis's role is still delegation, not execution. Workers do the actual work.

### R3: Lunafreya independence may create coordination issues
**Mitigation**: Clear documentation in lunafreya.md about when to coordinate with Noctis.

### R4: Breaking change for existing queue files
**Mitigation**: standby.sh --clean mode handles reset. Document migration in tasks.md.

## Migration Plan

1. **Backup**: standby.sh already creates backups in logs/ directory
2. **Deploy**: Update all files atomically (instructions, standby.sh, queue structure)
3. **Rollback**: Restore from git or logs/backup_* directory
4. **Validation**: Test with --setup-only flag, verify pane layout and agent IDs

## Open Questions

None - design is straightforward given the clear user requirements.
