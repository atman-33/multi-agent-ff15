---
name: code-edit-protocol
description: Verification workflow for code file edits. Use before and after editing any source code file (TypeScript, Python, C#, Rust, Go, etc.) to ensure compilation and lint pass with 0 errors. Triggers when an agent is about to write or modify code.
---

# Code Editing Protocol

## Workflow

1. Identify the file's language by extension
2. Run the language-specific verification command (see table below)
3. Fix all errors systematically
4. Re-run until 0 errors
5. Run `lsp_diagnostics` if available
6. Include "0 errors" in the task summary

## Language Verification Commands

| Language | Command |
|----------|---------|
| TypeScript | `tsc --noEmit` |
| Python | `mypy <file>` + `pylint <file>` |
| C# | `dotnet build` |
| Rust | `cargo check` |
| Go | `go build ./...` |

## Checklist Before Marking Complete

- [ ] Compiler/linter returns 0 errors
- [ ] LSP diagnostics show no errors (if available)
- [ ] API parameters and return types verified against SDK
- [ ] Error/response handling is correct
- [ ] All affected call sites updated if signatures changed

## Principles

- **Never skip verification** — always run compiler before marking done
- **Re-run after each fix batch** — don't assume fixes are clean
- **Check SDK types** — don't guess API shapes

For language-specific patterns and anti-patterns, see:
- TypeScript: `.opencode/skills/typescript-check/SKILL.md`
- Python: `.opencode/skills/python-check/SKILL.md`
