---
name: typescript-check
description: TypeScript error checking for OpenCode plugins. Runs tsc --noEmit and LSP diagnostics to verify TypeScript files are error-free. Use before completing any TypeScript editing task.
metadata:
  author: multi-agent-ff15
  version: "1.0"
  created: "2026-02-14"
---

# typescript-check

TypeScript validation tool for OpenCode plugins. Ensures type safety before task completion.

## Usage

### Basic Check

```bash
.opencode/skills/typescript-check/scripts/check.sh <file.ts>
```

### With LSP Diagnostics

```bash
.opencode/skills/typescript-check/scripts/lsp-check.sh <file.ts>
```

### Examples

**Check single file:**
```bash
.opencode/skills/typescript-check/scripts/check.sh .opencode/plugins/iris-dashboard-analyzer.ts
```

**Check with LSP:**
```bash
.opencode/skills/typescript-check/scripts/lsp-check.sh .opencode/plugins/my-plugin.ts
```

## What It Does

### check.sh

1. Runs `tsc --noEmit` with proper flags for OpenCode plugins
2. Checks for type errors, missing types, API mismatches
3. Returns exit code 0 if no errors, non-zero if errors found

**Flags used:**
- `--noEmit` — Check only, don't generate output
- `--skipLibCheck` — Skip node_modules type checking (faster)
- `--moduleResolution node16` — Modern Node.js resolution
- `--module node16` — ES modules support
- `--lib es2015,dom` — Include Promise, async/await, DOM types
- `--target esnext` — Target modern JavaScript
- `--types node` — Include Node.js type definitions

### lsp-check.sh

1. Runs LSP diagnostics via OpenCode's language server
2. Provides detailed error messages with locations
3. Integrates with editor error highlighting

## Verification Checklist

Before marking TypeScript task complete:

- [ ] Run `check.sh` — returns "✅ No TypeScript errors"
- [ ] Run `lsp-check.sh` — returns "✅ LSP diagnostics clear"
- [ ] Fix ALL errors reported
- [ ] Document any unfixable errors in task report

## Common Error Patterns

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find name 'process'` | Missing Node types | Add `declare const process` or install @types/node |
| `Type 'Promise<X>' is not assignable to 'X'` | Missing `await` | Add `await` to async call |
| `Property 'X' does not exist` | Wrong API usage | Check SDK types in node_modules |
| `Cannot find module '@opencode-ai/*'` | Module resolution | Ensure `"type": "module"` in package.json |

## SDK Type Verification

When fixing API errors, verify against SDK types:

```bash
# Find API type definition
grep -r "FileReadData\|SessionPromptData" .opencode/node_modules/@opencode-ai/sdk/dist/gen/

# Check RequestResult wrapper
grep -A 10 "RequestResult<" .opencode/node_modules/@opencode-ai/sdk/dist/gen/client/types.gen.d.ts
```

## Integration with Task Workflow

**For TypeScript editing tasks:**

1. **Before editing**: Run `check.sh` to establish baseline
2. **After each fix**: Re-run `check.sh` to verify
3. **Before completion**: Run both `check.sh` and `lsp-check.sh`
4. **In task report**: Include "tsc: 0 errors, LSP: 0 errors"

## Output Examples

**Success:**
```
✅ No TypeScript errors found
File: .opencode/plugins/my-plugin.ts
```

**With errors:**
```
❌ TypeScript errors found:

.opencode/plugins/my-plugin.ts:23:15 - error TS2345: Argument of type '...' is not assignable to parameter of type '...'

23     const response = await client.file.read({
                   ~~~~

✗ 1 error
```

## Benefits

- **Prevents iterative fixes** — Catch all errors before task completion
- **Standardized flags** — Consistent tsc configuration across tasks
- **LSP integration** — Leverages OpenCode's language server
- **Fast feedback** — Returns immediately on first error
- **CI-ready** — Exit codes suitable for automation

## For All Agents

Any agent editing TypeScript files should use this skill. See also:
- AGENTS.md — Code Editing Protocol section
- references/QUICKREF.md — Quick error reference (load if needed)
