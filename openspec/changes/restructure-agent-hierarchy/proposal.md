## Why

The current 3-layer hierarchy (User → Noctis → Ignis → Comrades) introduces unnecessary complexity in command delegation and communication paths. Simplifying to a 2-layer structure (User → Noctis → Comrades) reduces cognitive overhead, API costs from extra message passing, and makes the system easier to understand and maintain.

## What Changes

- **Noctis role elevation**: Prince → King (Leader), inheriting Ignis's task management responsibilities
- **Ignis role change**: Strategist → Comrade (one of the worker agents)
- **Agent reduction**: 6 agents → 5 agents (remove Iris)
- **Lunafreya independence**: Direct communication with Crystal (user), can issue commands to Noctis when needed
- **tmux simplification**: 2 sessions → 1 session with 5 panes
- **Pane layout**: 
  - Top row: Noctis (left), Lunafreya (right)
  - Bottom row: Ignis (left), Gladiolus (center), Prompto (right)

## Capabilities

### New Capabilities
- `agent-hierarchy-2-layer`: Two-layer agent hierarchy with Noctis as the task manager
- `tmux-single-session-layout`: Single tmux session with 5-pane layout
- `lunafreya-independent-mode`: Lunafreya operates independently with direct user access and ability to command Noctis

### Modified Capabilities
- `role-hierarchy`: Agent role definitions change (Noctis becomes task manager, Ignis becomes worker)
- `file-structure`: Queue and configuration files structure (remove Iris-related files)

## Impact

- **standby.sh**: Complete restructure of tmux session creation, pane layout, and agent initialization
- **instructions/**: Role definition files must reflect new hierarchy (noctis.md, ignis.md, comrades.md)
- **queue/**: Remove Iris task/report files, update noctis→comrades communication pattern
- **config/models.yaml**: Agent configuration (remove Iris, update role descriptions)
- **AGENTS.md**: System overview documentation updates
- **dashboard.md template**: May need updates to reflect new command flow
