# Context File Maintenance Guidelines

Guidelines for editing `AGENTS.md` and `.opencode/agents/*.md`.

## Principles

- **Be concise**: Every sentence must carry information. Remove filler and verbose phrasing.
- **No duplication**: Shared rules → AGENTS.md only. Agent files → role-specific content only.
- **AI-optimized**: Direct instructions, not prose. Use tables and lists over paragraphs.
- **Token-conscious**: Minimize token consumption. Fewer tokens = more effective context window.

## Edit Checklist

**Before editing AGENTS.md, ask:**
- [ ] Is this rule shared by ALL agents? → Keep in AGENTS.md
- [ ] Is this rule specific to ONE agent? → Move to `.opencode/agents/{name}.md`
- [ ] Can I reference instead of duplicate? → Use "See {file}.md"

**Before editing agent files, ask:**
- [ ] Is this duplicating AGENTS.md? → Remove and reference instead
- [ ] Is this truly role-specific? → Keep only if YES
- [ ] Can I make this more concise? → Cut filler, use tables

## After Editing

1. Self-review against the principles above
2. Search for similar content in other files — consolidate or reference if found
