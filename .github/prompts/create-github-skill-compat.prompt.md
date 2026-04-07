---
description: "Create a thin .github skill entrypoint for a canonical .opencode skill"
argument-hint: "Skill name and optional constraints"
agent: "agent"
---

Create a workspace-scoped GitHub Copilot skill at `.github/skills/<skill-name>/SKILL.md` that acts as a thin compatibility entrypoint to the canonical opencode skill at `.opencode/skills/<skill-name>/SKILL.md`.

Treat the target canonical opencode skill at `.opencode/skills/<skill-name>/SKILL.md` as the source of truth. If similar `.github/skills/*/SKILL.md` compatibility entrypoints already exist in the workspace, align with their style, but do not depend on any specific example path.

**Input**

The argument after this prompt is the skill name. It may also include optional constraints such as compatibility-only wording, minor workspace-specific guidance, or whether an existing `.github` entrypoint should be updated.

**Goal**

- Create or update only `.github/skills/<skill-name>/SKILL.md`.
- Keep `.opencode/skills/<skill-name>/` as the source of truth.
- Reuse the canonical skill's frontmatter fields when possible, especially `name`, `description`, and `argument-hint`.
- Keep the `.github` skill short and compatibility-focused.

**Steps**

1. Parse the requested skill name. If it is missing, ask for it.
2. Confirm that `.opencode/skills/<skill-name>/SKILL.md` exists. If it does not exist, stop and explain that the canonical skill must exist first.
3. Read the canonical opencode skill and extract the relevant frontmatter fields.
4. If similar compatibility entrypoints already exist under `.github/skills/`, inspect them only to match local style conventions.
5. Create or update `.github/skills/<skill-name>/SKILL.md`.
6. Use this compatibility-entrypoint structure:
   - Matching or near-matching frontmatter from the canonical skill
   - A title heading for the skill name
   - `This file is a compatibility entrypoint.`
   - `Use the canonical opencode skill at '.opencode/skills/<skill-name>/SKILL.md'.`
   - If the workflow uses bundled templates, references, or assets, add `When the workflow needs bundled references or templates, use the files under '.opencode/skills/<skill-name>/'.`
   - `Do not treat '.github/skills/<skill-name>/' as the source of truth.`
7. Do not copy the full canonical skill body into `.github/skills/`.
8. Preserve repository conventions and keep all new file content in English.
9. Summarize the created or updated file and note any assumptions.

**Ask Only If Blocked**

- What is the skill name?
- Should the `.github` file stay compatibility-only, or should it add a small amount of workspace-specific guidance?
- If a `.github` entrypoint already exists, should it be replaced or minimally adjusted?

**Guardrails**

- Do not edit the canonical `.opencode` skill unless the user explicitly asks.
- Do not create extra assets under `.github/skills/<skill-name>/` unless explicitly requested.
- If the canonical skill is missing, stop instead of inventing content.
- If no similar `.github` compatibility entrypoints exist, use a minimal compatibility-only structure instead of inventing extra sections.
- Keep detailed workflow instructions, templates, and references in `.opencode`, not in `.github`.