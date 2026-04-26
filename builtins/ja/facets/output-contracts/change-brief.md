## Format

````markdown
# Change Brief

## Overview

| Item | Value |
|------|-------|
| Change Key | {stable kebab-case key} |
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

- `Change Key` は必須で、同じ依頼に対する rerun や retry でも同じ値を維持すること
- `Requested Language` には User の明示指定があればそれを記録し、無ければ configured default を使ったことが分かる値にすること
- `Status` は step 完了時に `Clarified` とすること
- `Open Questions` は step 完了時に `None` とすること
- `Out of Scope` と `Constraints` が空の場合も `None` と明記すること