## Purpose

Defines the file/directory/session renaming scheme, script naming, variable naming, and alias conventions.

## Requirements

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

The following queue file changes MUST be performed:
- ~~`queue/noctis_to_ignis.yaml`~~ → REMOVED (direct task assignment)
- `queue/tasks/{character_name}.yaml` for 3 workers: ignis.yaml, gladiolus.yaml, prompto.yaml
- `queue/reports/{character_name}_report.yaml` for 3 workers: ignis_report.yaml, gladiolus_report.yaml, prompto_report.yaml
- `queue/lunafreya_to_noctis.yaml` → ADDED (Lunafreya→Noctis command channel)

Only 3 worker queue files exist (Ignis, Gladiolus, Prompto). Lunafreya has her own command channel file.

#### Scenario: Queue files exist with new structure

- **WHEN** listing files in `queue/tasks/` and `queue/reports/`
- **THEN** exactly 3 task files SHALL exist: ignis.yaml, gladiolus.yaml, prompto.yaml
- **AND** exactly 3 report files SHALL exist: ignis_report.yaml, gladiolus_report.yaml, prompto_report.yaml
- **AND** `queue/lunafreya_to_noctis.yaml` MAY exist for Lunafreya coordination
- **AND** files `iris.yaml`, `iris_report.yaml`, `noctis_to_ignis.yaml` MUST NOT exist

### Requirement: Internal file path references

All internal references to queue file paths MUST be updated:
- Instruction files referencing ~~`queue/noctis_to_ignis.yaml`~~ → Update to direct task assignment pattern
- Instruction files referencing `queue/tasks/iris.yaml` or `queue/reports/iris_report.yaml` → Remove references
- AGENTS.md referencing any queue paths MUST use new structure
- Shell scripts referencing queue paths MUST use new structure

#### Scenario: No broken file path references

- **WHEN** grep searching across all `.md`, `.yaml`, `.sh`, and `.bat` files for `iris.yaml` or `noctis_to_ignis.yaml`
- **THEN** zero matches MUST be found in active code (excluding `openspec/changes/archive/` and `logs/backup_*` historical files)

### Requirement: tmux session name references in scripts

`standby.sh` MUST use:
- `ff15` as the unified tmux session name (replacing `noctis` and `kingsglaive` separate sessions)

All `tmux new-session`, `tmux send-keys`, `tmux attach-session`, and alias definitions MUST reference the unified session name.

#### Scenario: Deployment script creates unified session

- **WHEN** running `standby.sh`
- **THEN** a tmux session named `ff15` with 5 panes MUST be created
- **AND** no sessions named `noctis` or `kingsglaive` SHALL be created

#### Scenario: All panes in single session

- **WHEN** running `tmux list-panes -t ff15`
- **THEN** exactly 5 panes MUST be listed with indices 0-4
- **AND** `@agent_id` values MUST be: noctis, lunafreya, ignis, gladiolus, prompto

### Requirement: Shell script variable naming

`standby.sh` SHALL use character-based variable names for 5 agents:
- `NOCTIS_MODEL` / `NOCTIS_LABEL`
- `IGNIS_MODEL` / `IGNIS_LABEL`
- `GLADIOLUS_MODEL` / `GLADIOLUS_LABEL`
- `PROMPTO_MODEL` / `PROMPTO_LABEL`
- `LUNAFREYA_MODEL` / `LUNAFREYA_LABEL`

The `IRIS_MODEL` / `IRIS_LABEL` variables are REMOVED.

#### Scenario: Variables use 5-agent structure

- **WHEN** inspecting shell script variable names
- **THEN** exactly 5 agent variable pairs (MODEL/LABEL) MUST exist
- **AND** no variables with `IRIS` naming SHALL exist

### Requirement: Shell alias updates

Shell aliases created by `first_setup.sh` SHALL use unified session:
- `ffa` → `tmux attach -t ff15` (Final Fantasy Attach - unified session access)

#### Scenario: Alias targets unified session

- **WHEN** `first_setup.sh` or `standby.sh` creates shell aliases
- **THEN** the `ffa` alias MUST point to the `ff15` session
- **AND** legacy aliases (`csf`, `csn`, `csk`, `css`, `csm`) SHALL be automatically removed

### Requirement: Deployment script naming

The main deployment script SHALL be `standby.sh`. Additionally, `setup.sh` is available for quick setup.

#### Scenario: Deployment script exists with correct name

- **WHEN** listing files in the project root
- **THEN** `standby.sh` MUST exist as the main deployment script

### Requirement: Queue YAML content updates

The content of queue YAML files (worker_id, references) MUST use character names:
- `worker_id` fields are not used; task files are identified by file name (e.g., `gladiolus.yaml`)
- Any `project` field MUST use `multi-agent-ff15`

#### Scenario: Queue file content uses correct project name

- **WHEN** reading any queue YAML file
- **THEN** the file MUST NOT contain iris references
- **AND** the `project` field, if present, MUST use `multi-agent-ff15`

## REMOVED Requirements

### Requirement: Iris queue files

**Reason**: Iris agent removed (6→5 agents)

**Migration**: 
- Delete `queue/tasks/iris.yaml` and `queue/reports/iris_report.yaml`
- Remove all references to Iris from instruction files, AGENTS.md, and scripts
- Update `config/models.yaml` to remove `iris` configuration blocks

### Requirement: Intermediate command queue

**Reason**: 2-layer hierarchy eliminates Noctis→Ignis→Workers delegation chain

**Migration**:
- Delete `queue/noctis_to_ignis.yaml`
- Update Noctis instructions to write directly to `queue/tasks/{worker}.yaml` files
- Remove references to `noctis_to_ignis.yaml` from all instruction files

## ADDED Requirements

### Requirement: Lunafreya command channel file

A new optional queue file `queue/lunafreya_to_noctis.yaml` enables Lunafreya to issue commands to Noctis when coordination is needed.

This file is NOT part of the standard task queue system and is only created when Lunafreya needs to coordinate.

#### Scenario: Lunafreya creates command file

- **WHEN** Lunafreya determines coordination with Noctis is needed
- **THEN** Lunafreya SHALL create/write `queue/lunafreya_to_noctis.yaml`
- **AND** SHALL send tmux send-keys to wake Noctis

#### Scenario: Noctis reads Lunafreya commands

- **WHEN** Noctis receives a wake-up signal from Lunafreya
- **THEN** Noctis SHALL check for existence of `queue/lunafreya_to_noctis.yaml`
- **AND** SHALL process commands if file exists
