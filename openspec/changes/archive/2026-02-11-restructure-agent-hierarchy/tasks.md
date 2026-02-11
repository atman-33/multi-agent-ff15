## 1. Configuration Updates

- [x] 1.1 Update config/models.yaml to remove iris agent configuration from all modes
- [x] 1.2 Verify all 5 agents (noctis, ignis, gladiolus, prompto, lunafreya) have model configurations

## 2. Queue Structure Updates

- [x] 2.1 Remove queue/tasks/iris.yaml
- [x] 2.2 Remove queue/reports/iris_report.yaml
- [x] 2.3 Create template for queue/lunafreya_to_noctis.yaml (optional coordination file)
- [x] 2.4 Update queue/tasks/ files for ignis, gladiolus, prompto to reflect worker role

## 3. Instruction File Updates

- [x] 3.1 Update instructions/noctis.md to reflect task manager role (absorb Ignis's delegation logic)
- [x] 3.2 Update instructions/ignis.md to reflect worker/Comrade role (remove task management logic)
- [x] 3.3 Update instructions/comrades.md to list 3 Comrades (Ignis, Gladiolus, Prompto) and document Lunafreya as independent
- [x] 3.4 Create or update instructions/lunafreya.md with independent operation mode and Noctis coordination capability
- [x] 3.5 Update YAML front matter in all instruction files (role fields, forbidden actions, workflow)
- [x] 3.6 Remove references to queue/noctis_to_ignis.yaml from instruction files
- [x] 3.7 Update tmux send-keys targets from noctis:/kingsglaive: to ff15:

## 4. tmux Session Restructure (standby.sh)

- [x] 4.1 Replace 2-session creation (noctis, kingsglaive) with single ff15 session
- [x] 4.2 Implement 2-row, 5-pane layout (top: Noctis, Lunafreya; bottom: Ignis, Gladiolus, Prompto)
- [x] 4.3 Update pane split logic to create correct layout with proper width distribution
- [x] 4.4 Set @agent_id for all 5 panes (noctis, lunafreya, ignis, gladiolus, prompto)
- [x] 4.5 Remove IRIS_MODEL and IRIS_LABEL variable definitions
- [x] 4.6 Update pane-border-format to show agent names and models in unified session
- [x] 4.7 Update OpenCode startup commands for 5 agents (remove Iris)
- [x] 4.8 Update instruction file reading commands for new structure (remove Iris, update for 3 Comrades)
- [x] 4.9 Update session naming in all tmux commands (attach, send-keys, etc.)

## 5. Shell Script and Alias Updates

- [x] 5.1 Update first_setup.sh to create csf alias for ff15 session
- [x] 5.2 Update/remove csn and csk aliases (or redirect to csf)
- [x] 5.3 Update all tmux attach-session examples in standby.sh help text

## 6. Documentation Updates

- [x] 6.1 Update AGENTS.md hierarchy diagram to show 2-layer structure (User → Noctis → 3 Comrades)
- [x] 6.2 Document Lunafreya's independent mode in AGENTS.md
- [x] 6.3 Update agent count from 6 to 5 throughout AGENTS.md
- [x] 6.4 Update tmux session structure documentation (1 session, 5 panes)
- [x] 6.5 Update workflow diagrams showing direct Noctis→Comrades delegation
- [x] 6.6 Update dashboard.md formatting section if needed
- [x] 6.7 Remove Iris from all agent listings and examples

## 7. Dashboard Template Updates

- [x] 7.1 Update dashboard initialization in standby.sh if format changes are needed
- [x] 7.2 Verify dashboard.md reflects new command flow (no Ignis intermediate layer)

## 8. Cleanup and Validation

- [x] 8.1 Search project for remaining "iris" references and remove/update
- [x] 8.2 Search for "noctis_to_ignis" references and update to direct assignment pattern
- [x] 8.3 Search for "kingsglaive:" session references and update to "ff15:"
- [x] 8.4 Search for "noctis:" session references and update to "ff15:"
- [x] 8.5 Test standby.sh with --setup-only flag to verify session creation
- [x] 8.6 Test standby.sh with --clean flag to verify full initialization
- [x] 8.7 Verify all 5 panes display correct agent IDs via tmux list-panes
- [x] 8.8 Test send-keys communication between agents in new structure

## 9. Context and Memory Updates

- [x] 9.1 Update context/*.md files if any project-specific context references old structure
- [x] 9.2 Update memory/global_context.md if it references old hierarchy
- [x] 9.3 Verify OpenSpec archive doesn't interfere (this change will be archived after completion)
