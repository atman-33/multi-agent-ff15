# OpenSpec Development Workflow Knowledge

## OpenSpec とは

OpenSpec は、この project で使われる、artifact-first の構造化開発 workflow です。実装を始める前に、一連の artifacts（specs）を通じて変更内容を定義することで、明確さと追跡可能性を確保します。

## Workflow の概要

```
1. Explore/Clarify → 2. Spec Creation → 3. Implementation → 4. Verification → 5. Archive
```

### Artifact の流れ

1. **Change Artifact** — 変更のスコープ、動機、方針を定義する
    - 配置先は `openspec/changes/{change-id}/`
    - context、requirements、design decisions、affected files を含む
2. **Delta Spec** — 現在状態と目標状態の差分を表す
3. **Main Spec** — 実装後に更新される正規の仕様

### ディレクトリ構成

```
openspec/
├── specs/           # Main specifications（canonical）
└── changes/         # Active change artifacts
    ├── {change-id}/
    │   ├── context.md
    │   ├── requirements.md
    │   └── delta-spec.md
    └── archive/     # Completed changes
```

## 重要原則

1. **Spec Before Code** — 作る前に、何を作るのかを定義する
2. **Incremental Artifacts** — 各 artifact は前の artifact を土台に積み上がる
3. **Traceability** — すべてのコード変更は spec の要件へ追跡できる
4. **Verification** — archiving 前に、実装が spec に照らして検証される

## Skills 連携

この project では `.opencode/skills/` に OpenSpec skills が用意されている:
- `openspec-new-change` — Start a new change
- `openspec-apply-change` — Implement from a change artifact
- `openspec-verify-change` — Verify implementation matches spec
- `openspec-archive-change` — Archive completed change

## Operations で使うとき

標準の development operation において、OpenSpec knowledge は agents が次を理解する助けになる:
- どの artifacts が存在し、どこに配置されているか
- 実装時に specs をどう参照するか
- 実装を spec 要件に対してどう検証するか
- project 全体の開発思想
