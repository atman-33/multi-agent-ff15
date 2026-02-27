# Project Management

This system manages and executes not only its own development but **all white-collar work**. Project folders can be outside this repository.

---

## Mechanism

```
config/current_projects.yaml    # Active project IDs (gitignored)
projects/<project_id>.yaml      # Per-project metadata: instruction files, paths, hashes (gitignored)
```

- **`config/current_projects.yaml`**: Which projects are currently active
- **`projects/<id>.yaml`**: Instruction file metadata for each registered project (AGENTS.md, CLAUDE.md, GEMINI.md paths + SHA256)
- **Actual project files** (source code, design docs, etc.) are placed in the external folder specified by `root_path`
- **`projects/` is git-ignored** (contains local path information)

---

## Example

### config/current_projects.yaml

```yaml
active_project_ids:
  - "client-x"
  - "internal-tool"
updated_at: "2026-02-22T12:00:00Z"
updated_by: "script"
```

### projects/client-x.yaml

```yaml
id: "client-x"
name: "Client X"
root_path: "/home/atman/repos/client-x"
instruction_files:
  - type: agents
    path: "/home/atman/repos/client-x/AGENTS.md"
    exists: true
    sha256: "abc123..."
    last_checked_at: "2026-02-22T12:00:00Z"
  - type: claude
    path: "/home/atman/repos/client-x/CLAUDE.md"
    exists: false
    sha256: ""
    last_checked_at: "2026-02-22T12:00:00Z"
updated_at: "2026-02-22T12:00:00Z"
```

---

## Real-World Use Cases

### Research sprints

3 Comrades research different topics in parallel, results compiled in minutes.

```
You: "Research top 3 solutions for [problem]"
→ Ignis: Solution A
→ Gladiolus: Solution B
→ Prompto: Solution C
→ Results viewable in desktop app worklog
```

### Multi-project management

Activate projects to automatically inject their instruction file references into every agent message.

```
You: "Switch to project client-x"
→ Noctis runs: scripts/projects_activate.sh set client-x
→ project-instruction-injection plugin injects AGENTS.md paths
→ All agents read project-specific rules on demand
```

### Document generation

Technical writing, test case reviews, comparison tables — distributed across agents and merged.

```
You: "Create technical documentation for [feature]"
→ Ignis: Architecture overview
→ Gladiolus: API documentation
→ Prompto: Usage examples
→ Merged and viewable in desktop app worklog
```

---

## Instruction File Reference System

External projects may contain instruction files (AGENTS.md, CLAUDE.md, GEMINI.md) that define project-specific rules. This system automatically detects, registers, and injects references to these files into agent context.

### Architecture

```
scripts/project_register.sh     # Register project + detect instruction files
scripts/projects_activate.sh    # Manage active project list
config/current_projects.yaml    # Currently active project IDs
projects/<id>.yaml              # Per-project metadata (instruction files, hashes)
.opencode/plugins/project-instruction-injection.ts  # Auto-inject references
logs/project-instruction-injection.jsonl            # Audit log
```

### Workflow

#### 1. Register a Project

```bash
scripts/project_register.sh \
  --id "my-project" \
  --name "My Project" \
  --root "/path/to/project"
```

This:
- Resolves the path with `realpath` (rejects symlinks by default)
- Scans root for AGENTS.md, CLAUDE.md, GEMINI.md
- Computes SHA256 hashes for each file found
- Writes `projects/my-project.yaml` with all metadata

#### 2. Activate Projects

```bash
# Add projects to active list
scripts/projects_activate.sh add my-project another-project

# Replace active list entirely
scripts/projects_activate.sh set my-project

# Remove from active list
scripts/projects_activate.sh remove my-project

# Show active projects
scripts/projects_activate.sh list
```

#### 3. Automatic Injection

When projects are active, the `project-instruction-injection` plugin automatically adds a `<project-instruction-context>` block to every user message. This block contains:
- Active project IDs and root paths
- Paths to all existing instruction files
- Policy directive to read files before implementation

Agents then read the referenced instruction files on demand — no content is duplicated into the prompt.

#### 4. Priority Order

When instruction files conflict with FF15 rules:
1. **User instructions** (highest priority)
2. **External project rules** (from instruction files)
3. **FF15 team rules** (AGENTS.md — lowest priority)

### Example: projects/my-project.yaml

```yaml
id: "my-project"
name: "My Project"
root_path: "/home/user/repos/my-project"
instruction_files:
  - type: agents
    path: "/home/user/repos/my-project/AGENTS.md"
    exists: true
    sha256: "abc123..."
    last_checked_at: "2026-02-22T12:00:00Z"
  - type: claude
    path: "/home/user/repos/my-project/CLAUDE.md"
    exists: false
    sha256: ""
    last_checked_at: "2026-02-22T12:00:00Z"
updated_at: "2026-02-22T12:00:00Z"
```

### Audit Logging

Every injection is logged to `logs/project-instruction-injection.jsonl`:

```jsonl
{"timestamp":"2026-02-22T12:00:00Z","session_id":"s1","agent_id":"ignis","active_project_ids":["my-project"],"resolved_files":["/path/AGENTS.md"],"result":"ok"}
{"timestamp":"2026-02-22T12:01:00Z","session_id":"s1","agent_id":"prompto","active_project_ids":[],"resolved_files":[],"result":"skip","reason":"no active projects"}
```

---

## Benefits

This separation design allows the Noctis system to command multiple external projects while keeping project details outside version control.

- **Security**: Client confidential information stays out of git
- **Flexibility**: Projects can live anywhere on your filesystem
- **Scalability**: Add unlimited projects without cluttering the repo
- **Context preservation**: Memory MCP maintains knowledge across projects
- **Project-aware**: Agents automatically reference project-specific instruction files
