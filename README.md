<div align="center">

# multi-agent-shogun

**Command your AI army like a feudal warlord.**

Run 8 OpenCode agents in parallel — orchestrated through a samurai-inspired hierarchy with zero coordination overhead.

[![GitHub Stars](https://img.shields.io/github/stars/yohey-w/multi-agent-shogun?style=social)](https://github.com/yohey-w/multi-agent-shogun)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![OpenCode](https://img.shields.io/badge/Built_for-OpenCode-blue)](https://opencode.ai)
[![OhMyOpenCode](https://img.shields.io/badge/Powered_by-OhMyOpenCode-purple)](https://ohmyopencode.com)
[![Shell](https://img.shields.io/badge/Shell%2FBash-100%25-green)]()

[English](README.md) | [日本語](README_ja.md)

</div>

<p align="center">
  <img src="assets/screenshots/tmux_multiagent_9panes.png" alt="multi-agent-shogun: 9 panes running in parallel" width="800">
</p>

<p align="center"><i>One Karo (manager) coordinating 8 Ashigaru (workers) — real session, no mock data.</i></p>

---

Give a single command. The **Shogun** (general) delegates to the **Karo** (steward), who distributes work across up to **8 Ashigaru** (foot soldiers) — all running as independent OpenCode processes in tmux. Communication flows through YAML files and tmux `send-keys`, meaning **zero extra API calls** for agent coordination.



<!-- TODO: add demo.gif — record with asciinema or vhs -->

## Philosophy

> "Don't execute tasks mindlessly. Always keep 'fastest × best output' in mind."

The Shogun System is built on five core principles:

| Principle | Description |
|-----------|-------------|
| **Autonomous Formation** | Design task formations based on complexity, not templates |
| **Parallelization** | Use subagents to prevent single-point bottlenecks |
| **Research First** | Search for evidence before making decisions |
| **Continuous Learning** | Don't rely solely on model knowledge cutoffs |
| **Triangulation** | Multi-perspective research with integrated authorization |

These principles are documented in detail: **[docs/philosophy.md](docs/philosophy.md)**

---

## Why Shogun?

Most multi-agent frameworks burn API tokens on coordination. Shogun doesn't.

| | OpenCode | LangGraph | CrewAI | **multi-agent-shogun** |
|---|---|---|---|---|
| **Architecture** | Agents with tools | Graph-based state machine | Role-based agents | Feudal hierarchy via tmux |
| **Parallelism** | Limited | Parallel nodes (v0.2+) | Limited | **8 independent agents** |
| **Coordination cost** | API calls | API + infra (Postgres/Redis) | API + CrewAI platform | **Zero** (YAML + tmux) |
| **Observability** | Logs only | LangSmith integration | OpenTelemetry | **Live tmux panes** + dashboard |
| **Skill discovery** | None | None | None | **Bottom-up auto-proposal** |
| **Setup** | CLI install | Heavy (infra required) | pip install | Shell scripts |

### What makes this different

**Zero coordination overhead** — Agents talk through YAML files on disk. The only API calls are for actual work, not orchestration. Run 8 agents and pay only for 8 agents' work.

**Full transparency** — Every agent runs in a visible tmux pane. Every instruction, report, and decision is a plain YAML file you can read, diff, and version-control. No black boxes.

**Battle-tested hierarchy** — The Shogun → Karo → Ashigaru chain of command prevents conflicts by design: clear ownership, dedicated files per agent, event-driven communication, no polling.

---

## Bottom-Up Skill Discovery

This is the feature no other framework has.

As Ashigaru execute tasks, they **automatically identify reusable patterns** and propose them as skill candidates. The Karo aggregates these proposals in `dashboard.md`, and you — the Lord — decide what gets promoted to a permanent skill.

```
Ashigaru finishes a task
    ↓
Notices: "I've done this pattern 3 times across different projects"
    ↓
Reports in YAML:  skill_candidate:
                     found: true
                     name: "api-endpoint-scaffold"
                     reason: "Same REST scaffold pattern used in 3 projects"
    ↓
Appears in dashboard.md → You approve → Skill created in .opencode/skills/
    ↓
Any agent can now invoke /api-endpoint-scaffold
```

Skills grow organically from real work — not from a predefined template library. Your skill set becomes a reflection of **your** workflow.

> **Framework**: Built on [OpenCode](https://opencode.ai) with [Oh My OpenCode](https://ohmyopencode.com) orchestration layer.

---

## Architecture

```
        You (上様 / The Lord)
             │
             ▼  Give orders
      ┌─────────────┐
      │   SHOGUN    │  Receives your command, plans strategy
      │    (将軍)    │  Session: shogun
      └──────┬──────┘
             │  YAML + send-keys
      ┌──────▼──────┐
      │    KARO     │  Breaks tasks down, assigns to workers
      │    (家老)    │  Session: multiagent, pane 0
      └──────┬──────┘
             │  YAML + send-keys
    ┌─┬─┬─┬─┴─┬─┬─┬─┐
    │1│2│3│4│5│6│7│8│  Execute in parallel
    └─┴─┴─┴─┴─┴─┴─┴─┘
         ASHIGARU (足軽)
         Panes 1-8
```

**Communication protocol:**
- **Downward** (orders): Write YAML → wake target with `tmux send-keys`
- **Upward** (reports): Write YAML only (no send-keys to avoid interrupting your input)
- **Polling**: Forbidden. Event-driven only. Your API bill stays predictable.

**Context persistence (4 layers):**

| Layer | What | Survives |
|-------|------|----------|
| Memory MCP | Preferences, rules, cross-project knowledge | Everything |
| Project files | `config/projects.yaml`, `context/*.md` | Everything |
| YAML Queue | Tasks, reports (source of truth) | Everything |
| Session | `AGENTS.md`, instructions | `/clear` wipes it |

After `/clear`, an agent recovers in **~2,000 tokens** by reading Memory MCP + its task YAML. No expensive re-prompting.

---

## Battle Formations

Agents can be deployed in different **formations** (陣形 / *jindate*) depending on the task:

| Formation | Ashigaru 1–4 | Ashigaru 5–8 | Best for |
|-----------|-------------|-------------|----------|
| **Normal** (default) | Sonnet | Opus | Everyday tasks — cost-efficient |
| **Battle** (`-k` flag) | Opus | Opus | Critical tasks — maximum capability |

```bash
./shutsujin_departure.sh          # Normal formation
./shutsujin_departure.sh -k       # Battle formation (all Opus)
```

The Karo can also promote individual Ashigaru mid-session with `/model opus` when a specific task demands it.

---

## Quick Start

### Windows (WSL2)

```bash
# 1. Clone
git clone https://github.com/yohey-w/multi-agent-shogun.git C:\tools\multi-agent-shogun

# 2. Run installer (right-click → Run as Administrator)
#    → install.bat handles WSL2 + Ubuntu setup automatically

# 3. In Ubuntu terminal:
cd /mnt/c/tools/multi-agent-shogun
./first_setup.sh          # One-time: installs tmux, dependencies, OpenCode CLI
./shutsujin_departure.sh  # Deploy your army
```

### Linux / macOS

```bash
# 1. Clone
git clone https://github.com/yohey-w/multi-agent-shogun.git ~/multi-agent-shogun
cd ~/multi-agent-shogun && chmod +x *.sh

# 2. Setup + Deploy
./first_setup.sh          # One-time: installs dependencies
./shutsujin_departure.sh  # Deploy your army
```

### First-time only: Authentication

After `first_setup.sh`, run these commands once to authenticate:

```bash
# 1. Apply PATH changes
source ~/.bashrc

# 2. Start OpenCode
opencode
#    → Select your preferred AI model provider
#    → Follow authentication prompts
#    → Type /exit to quit
```

This saves credentials to `~/.opencode/` — you won't need to do it again.

### Daily startup

```bash
cd /path/to/multi-agent-shogun
./shutsujin_departure.sh           # Normal startup (resumes existing tasks)
./shutsujin_departure.sh -c        # Clean startup (resets task queues, preserves command history)
tmux attach-session -t shogun      # Connect and give orders
```

**Startup options:**
- **Default**: Resumes with existing task queues and command history intact
- **`-c` / `--clean`**: Resets task queues for a fresh start while preserving command history in `queue/shogun_to_karo.yaml`. Previously assigned tasks are backed up before reset.

<details>
<summary><b>Convenient aliases</b> (added by first_setup.sh)</summary>

```bash
alias csst='cd /mnt/c/tools/multi-agent-shogun && ./shutsujin_departure.sh'
alias css='tmux attach-session -t shogun'
alias csm='tmux attach-session -t multiagent'
```

</details>

### 📱 Mobile Access (Command from anywhere)

Control your AI army from your phone — bed, café, or bathroom.

**Requirements:**
- [Tailscale](https://tailscale.com/) (free) — creates a secure tunnel to your WSL
- [Termux](https://termux.dev/) (free) — terminal app for Android
- SSH — already installed

**Setup:**

1. Install Tailscale on both WSL and your phone
2. In WSL (auth key method — browser not needed):
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscaled &
   sudo tailscale up --authkey tskey-auth-XXXXXXXXXXXX
   sudo service ssh start
   ```
3. In Termux on your phone:
   ```sh
   pkg update && pkg install openssh
   ssh youruser@your-tailscale-ip
   css    # Connect to Shogun
   ```
4. Open a new Termux window (+ button) for workers:
   ```sh
   ssh youruser@your-tailscale-ip
   csm    # See all 9 panes
   ```

**Disconnect:** Just swipe the Termux window closed. tmux sessions survive — agents keep working.

**Voice input:** Use your phone's voice keyboard to speak commands. The Shogun understands natural language, so typos from speech-to-text don't matter.

---

## How It Works

### 1. Give an order

```
You: "Research the top 5 MCP servers and create a comparison table"
```

### 2. Shogun delegates instantly

The Shogun writes the task to `queue/shogun_to_karo.yaml` and wakes the Karo. Control returns to you immediately — no waiting.

### 3. Karo distributes

The Karo breaks the task into subtasks and assigns each to an Ashigaru:

| Worker | Assignment |
|--------|-----------|
| Ashigaru 1 | Research Notion MCP |
| Ashigaru 2 | Research GitHub MCP |
| Ashigaru 3 | Research Playwright MCP |
| Ashigaru 4 | Research Memory MCP |
| Ashigaru 5 | Research Sequential Thinking MCP |

### 4. Parallel execution

All 5 Ashigaru research simultaneously. You can watch them work in real time:

<p align="center">
  <img src="assets/screenshots/tmux_multiagent_working.png" alt="Ashigaru agents working in parallel" width="700">
</p>

### 5. Results in dashboard

Open `dashboard.md` to see aggregated results, skill candidates, and blockers — all maintained by the Karo.

---

## Real-World Use Cases

This system manages **all white-collar tasks**, not just code. Projects can live anywhere on your filesystem.

```yaml
# config/projects.yaml
projects:
  - id: client_x
    name: "Client X Consulting"
    path: "/mnt/c/Consulting/client_x"
    status: active
```

**Research sprints** — 8 agents research different topics in parallel, results compiled in minutes.

**Multi-project management** — Switch between client projects without losing context. Memory MCP preserves preferences across sessions.

**Document generation** — Technical writing, test case reviews, comparison tables — distributed across agents and merged.

---

## Configuration

### Language

```yaml
# config/settings.yaml
language: ja   # Samurai Japanese only
language: en   # Samurai Japanese + English translation
```

### Model assignment

| Agent | Default Model | Thinking |
|-------|--------------|----------|
| Shogun | Opus | Disabled (delegation doesn't need deep reasoning) |
| Karo | Opus | Enabled |
| Ashigaru 1–4 | Sonnet | Enabled |
| Ashigaru 5–8 | Opus | Enabled |

### MCP servers

OpenCode uses a config file to manage MCP servers. Add servers to your `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "memory": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-memory"],
      "environment": {
        "MEMORY_FILE_PATH": "$PWD/memory/shogun_memory.jsonl"
      },
      "enabled": true
    },
    "github": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
      "environment": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your_pat_here"
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
```

To check MCP server status:
```bash
opencode mcp list
```

### Screenshot integration

```yaml
# config/settings.yaml
screenshot:
  path: "/mnt/c/Users/YourName/Pictures/Screenshots"
```

Tell the Shogun "check the latest screenshot" and it reads your screen captures for visual context. (`Win+Shift+S` on Windows.)

---

## File Structure

```
multi-agent-shogun/
├── install.bat                # Windows first-time setup
├── first_setup.sh             # Linux/Mac first-time setup
├── shutsujin_departure.sh     # Daily deployment script
│
├── instructions/              # Agent behavior definitions
│   ├── shogun.md
│   ├── karo.md
│   └── ashigaru.md
│
├── config/
│   ├── settings.yaml          # Language, model, screenshot settings
│   └── projects.yaml          # Project registry
│
├── queue/                     # Communication (source of truth)
│   ├── shogun_to_karo.yaml
│   ├── tasks/ashigaru{1-8}.yaml
│   └── reports/ashigaru{1-8}_report.yaml
│
├── memory/                    # Memory MCP persistent storage
├── dashboard.md               # Human-readable status board
└── AGENTS.md                  # OpenCode system instructions (auto-loaded)
```

---

## Troubleshooting





<details>
<summary><b>MCP tools not loading?</b></summary>

MCP tools are lazy-loaded. Search first, then use:
```
ToolSearch("select:mcp__memory__read_graph")
mcp__memory__read_graph()
```

</details>

<details>
<summary><b>Agent crashed?</b></summary>

Don't use `css`/`csm` aliases inside an existing tmux session (causes nesting). Instead:

```bash
# From the crashed pane:
opencode

# Or from another pane:
tmux respawn-pane -t shogun:0.0 -k 'opencode'
```

</details>

<details>
<summary><b>Workers stuck?</b></summary>

```bash
tmux attach-session -t multiagent
# Ctrl+B then 0-8 to switch panes
```

</details>

---

## tmux Quick Reference

| Command | Description |
|---------|-------------|
| `tmux attach -t shogun` | Connect to the Shogun |
| `tmux attach -t multiagent` | Connect to workers |
| `Ctrl+B` then `0`–`8` | Switch panes |
| `Ctrl+B` then `d` | Detach (agents keep running) |

Mouse support is enabled by default (`set -g mouse on` in `~/.tmux.conf`, configured by `first_setup.sh`). Scroll, click to focus, drag to resize.

---

## Contributing

Issues and pull requests are welcome.

- **Bug reports**: Open an issue with reproduction steps
- **Feature ideas**: Open a discussion first
- **Skills**: Skills are personal by design and not included in this repo

## Credits

Inspired by multi-agent AI development patterns and the OpenCode ecosystem.

## License

[MIT](LICENSE)

---

<div align="center">

**One command. Eight agents. Zero coordination cost.**

⭐ Star this repo if you find it useful — it helps others discover it.

</div>
