## Tasks

- [x] **Task 1: Rename queue files**
  **Specs**: file-structure
  Renamed `queue/shogun_to_karo.yaml` to `queue/noctis_to_ignis.yaml`.
  Created character-named task/report files: `gladiolus.yaml`, `prompto.yaml`, `lunafreya.yaml`, `iris.yaml` (4 workers instead of 8).

- [x] **Task 2: Rename instruction files**
  **Specs**: file-structure, role-hierarchy
  Renamed to `instructions/noctis.md`, `instructions/ignis.md`, `instructions/comrades.md`.

- [x] **Task 3: Rewrite instructions/noctis.md**
  **Specs**: role-hierarchy, theme-language, file-structure
  Full content rewrite with FF15 theme. Role: noctis, penalty: 追放, targets: `kingsglaive:0.0`, all FF15 naming.

- [x] **Task 4: Rewrite instructions/ignis.md**
  **Specs**: role-hierarchy, theme-language, file-structure
  Full content rewrite. File paths use character names (`queue/tasks/gladiolus.yaml` etc.), agent IDs use character names.

- [x] **Task 5: Rewrite instructions/comrades.md**
  **Specs**: role-hierarchy, theme-language, file-structure
  Full content rewrite. Role: worker (not kingsglaive). File paths: `queue/tasks/{worker_name}.yaml` with character names. 4 Comrades: Gladiolus, Prompto, Lunafreya, Iris.

- [x] **Task 6: Rewrite AGENTS.md**
  **Specs**: role-hierarchy, documentation-branding, file-structure
  Complete overhaul. Hierarchy: Noctis → Ignis → Comrades (4). Agent IDs: character names. Queue files: character-named. tmux session: kingsglaive.

- [x] **Task 7: Update config/models.yaml**
  **Specs**: role-hierarchy, file-structure
  Restructured to nested `modes.<mode>.<agent_name>.model/label` format. Modes: normal, fullpower, lite, free-glm, free-kimi. Agent keys: noctis, ignis, gladiolus, prompto, lunafreya, iris.

- [x] **Task 8: Update config/settings.yaml**
  **Specs**: theme-language, documentation-branding
  Updated header, language descriptions to FF15風, skill prefix to `ff15-`.

- [x] **Task 9: Create standby.sh (replacing shutsujin_departure.sh)**
  **Specs**: file-structure, theme-language, documentation-branding
  New deployment script `standby.sh` with FF15 theme. Variables: NOCTIS_MODEL, IGNIS_MODEL, GLADIOLUS_MODEL, PROMPTO_MODEL, LUNAFREYA_MODEL, IRIS_MODEL. Sessions: noctis, kingsglaive. Agent IDs: character names.

- [x] **Task 10: Update first_setup.sh**
  **Specs**: file-structure, documentation-branding
  FF15-themed installer. Queue files use character names. Aliases: `csn` for noctis, `csk` for kingsglaive.

- [x] **Task 11: Update install.bat**
  **Specs**: documentation-branding
  FF15 branding, `multi-agent-ff15` references.

- [x] **Task 12: Update README.md**
  **Specs**: documentation-branding
  FF15 theme, Noctis/Ignis/Comrades descriptions.

- [x] **Task 13: Update README_ja.md**
  **Specs**: documentation-branding
  Japanese version with FF15 theme. Comrades with character names.

- [x] **Task 14: Update dashboard.md**
  **Specs**: documentation-branding, theme-language
  Title: 「📊 ミッション状況」. Mission-oriented section headers. Character names for worker references.

- [x] **Task 15: Verification scan**
  **Specs**: all
  Verified no remaining Sengoku references in active code files (excluding openspec/ and backup/).
