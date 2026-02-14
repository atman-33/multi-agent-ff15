# TypeScript Error Check — Quick Reference

Essential patterns for OpenCode plugin TypeScript errors.

> **💡 Automated checking:**
> ```bash
> .opencode/skills/typescript-check/scripts/check.sh <file.ts>
> ```
> Full docs: `SKILL.md`

## Top 5 Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find name 'process'` | Missing Node types | `declare const process: { env: Record<string, string \| undefined> }` |
| `Type 'Promise<X>' not assignable to 'X'` | Missing `await` | Add `await` to async call |
| `Property 'tool' does not exist` | Wrong API | Use `client.file.read()` not `client.tool` |
| `Parameter structure error` | Wrong param format | File read: `query: { path }`, others: `body: {...}` |
| `Property 'content' does not exist` | Wrong response path | Use `(response as any)?.data?.content` |

## SDK Patterns

```typescript
// File read
const response = await client.file.read({ query: { path: "file.ts" } })
const content = (response as any)?.data?.content

// Session prompt
const response = await client.session.prompt({
  body: { agent: "iris", system: systemPrompt, parts: [{ type: "text", text: userPrompt }] },
  path: { id: sessionId },
})
const textParts = (response as any)?.data?.parts?.filter((p: any) => p.type === "text")
```

## tsc Command

```bash
tsc --noEmit --skipLibCheck --moduleResolution node16 --module node16 \
  --lib es2015,dom --target esnext --types node <file.ts>
```

## Checklist

- [ ] `check.sh` returns 0 errors
- [ ] All async functions awaited
- [ ] API params use correct structure (query vs body)
- [ ] Response uses `.data?.` wrapper
