## Context

The project `multi-agent-ff15` (formerly `multi-agent-shogun`) is a multi-agent parallel development framework using OpenCode + tmux. It currently uses a Sengoku (feudal Japan) theme throughout:

- **3 instruction files**: `instructions/noctis.md`, `instructions/ignis.md`, `instructions/comrades.md`
- **1 core config**: `AGENTS.md` — auto-loaded by all agents
- **2 shell scripts**: `standby.sh`, `first_setup.sh`
- **1 batch file**: `install.bat`
- **2 config files**: `config/models.yaml`, `config/settings.yaml`
- **9 queue YAML files**: `queue/noctis_to_ignis.yaml`, 4 task files (character-named), 4 report files (character-named)
- **3 documentation files**: `README.md`, `README_ja.md`, `dashboard.md`

All files reference `noctis`, `ignis`, and character names (gladiolus, prompto, lunafreya, iris) in variable names, YAML keys, tmux session/pane references, file paths, log messages, and speech patterns.

**Stakeholders**: Project owner (user), all 6 AI agents (Noctis, Ignis, 4 Comrades).

## Goals / Non-Goals

**Goals:**
- Complete theme migration from Sengoku to FF15/Lucis across all files
- Zero functional regression — all agent communication, tmux sessions, and YAML workflows must continue working
- Consistent naming: Noctis (commander), Ignis (task manager), Comrades with character names (workers)
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
| Ashigaru (足軽) | Comrades | FF15 party members — maps to worker agents |

The tmux session hosting all workers is named `kingsglaive` for thematic consistency.

### D2: Comrade Character Assignments

| Agent | Character | Specialization |
|-------|-----------|---------------|
| Comrade 1 | Gladiolus | Shield — defense, robustness |
| Comrade 2 | Prompto | Recon — investigation, information gathering |
| Comrade 3 | Lunafreya | Oracle — diplomacy, documentation |
| Comrade 4 | Iris | Support — logistics, assistance |

Characters are cosmetic only — they do not constrain which tasks an agent can receive.
Agent IDs use character names directly (gladiolus, prompto, lunafreya, iris).

### D3: tmux Session Naming

| Old | New | Rationale |
|-----|-----|-----------|
| `shogun` | `noctis` | Commander session |
| `multiagent` | `kingsglaive` | Worker session (contains Ignis pane 0 + Comrades panes 1-4) |

### D4: Queue File Naming

| Old | New |
|-----|-----|
| `queue/shogun_to_karo.yaml` | `queue/noctis_to_ignis.yaml` |
| `queue/tasks/ashigaru{N}.yaml` | `queue/tasks/{character_name}.yaml` (gladiolus, prompto, lunafreya, iris) |
| `queue/reports/ashigaru{N}_report.yaml` | `queue/reports/{character_name}_report.yaml` |

### D5: Config Structure

`config/models.yaml` uses a nested structure organized by modes:

```yaml
modes:
  <mode_name>:
    noctis:
      model: <model_id>
      label: <display_name>
    ignis: ...
    gladiolus: ...
    prompto: ...
    lunafreya: ...
    iris: ...
```

Agent names are used directly as keys (not numbered kingsglaive{N} format).

### D6: Mode Naming

| Mode | Purpose |
|------|--------|
| `normal` | Standard mode, balanced performance |
| `fullpower` | Maximum capability, all Opus-class models |
| `lite` | Lightweight, cost-efficient models |
| `free-glm` | Free tier using GLM models |
| `free-kimi` | Free tier using Kimi models |

**Rationale**: Mode names are descriptive and functional, replacing the old Sengoku-themed names (kessen, setsuyaku).

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
| 「戦況報告書」 | 「ミッション状況」 | Dashboard title |
| 「戦果」 | 「戦果」(keep — fits FF15 military context) | Results section |

### D8: Instruction File Renaming

| Old | New |
|-----|-----|
| `instructions/shogun.md` | `instructions/noctis.md` |
| `instructions/karo.md` | `instructions/ignis.md` |
| `instructions/ashigaru.md` | `instructions/comrades.md` |

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
| `standby.sh` variable references break after rename | Test script execution after changes; variables are used consistently |
| Running agents reference old queue files | Restart all tmux sessions after deployment |
| `first_setup.sh` creates old-named files on new installations | Update all file creation paths in the script |
| `AGENTS.md` auto-loaded by all agents — errors affect everyone | Review AGENTS.md changes carefully; it's the single most critical file |
| Queue YAML rename breaks in-progress tasks | Execute migration during idle period; clear all queues first |
| `install.bat` Windows paths with old names | Update paths; users will need to re-clone or rename directory |

## Migration Plan

### Phase 1: File Renames
1. Rename `instructions/shogun.md` → `instructions/noctis.md`
2. Rename `instructions/karo.md` → `instructions/ignis.md`
3. Rename `instructions/ashigaru.md` → `instructions/comrades.md`
4. Rename `queue/tasks/ashigaru{N}.yaml` → `queue/tasks/{character_name}.yaml` (gladiolus, prompto, lunafreya, iris)
5. Rename `queue/reports/ashigaru{N}_report.yaml` → `queue/reports/{character_name}_report.yaml`
6. Rename `queue/shogun_to_karo.yaml` → `queue/noctis_to_ignis.yaml`

### Phase 2: Content Updates
1. Update instructions files with FF15 theme
2. Update AGENTS.md
3. Update shell scripts (`standby.sh`, `first_setup.sh`)
4. Update config files (`models.yaml`, `settings.yaml`)
5. Update documentation (`README.md`, `README_ja.md`, `dashboard.md`)
6. Update `install.bat`

### Phase 3: Verification
1. `grep -ri "shogun\|karo\|ashigaru\|足軽\|将軍\|家老\|出陣\|切腹" --include="*.md" --include="*.yaml" --include="*.sh" --include="*.bat"` — must return zero results (excluding openspec/ and backup/)
2. Shell script syntax check: `bash -n standby.sh && bash -n first_setup.sh`
3. YAML lint on all queue files

### Rollback Strategy
- Git revert to pre-migration commit
- `backup/original/` directory exists for reference

## Resolved Questions

- `shutsujin_departure.sh` has been renamed to `standby.sh`.
- Memory file paths are managed via Memory MCP (not file-based jsonl).
- Worker count reduced from 8 to 4 for practical efficiency.
