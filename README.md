<div align="center">

# multi-agent-ff15

**OpenCode Multi-Agent Command System**

*5 AI agents running in parallel with a single command*

[![GitHub Stars](https://img.shields.io/github/stars/atman-33/multi-agent-ff15?style=social)](https://github.com/atman-33/multi-agent-ff15)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![OpenCode](https://img.shields.io/badge/Built_for-OpenCode-blue)](https://opencode.ai)
[![Shell](https://img.shields.io/badge/Shell%2FBash-100%25-green)]()

[English](README.md) | [日本語](README_ja.md)

</div>

<p align="center">
  <img src="assets/tmux_ff15_live_session.png" alt="multi-agent-ff15: 5 agents running in parallel - real session" width="800">
</p>

<p align="center"><i>Noctis (King) commanding 3 Comrades (Ignis, Gladiolus, Prompto) with Lunafreya (Oracle) operating independently - actual session screenshot</i></p>

---

With a single command, **Noctis** (King) directly assigns tasks to **3 Comrades** (Ignis, Gladiolus, Prompto) who execute in parallel. Meanwhile, **Lunafreya** (Oracle) operates independently, consulting directly with you and commanding Noctis when needed. All agents run as independent OpenCode processes in tmux. Communication flows through YAML files and tmux \`send-keys\`, meaning **zero API calls for agent coordination**.

---

## Philosophy

> "Don't execute tasks mindlessly. Always keep 'fastest × best output' in mind."

The Noctis System is built on five core principles:

| Principle | Description |
|-----------|-------------|
| **Autonomous Formation** | Design task formations based on complexity, not templates |
| **Parallelization** | Use subagents to prevent single-point bottlenecks |
| **Research First** | Search for evidence before making decisions |
| **Continuous Learning** | Don't rely solely on model knowledge cutoffs |
| **Triangulation** | Multi-perspective research with integrated authorization |

These principles are documented in detail: **[docs/philosophy.md](docs/philosophy.md)**

---

## Why Noctis?

Most multi-agent frameworks burn API tokens on coordination. Noctis doesn't.

| | OpenCode | LangGraph | CrewAI | **multi-agent-ff15** |
|---|---|---|---|---|
| **Architecture** | Agents with tools | Graph-based state machine | Role-based agents | Feudal hierarchy via tmux |
| **Parallelism** | Limited | Parallel nodes (v0.2+) | Limited | **5 independent agents** |
| **Coordination cost** | API calls | API + infra (Postgres/Redis) | API + CrewAI platform | **Zero** (YAML + tmux) |
| **Observability** | Logs only | LangSmith integration | OpenTelemetry | **Live tmux panes** + dashboard |
| **Skill discovery** | None | None | None | **Bottom-up auto-proposal** |
| **Setup** | CLI install | Heavy (infra required) | pip install | Shell scripts |

### What makes this different

**Zero coordination overhead** — Agents communicate through YAML files on disk. The only API calls are for actual work, not orchestration. Run 5 agents and pay only for 5 agents' work.

**Full transparency** — Every agent runs in a visible tmux pane. Every instruction, report, and decision is a plain YAML file you can read, diff, and version-control. No black boxes.

**Battle-tested hierarchy** — The Noctis → Comrades chain of command prevents conflicts by design: clear ownership, dedicated files per agent, event-driven communication, no polling. Lunafreya operates independently outside this hierarchy.

---

## Bottom-Up Skill Discovery

This is the feature no other framework has.

As Comrades execute tasks, they **automatically identify reusable patterns** and propose them as skill candidates. Ignis aggregates these proposals in \`dashboard.md\`, and you — the Lord — decide what gets promoted to a permanent skill.

\`\`\`
Comrade finishes a task
    ↓
Notices: "I've done this pattern 3 times across different projects"
    ↓
Reports in YAML:  skill_candidate:
                     found: true
                     name: "api-endpoint-scaffold"
                     reason: "Same REST scaffold pattern used in 3 projects"
    ↓
Appears in dashboard.md → You approve → Skill created in skills/
    ↓
Any agent can now invoke /api-endpoint-scaffold
\`\`\`

Skills grow organically from real work — not from a predefined template library. Your skill set becomes a reflection of **your** workflow.

> **Framework**: Built on [OpenCode](https://opencode.ai)

---

## Architecture

\`\`\`
        You (Crystal / Lord)
             │
             ├──────────────────────────┐
             ▼                          ▼
      ┌──────────┐            ┌────────────┐
      │ NOCTIS   │ ← King     │ LUNAFREYA  │ ← Oracle (Independent)
      │  (王)    │ (Leader +   │  (神凪)     │   Direct user interaction
      │          │  Task Mgr)  │            │   Can command Noctis
      └────┬─────┘            └────────────┘
           │ YAML + send-keys
           ▼
      ┌────────────┬──────────┬────────────┐
      │   IGNIS    │GLADIOLUS │  PROMPTO   │ ← Comrades (3)
      │  (軍師)    │  (盾)    │   (銃)     │
      └────────────┴──────────┴────────────┘

      Session: ff15 (unified session - 5 panes)
      Panes: 0=Noctis, 1=Lunafreya, 2=Ignis, 3=Gladiolus, 4=Prompto
\`\`\`

**Communication protocol:**
- **Downward** (orders): Write YAML → wake target with \`tmux send-keys\`
- **Upward** (reports): Write YAML only (no send-keys to avoid interrupting your input)
- **Polling**: Forbidden. Event-driven only. API bills stay predictable.

**Context persistence (4 layers):**

| Layer | What | Survives |
|-------|------|----------|
| Memory MCP | Preferences, rules, cross-project knowledge | Everything |
| Project files | \`config/projects.yaml\`, \`context/*.md\` | Everything |
| YAML Queue | Tasks, reports (source of truth) | Everything |
| Session | \`AGENTS.md\`, instructions | \`/new\` resets it |

After \`/new\`, an agent recovers in **~2,000 tokens** by reading Memory MCP + its task YAML. No expensive re-prompting.

---

## Party Formations

Agents can be deployed in different **formations** depending on the task:

| Formation | Comrades (Ignis/Gladiolus/Prompto) | Leaders (Noctis/Lunafreya) | Best for |
|-----------|-------------------------------------|----------------------------|----------|
| **Normal** (default) | Haiku 4.5 / Gemini 3 Flash | Sonnet 4.5 / Grok Fast | Everyday tasks — cost-efficient |
| **Full Power** (\`--fullpower\`) | GPT-5.2 / Sonnet 4.5 / Gemini 3 Pro | Opus 4.6 / Grok Fast | Critical tasks — maximum capability |
| **Lite** (\`--lite\`) | Haiku / Grok Fast | Haiku 4.5 | Budget-conscious development |

\`\`\`bash
./standby.sh                # Normal formation (default)
./standby.sh --fullpower    # Full Power formation (premium models)
./standby.sh --lite         # Lite formation (budget mode)
\`\`\`

Noctis can also switch individual Comrades to different models mid-session when needed.

---

## 🧭 Core Philosophy

> **"Don't execute tasks mindlessly. Always keep 'fastest × best output' in mind."**

The Noctis System is designed based on five core principles:

| Principle | Description |
|-----------|-------------|
| **Autonomous Formation Design** | Design formations based on task complexity, not templates |
| **Parallelization** | Use subagents to avoid single points of failure |
| **Research First** | Seek evidence before making decisions |
| **Continuous Learning** | Don't rely solely on model knowledge cutoffs |
| **Triangulation** | Multi-perspective research with integrated authorization |

Details: **[docs/philosophy.md](docs/philosophy.md)**

---

## What is this?

## 🚀 Quick Start

### 🪟 Windows Users (Most Common)

<table>
<tr>
<td width="60">

**Step 1**

</td>
<td>

📥 **Download the repository**

[Download ZIP](https://github.com/yohey-w/multi-agent-ff15/archive/refs/heads/main.zip) and extract to \`C:\\tools\\multi-agent-ff15\`

*Or use git:* \`git clone https://github.com/yohey-w/multi-agent-ff15.git C:\\tools\\multi-agent-ff15\`

</td>
</tr>
<tr>
<td>

**Step 2**

</td>
<td>

🖱️ **Run \`install.bat\`**

Right-click → "Run as administrator" (if WSL2 is not installed). Sets up WSL2 + Ubuntu.

</td>
</tr>
<tr>
<td>

**Step 3**

</td>
<td>

🐧 **Open Ubuntu and run the following** (first time only)

\`\`\`bash
cd /mnt/c/tools/multi-agent-ff15
./first_setup.sh
\`\`\`

</td>
</tr>
<tr>
<td>

**Step 4**

</td>
<td>

✅ **Stand by Me!**

\`\`\`bash
./standby.sh
\`\`\`

</td>
</tr>
</table>

#### 🔑 First time only: Authentication

After \`first_setup.sh\` completes, run the following once to authenticate:

\`\`\`bash
# 1. Apply PATH changes
source ~/.bashrc

# 2. Start OpenCode
opencode
#    → Select your preferred AI model provider
#    → Follow authentication prompts
#    → Type /exit to quit
\`\`\`

Authentication is saved to \`~/.opencode/\` and won't be needed again.

#### 📅 Daily startup (after initial setup)

Open **Ubuntu terminal** (WSL) and run:

\`\`\`bash
cd /mnt/c/tools/multi-agent-ff15
./standby.sh
\`\`\`

### 📱 Mobile Access (Command from anywhere)

Command your AI army from your phone — bed, café, or bathroom.

**Requirements (all free):**

| Name | In a nutshell | Role |
|------|---------------|------|
| [Tailscale](https://tailscale.com/) | Road to your home from outside | Connect to home PC from café or bathroom |
| SSH | Feet to walk that road | Log into home PC through Tailscale |
| [Termux](https://termux.dev/) | Black screen on phone | Needed to use SSH. Just install on phone |

**Setup:**

1. Install Tailscale on both WSL and your phone
2. On WSL side (Auth key method — no browser needed):
   \`\`\`bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscaled &
   sudo tailscale up --authkey tskey-auth-XXXXXXXXXXXX
   sudo service ssh start
   \`\`\`
3. From Termux on your phone:
   \`\`\`sh
   pkg update && pkg install openssh
   ssh youruser@your-tailscale-ip
   ffa    # Connect to ff15 session
   \`\`\`

**Disconnect:** Just swipe the Termux window closed. tmux sessions survive — AI subordinates keep working silently.

**Voice input:** Use your phone's voice keyboard to speak. Noctis understands natural language, so typos from speech recognition don't matter.

**tmux pane switching:** \`Ctrl+B\` then numbers (0-4) to switch panes. 0=Noctis, 1=Lunafreya, 2-4=Comrades.

---

<details>
<summary>🐧 <b>Linux / Mac Users</b> (click to expand)</summary>

### Initial Setup

\`\`\`bash
# 1. Clone the repository
git clone https://github.com/yohey-w/multi-agent-ff15.git ~/multi-agent-ff15
cd ~/multi-agent-ff15

# 2. Grant execution permission to scripts
chmod +x *.sh

# 3. Run initial setup
./first_setup.sh
\`\`\`

### Daily startup

\`\`\`bash
cd ~/multi-agent-ff15
./standby.sh
\`\`\`

</details>

---

<details>
<summary>❓ <b>What is WSL2? Why is it needed?</b> (click to expand)</summary>

### About WSL2

**WSL2 (Windows Subsystem for Linux)** is a feature that allows you to run Linux inside Windows. This system uses \`tmux\` (a Linux tool) to manage multiple AI agents, so WSL2 is required on Windows.

### If you don't have WSL2 yet

No problem! Running \`install.bat\` will:
1. Check if WSL2 is installed (auto-install if not)
2. Check if Ubuntu is installed (auto-install if not)
3. Guide you to the next step (how to run \`first_setup.sh\`)

**Quick install command** (run PowerShell as administrator):
\`\`\`powershell
wsl --install
\`\`\`

Then restart your computer and run \`install.bat\` again.

</details>

---

<details>
<summary>📋 <b>Script Reference</b> (click to expand)</summary>

| Script | Purpose | When to run |
|--------|---------|-------------|
| \`install.bat\` | Windows: Setup WSL2 + Ubuntu | First time only |
| \`first_setup.sh\` | Install tmux, dependencies, OpenCode CLI + Memory MCP setup | First time only |
| \`standby.sh\` | Create tmux session + Start OpenCode + Load instructions | Daily |

### What \`install.bat\` does automatically:
- ✅ Check if WSL2 is installed (guide if not)
- ✅ Check if Ubuntu is installed (guide if not)
- ✅ Guide to next step (how to run \`first_setup.sh\`)

### What \`standby.sh\` does:
- ✅ Create tmux session (noctis + kingsglaive)
- ✅ Start OpenCode on all agents
- ✅ Auto-load instructions for each agent
- ✅ Reset queue files to fresh state

**After running, all agents are ready to receive commands!**

</details>

---

<details>
<summary>🔧 <b>Required Environment (for manual setup)</b> (click to expand)</summary>

If manually installing dependencies:

| Requirement | Installation method | Notes |
|-------------|---------------------|-------|
| WSL2 + Ubuntu | \`wsl --install\` in PowerShell | Windows only |
| Set Ubuntu as default | \`wsl --set-default Ubuntu\` | Required for script operation |
| tmux | \`sudo apt install tmux\` | Terminal multiplexer |
| Node.js v20+ | \`nvm install 20\` | Required for MCP servers |
| OpenCode CLI | \`npm install -g opencode\` or from official site | Official OpenCode CLI |

</details>

---

### ✅ State after setup

With either option, **5 AI agents** will auto-start:

| Agent | Role | Count |
|-------|------|-------|
| 👑 Noctis | King - receives your commands and manages tasks | 1 |
| 🌙 Lunafreya | Oracle - operates independently & commands Noctis | 1 |
| ⚔️ Comrades (Ignis, Gladiolus, Prompto) | Workers - execute tasks in parallel | 3 |

tmux session:
- \`ff15\` - unified session (5 panes)

---

## 📖 Basic Usage

### Step 1: Connect to ff15 session

After running \`standby.sh\`, all agents automatically load their instructions and are ready to work.

Open a new terminal and connect to the ff15 session:

\`\`\`bash
ffa    # Alias (tmux attach-session -t ff15)
\`\`\`

### Step 2: Give your first command

Noctis is already initialized! Just give a command:

\`\`\`
Research the top 5 JavaScript frameworks and create a comparison table
\`\`\`

Noctis will:
1. Write tasks to YAML files
2. Notify Ignis (manager)
3. Return control to you immediately (no waiting!)

Meanwhile, Ignis distributes tasks to Comrades and executes in parallel.

### Step 3: Check progress

Open \`dashboard.md\` in your editor to see real-time status:

\`\`\`markdown
## In Progress
| Worker | Task | Status |
|--------|------|--------|
| Gladiolus | React research | Running |
| Prompto | Vue research | Running |
| Lunafreya | Angular research | Complete |
\`\`\`

---

## How It Works

### 1. Give a command

\`\`\`
You: "Research the top 5 MCP servers and create a comparison table"
\`\`\`

### 2. Noctis delegates instantly

Noctis writes tasks to \`queue/tasks/{worker_name}.yaml\` and wakes each Comrade. Control returns to you immediately — no waiting.

### 3. Comrades execute

Noctis directly assigns tasks to each Comrade:

| Comrade | Assignment |
|---------|------------|
| Ignis | Research Notion MCP + coordinate findings |
| Gladiolus | Research GitHub MCP |
| Prompto | Research Playwright MCP |

### 4. Parallel execution

All 3 Comrades research simultaneously. You can watch them work in real time:

<p align="center">
  <img src="assets/tmux_ff15_live_session.png" alt="Comrades executing tasks in parallel - live view" width="800">
</p>

### 5. Results in dashboard

Open \`dashboard.md\` to see aggregated results, skill candidates, and blockers — all maintained by Noctis.

---

## Real-World Use Cases

This system manages **all white-collar tasks**, not just code. Projects can live anywhere on your filesystem.

\`\`\`yaml
# config/projects.yaml
projects:
  - id: client_x
    name: "Client X Consulting"
    path: "/mnt/c/Consulting/client_x"
    status: active
\`\`\`

**Research sprints** — 3 Comrades research different topics in parallel, results compiled in minutes.

**Multi-project management** — Switch between client projects without losing context. Memory MCP preserves preferences across sessions.

**Document generation** — Technical writing, test case reviews, comparison tables — distributed across agents and merged.

---

## ✨ Key Features

### ⚡ 1. Parallel Execution

Generate up to 3 parallel tasks with a single command:

\`\`\`
You: "Research 3 MCP servers"
→ 3 Comrades start research simultaneously
→ Results in minutes, not hours
\`\`\`

### 🔄 2. Non-Blocking Workflow

Noctis delegates instantly and returns control to you:

\`\`\`
You: Command → Noctis: Delegate → You: Can give next command immediately
                                     ↓
                     Workers: Execute in background
                                     ↓
                     Dashboard: Shows results
\`\`\`

No need to wait for long tasks to complete.

### 🧠 3. Cross-Session Memory (Memory MCP)

AI remembers your preferences:

\`\`\`
Session 1: Tell "I prefer simple approaches"
           → Saved to Memory MCP

Session 2: AI loads memory at startup
           → No longer suggests complex approaches
\`\`\`

### 📡 4. Event-Driven (No Polling)

Agents communicate via YAML files and wake each other with tmux send-keys.
**No wasted API calls in polling loops.**

### 📸 5. Screenshot Integration

VSCode extension AI coding tools can paste screenshots to explain situations. This CLI system achieves the same:

\`\`\`
# Set screenshot folder in config/settings.yaml
screenshot:
  path: "/mnt/c/Users/YourName/Pictures/Screenshots"

# Just tell Noctis:
You: "Check the latest screenshot"
You: "Check 2 screenshots"
→ AI immediately reads and analyzes screenshots
\`\`\`

**💡 Windows tip:** Press \`Win + Shift + S\` to take screenshots. Match the save location to the path in \`settings.yaml\` for seamless integration.

Useful when:
- Visually explaining UI bugs
- Showing error messages
- Comparing before/after states

### 📁 6. Context Management

Four-layer context structure for efficient knowledge sharing:

| Layer | Location | Purpose |
|-------|----------|---------|
| Layer 1: Memory MCP | \`memory/noctis_memory.jsonl\` | Cross-project, cross-session long-term memory |
| Layer 2: Project | \`config/projects.yaml\`, \`projects/<id>.yaml\`, \`context/{project}.md\` | Project-specific information & technical knowledge |
| Layer 3: YAML Queue | \`queue/noctis_to_ignis.yaml\`, \`queue/tasks/\`, \`queue/reports/\` | Task management - instructions & reports (source of truth) |
| Layer 4: Session | AGENTS.md, instructions/*.md | Working context (resets with /new) |

#### /new Protocol (Cost Optimization)

Long work sessions cause context (Layer 4) to bloat, increasing API costs. Running \`/new\` clears session memory, resetting costs. Layers 1-3 remain as files and are not lost.

Comrades' recovery cost after \`/new\`: **~1,950 tokens** (39% of 5,000 target)

1. AGENTS.md (auto-loaded) → Recognize as ff15 system member
2. \`tmux display-message -t "$TMUX_PANE" -p '#{@agent_id}'\` → Confirm own ID
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

### 🧠 Model Configuration

| Agent | Normal Mode | Full Power Mode | Reason |
|-------|-------------|-----------------|--------|
| Noctis | Sonnet 4.5 | Opus 4.6 | Delegation and task management |
| Lunafreya | Grok Code Fast | Grok Code Fast | Independent advisor |
| Ignis | Haiku 4.5 | GPT-5.2 Codex | Cost-efficient |
| Gladiolus | Haiku 4.5 | Sonnet 4.5 | Cost-efficient |
| Prompto | Gemini 3 Flash | Gemini 3 Pro | Fast research |

#### Mode Configuration

| Mode | Comrades | Leaders (Noctis/Lunafreya) | Command |
|------|----------|----------------------------|---------|
| **Normal** (default) | Haiku 4.5 / Gemini 3 Flash | Sonnet 4.5 / Grok Fast | \`./standby.sh\` |
| **Full Power** | GPT-5.2 / Sonnet 4.5 / Gemini 3 Pro | Opus 4.6 / Grok Fast | \`./standby.sh --fullpower\` |
| **Lite** (budget) | Haiku / Grok Fast | Haiku 4.5 | \`./standby.sh --lite\` |

Normally run Comrades with lightweight models. Switch to premium models with \`--fullpower\` for critical tasks. Noctis can also temporarily switch individual Comrades to different models as needed.

---

## 🎯 Design Philosophy

### Why hierarchical structure (Noctis→Comrades)?

1. **Instant response**: Noctis delegates immediately and returns control to you
2. **Parallel execution**: Distribute to multiple Comrades simultaneously
3. **Single responsibility**: Each role is clearly separated, no confusion
4. **Scalability**: Structure remains intact even when adding Comrades
5. **Fault isolation**: One Comrade's failure doesn't affect others
6. **Centralized reporting**: Only Noctis interacts with humans, keeping information organized
7. **Independent advisor**: Lunafreya operates independently and can command Noctis

### Why YAML + send-keys?

1. **State persistence**: Structured communication via YAML files survives agent restarts
2. **No polling needed**: Event-driven approach reduces API costs
3. **Interrupt prevention**: Prevents interruptions between agents or to your input
4. **Easy debugging**: Humans can directly read YAML to understand status
5. **Conflict avoidance**: Each Comrade has dedicated files
6. **2-second interval transmission**: Inserting \`sleep 2\` between consecutive sends to multiple Comrades prevents input buffer overflow (arrival rate improved from 14% to 87.5%)

### Agent Identification (@agent_id)

Each pane has a \`@agent_id\` tmux user option set (e.g., \`ignis\`, \`gladiolus\`). \`pane_index\` shifts with pane rearrangement, but \`@agent_id\` is fixed by \`standby.sh\` at startup and doesn't change.

Agent self-identification:
\`\`\`bash
tmux display-message -t "$TMUX_PANE" -p '#{@agent_id}'
\`\`\`
\`-t "$TMUX_PANE"\` is mandatory. Omitting it returns the active pane's value, causing misidentification.

Model names are also saved as \`@model_name\` and always displayed via \`pane-border-format\`. Even if OpenCode overwrites the pane title, the model name remains visible.

### Why only Noctis updates dashboard.md?

1. **Single updater**: Limit update responsibility to one person to prevent conflicts
2. **Information aggregation**: Noctis receives reports from all Comrades and grasps the full picture
3. **Consistency**: All updates pass through one quality gate
4. **Interrupt prevention**: If Comrades updated, they could interrupt King during input

---

## 🛠️ Skills

Initially, there are no skills.
During operation, approve candidates from the "Skill Candidates" section in the dashboard (dashboard.md) to add them.

Skills can be invoked with \`/skillname\`. Just tell Noctis "Execute /skillname".

### Skill Philosophy

**1. Skills are not committed**

Skills under \`.opencode/skills/\` are not committed to the repository by design. Reasons:
- Each user's work and workflow are different
- Rather than imposing generic skills, let users grow skills they need

**2. Skill acquisition process**

\`\`\`
Comrade discovers pattern during work
    ↓
Appears in "Skill Candidates" in dashboard.md
    ↓
King (you) reviews content
    ↓
If approved, command Noctis to create skill
\`\`\`

Skills are user-driven growth. Automatic growth leads to unmanageable proliferation, so keep only what you judge as "useful".

---

## 🔌 MCP Setup Guide

MCP (Model Context Protocol) servers extend OpenCode functionality. Setup method:

### What is MCP?

MCP servers provide OpenCode with access to external tools:
- **Memory MCP** → Retain memory across sessions
- **Playwright MCP** → Browser automation, screenshots, web scraping

### Installing MCP Servers

OpenCode manages MCP servers via config file. Add to \`~/.config/opencode/opencode.json\`:

\`\`\`json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "memory": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-memory"],
      "environment": {
        "MEMORY_FILE_PATH": "$PWD/memory/noctis_memory.jsonl"
      },
      "enabled": true
    },
    "playwright": {
      "type": "local",
      "command": ["npx", "@playwright/mcp@latest"],
      "enabled": true
    }
  }
}
\`\`\`

### Verify Installation

```bash
opencode mcp list
```

Check MCP server status.

---

## 🔌 Plugin System

### Dashboard Update Reminder

The system includes an automated dashboard update reminder plugin that helps Noctis stay on top of status updates.

#### How It Works

The plugin uses a **hybrid notification system**:

1. **YAML Queue** (`queue/plugin_notifications.yaml`)
   - All notifications are written here
   - Noctis checks this file when starting or receiving reminders
   - Low-priority reminders (e.g., session idle)

2. **Direct tmux Notification** (via send-keys)
   - High-priority alerts sent directly to Noctis pane
   - Immediate visibility for critical events
   - Used for: todo completion, new Comrade reports

#### Triggers

| Event | Priority | Notification Method |
|-------|----------|---------------------|
| Session idle | Low | YAML only |
| Todo completion | High | YAML + tmux send-keys |
| Comrade reports | High | YAML + tmux send-keys |

#### Noctis Workflow

When Noctis receives a reminder or starts a session:

1. Check `queue/plugin_notifications.yaml`
2. Process pending notifications
3. Update `dashboard.md` accordingly
4. Clear processed notifications

#### Creating Custom Plugins

Plugins are stored in `.opencode/plugins/` and automatically loaded by OpenCode. See `.opencode/plugins/README.md` for detailed documentation on creating custom hooks.

---

## 🌍 Practical Examples

### Example 1: Research Task

\`\`\`
You: "Research the top 3 AI coding assistants and compare"

Executed process:
1. Noctis assigns to each Comrade:
   - Ignis: Research GitHub Copilot
   - Gladiolus: Research Cursor
   - Prompto: Research OpenCode
2. All 3 research simultaneously
3. Results aggregated in dashboard.md
\`\`\`

### Example 2: PoC Preparation

\`\`\`
You: "Prepare PoC for project on this Notion page: [URL]"

Executed process:
1. Noctis fetches Notion content via MCP and assigns to each Comrade:
2. Ignis: List items to verify
3. Gladiolus: Research technical feasibility
4. Prompto: Create PoC plan document
5. All results aggregated in dashboard.md, ready for meeting
\`\`\`

---

## ⚙️ Configuration

### Language Settings

Edit \`config/settings.yaml\`:

\`\`\`yaml
language: ja   # Japanese only
language: en   # Japanese + English translation
\`\`\`

---

## 🛠️ Advanced Users

<details>
<summary><b>Script Architecture</b> (click to expand)</summary>

\`\`\`
┌─────────────────────────────────────────────────────────────────────┐
│                   Initial Setup (run once)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  install.bat (Windows)                                              │
│      │                                                              │
│      ├── Check/guide WSL2 installation                              │
│      └── Check/guide Ubuntu installation                            │
│                                                                     │
│  first_setup.sh (run manually in Ubuntu/WSL)                        │
│      │                                                              │
│      ├── Check/install tmux                                         │
│      ├── Check/install Node.js v20+ (via nvm)                       │
│      ├── Check/install OpenCode CLI                                 │
│      │       ※ Suggests migration to native version if npm detected │
│      └── Setup Memory MCP server                                    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                      Daily Startup (run daily)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  standby.sh                                                          │
│      │                                                              │
│      ├──▶ Create tmux sessions                                      │
│      │         • "noctis" session (1 pane)                          │
│      │         • "kingsglaive" session (5 panes, Ignis top + Comrades 2x2) │
│      │                                                              │
│      ├──▶ Reset queue files and dashboard                           │
│      │                                                              │
│      └──▶ Start OpenCode on all agents                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
\`\`\`

</details>

<details>
<summary><b>standby.sh Options</b> (click to expand)</summary>

\`\`\`bash
# Default: Full startup (tmux session + OpenCode startup)
./standby.sh

# Session setup only (no OpenCode startup)
./standby.sh -s
./standby.sh --setup-only

# Clear task queues (preserve command history)
./standby.sh -c
./standby.sh --clean

# Full Power: Start all Comrades with Opus (max capability, high cost)
./standby.sh --fullpower

# Full startup + open Windows Terminal tabs
./standby.sh -t
./standby.sh --terminal

# Show help
./standby.sh -h
./standby.sh --help
\`\`\`

</details>

<details>
<summary><b>Common Workflows</b> (click to expand)</summary>

**Normal daily use:**
\`\`\`bash
./standby.sh                      # Start everything
ffa                               # Connect and give commands
\`\`\`

**Debug mode (manual control):**
\`\`\`bash
./standby.sh -s       # Create session only

# Manually start OpenCode on specific agents
tmux send-keys -t ff15:0 'opencode' Enter
tmux send-keys -t ff15:2 'opencode' Enter
\`\`\`

**Restart after crash:**
\`\`\`bash
# Kill existing session
tmux kill-session -t ff15

# Start fresh
./standby.sh
\`\`\`

</details>

<details>
<summary><b>Convenient Aliases</b> (click to expand)</summary>

Running \`first_setup.sh\` automatically adds these aliases to \`~/.bashrc\` (or \`~/.zshrc\`):

\`\`\`bash
alias ffa='tmux attach-session -t ff15'  # Connect to ff15 session
\`\`\`

※ To apply aliases, run \`source ~/.bashrc\` or run \`wsl --shutdown\` in PowerShell and reopen terminal.

</details>

---

## 📁 File Structure

<details>
<summary><b>Click to expand file structure</b></summary>

\`\`\`
multi-agent-ff15/
│
│  ┌─────────────────── Setup Scripts ───────────────────┐
├── install.bat               # Windows: Initial setup
├── first_setup.sh            # Ubuntu/Mac: Initial setup
├── standby.sh    # Daily startup (auto-load instructions)
│  └────────────────────────────────────────────────────────────┘
│
├── instructions/             # Agent instructions
│   ├── noctis.md             # Noctis instructions
│   ├── lunafreya.md          # Lunafreya instructions
│   ├── ignis.md              # Ignis instructions
│   ├── gladiolus.md          # Gladiolus instructions
│   └── prompto.md            # Prompto instructions
│
├── config/
│   └── settings.yaml         # Language and other settings
│
├── projects/                # Project details (git-ignored, contains confidential info)
│   └── <project_id>.yaml   # All information for each project (client, tasks, Notion integration, etc.)
│
├── queue/                    # Communication files
│   ├── lunafreya_to_noctis.yaml  # Lunafreya → Noctis coordination
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
\`\`\`

</details>

---

## 📂 Project Management

This system manages and executes not only its own development but **all white-collar work**. Project folders can be outside this repository.

### Mechanism

\`\`\`
config/projects.yaml          # Project list (ID, name, path, status only)
projects/<project_id>.yaml    # Detailed information for each project
\`\`\`

- **\`config/projects.yaml\`**: List of what projects exist (summary only)
- **\`projects/<id>.yaml\`**: All details for that project (client info, contracts, tasks, related files, Notion pages, etc.)
- **Actual project files** (source code, design docs, etc.) are placed in external folder specified by \`path\`
- **\`projects/\` is git-ignored** (contains client confidential information)

### Example

\`\`\`yaml
# config/projects.yaml
projects:
  - id: my_client
    name: "Client X Consulting"
    path: "/mnt/c/Consulting/client_x"
    status: active

# projects/my_client.yaml
id: my_client
client:
  name: "Client X"
  company: "X Corporation"
contract:
  fee: "Monthly"
current_tasks:
  - id: task_001
    name: "System Architecture Review"
    status: in_progress
\`\`\`

This separation design allows the Noctis system to command multiple external projects while keeping project details outside version control.

---

## 🔧 Troubleshooting



<details>
<summary><b>MCP tools not working?</b></summary>

MCP tools are "lazy-loaded" and must be loaded first:

\`\`\`
# Wrong - tool not loaded
mcp__memory__read_graph()  ← Error!

# Correct - load first
ToolSearch("select:mcp__memory__read_graph")
mcp__memory__read_graph()  ← Works!
\`\`\`

</details>

<details>
<summary><b>Agent requesting permissions?</b></summary>

Confirm you're starting with \`--dangerously-skip-permissions\`:

\`\`\`bash
opencode
\`\`\`

</details>

<details>
<summary><b>Worker stuck?</b></summary>

Check worker pane:
\`\`\`bash
tmux attach-session -t kingsglaive
# Ctrl+B then numbers to switch panes
\`\`\`

</details>

<details>
<summary><b>Noctis or agent crashed? (OpenCode process killed)</b></summary>

**Do NOT use the \`ffa\` alias to restart.** This alias is for attaching to tmux sessions. Running it inside an existing tmux pane causes session nesting, breaking input and making the pane unusable.

**Correct restart methods:**

\`\`\`bash
# Method 1: Execute opencode directly in pane
opencode

# Method 2: Force restart with respawn-pane (also resolves nesting)
tmux respawn-pane -t ff15:0 -k 'opencode'
\`\`\`

**If you accidentally nested tmux:**
1. Press \`Ctrl+B\` then \`d\` to detach (exit inner session)
2. Then run \`opencode\` directly (don't use \`ffa\`)
3. If detach doesn't work, force reset from another pane with \`tmux respawn-pane -k\`

</details>

---

## 📚 tmux Quick Reference

| Command | Description |
|---------|-------------|
| \`ffa\` (alias) | Connect to ff15 session |
| \`tmux attach -t ff15\` | Connect to ff15 session (full command) |
| \`Ctrl+B\` then \`0-4\` | Switch between panes |
| \`Ctrl+B\` then \`d\` | Detach (keeps running) |
| \`tmux kill-session -t ff15\` | Stop ff15 session |

### 🖱️ Mouse Operations

\`first_setup.sh\` automatically sets \`set -g mouse on\` in \`~/.tmux.conf\`, enabling intuitive mouse operations:

| Operation | Description |
|-----------|-------------|
| Mouse wheel | Scroll within pane (check output history) |
| Click pane | Switch focus between panes |
| Drag pane border | Resize panes |

Even if unfamiliar with keyboard operations, you can switch panes, scroll, and resize using only the mouse.

---

## Contributing

Issues and pull requests are welcome.

- **Bug reports**: Create issue with reproduction steps
- **Feature ideas**: Propose in Discussion first
- **Skills**: Skills are personal by design and not included in this repo

---

## 🙏 Credits

This project is based on [multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun) by [@yohey-w](https://github.com/yohey-w). We deeply appreciate the original work and the foundation it provided for this FF15-inspired multi-agent system.

Key inspirations:
- Multi-agent orchestration patterns and the OpenCode ecosystem
- Event-driven communication architecture
- Bottom-up skill discovery system

---

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

---

<div align="center">

**Command your AI army. Build faster.**

</div>
