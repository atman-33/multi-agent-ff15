## Purpose

Defines the single-session tmux layout with 5 panes organized in a 2-row structure for all ff15 agents.

## Requirements

### Requirement: Single tmux session

The system SHALL use a single tmux session named `ff15` containing all 5 agents.

The previous 2-session architecture (`noctis` + `kingsglaive`) is replaced by this unified session.

#### Scenario: Single session creation

- **WHEN** `standby.sh` executes
- **THEN** exactly one tmux session named `ff15` SHALL be created
- **AND** sessions named `noctis` or `kingsglaive` MUST NOT be created

#### Scenario: All agents in one session

- **WHEN** listing tmux panes in the `ff15` session
- **THEN** exactly 5 panes SHALL exist with agent IDs: noctis, lunafreya, ignis, gladiolus, prompto

### Requirement: Two-row pane layout

The session SHALL use a 2-row layout:
- **Top row**: 2 panes (Noctis left, Lunafreya right)
- **Bottom row**: 3 panes (Ignis left, Gladiolus center, Prompto right)

```
┌──────────────┬──────────────┐
│    Noctis    │  Lunafreya   │  ← Command layer
├──────────────┴──────────────┤
│ Ignis │ Gladiolus │ Prompto │  ← Worker layer (3 equal columns)
```

#### Scenario: Top row has command agents

- **WHEN** inspecting panes in row 0 of `ff15` session
- **THEN** pane 0 SHALL have `@agent_id` set to `noctis`
- **AND** pane 1 SHALL have `@agent_id` set to `lunafreya`

#### Scenario: Bottom row has three workers

- **WHEN** inspecting panes in row 1 of `ff15` session
- **THEN** pane 2 SHALL have `@agent_id` set to `ignis`
- **AND** pane 3 SHALL have `@agent_id` set to `gladiolus`
- **AND** pane 4 SHALL have `@agent_id` set to `prompto`

### Requirement: Pane width distribution

The layout SHALL distribute panes as follows:
- Top row: 50% width each (Noctis | Lunafreya)
- Bottom row: 33% width each (Ignis | Gladiolus | Prompto)

Panes SHALL resize proportionally when terminal window size changes.

#### Scenario: Top row equal split

- **WHEN** the terminal is 200 columns wide
- **THEN** Noctis and Lunafreya panes SHALL each be approximately 100 columns wide

#### Scenario: Bottom row three-way split

- **WHEN** the terminal is 200 columns wide
- **THEN** Ignis, Gladiolus, and Prompto panes SHALL each be approximately 66 columns wide

### Requirement: tmux send-keys target format

All send-keys commands SHALL use the format `ff15:{pane_index}` or target by `@agent_id`.

The session name prefix changes from `noctis:` or `kingsglaive:` to `ff15:`.

#### Scenario: Send command to Ignis

- **WHEN** Noctis sends a wake-up signal to Ignis
- **THEN** the tmux command SHALL be `tmux send-keys -t ff15:2 'message'`
- **OR** `tmux send-keys -t $(tmux list-panes -t ff15 -F '#{pane_index}' -f '#{==:#{@agent_id},ignis}') 'message'`

#### Scenario: Send command to Lunafreya

- **WHEN** the user sends a command to Lunafreya
- **THEN** the tmux command SHALL be `tmux send-keys -t ff15:1 'message'`

### Requirement: Session attachment command

The session attachment command SHALL be `tmux attach-session -t ff15`.

Shell aliases SHALL be updated:
- `ffa` → `tmux attach -t ff15` (Final Fantasy Attach - unified session access)

#### Scenario: User attaches to unified session

- **WHEN** the user runs `tmux attach-session -t ff15` or `ffa` alias
- **THEN** all 5 agent panes SHALL be visible in the 2-row layout
- **AND** the user SHALL be able to see Noctis, Lunafreya, and all Comrades simultaneously

### Requirement: Pane border formatting

The `ff15` session SHALL display agent names and model labels in pane borders using `pane-border-format`.

#### Scenario: Pane borders show agent identity

- **WHEN** viewing the `ff15` session
- **THEN** each pane border SHALL display: `{pane_index} {agent_id} ({model_label})`
- **AND** the format SHALL match: `0 noctis (Opus)`, `1 lunafreya (Opus)`, etc.
