## ADDED Requirements

### Requirement: Instruction file renaming

The following file renames MUST be performed:
- `instructions/shogun.md` → `instructions/noctis.md`
- `instructions/karo.md` → `instructions/ignis.md`
- `instructions/ashigaru.md` → `instructions/kingsglaive.md`

#### Scenario: Instruction files exist with new names

- **WHEN** listing files in `instructions/` directory
- **THEN** the files `noctis.md`, `ignis.md`, `kingsglaive.md` MUST exist
- **AND** the files `shogun.md`, `karo.md`, `ashigaru.md` MUST NOT exist

### Requirement: Queue file renaming

The following file renames MUST be performed:
- `queue/shogun_to_karo.yaml` → `queue/noctis_to_ignis.yaml`
- `queue/tasks/ashigaru{N}.yaml` → `queue/tasks/kingsglaive{N}.yaml` (for N=1..8)
- `queue/reports/ashigaru{N}_report.yaml` → `queue/reports/kingsglaive{N}_report.yaml` (for N=1..8)

#### Scenario: Queue files exist with new names

- **WHEN** listing files in `queue/`, `queue/tasks/`, and `queue/reports/`
- **THEN** all files MUST use `noctis_to_ignis`, `kingsglaive{N}`, and `kingsglaive{N}_report` naming
- **AND** no files with `shogun`, `karo`, or `ashigaru` naming SHALL exist

### Requirement: Internal file path references

All internal references to queue file paths MUST be updated:
- Instruction files referencing `queue/shogun_to_karo.yaml` → `queue/noctis_to_ignis.yaml`
- Instruction files referencing `queue/tasks/ashigaru{N}.yaml` → `queue/tasks/kingsglaive{N}.yaml`
- Instruction files referencing `queue/reports/ashigaru{N}_report.yaml` → `queue/reports/kingsglaive{N}_report.yaml`
- AGENTS.md referencing any queue paths MUST use new names
- Shell scripts referencing queue paths MUST use new names

#### Scenario: No broken file path references

- **WHEN** grep searching across all `.md`, `.yaml`, `.sh`, and `.bat` files for `ashigaru` or `shogun_to_karo`
- **THEN** zero matches MUST be found (excluding `openspec/` and `docs/ff15_refactor_plan.md` historical files)

### Requirement: tmux session name references in scripts

`shutsujin_departure.sh` and `first_setup.sh` MUST use:
- `noctis` as the commander tmux session name (replacing `shogun`)
- `kingsglaive` as the worker tmux session name (replacing `multiagent`)

All `tmux new-session`, `tmux send-keys`, `tmux attach-session`, and alias definitions MUST reference the new session names.

#### Scenario: Deployment script creates correct sessions

- **WHEN** running `shutsujin_departure.sh`
- **THEN** tmux sessions named `noctis` and `kingsglaive` MUST be created
- **AND** no sessions named `shogun` or `multiagent` SHALL be created

### Requirement: Shell script variable naming

`shutsujin_departure.sh` SHALL rename all role-related variables:
- `SHOGUN_MODEL` → `NOCTIS_MODEL`
- `SHOGUN_LABEL` → `NOCTIS_LABEL`
- `KARO_MODEL` → `IGNIS_MODEL`
- `KARO_LABEL` → `IGNIS_LABEL`
- `ASHIGARU_1_4_MODEL` → `KINGSGLAIVE_1_4_MODEL`
- `ASHIGARU_1_4_LABEL` → `KINGSGLAIVE_1_4_LABEL`
- `ASHIGARU_5_8_MODEL` → `KINGSGLAIVE_5_8_MODEL`
- `ASHIGARU_5_8_LABEL` → `KINGSGLAIVE_5_8_LABEL`

#### Scenario: Variables use FF15 naming

- **WHEN** inspecting shell script variable names
- **THEN** all role-related variables MUST use FF15 naming (NOCTIS, IGNIS, KINGSGLAIVE)
- **AND** no variables with old naming (SHOGUN, KARO, ASHIGARU) SHALL exist

### Requirement: Shell alias updates

Shell aliases created by `first_setup.sh` SHALL use new session names:
- `css` → `tmux attach-session -t noctis` (was `-t shogun`)
- `csm` → `tmux attach-session -t kingsglaive` (was `-t multiagent`)

#### Scenario: Aliases target correct sessions

- **WHEN** `first_setup.sh` creates shell aliases
- **THEN** the `css` alias MUST point to the `noctis` session
- **AND** the `csm` alias MUST point to the `kingsglaive` session

### Requirement: Memory file path

The memory file path in instruction files SHALL be updated:
- `memory/shogun_memory.jsonl` → `memory/noctis_memory.jsonl`

#### Scenario: Memory path references are updated

- **WHEN** instruction files reference the memory storage path
- **THEN** the path MUST be `memory/noctis_memory.jsonl`

### Requirement: Queue YAML content updates

The content of queue YAML files (worker_id, references) MUST use FF15 naming:
- `worker_id: ashigaru{N}` → `worker_id: kingsglaive{N}`
- Any `project: multi-agent-shogun` → `project: multi-agent-ff15`

#### Scenario: Queue file content uses new names

- **WHEN** reading any queue YAML file
- **THEN** the `worker_id` field MUST use `kingsglaive{N}` format
- **AND** the `project` field, if present, MUST use `multi-agent-ff15`
