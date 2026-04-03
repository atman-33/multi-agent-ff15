# Spec Plan — Output Contract

## 保存先

- runtime が `<output-contract>` の `output-path` で渡す absolute path に保存すること
- filename は `spec-plan.md` とすること

## 必須 frontmatter

```yaml
---
change_name: mission-scoped-output-contracts
change_path: openspec/changes/mission-scoped-output-contracts
proposal_path: openspec/changes/mission-scoped-output-contracts/proposal.md
design_path: openspec/changes/mission-scoped-output-contracts/design.md
tasks_path: openspec/changes/mission-scoped-output-contracts/tasks.md
---
```

## 本文構成

```markdown
# Spec Plan

## Request Summary
{User request and scope}

## Approved Change
- Change name: {change_name}
- Change path: {change_path}

## Artifact Status
- proposal.md: created / updated
- design.md: created / updated
- tasks.md: created / updated
- spec delta: created / updated / not needed

## Implementation Guidance
- Expected file changes
- Constraints and non-goals
- Validation steps

## Open Questions
- {none or remaining questions}
```

## ルール

- `change_name` は必須で、作成した OpenSpec change directory 名と一致させること
- `change_path` は必須で、`openspec/changes/<change_name>` を指すこと
- `proposal_path`、`design_path`、`tasks_path` は必須で、作成済み artifact への path を記載すること
- 本文には後続 step が使う implementation scope、制約、validation expectation を要約すること