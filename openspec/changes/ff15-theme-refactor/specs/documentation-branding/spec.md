## ADDED Requirements

### Requirement: README.md FF15 branding

`README.md` (English) SHALL be updated with FF15 theme:
- Project title: `multi-agent-ff15`
- Tagline: Replace "feudal warlord" / "samurai-inspired" with FF15/Lucis theme
- Role descriptions: Use Noctis (commander), Ignis (steward), Kingsglaive (soldiers)
- GitHub badge URLs: Update to point to `multi-agent-ff15` repository
- All references to `shogun`, `karo`, `ashigaru` in text and code examples MUST be replaced

#### Scenario: README contains no Sengoku references

- **WHEN** reading README.md
- **THEN** no Sengoku terms (shogun, karo, ashigaru, samurai, feudal warlord) SHALL appear
- **AND** all role references MUST use FF15 naming

### Requirement: README_ja.md FF15 branding

`README_ja.md` (Japanese) SHALL be updated with FF15 theme:
- Project title: `multi-agent-ff15`
- Description: Replace 戦国 references with FF15/ルシス references
- Role descriptions: Use Noctis, Ignis, Kingsglaive
- All tmux session references updated to `noctis` and `kingsglaive`
- All code examples and commands updated

#### Scenario: README_ja contains no Sengoku references

- **WHEN** reading README_ja.md
- **THEN** no Sengoku role terms (将軍, 家老, 足軽 as role names) SHALL appear
- **AND** all session references MUST use `noctis` and `kingsglaive`

### Requirement: AGENTS.md FF15 overhaul

`AGENTS.md` SHALL be completely updated:
- Project name: `multi-agent-ff15`
- Hierarchy diagram: Use Noctis → Ignis → Kingsglaive
- Role definitions (Agent Roles section): Full FF15 descriptions
- Communication rules: Updated session/pane names
- File structure section: Updated file names (queue files, instructions)
- Session recovery section: Updated with FF15 naming
- tmux pane identification: `kingsglaive{N}` instead of `ashigaru{N}`
- All code examples and YAML samples updated

#### Scenario: AGENTS.md hierarchy diagram uses FF15

- **WHEN** reading the hierarchy diagram in AGENTS.md
- **THEN** the diagram MUST show Noctis (top) → Ignis (middle) → Kingsglaive 1-8 (bottom)
- **AND** all labels MUST use FF15 naming

#### Scenario: AGENTS.md file structure section is accurate

- **WHEN** reading the file structure section in AGENTS.md
- **THEN** all file paths listed MUST match the actual renamed files (e.g., `queue/noctis_to_ignis.yaml`, `instructions/noctis.md`)

### Requirement: install.bat FF15 branding

`install.bat` SHALL be updated:
- Window title: `multi-agent-ff15 Installer`
- Banner: Replace `[SHOGUN] multi-agent-shogun` with FF15 branding
- Any path references to `multi-agent-shogun` updated to `multi-agent-ff15`

#### Scenario: install.bat uses FF15 branding

- **WHEN** running install.bat
- **THEN** the window title and banners MUST reference `multi-agent-ff15`
- **AND** no references to `shogun` or `multi-agent-shogun` SHALL appear

### Requirement: dashboard.md template

The dashboard template/structure SHALL use FF15 naming:
- Title: 「⚔️ multi-agent-ff15 任務報告書」
- Column headers: Replace 足軽 with Kingsglaive
- Section headers updated as per theme-language spec

#### Scenario: Dashboard uses Kingsglaive references

- **WHEN** Ignis creates or updates dashboard.md
- **THEN** all worker references MUST use "Kingsglaive" instead of "足軽"
- **AND** the title MUST include "multi-agent-ff15"

### Requirement: ASCII art and organizational diagrams

All ASCII art and diagrams in scripts and documentation SHALL use FF15 theme:
- Deployment banner in `shutsujin_departure.sh`: FF15-themed art replacing Sengoku art
- Organization chart in AGENTS.md: Noctis/Ignis/Kingsglaive hierarchy
- No 🏯 emoji (castle) — use ⚔️ or appropriate FF15 symbols

#### Scenario: No Sengoku ASCII art remains

- **WHEN** scanning all `.sh` and `.md` files for ASCII art blocks
- **THEN** no Sengoku-themed imagery (castle emoji 🏯, samurai references) SHALL remain in active code
- **AND** replacement FF15-themed art MUST be present

### Requirement: first_setup.sh branding

`first_setup.sh` SHALL update all branding:
- Header banner: `multi-agent-ff15 インストーラー`
- Settings file generation: Comments reference FF15 theme
- Queue file generation: Create `kingsglaive{N}.yaml` files instead of `ashigaru{N}.yaml`
- Alias creation: Use new session names
- Memory path: `noctis_memory.jsonl` instead of `shogun_memory.jsonl`

#### Scenario: first_setup.sh creates correct file names

- **WHEN** `first_setup.sh` runs initial setup
- **THEN** all generated queue files MUST use `kingsglaive{N}` naming
- **AND** all generated config files MUST use FF15 comments and references
