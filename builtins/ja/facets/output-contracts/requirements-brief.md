## Format

````markdown
# Requirements Brief

## Overview

| Item | Value |
|------|-------|
| PRD Key | {stable kebab-case key} |
| Requested Language | {explicit user language or configured default} |
| Status | Clarified |

## Problem Statement

{summarize the user problem in 2-4 sentences}

## Success Criteria

- {criterion}
- {criterion}

## In Scope

- {item}

## Out of Scope

- {item}

## Constraints

- {constraint}

## Decisions

- {resolved decision}

## Open Questions

None
````

## Rule

- `PRD Key` は必須で、workflow の再実行や差し戻し後も同じ依頼に対しては同じ値を維持すること
- `Requested Language` には User の明示指定があればそれを記録し、無ければ configured default を使ったことが分かる値にすること
- `Status` は step 完了時に `Clarified` とすること
- `Open Questions` は step 完了時に `None` とすること
- `Out of Scope` と `Constraints` が空の場合も `None` と明記すること