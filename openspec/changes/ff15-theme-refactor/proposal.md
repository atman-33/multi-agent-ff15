## Why

The project currently uses a Sengoku (feudal Japan) theme throughout all documentation, scripts, configuration, and agent instructions. The project is being rebranded to a **FINAL FANTASY XV (FF15)** theme centered around the Kingdom of Lucis. This unifies the project identity under `multi-agent-ff15` and provides a more engaging, modern thematic layer while preserving all technical functionality.

## What Changes

- **BREAKING**: Role names renamed across all files: Shogun → Noctis, Karo → Ignis, Ashigaru → Kingsglaive
- **BREAKING**: tmux session names changed: `shogun` → `noctis`, `multiagent` → `kingsglaive`
- **BREAKING**: Queue file names changed: `ashigaru{N}.yaml` → `kingsglaive{N}.yaml`, `shogun_to_karo.yaml` → `noctis_to_ignis.yaml`
- **BREAKING**: Config YAML keys renamed: `shogun_model` → `noctis_model`, `karo_model` → `ignis_model`, `ashigaru_*` → `kingsglaive_*`
- Speech style updated from Sengoku Japanese to FF15/Lucis-style expressions
- ASCII art banners and organizational diagrams updated to FF15 theme
- All documentation (README.md, README_ja.md, AGENTS.md, dashboard.md) rebranded
- Mode names updated: `kessen` → `shiva` (or similar FF15 term), `setsuyaku` → tbd
- Kingsglaive agents (1-8) assigned FF15 character identities (Gladiolus, Prompto, Lunafreya, Iris, Cor, Aranea, Ravus, Ardyn)
- install.bat updated with FF15 branding

## Capabilities

### New Capabilities

- `role-hierarchy`: Defines the FF15 role hierarchy (Noctis/Ignis/Kingsglaive), naming conventions, character assignments for all 8 Kingsglaive agents, and the mapping from old Sengoku names to new FF15 names across all files
- `theme-language`: Defines the FF15 speech style system replacing Sengoku expressions — greetings, honorifics, status messages, forbidden action phrasing, and per-character first-person pronouns
- `file-structure`: Defines the file/directory/session renaming scheme — queue files, tmux sessions, config keys, script names, and any folder renames needed for the FF15 migration
- `documentation-branding`: Defines how all user-facing documentation (README, README_ja, AGENTS.md, dashboard, install.bat) should be updated with FF15 branding, ASCII art, organizational diagrams, and badges

### Modified Capabilities

_(No existing OpenSpec specs to modify — this is the first change in the project)_

## Impact

- **All instruction files**: `instructions/shogun.md`, `instructions/karo.md`, `instructions/ashigaru.md` — full rewrite with FF15 terminology
- **Core config**: `AGENTS.md` — complete theme overhaul
- **Shell scripts**: `shutsujin_departure.sh` (~810 lines), `first_setup.sh` (~800 lines) — variable names, log messages, ASCII art, tmux session names, aliases
- **Windows installer**: `install.bat` (~140 lines) — branding text
- **Config files**: `config/models.yaml` (key names), `config/settings.yaml` (comments, prefixes)
- **Queue files**: All 16 YAML files in `queue/tasks/` and `queue/reports/` need renaming, plus `queue/shogun_to_karo.yaml`
- **Documentation**: `README.md`, `README_ja.md`, `dashboard.md`
- **Templates**: `templates/context_template.md` — minor updates
- **Existing agent sessions**: All running tmux sessions will need restart after deployment
