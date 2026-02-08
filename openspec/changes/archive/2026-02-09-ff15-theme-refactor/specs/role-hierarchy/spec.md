## ADDED Requirements

### Requirement: Role naming convention

The system SHALL use the following role names consistently across all files:
- Commander agent: **Noctis** (replacing Shogun/将軍)
- Task manager agent: **Ignis** (replacing Karo/家老)
- Worker agents: **Comrades** (replacing Ashigaru/足軽)

The tmux session hosting Ignis and all Comrades is named **kingsglaive**.

All references to `shogun`, `karo`, `ashigaru`, `将軍`, `家老`, `足軽` in code, configuration, instructions, and documentation MUST be replaced with the corresponding FF15 names.

#### Scenario: Instruction files use FF15 role names

- **WHEN** an agent reads its instruction file
- **THEN** the file MUST use only FF15 role names (Noctis, Ignis, Comrades) and MUST NOT contain any Sengoku role names (Shogun, Karo, Ashigaru, 将軍, 家老, 足軽)

#### Scenario: AGENTS.md uses FF15 role names

- **WHEN** any agent reads AGENTS.md
- **THEN** all role references, hierarchy diagrams, and communication rules MUST use FF15 naming (Noctis, Ignis, Comrades with character names)

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

The system SHALL have 4 Comrade agents, each associated with an FF15 character for thematic identity:

| Agent ID | Character | Identity |
|----------|-----------|----------|
| gladiolus | Gladiolus (グラディオラス) | 王の盾 (Shield) |
| prompto | Prompto (プロンプト) | 銃使い (Recon) |
| lunafreya | Lunafreya (ルナフレーナ) | 神凪 (Oracle) |
| iris | Iris (イリス) | 花 (Support) |

Character assignments are cosmetic and MUST NOT restrict which tasks an agent can receive.
Agent IDs use character names directly (not numbered `kingsglaive{N}` format).

#### Scenario: Character identity in instructions

- **WHEN** the Comrade instruction file lists agent character assignments
- **THEN** all 4 agents MUST have their FF15 character listed with a brief identity description

### Requirement: tmux session naming

tmux sessions SHALL use FF15-themed names:
- Commander session: `noctis` (replacing `shogun`)
- Worker session: `kingsglaive` (replacing `multiagent`)

The `kingsglaive` session contains 5 panes: Ignis (pane 0) + 4 Comrades (panes 1-4).

All send-keys targets, capture-pane commands, and pane references MUST use the new session names.

#### Scenario: send-keys targets use new session names

- **WHEN** an agent sends a tmux send-keys command to another agent
- **THEN** the target MUST use `kingsglaive:` prefix (replacing `multiagent:`) or `noctis` session name (replacing `shogun`)

#### Scenario: Pane identification uses character names

- **WHEN** checking agent identity via `@agent_id`
- **THEN** worker agents MUST have `@agent_id` set to their character name (gladiolus, prompto, lunafreya, iris)
- **AND** the task manager MUST have `@agent_id` set to `ignis`

### Requirement: Queue file naming

Queue files SHALL use character names directly:
- `queue/noctis_to_ignis.yaml` (replacing `queue/shogun_to_karo.yaml`)
- `queue/tasks/{character_name}.yaml` (e.g., `gladiolus.yaml`, `prompto.yaml`, `lunafreya.yaml`, `iris.yaml`)
- `queue/reports/{character_name}_report.yaml` (e.g., `gladiolus_report.yaml`, `prompto_report.yaml`, etc.)

#### Scenario: Agents read and write to correctly named queue files

- **WHEN** Noctis writes a command to the instruction queue
- **THEN** the file path MUST be `queue/noctis_to_ignis.yaml`

#### Scenario: Workers use character-named task files

- **WHEN** a Comrade agent reads its task file
- **THEN** the path MUST be `queue/tasks/{character_name}.yaml` where character_name is the agent's FF15 character name

### Requirement: Config model structure

`config/models.yaml` SHALL use a nested structure organized by modes and character names:

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
    iris:
      model: <model_id>
      label: <display_name>
```

Available modes: `normal`, `fullpower`, `lite`, `free-glm`, `free-kimi`.

#### Scenario: Deployment script reads model config by character name

- **WHEN** `standby.sh` reads model configuration
- **THEN** it MUST reference agent names directly (e.g., `GLADIOLUS_MODEL`, `PROMPTO_MODEL`)

### Requirement: Forbidden action penalty phrasing

The penalty phrase for forbidden actions MUST change from 「違反は切腹」(violation is seppuku) to 「違反は追放」(violation is exile).

#### Scenario: Instruction files use exile phrasing

- **WHEN** instruction YAML front matter lists forbidden actions
- **THEN** the comment MUST say 「違反は追放」 not 「違反は切腹」
