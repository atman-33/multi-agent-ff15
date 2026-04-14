---
name: Operation System Contract
description: runtime-owned dispatch、source-aware operationRef、step-completion transport、prompt composition boundary、または live と debug の prompt 差分を変更するときに読むこと。
---

# Operation System Contract

## 目的

この文書は、この repository における operation system の stable な runtime / prompt-composition contract を整理した reference です。

workflow routing、runtime dispatch ownership、report handling、prompt composition boundary を変更するときに参照してください。

## Non-Negotiable Invariants

- dispatch は direct な agent chaining ではなく runtime-mediated である。
- Runtime が次 actor を決定し、worker dispatch を所有する。
- runtime state における canonical な workflow key は `operationRef` であり、`operationName` は display 用である。
- builtin と project source で同じ `name` を持つ workflow は separate catalog entry として扱う。
- free-form message からの auto activation は unique な catalog match がある場合だけ成功する。
- step completion の canonical transport は `taskId + next + message` である。
- routing は standalone な body tag や `[STEP:N]` token ではなく runtime state に依存する。
- Noctis step と worker step は同じ completion contract を共有する。
- delegated child task は parent step ownership を変更せず、report 後は同じ Noctis-owned step へ戻る。
