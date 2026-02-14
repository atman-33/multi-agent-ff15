# Architecture

## System Overview

```
        You (Crystal / Lord)
             │
             ├──────────────────────────┐
             ▼                          ▼
      ┌──────────┐            ┌────────────┐
      │ NOCTIS   │ ← King     │ LUNAFREYA  │ ← Oracle (Independent)
      │  (王)    │ (Leader +   │  (神凪)     │   Direct user interaction
      │          │  Task Mgr)  │            │   Can command Noctis
      └────┬─────┘            └────────────┘
           │ YAML + send-keys        ▲
           ▼                          │
      ┌────────────┬──────────┬────────────┐
      │   IGNIS    │GLADIOLUS │  PROMPTO   │ ← Comrades (3)
      │  (軍師)    │  (盾)    │   (銃)     │
      └────────────┴──────────┴────────────┘
                                     │
                                     ▼
                             ┌────────────┐
                             │    IRIS    │ ← Guardian (Monitor)
                             │  (守護者)   │   Dashboard monitoring
                             │            │   Notifies Noctis
                             └────────────┘

      Session: ff15 (unified session - 6 panes)
      Panes: 0=Noctis, 1=Lunafreya, 2=Ignis, 3=Gladiolus, 4=Prompto, 5=Iris
```

---

## Communication Protocol

### Downward (Orders)
Write YAML → wake target with `tmux send-keys`

### Upward (Reports)
Write YAML only (no send-keys to avoid interrupting your input)

### Polling
Forbidden. Event-driven only. API bills stay predictable.

---

## Context Persistence (4 Layers)

| Layer | What | Survives |
|-------|------|----------|
| Memory MCP | Preferences, rules, cross-project knowledge | Everything |
| Project files | `config/projects.yaml`, `context/*.md` | Everything |
| YAML Queue | Tasks, reports (source of truth) | Everything |
| Session | `AGENTS.md`, `.opencode/agents/*.md` | `/new` resets it |

After `/new`, an agent recovers in **~2,000 tokens** by reading Memory MCP + its task YAML. No expensive re-prompting.

---

## Party Formations

Agents can be deployed in different **formations** depending on the task:

| Formation | Comrades (Ignis/Gladiolus/Prompto) | Leaders (Noctis/Lunafreya) | Best for |
|-----------|-------------------------------------|----------------------------|----------|
| **Normal** (default) | Haiku 4.5 / Gemini 3 Flash | Sonnet 4.5 / Grok Fast | Everyday tasks — cost-efficient |
| **Full Power** (`--fullpower`) | GPT-5.2 / Sonnet 4.5 / Gemini 3 Pro | Opus 4.6 / Grok Fast | Critical tasks — maximum capability |
| **Lite** (`--lite`) | Haiku / Grok Fast | Haiku 4.5 | Budget-conscious development |

```bash
./standby.sh                # Normal formation (default)
./standby.sh --fullpower    # Full Power formation (premium models)
./standby.sh --lite         # Lite formation (budget mode)
```

Noctis can also switch individual Comrades to different models mid-session when needed.

---

## Model Configuration

| Agent | Normal Mode | Full Power Mode | Reason |
|-------|-------------|-----------------|--------|
| Noctis | Sonnet 4.5 | Opus 4.6 | Delegation and task management |
| Lunafreya | Grok Code Fast | Grok Code Fast | Independent advisor |
| Ignis | Haiku 4.5 | GPT-5.2 Codex | Cost-efficient |
| Gladiolus | Haiku 4.5 | Sonnet 4.5 | Cost-efficient |
| Prompto | Gemini 3 Flash | Gemini 3 Pro | Fast research |

---

## Context Management

Four-layer context structure for efficient knowledge sharing:

| Layer | Location | Purpose |
|-------|----------|---------|
| Layer 1: Memory MCP | `memory/noctis_memory.jsonl` | Cross-project, cross-session long-term memory |
| Layer 2: Project | `config/projects.yaml`, `projects/<id>.yaml`, `context/{project}.md` | Project-specific information & technical knowledge |
| Layer 3: YAML Queue | `queue/noctis_to_ignis.yaml`, `queue/tasks/`, `queue/reports/` | Task management - instructions & reports (source of truth) |
| Layer 4: Session | AGENTS.md, .opencode/agents/*.md | Working context (resets with /new) |

### /new Protocol (Cost Optimization)

Long work sessions cause context (Layer 4) to bloat, increasing API costs. Running `/new` clears session memory, resetting costs. Layers 1-3 remain as files and are not lost.

Comrades' recovery cost after `/new`: **~1,950 tokens** (39% of 5,000 target)

1. AGENTS.md (auto-loaded) → Recognize as ff15 system member
2. `tmux display-message -t "$TMUX_PANE" -p '#{@agent_id}'` → Confirm own ID
3. Load Memory MCP → Restore Crystal's preferences (~700 tokens)
4. Load task YAML → Check next assignment (~800 tokens)

The design of "what NOT to load" is key to cost reduction.

### Universal Context Template

Same 7-section template structure used for all projects:

| Section | Purpose |
|---------|---------|
| What | Project overview |
| Why | Purpose and success definition |
| Who | Stakeholders and owners |
| Constraints | Deadlines, budget, limitations |
| Current State | Progress, next actions, blockers |
| Decisions | Record of decisions and rationale |
| Notes | Free-form notes & insights |

This unified format enables:
- Quick onboarding for any agent
- Consistent information management across projects
- Easy handoff between Comrades

---

## Agent Identification (@agent_id)

Each pane has a `@agent_id` tmux user option set (e.g., `ignis`, `gladiolus`). `pane_index` shifts with pane rearrangement, but `@agent_id` is fixed by `standby.sh` at startup and doesn't change.

Agent self-identification:
```bash
tmux display-message -t "$TMUX_PANE" -p '#{@agent_id}'
```
`-t "$TMUX_PANE"` is mandatory. Omitting it returns the active pane's value, causing misidentification.

Model names are also saved as `@model_name` and always displayed via `pane-border-format`. Even if OpenCode overwrites the pane title, the model name remains visible.

---

## File Structure

```
multi-agent-ff15/
│
│  ┌─────────────────── Setup Scripts ───────────────────┐
├── install.bat               # Windows: Initial setup
├── first_setup.sh            # Ubuntu/Mac: Initial setup
├── standby.sh                # Daily startup
│  └────────────────────────────────────────────────────────────┘
│
├── .opencode/
│   └── agents/               # Native agent definitions
│       ├── noctis.md         # Noctis (King) agent
│       ├── lunafreya.md      # Lunafreya (Oracle) agent
│       ├── ignis.md          # Ignis (Strategist) agent
│       ├── gladiolus.md      # Gladiolus (Shield) agent
│       └── prompto.md        # Prompto (Gun) agent
│
├── config/
│   └── settings.yaml         # Language and other settings
│
├── projects/                # Project details (git-ignored, contains confidential info)
│   └── <project_id>.yaml   # All information for each project
│
├── queue/                    # Communication files
│   ├── lunafreya_to_noctis.yaml
│   ├── noctis_to_lunafreya.yaml
│   ├── tasks/                # Task files for each worker
│   │   ├── ignis.yaml
│   │   ├── gladiolus.yaml
│   │   └── prompto.yaml
│   └── reports/              # Worker reports
│       ├── ignis_report.yaml
│       ├── gladiolus_report.yaml
│       └── prompto_report.yaml
│
├── memory/                   # Memory MCP storage
├── dashboard.md              # Real-time status overview
└── AGENTS.md                 # OpenCode project context
```
