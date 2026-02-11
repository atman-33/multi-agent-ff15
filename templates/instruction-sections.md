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

# {Name}（{kanji}）専用指示書

## 概要                              🔴 REQUIRED
   - Role description, attributes table
   - Character personality summary

## 🔴 自己識別（最重要）               🔴 REQUIRED
   - tmux display-message command
   - Identity verification

## 🔴 絶対禁止事項                    🔴 REQUIRED
   - F001-F006 table (IDENTICAL across all Comrades)
   - Hierarchy diagram (IDENTICAL across all Comrades)
   - Report destination note

## 🔴 言葉遣い（重要）                🔴 REQUIRED
   - language: ja rules
   - language: non-ja rules
   - Character-specific speech examples
   - 決めゼリフ examples

## 🔴 タスク実行フロー                 🔴 REQUIRED
   - STEP 1: Read task YAML
   - STEP 2: Check status (idle/assigned)
   - STEP 3: Execute task
   - STEP 4: Write report YAML
   - STEP 5: send-keys to Noctis
   - STEP 6: Wait

## 🔴 send-keys の使用方法（超重要）    🔴 REQUIRED
   - ❌ Forbidden pattern (single line)
   - ✅ Correct pattern (two bash calls)

## 🔴 タイムスタンプの取得（必須）       🔴 REQUIRED
   - date command for ISO 8601

## 🔴 /new からの復帰プロトコル         🔴 REQUIRED
   - ASCII flow diagram
   - Steps: identify → memory → task YAML → context → resume

## 🔴 コンパクション復帰手順            🔴 REQUIRED
   - 4-step numbered list

## 🧠 Memory MCP（知識グラフ記憶）      🔴 REQUIRED
   - ToolSearch + read_graph code block

## 🔴 skill_candidate（スキル化候補）   🔴 REQUIRED
   - YAML example with name/description/applicable_to

## ペルソナ設定（深掘り）               ⚪ OPTIONAL
   - Thinking process, communication style, etc.
   - Character-specific depth

## 専門領域                            ⚪ OPTIONAL
   - Expertise table
   - Suitable / unsuitable tasks

## 品質基準                            ⚪ OPTIONAL
   - Quality criteria table

## 問題解決手順                         ⚪ OPTIONAL
   - Phase-based methodology (role-specific)

## コンテキスト読み込み手順             ⚪ OPTIONAL
   - Startup context loading steps

## 次のステップ                        ⚪ OPTIONAL
   - Summary of key actions

## フッター                            ⚪ OPTIONAL
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

# Noctis（王）指示書

## 役割                              🔴 REQUIRED
   - Role description, Comrade list

## 🚨 絶対禁止事項の詳細              🔴 REQUIRED
   - F001-F004 table (Noctis-specific)

## 言葉遣い                           🔴 REQUIRED
   - language switching rules
   - Noctis speech patterns

## 🔴 タイムスタンプの取得方法（必須）   🔴 REQUIRED

## 🔴 tmux send-keys の使用方法        🔴 REQUIRED
   - Forbidden / correct patterns
   - Multi-Comrade sequential send (with sleep 2)

## 🔴 タスク分解の前に、まず考えろ      🔴 REQUIRED
   - 5 questions table

## 🔴 各Comradeに専用ファイルで指示     🔴 REQUIRED
   - File paths, YAML format

## 🔴 dashboard.md 更新               🔴 REQUIRED
   - Update timing table

## 🔴 「起こされたら全確認」方式        🔴 REQUIRED

## 🔴 未処理報告スキャン               🔴 REQUIRED

## 🔴 同一ファイル書き込み禁止          🔴 REQUIRED

## 🔴 並列化ルール                    🔴 REQUIRED

## 🔴 send-keys送信後の到達確認        🔴 REQUIRED

## 🔴 Lunafreyaからの指示受信          🔴 REQUIRED

## ペルソナ設定                       🔴 REQUIRED

## 🔴 コンパクション復帰手順           🔴 REQUIRED

## コンテキスト読み込み手順            🔴 REQUIRED

## 🔴 /newプロトコル                  🔴 REQUIRED

## 🚨 Crystalへの確認ルール           🔴 REQUIRED

## 🧠 Memory MCP                     🔴 REQUIRED

## 🔴 ペイン番号ズレ対策              🔴 REQUIRED

## 🔴 Comradeモデル動的切替           🔴 REQUIRED

## 🔴 自律判断ルール                  🔴 REQUIRED
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

# Lunafreya（神凪）指示書

## 役割                              🔴 REQUIRED
   - Role description, position diagram

## 🚨 やること・やらないこと            🔴 REQUIRED
   - ✅ / ❌ tables

## 言葉遣い                           🔴 REQUIRED
   - language switching rules
   - Speech pattern characteristics

## 🔴 Noctisへの指示方法              🔴 REQUIRED
   - YAML write + send-keys

## 🔴 タイムスタンプの取得方法          🔴 REQUIRED

## 🔴 tmux send-keys の使用方法        🔴 REQUIRED

## 🔴 /new からの復帰プロトコル         🔴 REQUIRED

## 🔴 コンパクション復帰手順            🔴 REQUIRED

## コンテキスト読み込み手順             🔴 REQUIRED

## ペルソナ設定                        🔴 REQUIRED

## 🧠 Memory MCP                      🔴 REQUIRED
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
- Keep heading text in Japanese (consistent with agent language)

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
