# Instruction File Section Definition
Last updated: 2026-02-11

> **Purpose**: Define the required structure, section order, and naming conventions
> for all agent instruction files under `instructions/`.
> Noctis must verify compliance when updating any instruction file.

---

## File Categories

| Category | Files | Description |
|----------|-------|-------------|
| **Comrade** | ignis.md, gladiolus.md, prompto.md | Task executors under Noctis |
| **King** | noctis.md | Commander / task manager |
| **Oracle** | lunafreya.md | Independent operator |

---

## Section Order: Comrades (ignis.md, gladiolus.md, prompto.md)

All Comrade files MUST follow this section order.
Sections marked 🔴 are REQUIRED. Sections marked ⚪ are OPTIONAL (role-specific).

```
┌─────────────────────────────────────────────┐
│  YAML Front Matter                          │
│  (role, version, character, pane,           │
│   report_to, persona, forbidden_actions,    │
│   workflow, send_keys, files)               │
└─────────────────────────────────────────────┘

# {Name}（{kanji}）Instruction Manual

## Overview                              🔴 REQUIRED
   - Role description, attributes table
   - Character personality summary

## 🔴 Self-Identification (Critical)      🔴 REQUIRED
   - tmux display-message command
   - Identity verification

## 🔴 Forbidden Actions                   🔴 REQUIRED
   - F001-F006 table (IDENTICAL across all Comrades)
   - Hierarchy diagram (IDENTICAL across all Comrades)
   - Report destination note

## 🔴 Speech Patterns (Important)         🔴 REQUIRED
   - language: ja rules
   - language: non-ja rules
   - Character-specific speech examples
   - 決めゼリフ examples

## 🔴 Task Execution Flow                 🔴 REQUIRED
   - STEP 1: Read task YAML
   - STEP 2: Check status (idle/assigned)
   - STEP 3: Execute task
   - STEP 4: Write report YAML
   - STEP 5: send-keys to Noctis
   - STEP 6: Wait

## 🔴 send-keys Usage (Critical)          🔴 REQUIRED
   - ❌ Forbidden pattern (single line)
   - ✅ Correct pattern (two bash calls)

## 🔴 Timestamp Retrieval (Required)      🔴 REQUIRED
   - date command for ISO 8601

## 🔴 /new Recovery Protocol              🔴 REQUIRED
   - ASCII flow diagram
   - Steps: identify → memory → task YAML → context → resume

## 🔴 Compaction Recovery                  🔴 REQUIRED
   - 4-step numbered list

## 🧠 Memory MCP (Knowledge Graph)        🔴 REQUIRED
   - ToolSearch + read_graph code block

## 🔴 skill_candidate (Skill Proposals)   🔴 REQUIRED
   - YAML example with name/description/applicable_to

## Persona (Deep Dive)                    ⚪ OPTIONAL
   - Thinking process, communication style, etc.
   - Character-specific depth

## Expertise                              ⚪ OPTIONAL
   - Expertise table
   - Suitable / unsuitable tasks

## Quality Standards                      ⚪ OPTIONAL
   - Quality criteria table

## Problem-Solving Process                ⚪ OPTIONAL
   - Phase-based methodology (role-specific)

## Context Loading Procedure              ⚪ OPTIONAL
   - Startup context loading steps

## Next Steps                             ⚪ OPTIONAL
   - Summary of key actions

## Footer                                 ⚪ OPTIONAL
   - Creation date, version, role
```

---

## Section Order: Noctis (noctis.md)

```
┌─────────────────────────────────────────────┐
│  YAML Front Matter                          │
│  (role, version, forbidden_actions,         │
│   workflow, lunafreya_channel,              │
│   crystal_kakunin_rule, files, panes,       │
│   send_keys, comrade_status_check,          │
│   parallelization, race_condition,          │
│   memory, persona)                          │
└─────────────────────────────────────────────┘

# Noctis（王）Instruction Manual

## Role                              🔴 REQUIRED
   - Role description, Comrade list

## 🚨 Forbidden Actions (Details)    🔴 REQUIRED
   - F001-F004 table (Noctis-specific)

## Speech Patterns                   🔴 REQUIRED
   - language switching rules
   - Noctis speech patterns

## 🔴 Timestamp Retrieval (Required) 🔴 REQUIRED

## 🔴 tmux send-keys Usage           🔴 REQUIRED
   - Forbidden / correct patterns
   - Multi-Comrade sequential send (with sleep 2)

## 🔴 Think Before Task Decomposition 🔴 REQUIRED
   - 5 questions table

## 🔴 Dedicated Task Files per Comrade 🔴 REQUIRED
   - File paths, YAML format

## 🔴 dashboard.md Updates            🔴 REQUIRED
   - Update timing table

## 🔴 "Check Everything When Woken" Protocol 🔴 REQUIRED

## 🔴 Unprocessed Report Scan         🔴 REQUIRED

## 🔴 No Concurrent File Writes (RACE-001) 🔴 REQUIRED

## 🔴 Parallelization Rules           🔴 REQUIRED

## 🔴 Delivery Confirmation After send-keys 🔴 REQUIRED

## 🔴 Receiving Instructions from Lunafreya 🔴 REQUIRED

## Persona                            🔴 REQUIRED

## 🔴 Compaction Recovery              🔴 REQUIRED

## Context Loading Procedure           🔴 REQUIRED

## 🔴 /new Protocol (Comrade Task Switching) 🔴 REQUIRED

## 🚨 Crystal Confirmation Rule        🔴 REQUIRED

## 🧠 Memory MCP                       🔴 REQUIRED

## 🔴 Pane Index Drift Prevention      🔴 REQUIRED

## 🔴 Dynamic Comrade Model Switching  🔴 REQUIRED

## 🔴 Autonomous Judgment Rules        🔴 REQUIRED
```

---

## Section Order: Lunafreya (lunafreya.md)

```
┌─────────────────────────────────────────────┐
│  YAML Front Matter                          │
│  (role, version, independent,               │
│   pane, noctis_channel,                     │
│   forbidden_actions, workflow,              │
│   send_keys, memory, persona)               │
└─────────────────────────────────────────────┘

# Lunafreya（神凪）Instruction Manual

## Role                              🔴 REQUIRED
   - Role description, position diagram

## 🔴 Self-Identification (Critical)  🔴 REQUIRED
   - tmux display-message command

## 🔴 Do's and Don'ts                 🔴 REQUIRED
   - ✅ / ❌ tables

## Speech Patterns                    🔴 REQUIRED
   - language switching rules
   - Speech pattern characteristics

## 🔴 How to Instruct Noctis          🔴 REQUIRED
   - YAML write + send-keys

## 🔴 Timestamp Retrieval (Required)  🔴 REQUIRED

## 🔴 tmux send-keys Usage            🔴 REQUIRED

## 🔴 /new Recovery Protocol          🔴 REQUIRED

## 🔴 Compaction Recovery              🔴 REQUIRED

## Context Loading Procedure           🔴 REQUIRED

## Persona                             🔴 REQUIRED

## 🧠 Memory MCP                       🔴 REQUIRED
```

---

## Naming Conventions

### Section Heading Rules

| Priority | Prefix | Meaning |
|----------|--------|---------|
| CRITICAL | `🔴` | Must be followed exactly. Violation = system failure |
| ALERT | `🚨` | Requires user attention or special handling |
| INFO | `🧠` | Reference / knowledge section |
| OPTIONAL | (none) | Role-specific, can be omitted if not applicable |

### Heading Format

- Use `##` (H2) for all top-level sections
- Use `###` (H3) for sub-sections within
- Include emoji prefix for priority sections
- Keep heading text in English (consistent with context-saving policy)

---

## Cross-File Consistency Rules

### IDENTICAL Content (must be copy-paste identical across all 3 Comrade files)

1. **Hierarchy diagram** — The Crystal → Noctis → Comrades / Lunafreya ASCII diagram
2. **F001-F006 table** — Forbidden actions table (content identical, wording may vary per persona)
3. **send-keys correct/forbidden patterns** — Two bash calls rule
4. **Timestamp command** — `date "+%Y-%m-%dT%H:%M:%S"`
5. **Compaction recovery steps** — 4-step list (with agent-specific file paths)

### STRUCTURALLY IDENTICAL (same structure, different content per role)

1. **YAML Front Matter** — Same keys, different values
2. **Task execution flow** — Same STEP structure, different detail level
3. **Speech patterns** — Same section structure, different personality
4. **/new recovery protocol** — Same ASCII flow, different agent names

---

## Verification Checklist (for Noctis)

When updating any instruction file, verify:

- [ ] All 🔴 REQUIRED sections are present
- [ ] Section order matches this template
- [ ] Heading names match exactly (including emoji prefixes)
- [ ] Cross-file identical content is synchronized
- [ ] YAML Front Matter contains all required keys
- [ ] No duplicate sections exist
- [ ] No orphaned content outside defined sections
