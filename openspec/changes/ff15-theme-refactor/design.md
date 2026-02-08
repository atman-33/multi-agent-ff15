## Context

The project `multi-agent-ff15` (formerly `multi-agent-shogun`) is a multi-agent parallel development framework using OpenCode + tmux. It currently uses a Sengoku (feudal Japan) theme throughout:

- **3 instruction files** (~1,700 lines total): `instructions/shogun.md`, `instructions/karo.md`, `instructions/ashigaru.md`
- **1 core config**: `AGENTS.md` (~250 lines) — auto-loaded by all agents
- **2 shell scripts** (~1,600 lines total): `shutsujin_departure.sh`, `first_setup.sh`
- **1 batch file**: `install.bat` (~140 lines)
- **2 config files**: `config/models.yaml`, `config/settings.yaml`
- **17 queue YAML files**: `queue/shogun_to_karo.yaml`, 8 task files, 8 report files
- **3 documentation files**: `README.md`, `README_ja.md`, `dashboard.md`

All files reference `shogun`, `karo`, and `ashigaru` in variable names, YAML keys, tmux session/pane references, file paths, log messages, and speech patterns. The migration must be comprehensive — a single missed reference can break agent communication.

**Stakeholders**: Project owner (user), all 10 AI agents (Noctis, Ignis, Kingsglaive 1-8).

## Goals / Non-Goals

**Goals:**
- Complete theme migration from Sengoku to FF15/Lucis across all files
- Zero functional regression — all agent communication, tmux sessions, and YAML workflows must continue working
- Consistent naming: Noctis (commander), Ignis (task manager), Kingsglaive 1-8 (workers)
- Updated speech style from Sengoku to FF15-appropriate expressions
- All queue/config files renamed to match new conventions

**Non-Goals:**
- Changing the fundamental architecture (YAML queue + tmux send-keys remains)
- Adding new features or capabilities beyond the theme change
- Changing the OpenCode framework or its configuration format
- Modifying the openspec workflow itself
- Renaming the git repository remote URL (handled separately by owner)
- Changing the project directory name on disk (already `multi-agent-ff15`)

## Decisions

### D1: Role Name Mapping

| Old | New | Rationale |
|-----|-----|-----------|
| Shogun (将軍) | Noctis | Prince Noctis is the commander/protagonist — maps to project commander |
| Karo (家老) | Ignis | Ignis is the strategist/advisor — maps to task manager |
| Ashigaru (足軽) | Kingsglaive | The King's elite soldiers — maps to worker agents |

**Alternative considered**: Using "Crownsguard" instead of "Kingsglaive". Rejected because Kingsglaive is more iconic and provides clear differentiation from generic terms.

### D2: Kingsglaive Character Assignments

| Agent | Character | Specialization |
|-------|-----------|---------------|
| Kingsglaive 1 | Gladiolus | Shield — defense, robustness |
| Kingsglaive 2 | Prompto | Recon — investigation, information gathering |
| Kingsglaive 3 | Lunafreya | Oracle — diplomacy, documentation |
| Kingsglaive 4 | Iris | Support — logistics, assistance |
| Kingsglaive 5 | Cor | Immortal Marshal — veteran execution |
| Kingsglaive 6 | Aranea | Mercenary — external collaboration |
| Kingsglaive 7 | Ravus | Imperial General — strategic perspective |
| Kingsglaive 8 | Ardyn | Chancellor — deep knowledge, tricks |

Characters are cosmetic only — they do not constrain which tasks an agent can receive.

### D3: tmux Session Naming

| Old | New | Rationale |
|-----|-----|-----------|
| `shogun` | `noctis` | Commander session |
| `multiagent` | `kingsglaive` | Worker session (contains Ignis pane 0 + Kingsglaive panes 1-8) |

**Alternative considered**: Renaming `multiagent` to `lucis`. Rejected because `kingsglaive` directly describes the agents in that session.

### D4: Queue File Naming

| Old | New |
|-----|-----|
| `queue/shogun_to_karo.yaml` | `queue/noctis_to_ignis.yaml` |
| `queue/tasks/ashigaru{N}.yaml` | `queue/tasks/kingsglaive{N}.yaml` |
| `queue/reports/ashigaru{N}_report.yaml` | `queue/reports/kingsglaive{N}_report.yaml` |

### D5: Config Key Naming

`config/models.yaml` keys:

| Old | New |
|-----|-----|
| `shogun_model` / `shogun_label` | `noctis_model` / `noctis_label` |
| `karo_model` / `karo_label` | `ignis_model` / `ignis_label` |
| `ashigaru_1_4_model` / `ashigaru_1_4_label` | `kingsglaive_1_4_model` / `kingsglaive_1_4_label` |
| `ashigaru_5_8_model` / `ashigaru_5_8_label` | `kingsglaive_5_8_model` / `kingsglaive_5_8_label` |

### D6: Mode Naming

| Old | New | Rationale |
|-----|-----|-----------|
| `normal` | `normal` | Generic, keep as-is |
| `kessen` (決戦) | `kessen` | Keep — still conveys "decisive battle" which fits FF15 |
| `setsuyaku` (節約) | `setsuyaku` | Keep — still conveys "economy mode" |

**Rationale**: Mode names are functional, not thematic. Changing them adds no value and breaks backward compatibility for users who have muscle memory.

### D7: Speech Style Migration

| Sengoku | FF15 | Usage |
|---------|------|-------|
| 「かしこまりました」 | 「了解しました」(Understood) | Acknowledgment |
| 「はっ！」 | 「了解」(Roger) / 「王の剣にかけて」 | Determination |
| 「殿」「上様」 | 「Noctis殿」「王子」 | Honorifics |
| 「拙者」「某」 | Character-dependent (俺/僕/私) | First person |
| 「でござる」 | 「です」 | Sentence endings |
| 「切腹」 | 「追放」(exile) | Forbidden action penalty |
| 「出陣じゃーーー！」 | 「出発する！」 / FF15-themed | Deployment banner |
| 「戦況報告書」 | 「任務報告書」 | Dashboard title |
| 「戦果」 | 「戦果」(keep — fits FF15 military context) | Results section |

### D8: Instruction File Renaming

| Old | New |
|-----|-----|
| `instructions/shogun.md` | `instructions/noctis.md` |
| `instructions/karo.md` | `instructions/ignis.md` |
| `instructions/ashigaru.md` | `instructions/kingsglaive.md` |

### D9: Edit Strategy — In-place Rewrite

All files will be rewritten in-place with the new theme. The approach:
1. Rename files where the filename itself changes (`instructions/*.md`, `queue/*.yaml`)
2. Rewrite content with global find-and-replace for systematic terms
3. Manual rewrite for speech/narrative sections that need creative adaptation
4. Verification scan for any remaining old-theme references

**Alternative considered**: Creating entirely new files and deleting old ones. Rejected because git history is better preserved with renames + edits.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Missed references to old naming ("shogun"/"karo"/"ashigaru" still present) | Post-migration grep scan across entire codebase for old terms |
| `shutsujin_departure.sh` variable references break after rename | Test script execution after changes; variables are used consistently |
| Running agents reference old queue files | Restart all tmux sessions after deployment |
| `first_setup.sh` creates old-named files on new installations | Update all file creation paths in the script |
| `AGENTS.md` auto-loaded by all agents — errors affect everyone | Review AGENTS.md changes carefully; it's the single most critical file |
| Queue YAML rename breaks in-progress tasks | Execute migration during idle period; clear all queues first |
| `install.bat` Windows paths with old names | Update paths; users will need to re-clone or rename directory |

## Migration Plan

### Phase 1: File Renames
1. Rename `instructions/shogun.md` → `instructions/noctis.md`
2. Rename `instructions/karo.md` → `instructions/ignis.md`
3. Rename `instructions/ashigaru.md` → `instructions/kingsglaive.md`
4. Rename all `queue/tasks/ashigaru{N}.yaml` → `queue/tasks/kingsglaive{N}.yaml`
5. Rename all `queue/reports/ashigaru{N}_report.yaml` → `queue/reports/kingsglaive{N}_report.yaml`
6. Rename `queue/shogun_to_karo.yaml` → `queue/noctis_to_ignis.yaml`

### Phase 2: Content Updates
1. Update instructions files with FF15 theme
2. Update AGENTS.md
3. Update shell scripts (`shutsujin_departure.sh`, `first_setup.sh`)
4. Update config files (`models.yaml`, `settings.yaml`)
5. Update documentation (`README.md`, `README_ja.md`, `dashboard.md`)
6. Update `install.bat`

### Phase 3: Verification
1. `grep -ri "shogun\|karo\|ashigaru\|足軽\|将軍\|家老\|出陣\|切腹" --include="*.md" --include="*.yaml" --include="*.sh" --include="*.bat"` — must return zero results (excluding docs/ff15_refactor_plan.md and openspec/ history)
2. Shell script syntax check: `bash -n shutsujin_departure.sh && bash -n first_setup.sh`
3. YAML lint on all queue files

### Rollback Strategy
- Git revert to pre-migration commit
- `backup/original/` directory exists for reference

## Open Questions

- Should `shutsujin_departure.sh` be renamed to something FF15-themed (e.g., `deploy.sh` or `departure.sh`)? Current decision: keep the filename as-is to avoid breaking user muscle memory and aliases.
- Should the `memory/shogun_memory.jsonl` path be renamed? It's referenced in instructions but may contain existing data.
