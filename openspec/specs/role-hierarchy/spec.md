## Purpose

Defines the FF15 role hierarchy, naming conventions, character assignments, tmux session naming, queue file naming, and config structure for all agents.

## Requirements

### Requirement: Role naming convention

The system SHALL use the following role names consistently across all files:
- **King agent: Noctis** (task manager, delegation, dashboard updates)
- **Worker agents: Comrades** (task execution)

The tmux session hosting all agents is named **ff15** (single unified session).

Agent roles:
- **Noctis**: King/Leader - receives user commands, decomposes tasks, assigns to Comrades, updates dashboard
- **Ignis**: Comrade (Worker) - executes assigned tasks from Noctis
- **Gladiolus**: Comrade (Worker) - executes assigned tasks from Noctis
- **Prompto**: Comrade (Worker) - executes assigned tasks from Noctis
- **Lunafreya**: Independent Oracle - direct user interaction, optional coordination with Noctis

All references in code, configuration, instructions, and documentation MUST reflect these roles.

#### Scenario: Instruction files use updated role structure

- **WHEN** an agent reads its instruction file
- **THEN** Noctis's file MUST describe task manager responsibilities (decomposition, delegation, dashboard)
- **AND** Ignis's file MUST describe worker responsibilities (task execution, reporting)
- **AND** Lunafreya's file MUST describe independent operation with optional Noctis coordination

#### Scenario: AGENTS.md reflects 2-layer hierarchy

- **WHEN** any agent reads AGENTS.md
- **THEN** hierarchy diagrams MUST show User → Noctis → Comrades (2 layers)
- **AND** MUST show Lunafreya as independent with optional link to Noctis

### Requirement: Instruction file naming

Instruction files SHALL be named after the FF15 roles:
- `instructions/noctis.md` (replacing `instructions/shogun.md`)
- `instructions/ignis.md` (replacing `instructions/karo.md`)
- `instructions/comrades.md` (replacing `instructions/ashigaru.md`)

#### Scenario: Agent startup reads correctly named instruction file

- **WHEN** an agent starts a new session and reads its role instructions
- **THEN** the instruction file path MUST match the FF15 naming convention

### Requirement: YAML front matter role field

Each instruction file's YAML front matter MUST set the `role` field to the FF15 role name:
- `role: noctis` (in `instructions/noctis.md`)
- `role: ignis` (in `instructions/ignis.md`)
- `role: worker` (in `instructions/comrades.md`)

#### Scenario: Role field matches FF15 naming

- **WHEN** parsing the YAML front matter of an instruction file
- **THEN** the `role` field MUST be one of `noctis`, `ignis`, or `worker`

### Requirement: Comrade character assignments

The system SHALL have 3 Comrade agents (formerly 4):

| Agent ID | Character | Identity | Role |
|----------|-----------|----------|------|
| ignis | Ignis (イグニス) | 軍師 (Strategist) | Worker |
| gladiolus | Gladiolus (グラディオラス) | 王の盾 (Shield) | Worker |
| prompto | Prompto (プロンプト) | 銃使い (Recon) | Worker |

Lunafreya maintains her character identity but operates independently.

| Agent ID | Character | Identity | Role |
|----------|-----------|----------|------|
| lunafreya | Lunafreya (ルナフレーナ) | 神凪 (Oracle) | Independent |

Character assignments are cosmetic and MUST NOT restrict which tasks an agent can receive.

#### Scenario: Character identity shows new structure

- **WHEN** the Comrade instruction file lists agent character assignments
- **THEN** exactly 3 agents (Ignis, Gladiolus, Prompto) MUST be listed as Comrades
- **AND** Lunafreya MUST be documented separately as independent

### Requirement: tmux session naming

tmux sessions SHALL use a unified FF15-themed session:
- Unified session: `ff15` (replaces `noctis` and `kingsglaive` separate sessions)

The `ff15` session contains 5 panes:
- Pane 0: Noctis
- Pane 1: Lunafreya
- Pane 2: Ignis
- Pane 3: Gladiolus
- Pane 4: Prompto

All send-keys targets, capture-pane commands, and pane references MUST use the `ff15:` session name.

#### Scenario: send-keys targets use unified session name

- **WHEN** an agent sends a tmux send-keys command to another agent
- **THEN** the target MUST use `ff15:{pane_index}` format
- **AND** session names `noctis:` or `kingsglaive:` MUST NOT be used

#### Scenario: Pane identification uses unified session

- **WHEN** checking agent identity via `@agent_id`
- **THEN** all agents MUST be in the `ff15` session
- **AND** `@agent_id` values MUST be: noctis, lunafreya, ignis, gladiolus, prompto

### Requirement: Queue file naming

Queue files SHALL use simplified structure:
- ~~`queue/noctis_to_ignis.yaml`~~ (REMOVED - direct task assignment)
- `queue/tasks/{character_name}.yaml` for workers: ignis.yaml, gladiolus.yaml, prompto.yaml
- `queue/reports/{character_name}_report.yaml`: ignis_report.yaml, gladiolus_report.yaml, prompto_report.yaml
- `queue/lunafreya_to_noctis.yaml` (NEW - Lunafreya→Noctis command channel)

#### Scenario: Workers use character-named task files

- **WHEN** a Comrade agent (Ignis, Gladiolus, Prompto) reads its task file
- **THEN** the path MUST be `queue/tasks/{character_name}.yaml`
- **AND** the task SHALL be written directly by Noctis (not via intermediate queue)

#### Scenario: Lunafreya has command channel to Noctis

- **WHEN** Lunafreya needs to coordinate with Noctis
- **THEN** Lunafreya SHALL write to `queue/lunafreya_to_noctis.yaml`
- **AND** Noctis SHALL read this file when notified
with 5 agents (not 6):

```yaml
modes:
  <mode_name>:
    noctis:
      model: <model_id>
      label: <display_name>
    ignis:
      model: <model_id>
      label: <display_name>
    gladiolus:
      model: <model_id>
      label: <display_name>
    prompto:
      model: <model_id>
      label: <display_name>
    lunafreya:
      model: <model_id>
      label: <display_name>
```

The `iris` agent configuration is REMOVED.

#### Scenario: Deployment script reads 5 agent configs

- **WHEN** `standby.sh` reads model configuration
- **THEN** it MUST reference exactly 5 agents: noctis, ignis, gladiolus, prompto, lunafreya
- **AND** MUST NOT reference `iris`

## REMOVED Requirements

### Requirement: Iris character assignment

**Reason**: Agent count reduced from 4 to 3 Comrades (Ignis, Gladiolus, Prompto)

**Migration**: Remove all Iris references from configs, queue files, and instructions

- **WHEN** instruction YAML front matter lists forbidden actions
- **THEN** the comment MUST say 「違反は追放」 not 「違反は切腹」
