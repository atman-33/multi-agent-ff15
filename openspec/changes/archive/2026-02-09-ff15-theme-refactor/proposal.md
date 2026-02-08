## Why

The project currently uses a Sengoku (feudal Japan) theme throughout all documentation, scripts, configuration, and agent instructions. The project is being rebranded to a **FINAL FANTASY XV (FF15)** theme centered around the Kingdom of Lucis. This unifies the project identity under `multi-agent-ff15` and provides a more engaging, modern thematic layer while preserving all technical functionality.

## What Changes

- **BREAKING**: Role names renamed across all files: Shogun → Noctis, Karo → Ignis, Ashigaru → Comrades
- **BREAKING**: tmux session names changed: `shogun` → `noctis`, `multiagent` → `kingsglaive`
- **BREAKING**: Queue file names changed: `ashigaru{N}.yaml` → `{character_name}.yaml`, `shogun_to_karo.yaml` → `noctis_to_ignis.yaml`
- **BREAKING**: Config YAML restructured: flat keys → nested `modes.<mode>.<agent_name>.model/label` structure
- Speech style updated from Sengoku Japanese to FF15/Lucis-style expressions
- ASCII art banners and organizational diagrams updated to FF15 theme
- All documentation (README.md, README_ja.md, AGENTS.md, dashboard.md) rebranded
- Mode names updated: `normal`, `fullpower`, `lite`, `free-glm`, `free-kimi`
- 4 Comrade agents assigned FF15 character identities (Gladiolus, Prompto, Lunafreya, Iris)
- install.bat updated with FF15 branding

## Capabilities

### New Capabilities

- `role-hierarchy`: Defines the FF15 role hierarchy (Noctis/Ignis/Comrades), naming conventions, character assignments for 4 Comrade agents, and the mapping from old Sengoku names to new FF15 names across all files
- `theme-language`: Defines the FF15 speech style system replacing Sengoku expressions — greetings, honorifics, status messages, forbidden action phrasing, and per-character first-person pronouns
- `file-structure`: Defines the file/directory/session renaming scheme — queue files (character-named), tmux sessions, config structure, script names (standby.sh), and folder renames for the FF15 migration
- `documentation-branding`: Defines how all user-facing documentation (README, README_ja, AGENTS.md, dashboard, install.bat) should be updated with FF15 branding, ASCII art, organizational diagrams, and badges

### Modified Capabilities

_(No existing OpenSpec specs to modify — this is the first change in the project)_

## Impact

- **All instruction files**: `instructions/noctis.md`, `instructions/ignis.md`, `instructions/comrades.md` — full rewrite with FF15 terminology
- **Core config**: `AGENTS.md` — complete theme overhaul
- **Shell scripts**: `standby.sh`, `first_setup.sh` — variable names, log messages, ASCII art, tmux session names, aliases
- **Windows installer**: `install.bat` — branding text
- **Config files**: `config/models.yaml` (nested mode/agent structure), `config/settings.yaml` (comments, prefixes)
- **Queue files**: 4 task files + 4 report files (character-named) + `queue/noctis_to_ignis.yaml`
- **Documentation**: `README.md`, `README_ja.md`, `dashboard.md`
- **Templates**: `templates/context_template.md` — minor updates
- **Existing agent sessions**: All running tmux sessions will need restart after deployment
