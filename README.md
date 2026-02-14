<div align="center">

# multi-agent-ff15

**OpenCode Multi-Agent Command System**

*5 AI agents running in parallel with a single command*

[![GitHub Stars](https://img.shields.io/github/stars/atman-33/multi-agent-ff15?style=social)](https://github.com/atman-33/multi-agent-ff15)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![OpenCode](https://img.shields.io/badge/Built_for-OpenCode-blue)](https://opencode.ai)
[![Shell](https://img.shields.io/badge/Shell%2FBash-Core-green)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-Plugins-blue)]()

[English](README.md) | [日本語](README_ja.md)

</div>

<p align="center">
  <img src="assets/tmux_ff15_live_session.png" alt="multi-agent-ff15: 5 agents running in parallel - real session" width="800">
</p>

<p align="center"><i>Noctis (King) commanding 3 Comrades (Ignis, Gladiolus, Prompto) with Lunafreya (Oracle) operating independently - actual session screenshot</i></p>

---

With a single command, **Noctis** (King) directly assigns tasks to **3 Comrades** (Ignis, Gladiolus, Prompto) who execute in parallel. Meanwhile, **Lunafreya** (Oracle) operates independently, consulting directly with you and commanding Noctis when needed. All agents run as independent OpenCode processes in tmux. Communication flows through YAML files and tmux `send-keys`, meaning **zero API calls for agent coordination**.

> **Framework**: Built on [OpenCode](https://opencode.ai)

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

**Bottom-up skill discovery** — As Comrades execute tasks, they automatically identify reusable patterns and propose them as skill candidates. You decide what gets promoted to a permanent skill.

---

## 🚀 Quick Start

### 🪟 Windows Users (Most Common)

<table>
<tr>
<td width="60">

**Step 1**

</td>
<td>

📥 **Download the repository**

[Download ZIP](https://github.com/atman-33/multi-agent-ff15/archive/refs/heads/main.zip) and extract to `C:\tools\multi-agent-ff15`

*Or use git:* `git clone https://github.com/atman-33/multi-agent-ff15.git C:\tools\multi-agent-ff15`

</td>
</tr>
<tr>
<td>

**Step 2**

</td>
<td>

🖱️ **Run `install.bat`**

Right-click → "Run as administrator" (if WSL2 is not installed). Sets up WSL2 + Ubuntu.

</td>
</tr>
<tr>
<td>

**Step 3**

</td>
<td>

🐧 **Open Ubuntu and run the following** (first time only)

```bash
cd /mnt/c/tools/multi-agent-ff15
./first_setup.sh
```

</td>
</tr>
<tr>
<td>

**Step 4**

</td>
<td>

✅ **Stand by Me!**

```bash
./standby.sh
```

</td>
</tr>
</table>

#### 🔑 First time only: Authentication

After `first_setup.sh` completes, run the following once to authenticate:

```bash
# 1. Apply PATH changes
source ~/.bashrc

# 2. Start OpenCode
opencode
#    → Select your preferred AI model provider
#    → Follow authentication prompts
#    → Type /exit to quit
```

Authentication is saved to `~/.opencode/` and won't be needed again.

#### 📅 Daily startup (after initial setup)

Open **Ubuntu terminal** (WSL) and run:

```bash
cd /mnt/c/tools/multi-agent-ff15
./standby.sh
```

---

<details>
<summary>🐧 <b>Linux / Mac Users</b> (click to expand)</summary>

### Initial Setup

```bash
# 1. Clone the repository
git clone https://github.com/atman-33/multi-agent-ff15.git ~/multi-agent-ff15
cd ~/multi-agent-ff15

# 2. Grant execution permission to scripts
chmod +x *.sh

# 3. Run initial setup
./first_setup.sh
```

### Daily startup

```bash
cd ~/multi-agent-ff15
./standby.sh
```

</details>

---

<details>
<summary>❓ <b>What is WSL2? Why is it needed?</b> (click to expand)</summary>

### About WSL2

**WSL2 (Windows Subsystem for Linux)** is a feature that allows you to run Linux inside Windows. This system uses `tmux` (a Linux tool) to manage multiple AI agents, so WSL2 is required on Windows.

### If you don't have WSL2 yet

No problem! Running `install.bat` will:
1. Check if WSL2 is installed (auto-install if not)
2. Check if Ubuntu is installed (auto-install if not)
3. Guide you to the next step (how to run `first_setup.sh`)

**Quick install command** (run PowerShell as administrator):
```powershell
wsl --install
```

Then restart your computer and run `install.bat` again.

</details>

---

### ✅ State after setup

**6 AI agents** will auto-start:

| Agent | Role | Count |
|-------|------|-------|
| 👑 Noctis | King - receives your commands and manages tasks | 1 |
| 🌙 Lunafreya | Oracle - operates independently & commands Noctis | 1 |
| ⚔️ Comrades (Ignis, Gladiolus, Prompto) | Workers - execute tasks in parallel | 3 |
| 🌸 Iris | Guardian - monitors dashboard & notifies Noctis | 1 |

tmux session: `ff15` - unified session (6 panes)

---

## 📖 Basic Usage

### Step 1: Connect to ff15 session

After running `standby.sh`, all agents automatically load their instructions and are ready to work.

Open a new terminal and connect to the ff15 session:

```bash
ffa    # Alias (tmux attach-session -t ff15)
```

### Step 2: Give your first command

Noctis is already initialized! Just give a command:

```
Research the top 5 JavaScript frameworks and create a comparison table
```

Noctis will:
1. Write tasks to YAML files
2. Notify Ignis (manager)
3. Return control to you immediately (no waiting!)

Meanwhile, Ignis distributes tasks to Comrades and executes in parallel.

### Step 3: Check progress

Open `dashboard.md` in your editor to see real-time status:

```markdown
## In Progress
| Worker | Task | Status |
|--------|------|--------|
| Gladiolus | React research | Running |
| Prompto | Vue research | Running |
| Lunafreya | Angular research | Complete |
```

---

## ✨ Key Features

### ⚡ Parallel Execution

Generate up to 3 parallel tasks with a single command — results in minutes, not hours.

### 🔄 Non-Blocking Workflow

Noctis delegates instantly and returns control to you. No need to wait for long tasks to complete.

### 🧠 Cross-Session Memory (Memory MCP)

AI remembers your preferences across sessions. Tell it once, it remembers forever.

### 📡 Event-Driven (No Polling)

Agents communicate via YAML files and wake each other with tmux send-keys. No wasted API calls in polling loops.

### 📸 Screenshot Integration

Set screenshot folder in `config/settings.yaml` and tell Noctis "Check the latest screenshot" — AI immediately reads and analyzes it.

### 🛠️ Bottom-Up Skill Discovery

Comrades automatically identify reusable patterns and propose them as skill candidates. You approve what gets promoted to permanent skills.

---

## 🌍 Practical Examples

### Example 1: Research Task

```
You: "Research the top 3 AI coding assistants and compare"

Executed process:
1. Noctis assigns to each Comrade:
   - Ignis: Research GitHub Copilot
   - Gladiolus: Research Cursor
   - Prompto: Research OpenCode
2. All 3 research simultaneously
3. Results aggregated in dashboard.md
```

### Example 2: PoC Preparation

```
You: "Prepare PoC for project on this Notion page: [URL]"

Executed process:
1. Noctis fetches Notion content via MCP and assigns to each Comrade
2. Ignis: List items to verify
3. Gladiolus: Research technical feasibility
4. Prompto: Create PoC plan document
5. All results aggregated in dashboard.md, ready for meeting
```

---

## 📚 Documentation

For detailed information, see the [docs](docs/) folder:

- **[Architecture](docs/architecture.md)** - System design and communication protocol
- **[Philosophy](docs/philosophy.md)** - Core principles and design decisions
- **[Advanced Usage](docs/advanced-usage.md)** - Script options, workflows, and customization
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues and solutions
- **[Mobile Access](docs/mobile-access.md)** - Command from your phone
- **[MCP Setup](docs/mcp-setup.md)** - Model Context Protocol configuration
- **[Project Management](docs/project-management.md)** - Managing multiple projects

---

## ⚙️ Configuration

### Language Settings

Edit `config/settings.yaml`:

```yaml
language: ja   # Japanese only
language: en   # Japanese + English translation
```

### Party Formations

```bash
./standby.sh                # Normal formation (default)
./standby.sh --fullpower    # Full Power formation (premium models)
./standby.sh --lite         # Lite formation (budget mode)
```

---

## 📚 tmux Quick Reference

| Command | Description |
|---------|-------------|
| `ffa` (alias) | Connect to ff15 session |
| `Ctrl+B` then `0-5` | Switch between panes |
| `Ctrl+B` then `d` | Detach (keeps running) |
| `tmux kill-session -t ff15` | Stop ff15 session |

Mouse operations enabled by default: scroll, click to switch panes, drag borders to resize.

---

## Contributing

Issues and pull requests are welcome.

- **Bug reports**: Create issue with reproduction steps
- **Feature ideas**: Propose in Discussion first
- **Skills**: Skills are personal by design and not included in this repo

---

## 🙏 Credits

This project is based on [multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun) by [@yohey-w](https://github.com/yohey-w). We deeply appreciate the original work and the foundation it provided for this FF15-inspired multi-agent system.

---

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

---

<div align="center">

**Command your AI army. Build faster.**

</div>
