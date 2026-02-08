## Tasks

### Task 1: Rename queue files
**Specs**: file-structure  
**Files**: `queue/shogun_to_karo.yaml`, `queue/tasks/ashigaru*.yaml`, `queue/reports/ashigaru*_report.yaml`

Rename all queue files to use FF15 naming:
```bash
mv queue/shogun_to_karo.yaml queue/noctis_to_ignis.yaml
for i in $(seq 1 8); do
  mv queue/tasks/ashigaru${i}.yaml queue/tasks/kingsglaive${i}.yaml
  mv queue/reports/ashigaru${i}_report.yaml queue/reports/kingsglaive${i}_report.yaml
done
```

Update content inside renamed files:
- Replace `worker_id: ashigaru` → `worker_id: kingsglaive`  
- Replace `project: multi-agent-shogun` → `project: multi-agent-ff15`
- Replace all `ashigaru` references in task descriptions and paths

### Task 2: Rename instruction files
**Specs**: file-structure, role-hierarchy  
**Files**: `instructions/shogun.md`, `instructions/karo.md`, `instructions/ashigaru.md`

```bash
mv instructions/shogun.md instructions/noctis.md
mv instructions/karo.md instructions/ignis.md
mv instructions/ashigaru.md instructions/kingsglaive.md
```

### Task 3: Rewrite instructions/noctis.md
**Specs**: role-hierarchy, theme-language, file-structure  
**File**: `instructions/noctis.md`

Full content rewrite:
- YAML front matter: `role: noctis`, all `forbidden_actions` descriptions updated, penalty changed from 切腹→追放
- Workflow targets: `kingsglaive:0.0` (was `multiagent:0.0`)
- File paths: `queue/noctis_to_ignis.yaml`, etc.
- Pane references: `karo: kingsglaive:0.0`
- Speech style: `FF15風` replacing `戦国風`, all example phrases updated
- Persona: `speech_style: "FF15風"`
- Memory path: `memory/noctis_memory.jsonl`
- All send-keys examples: use `kingsglaive:` session
- Section title: 「Noctis（王子）指示書」
- Replace 殿→王子/Noctis殿, 将軍→Noctis, 家老→Ignis, 足軽→Kingsglaive throughout

### Task 4: Rewrite instructions/ignis.md
**Specs**: role-hierarchy, theme-language, file-structure  
**File**: `instructions/ignis.md`

Full content rewrite:
- YAML front matter: `role: ignis`, updated forbidden_actions, penalty 切腹→追放
- Workflow: all `ashigaru` → `kingsglaive`, all `shogun` → `noctis`
- File paths: `queue/noctis_to_ignis.yaml`, `queue/tasks/kingsglaive{N}.yaml`, `queue/reports/kingsglaive{N}_report.yaml`
- Pane references: `kingsglaive:0.0` (self), `kingsglaive:agents.{N}` (workers), `noctis` session
- Agent ID: `ignis` (was `karo`), lookup pattern `kingsglaive{N}` (was `ashigaru{N}`)
- Send-keys: all targets updated to `kingsglaive:` session
- Speech style: `FF15風`
- Dashboard references: 戦況報告書→任務報告書, 足軽→Kingsglaive
- All model override references: variable names use FF15 naming
- /clear protocol: pane titles use `kingsglaive{N}` naming
- Section title: 「Ignis（軍師）指示書」

### Task 5: Rewrite instructions/kingsglaive.md
**Specs**: role-hierarchy, theme-language, file-structure  
**File**: `instructions/kingsglaive.md`

Full content rewrite:
- YAML front matter: `role: kingsglaive`, updated forbidden_actions, penalty 切腹→追放
- Workflow: `queue/tasks/kingsglaive{N}.yaml`, `queue/reports/kingsglaive{N}_report.yaml`
- All `karo` → `ignis`, all `shogun` → `noctis`
- Pane references: `ignis` at `kingsglaive:0.0`, self at `kingsglaive:0.{N}`
- Agent ID format: `kingsglaive{N}` (was `ashigaru{N}`)
- Send-keys: targets use `kingsglaive:0.0`
- Persona speech_style: `FF15風`
- Report YAML examples: `worker_id: kingsglaive1`
- Section title: 「Kingsglaive（王の剣）指示書」
- Add character assignment table (Gladiolus, Prompto, etc.)
- Speech examples: FF15-style

### Task 6: Rewrite AGENTS.md
**Specs**: role-hierarchy, documentation-branding, file-structure  
**File**: `AGENTS.md`

Complete overhaul:
- Title: `multi-agent-ff15`
- Hierarchy ASCII: User → Noctis → Ignis → Kingsglaive 1-8
- Agent Roles section: Noctis/Ignis/Kingsglaive with FF15 descriptions
- File structure: all paths updated
- Communication protocol: updated session names
- YAML examples: FF15 naming
- Session recovery: updated with kingsglaive references
- tmux pane ID: `kingsglaive{N}` format
- /clear recovery: updated paths and names

### Task 7: Update config/models.yaml
**Specs**: role-hierarchy, file-structure  
**File**: `config/models.yaml`

Rename all keys:
- `shogun_model`/`shogun_label` → `noctis_model`/`noctis_label`
- `karo_model`/`karo_label` → `ignis_model`/`ignis_label`
- `ashigaru_1_4_model`/`ashigaru_1_4_label` → `kingsglaive_1_4_model`/`kingsglaive_1_4_label`
- `ashigaru_5_8_model`/`ashigaru_5_8_label` → `kingsglaive_5_8_model`/`kingsglaive_5_8_label`

### Task 8: Update config/settings.yaml
**Specs**: theme-language, documentation-branding  
**File**: `config/settings.yaml`

- Header: `# multi-agent-ff15 設定ファイル`
- Language descriptions: `FF15風日本語` replacing `戦国風日本語`
- Skill prefix: `ff15-` replacing `shogun-`

### Task 9: Update shutsujin_departure.sh
**Specs**: file-structure, theme-language, documentation-branding  
**File**: `shutsujin_departure.sh`

- Header comment: `multi-agent-ff15`
- Log comment: `FF15風` replacing `戦国風`
- Variable names: SHOGUN→NOCTIS, KARO→IGNIS, ASHIGARU→KINGSGLAIVE
- tmux session names: `noctis` and `kingsglaive`
- ASCII art banner: FF15-themed
- Alias references: `css → tmux attach-session -t noctis`
- Agent ID creation: `kingsglaive{N}` instead of `ashigaru{N}`
- Pane titles: use FF15 naming
- Model key reads: use new config key names
- All send-keys targets use new session names

### Task 10: Update first_setup.sh
**Specs**: file-structure, documentation-branding  
**File**: `first_setup.sh`

- Header: `multi-agent-ff15`
- Banner: FF15-themed installer
- Queue file creation: `kingsglaive{N}.yaml` instead of `ashigaru{N}.yaml`
- Report file creation: `kingsglaive{N}_report.yaml`
- Worker ID in generated YAML: `kingsglaive{N}`
- Settings.yaml generation: FF15 comments
- Alias creation: new session names
- Memory path: `noctis_memory.jsonl` instead of `shogun_memory.jsonl`
- All `multi-agent-shogun` references → `multi-agent-ff15`

### Task 11: Update install.bat
**Specs**: documentation-branding  
**File**: `install.bat`

- Window title: `multi-agent-ff15 Installer`
- Banner text: Replace `[SHOGUN] multi-agent-shogun`
- Path references: `multi-agent-ff15`

### Task 12: Update README.md
**Specs**: documentation-branding  
**File**: `README.md`

- Project title: `multi-agent-ff15`
- Tagline: FF15-themed
- Role descriptions: Noctis/Ignis/Kingsglaive
- Code examples: updated session names and commands
- Badge URLs: if referencing repo name

### Task 13: Update README_ja.md
**Specs**: documentation-branding  
**File**: `README_ja.md`

- Same scope as Task 12 but for Japanese version
- Replace 将軍→Noctis, 家老→Ignis, 足軽→Kingsglaive
- Session names: noctis, kingsglaive
- All code examples updated

### Task 14: Update dashboard.md
**Specs**: documentation-branding, theme-language  
**File**: `dashboard.md`

- Title: 「⚔️ multi-agent-ff15 任務報告書」
- Replace 足軽→Kingsglaive in all references
- Replace 家老→Ignis
- Replace 戦国 references

### Task 15: Verification scan
**Specs**: all  

Run comprehensive grep to find any remaining old-theme references:
```bash
grep -rni "shogun\|karo\|ashigaru\|足軽\|将軍\|家老\|切腹\|戦国\|出陣" \
  --include="*.md" --include="*.yaml" --include="*.sh" --include="*.bat" \
  --exclude-dir=openspec --exclude-dir=backup --exclude-dir=docs \
  --exclude-dir=.git
```
Any remaining references must be addressed.
