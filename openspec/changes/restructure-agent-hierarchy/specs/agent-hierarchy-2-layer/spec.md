## Purpose

Defines the simplified 2-layer agent hierarchy where Noctis acts as both commander and task manager, directly delegating to worker agents (Comrades).

## ADDED Requirements

### Requirement: Two-layer hierarchy structure

The system SHALL use a 2-layer hierarchy:
- Layer 1: Noctis (King/Leader) - receives user commands, breaks down tasks, delegates to workers
- Layer 2: Comrades (3 workers) - execute assigned tasks

This eliminates the middle management layer (former Ignis role) from the 3-layer structure.

#### Scenario: User command flows through two layers

- **WHEN** the user issues a command to Noctis
- **THEN** Noctis SHALL analyze and decompose the task
- **AND** Noctis SHALL assign tasks directly to available Comrades via YAML
- **AND** Noctis SHALL NOT delegate to an intermediate manager agent

#### Scenario: Task delegation bypasses intermediate layer

- **WHEN** Noctis completes task decomposition
- **THEN** tasks SHALL be written directly to `queue/tasks/{worker}.yaml` files
- **AND** no intermediate `noctis_to_ignis.yaml` queue file SHALL be used

### Requirement: Noctis role consolidation

Noctis SHALL perform both command reception and task management:
- Receive commands from user (Crystal)
- Decompose complex tasks into parallel subtasks
- Assign tasks to available Comrades
- Update dashboard.md with task status
- Monitor completion and report to user

#### Scenario: Noctis decomposes and assigns tasks

- **WHEN** Noctis receives a multi-step command
- **THEN** Noctis SHALL break it into 1-3 parallel subtasks
- **AND** SHALL assign each to an available Comrade
- **AND** SHALL update dashboard.md with "進行中" status

#### Scenario: Noctis reports completion to user

- **WHEN** all assigned Comrades report completion
- **THEN** Noctis SHALL update dashboard.md with results
- **AND** SHALL summarize the outcome for the user

### Requirement: Three-worker Comrade team

The system SHALL have exactly 3 Comrade (worker) agents:
- Ignis (formerly task manager, now worker)
- Gladiolus (shield)
- Prompto (recon)

Lunafreya operates independently and is not part of the Comrade pool.

#### Scenario: Task distribution across three workers

- **WHEN** Noctis has 3 parallel subtasks to assign
- **THEN** each Comrade (Ignis, Gladiolus, Prompto) SHALL receive one task
- **AND** all SHALL execute in parallel

#### Scenario: Lunafreya not assigned Noctis tasks

- **WHEN** Noctis assigns tasks to Comrades
- **THEN** Lunafreya SHALL NOT be included in the assignment pool
- **AND** Lunafreya's task file SHALL remain untouched

### Requirement: Queue file simplification

The command queue structure SHALL reflect the 2-layer hierarchy:
- `queue/tasks/ignis.yaml` - Ignis's task file (now as worker)
- `queue/tasks/gladiolus.yaml` - Gladiolus's task file
- `queue/tasks/prompto.yaml` - Prompto's task file
- `queue/reports/ignis_report.yaml` - Ignis's report file
- `queue/reports/gladiolus_report.yaml` - Gladiolus's report file
- `queue/reports/prompto_report.yaml` - Prompto's report file

The intermediate queue file `queue/noctis_to_ignis.yaml` SHALL be removed.

#### Scenario: No intermediate queue file exists

- **WHEN** listing files in `queue/` directory
- **THEN** files named `noctis_to_ignis.yaml` or `noctis_to_workers.yaml` MUST NOT exist
- **AND** only individual worker task/report files SHALL exist
