# Project Management

This system manages and executes not only its own development but **all white-collar work**. Project folders can be outside this repository.

---

## Mechanism

```
config/projects.yaml          # Project list (ID, name, path, status only)
projects/<project_id>.yaml    # Detailed information for each project
```

- **`config/projects.yaml`**: List of what projects exist (summary only)
- **`projects/<id>.yaml`**: All details for that project (client info, contracts, tasks, related files, Notion pages, etc.)
- **Actual project files** (source code, design docs, etc.) are placed in external folder specified by `path`
- **`projects/` is git-ignored** (contains client confidential information)

---

## Example

### config/projects.yaml

```yaml
projects:
  - id: my_client
    name: "Client X Consulting"
    path: "/mnt/c/Consulting/client_x"
    status: active
  
  - id: internal_tool
    name: "Internal Automation Tool"
    path: "/mnt/c/Projects/automation"
    status: active
```

### projects/my_client.yaml

```yaml
id: my_client
client:
  name: "Client X"
  company: "X Corporation"
  contact: "[email]"
contract:
  fee: "Monthly"
  start_date: "2024-01-01"
current_tasks:
  - id: task_001
    name: "System Architecture Review"
    status: in_progress
    assigned_to: ignis
  - id: task_002
    name: "Performance Optimization"
    status: pending
    assigned_to: gladiolus
notion:
  workspace: "https://notion.so/workspace"
  pages:
    - name: "Project Overview"
      url: "https://notion.so/page1"
    - name: "Technical Specs"
      url: "https://notion.so/page2"
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
→ Results in dashboard.md
```

### Multi-project management

Switch between client projects without losing context. Memory MCP preserves preferences across sessions.

```
You: "Switch to project my_client"
→ Noctis loads project context
→ Ready to work on client tasks
```

### Document generation

Technical writing, test case reviews, comparison tables — distributed across agents and merged.

```
You: "Create technical documentation for [feature]"
→ Ignis: Architecture overview
→ Gladiolus: API documentation
→ Prompto: Usage examples
→ Merged in dashboard.md
```

---

## Benefits

This separation design allows the Noctis system to command multiple external projects while keeping project details outside version control.

- **Security**: Client confidential information stays out of git
- **Flexibility**: Projects can live anywhere on your filesystem
- **Scalability**: Add unlimited projects without cluttering the repo
- **Context preservation**: Memory MCP maintains knowledge across projects
