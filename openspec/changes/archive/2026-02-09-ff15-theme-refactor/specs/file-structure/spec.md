## ADDED Requirements

### Requirement: Instruction file renaming

The following file renames MUST be performed:
- `instructions/shogun.md` → `instructions/noctis.md`
- `instructions/karo.md` → `instructions/ignis.md`
- `instructions/ashigaru.md` → `instructions/comrades.md`

#### Scenario: Instruction files exist with new names

- **WHEN** listing files in `instructions/` directory
- **THEN** the files `noctis.md`, `ignis.md`, `comrades.md` MUST exist
- **AND** the files `shogun.md`, `karo.md`, `ashigaru.md` MUST NOT exist

### Requirement: Queue file renaming

The following file renames MUST be performed:
- `queue/shogun_to_karo.yaml` → `queue/noctis_to_ignis.yaml`
- `queue/tasks/ashigaru{N}.yaml` → `queue/tasks/{character_name}.yaml` (gladiolus, prompto, lunafreya, iris)
- `queue/reports/ashigaru{N}_report.yaml` → `queue/reports/{character_name}_report.yaml`

Only 4 worker queue files exist (matching the 4 Comrade agents).

#### Scenario: Queue files exist with new names

- **WHEN** listing files in `queue/`, `queue/tasks/`, and `queue/reports/`
- **THEN** all files MUST use `noctis_to_ignis` and character names (gladiolus, prompto, lunafreya, iris)
- **AND** no files with `shogun`, `karo`, or `ashigaru` naming SHALL exist

### Requirement: Internal file path references

All internal references to queue file paths MUST be updated:
- Instruction files referencing `queue/shogun_to_karo.yaml` → `queue/noctis_to_ignis.yaml`
- Instruction files referencing `queue/tasks/ashigaru{N}.yaml` → `queue/tasks/{character_name}.yaml`
- Instruction files referencing `queue/reports/ashigaru{N}_report.yaml` → `queue/reports/{character_name}_report.yaml`
- AGENTS.md referencing any queue paths MUST use new names
- Shell scripts referencing queue paths MUST use new names

#### Scenario: No broken file path references

- **WHEN** grep searching across all `.md`, `.yaml`, `.sh`, and `.bat` files for `ashigaru` or `shogun_to_karo`
- **THEN** zero matches MUST be found (excluding `openspec/` and `backup/` historical files)

### Requirement: tmux session name references in scripts

`standby.sh` and `first_setup.sh` MUST use:
- `noctis` as the commander tmux session name (replacing `shogun`)
- `kingsglaive` as the worker tmux session name (replacing `multiagent`)

All `tmux new-session`, `tmux send-keys`, `tmux attach-session`, and alias definitions MUST reference the new session names.

#### Scenario: Deployment script creates correct sessions

- **WHEN** running `standby.sh`
- **THEN** tmux sessions named `noctis` and `kingsglaive` MUST be created
- **AND** no sessions named `shogun` or `multiagent` SHALL be created

### Requirement: Shell script variable naming

`standby.sh` SHALL use character-based variable names for agent models:
- `NOCTIS_MODEL` / `NOCTIS_LABEL`
- `IGNIS_MODEL` / `IGNIS_LABEL`
- `GLADIOLUS_MODEL` / `GLADIOLUS_LABEL`
- `PROMPTO_MODEL` / `PROMPTO_LABEL`
- `LUNAFREYA_MODEL` / `LUNAFREYA_LABEL`
- `IRIS_MODEL` / `IRIS_LABEL`

#### Scenario: Variables use FF15 naming

- **WHEN** inspecting shell script variable names
- **THEN** all role-related variables MUST use FF15 character names (NOCTIS, IGNIS, GLADIOLUS, PROMPTO, LUNAFREYA, IRIS)
- **AND** no variables with old naming (SHOGUN, KARO, ASHIGARU) SHALL exist

### Requirement: Shell alias updates

Shell aliases created by `first_setup.sh` SHALL use new session names:
- `csn` → `tmux attach-session -t noctis` (was `-t shogun`)
- `csk` → `tmux attach-session -t kingsglaive` (was `-t multiagent`)

#### Scenario: Aliases target correct sessions

- **WHEN** `first_setup.sh` creates shell aliases
- **THEN** the `csn` alias MUST point to the `noctis` session
- **AND** the `csk` alias MUST point to the `kingsglaive` session

### Requirement: Deployment script renaming

The main deployment script SHALL be `standby.sh` (replacing `shutsujin_departure.sh`).
Additionally, `setup.sh` is available for quick setup.

#### Scenario: Deployment script exists with new name

- **WHEN** listing files in the project root
- **THEN** `standby.sh` MUST exist as the main deployment script
- **AND** `shutsujin_departure.sh` MUST NOT exist

### Requirement: Queue YAML content updates

The content of queue YAML files (worker_id, references) MUST use character names:
- `worker_id` fields are not used; task files are identified by file name (e.g., `gladiolus.yaml`)
- Any `project: multi-agent-shogun` → `project: multi-agent-ff15`

#### Scenario: Queue file content uses new names

- **WHEN** reading any queue YAML file
- **THEN** the file MUST NOT contain any Sengoku-era references
- **AND** the `project` field, if present, MUST use `multi-agent-ff15`
