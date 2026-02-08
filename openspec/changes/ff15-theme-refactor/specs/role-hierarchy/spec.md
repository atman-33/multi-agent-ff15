## ADDED Requirements

### Requirement: Role naming convention

The system SHALL use the following role names consistently across all files:
- Commander agent: **Noctis** (replacing Shogun/将軍)
- Task manager agent: **Ignis** (replacing Karo/家老)
- Worker agents: **Kingsglaive** (replacing Ashigaru/足軽)

All references to `shogun`, `karo`, `ashigaru`, `将軍`, `家老`, `足軽` in code, configuration, instructions, and documentation MUST be replaced with the corresponding FF15 names.

#### Scenario: Instruction files use FF15 role names

- **WHEN** an agent reads its instruction file
- **THEN** the file MUST use only FF15 role names (Noctis, Ignis, Kingsglaive) and MUST NOT contain any Sengoku role names (Shogun, Karo, Ashigaru, 将軍, 家老, 足軽)

#### Scenario: AGENTS.md uses FF15 role names

- **WHEN** any agent reads AGENTS.md
- **THEN** all role references, hierarchy diagrams, and communication rules MUST use FF15 naming (Noctis, Ignis, Kingsglaive)

### Requirement: Instruction file naming

Instruction files SHALL be named after the FF15 roles:
- `instructions/noctis.md` (replacing `instructions/shogun.md`)
- `instructions/ignis.md` (replacing `instructions/karo.md`)
- `instructions/kingsglaive.md` (replacing `instructions/ashigaru.md`)

#### Scenario: Agent startup reads correctly named instruction file

- **WHEN** an agent starts a new session and reads its role instructions
- **THEN** the instruction file path MUST match the FF15 naming convention

### Requirement: YAML front matter role field

Each instruction file's YAML front matter MUST set the `role` field to the FF15 role name:
- `role: noctis` (in `instructions/noctis.md`)
- `role: ignis` (in `instructions/ignis.md`)
- `role: kingsglaive` (in `instructions/kingsglaive.md`)

#### Scenario: Role field matches FF15 naming

- **WHEN** parsing the YAML front matter of an instruction file
- **THEN** the `role` field MUST be one of `noctis`, `ignis`, or `kingsglaive`

### Requirement: Kingsglaive character assignments

Each Kingsglaive agent (1-8) SHALL be associated with an FF15 character for thematic identity:

| Agent ID | Character | Identity |
|----------|-----------|----------|
| kingsglaive1 | Gladiolus | Shield |
| kingsglaive2 | Prompto | Recon |
| kingsglaive3 | Lunafreya | Oracle |
| kingsglaive4 | Iris | Support |
| kingsglaive5 | Cor | Immortal Marshal |
| kingsglaive6 | Aranea | Mercenary |
| kingsglaive7 | Ravus | Imperial General |
| kingsglaive8 | Ardyn | Chancellor |

Character assignments are cosmetic and MUST NOT restrict which tasks an agent can receive.

#### Scenario: Character identity in instructions

- **WHEN** the Kingsglaive instruction file lists agent character assignments
- **THEN** all 8 agents MUST have their FF15 character listed with a brief identity description

### Requirement: tmux session naming

tmux sessions SHALL use FF15-themed names:
- Commander session: `noctis` (replacing `shogun`)
- Worker session: `kingsglaive` (replacing `multiagent`)

All send-keys targets, capture-pane commands, and pane references MUST use the new session names.

#### Scenario: send-keys targets use new session names

- **WHEN** an agent sends a tmux send-keys command to another agent
- **THEN** the target MUST use `kingsglaive:` prefix (replacing `multiagent:`) or `noctis` session name (replacing `shogun`)

#### Scenario: Pane identification uses kingsglaive prefix

- **WHEN** checking agent identity via `@agent_id`
- **THEN** worker agents MUST have `@agent_id` set to `kingsglaive{N}` (replacing `ashigaru{N}`)
- **AND** the task manager MUST have `@agent_id` set to `ignis` (replacing `karo`)

### Requirement: Queue file naming

Queue files SHALL use FF15-themed names:
- `queue/noctis_to_ignis.yaml` (replacing `queue/shogun_to_karo.yaml`)
- `queue/tasks/kingsglaive{N}.yaml` (replacing `queue/tasks/ashigaru{N}.yaml`)
- `queue/reports/kingsglaive{N}_report.yaml` (replacing `queue/reports/ashigaru{N}_report.yaml`)

#### Scenario: Agents read and write to correctly named queue files

- **WHEN** Noctis writes a command to the instruction queue
- **THEN** the file path MUST be `queue/noctis_to_ignis.yaml`

#### Scenario: Workers use kingsglaive-named task files

- **WHEN** a Kingsglaive agent reads its task file
- **THEN** the path MUST be `queue/tasks/kingsglaive{N}.yaml` where N is the agent number

### Requirement: Config key naming

`config/models.yaml` keys SHALL use FF15 role names:
- `noctis_model` / `noctis_label` (replacing `shogun_model` / `shogun_label`)
- `ignis_model` / `ignis_label` (replacing `karo_model` / `karo_label`)
- `kingsglaive_1_4_model` / `kingsglaive_1_4_label` (replacing `ashigaru_1_4_model` / `ashigaru_1_4_label`)
- `kingsglaive_5_8_model` / `kingsglaive_5_8_label` (replacing `ashigaru_5_8_model` / `ashigaru_5_8_label`)

#### Scenario: Shell scripts read new config keys

- **WHEN** `shutsujin_departure.sh` reads model configuration
- **THEN** it MUST reference `noctis_model`, `ignis_model`, `kingsglaive_1_4_model`, `kingsglaive_5_8_model` (and corresponding label keys)

### Requirement: Forbidden action penalty phrasing

The penalty phrase for forbidden actions MUST change from 「違反は切腹」(violation is seppuku) to 「違反は追放」(violation is exile).

#### Scenario: Instruction files use exile phrasing

- **WHEN** instruction YAML front matter lists forbidden actions
- **THEN** the comment MUST say 「違反は追放」 not 「違反は切腹」
