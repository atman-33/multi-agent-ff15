## Purpose

Defines Lunafreya's special independent operational mode where she works directly with the user (Crystal) and can issue commands to Noctis when coordination is needed.

## Requirements

### Requirement: Direct user interaction

Lunafreya SHALL operate independently from the Noctis→Comrades task flow and interact directly with the user (Crystal).

She is NOT part of the Comrade worker pool and does NOT receive tasks from Noctis via the standard queue system.

#### Scenario: User consults Lunafreya directly

- **WHEN** the user opens Lunafreya's pane and asks a question
- **THEN** Lunafreya SHALL respond directly to the user
- **AND** SHALL NOT wait for instruction from Noctis or notify other agents

#### Scenario: Lunafreya not in worker assignment pool

- **WHEN** Noctis decomposes a task for Comrade assignment
- **THEN** Lunafreya SHALL NOT be considered as an available worker
- **AND** `queue/tasks/lunafreya.yaml` SHALL NOT be written by Noctis

### Requirement: Lunafreya-to-Noctis command channel

Lunafreya SHALL have the ability to issue commands to Noctis when coordination with the main task flow is needed.

A dedicated queue file `queue/lunafreya_to_noctis.yaml` enables this upward communication.

#### Scenario: Lunafreya commands Noctis

- **WHEN** Lunafreya determines that coordination with the main project is needed
- **THEN** Lunafreya SHALL write a command to `queue/lunafreya_to_noctis.yaml`
- **AND** SHALL send tmux send-keys to wake Noctis: `tmux send-keys -t ff15:0 'Lunafreya から指示があります'` followed by Enter

#### Scenario: Noctis processes Lunafreya commands

- **WHEN** Noctis receives a wake-up signal from Lunafreya
- **THEN** Noctis SHALL read `queue/lunafreya_to_noctis.yaml`
- **AND** SHALL process the command as a high-priority instruction

### Requirement: Autonomous task execution

Lunafreya SHALL execute tasks autonomously without reporting back to Noctis unless explicitly coordinating via the command channel.

Her work products are delivered directly to the user.

#### Scenario: Autonomous task completion

- **WHEN** Lunafreya completes a user-assigned task
- **THEN** Lunafreya SHALL present results directly to the user in her pane
- **AND** SHALL NOT write to `queue/reports/lunafreya_report.yaml` or notify Noctis

#### Scenario: No mandatory dashboard updates

- **WHEN** Lunafreya works on independent tasks
- **THEN** Lunafreya is NOT required to update dashboard.md
- **AND** dashboard.md reflects only Noctis-managed Comrade work

### Requirement: Optional status file for visibility

Lunafreya MAY maintain an optional status file `queue/lunafreya_status.yaml` for user visibility, but this is NOT part of the core task queue system.

#### Scenario: Optional status tracking

- **WHEN** Lunafreya is working on a long-running independent task
- **THEN** Lunafreya MAY write status updates to `queue/lunafreya_status.yaml`
- **AND** this file SHALL NOT be read by Noctis or other agents

### Requirement: Pane position reflects independence

Lunafreya's pane SHALL be positioned in the top row alongside Noctis, visually distinct from the bottom-row Comrade workers.

This positioning reflects her command-level independence.

#### Scenario: Top-row positioning

- **WHEN** viewing the `ff15` tmux session
- **THEN** Lunafreya SHALL be in the top-right pane (pane 1)
- **AND** Noctis SHALL be in the top-left pane (pane 0)
- **AND** Comrades (Ignis, Gladiolus, Prompto) SHALL be in the bottom row
