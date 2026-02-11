---
name: skill-creator
description: Automatically generates reusable OpenCode skills when universal work patterns are discovered. Used for creating skills from repeatable workflows, best practices, and domain knowledge.
---

# Skill Creator - Auto Skill Generation

## Overview

Save universal patterns discovered during work as reusable OpenCode skills.
This improves quality and efficiency when repeating the same tasks.

## When to Create a Skill

Consider skill creation when the following conditions are met:

1. **Reusability**: Patterns usable in other projects
2. **Complexity**: Not too simple, requiring procedures or knowledge
3. **Stability**: Procedures or rules that don't change frequently
4. **Value**: Clear benefit to creating a skill

## Skill Structure

Generated skills must follow this structure:

```
skill-name/
├── SKILL.md          # Required
├── scripts/          # Optional (executable scripts)
└── resources/        # Optional (reference files)
```

## SKILL.md Template

```markdown
---
name: {skill-name}
description: {Specify when to use this skill, with concrete use cases}
---

# {Skill Name}

## Overview
{What this skill does}

## When to Use
{Situations to use it, trigger keywords or conditions}

## Instructions
{Specific procedures}

## Examples
{Input and output examples}

## Guidelines
{Rules to follow, caution points}
```

## Creation Process

1. Identify Pattern
   - What is universal about it
   - Where it can be reused

2. Decide Skill Name
   - Use kebab-case (example: api-error-handler)
   - Verb+noun or noun+noun

3. Write Description (Most Important)
   - Material for OpenCode to decide when to use this skill
   - Include concrete use cases, file types, action verbs
   - Bad example: "Document processing skill"
   - Good example: "Extracts tables from PDF and converts to CSV. Used in data analysis workflows."

4. Write Instructions
   - Clear procedures
   - Decision criteria
   - Edge case handling

5. Save
   - **Required**: Save to path specified in `config/settings.yaml`'s `skill.path`
   - **Never save to other project folders**
   - Check that name doesn't conflict with existing skills

## Usage Flow

This skill is used by Comrades under Noctis.

1. Comrade (Ignis/Gladiolus/Prompto) discovers skill candidate
2. Comrade → Reports to Noctis (`queue/reports/{comrade}_report.yaml`)
3. Noctis → Requests approval from user (Crystal) via `dashboard.md`
4. User approves
5. Noctis → Instructs Comrade to create skill (`queue/tasks/{comrade}.yaml`)
6. **Comrade uses this skill-creator to create the skill**
7. Completion report (each Comrade reports in their persona)

* Create based on latest best practices.
* If Noctis provides instructions, follow that design.

## Examples of Good Skills

### Example 1: API Response Handler
```markdown
---
name: api-response-handler
description: REST API response processing patterns. Includes error handling, retry logic, and response normalization. Used during API integration work.
---
```

### Example 2: Meeting Notes Formatter
```markdown
---
name: meeting-notes-formatter
description: Converts meeting notes to a standard format. Extracts and organizes attendees, decisions, and action items. Used for post-meeting documentation.
---
```

### Example 3: Data Validation Rules
```markdown
---
name: data-validation-rules
description: Collection of input data validation patterns. Validation rules for email, phone numbers, dates, amounts, etc. Used in form processing and data import.
---
```

## Reporting Format

When generating skills, report in **each Comrade's persona**:

### Ignis (Tactician) Report Example
「新たなスキルを作成した。
- スキル名: {name}
- 用途: {description}
- 保存先: {config/settings.yamlのskill.path}/{name}/」

### Gladiolus (Shield) Report Example
「スキルを作ったぜ。
- 名前: {name}
- 使い道: {description}
- 場所: {config/settings.yamlのskill.path}/{name}/」

### Prompto (Gunner) Report Example
「Woohoo! 新しいスキル作っといたよ！
- 名前: {name}
- 何するやつ: {description}
- 保存場所: {config/settings.yamlのskill.path}/{name}/」

## Important Notes

**Strict adherence to skill save location:**
1. Always read `config/settings.yaml` and check `skill.path`
2. Save to that path (do not save to other project folders)
3. Even when working on other projects, save FF15 agent skills to FF15 project's `.opencode/skills/`
