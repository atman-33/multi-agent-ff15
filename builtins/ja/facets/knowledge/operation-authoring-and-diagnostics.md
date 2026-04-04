---
name: operation-authoring-and-diagnostics
description: operation YAML、facet source 解決、output contract、output placeholder、または workflow 関連テストを安全に変更するときに読むこと。
critical:
  - Canonical な operation schema は `initial_step` と `steps` を使い、各 facet source は `file` または `inline` の source object で表現する。
  - knowledge と policy の list は authored order を保持する。
  - output placeholder は既存の mission-scoped file に解決できなければ prompt build が失敗する。
  - `rules` を持たない step は、`delegation` を持つ Noctis-owned autonomous step としてだけ authoring する。
---

# Operation Authoring And Diagnostics

## 目的

この文書は、この repository における operation と facet を安全に変更するための authoring rule と diagnostics 観点を整理した reference です。

operation YAML、facet file、output contract、placeholder 挙動、workflow 関連テストを変更するときに参照してください。

## Change Surfaces

- operation YAML の step ownership、rule、source object を変える変更
- facet file の内容や path を変える変更
- output contract や placeholder reference を変える変更
- prompt builder / composer / report routing に影響する変更
- workflow 関連テストを更新する変更

## Runtime-Relevant Authoring Rules

頻繁に確認する schema field は次のとおりです。

- `initial_step`
- `steps[]`
- `steps[].job`
- `steps[].instruction`
- `steps[].knowledge`
- `steps[].policies`
- `steps[].delegation.allowed_workers`
- `steps[].delegation.worker_job`
- `steps[].delegation.worker_instruction`
- `steps[].delegation.worker_knowledge`
- `steps[].delegation.worker_policies`
- `steps[].output_contracts.report[].format`
- `steps[].rules[]`

意味上の役割の違いは次のとおりです。

- `job`: その step の stable な role、responsibility、decision principle、prohibition
- `instruction`: その step 固有の execution procedure と reference
- `knowledge`: current step の実行に必要な background knowledge や reference material
- `policies`: current step が従う constraint や convention
- `delegation.*`: Noctis-owned step が child task を worker へ委任するときの許可対象と delegated worker prompt 素材
- `output_contracts.report[].format`: report artifact の format 定義

Canonical な source form は次のとおりです。

- `job.file` / `job.inline`
- `instruction.file` / `instruction.inline`
- `knowledge[].file` / `knowledge[].inline`
- `policies[].file` / `policies[].inline`
- `output_contracts.report[].format.file` / `output_contracts.report[].format.inline`

次の制約は runtime failure に直結しやすいので、設計時に先に確認してください。

- `initial_step` は `noctis` step を指すべきである
- list facet は authored order を保持する
- `file` source は operation YAML path からの相対パスで解決される
- `inline` source は authored された text をそのまま使う
- `output_contracts.report[].format` は output filename と downstream reference に整合している必要がある
- `steps[].delegation.allowed_workers` は authored 上の上限であり、runtime では mission の allowed worker set との積集合が effective set になる
- `rules` を省略できるのは、Noctis が同じ parent step に留まる autonomous delegation step だけである

`initial_movement`、`movements`、`max_movements`、`edit`、`handoff_mode`、`job_file`、`knowledge_files` などの legacy field は canonical ではありません。

prompt を変えるときは operation YAML と参照先 facet file の両方をセットで確認してください。

## Output And Placeholder Failure Modes

- step が `output_contracts.report[]` を定義している場合、prompt composition は mission-scoped output file 向けの guidance を注入する
- canonical output path は `runtime/noctis-missions/{missionId}/outputs/{step}/{taskId}/{filename}` に置かれる
- required output file が不足している場合、reports route は completion を reject する
- 後続 instruction では `{{ output("step", "latest", "file") }}` や `{{ output("step", "task:<taskId>", "file") }}` を使える
- placeholder が解決できない場合、prompt build は明示的に失敗しなければならない
- `spec-plan.md` には `change_name` や `change_path` のような machine-readable frontmatter を持たせられる

よくある failure mode は次のとおりです。

- output filename と `output(...)` reference が一致していない
- facet path が operation YAML から見た相対パスになっていない
- required output file が生成されず completion が reject される
- placeholder が old taskId や存在しない artifact を参照している
- prompt builder 側の変更で previously valid な placeholder 解決が壊れる

## Symptom-To-Layer Triage

### 次 actor が想定と違う

- operation rules、active step owner、`next` を先に確認する
- runtime state と report routing contract を確認する

### prompt に knowledge や guidance が入らない

- operation YAML の source object と facet path を確認する
- prompt builder と composer の両方を見る

### report が reject される

- required output file、active `taskId`、allowed `next` を確認する
- `send_report.sh -> /reports -> processReport()` を追う

### delegated child report が parent step completion 扱いになる

- `operationState.delegatedTasks` に child `taskId` と parent step の対応があるか確認する
- current step が `noctis` owner かつ `delegation` を持つか確認する
- child report の `next` が `COMPLETE` または `ABORT` のみになっているか確認する
- report 後も `operationState.currentStep` が変わっていないか確認する

### placeholder が解決されない

- output directory の実ファイル、taskId、filename を確認する
- absolute path に解決されているかを確認する

### preview と live の prompt が違う

- synthetic input による差か、runtime behavior の差かを切り分ける
- preview output と live composer/runtime behavior の両方を確認する

## Files To Inspect

よく確認する file は次のとおりです。

- `scripts/send_report.sh`
- `scripts/lib/send_report.mjs`
- `web/app/routes/api.noctis.mission.start.ts`
- `web/app/routes/api.noctis.mission.continue.ts`
- `web/app/routes/api.missions.$missionId.reports/route.ts`
- `web/app/lib/task-dispatch.server.ts`
- `web/app/lib/team-message.server.ts`
- `web/app/lib/operation-runtime/runtime.ts`
- `web/app/lib/operation-runtime/autonomous.ts`
- `web/app/lib/operation-runtime/state.ts`
- `web/app/lib/prompt-composition-engine/composer.ts`
- `web/app/lib/prompt-composition-engine/operation-prompt-builder.ts`
- `web/app/lib/operation-debug/debug-preview.server.ts`

## Tests To Revisit

- operation definition や source object の変更なら `web/app/lib/operation-definition/` 配下の test を見直す
- prompt shape の変更なら `web/app/lib/prompt-composition-engine/` 配下の test を見直す
- report routing や completion の変更なら reports route と runtime まわりの test を見直す
- preview の挙動差を変えるなら debug preview 関連の test を見直す

## Safe Change Checklist

1. 問題が Hook 1、Hook 2、Hook 3 のどこにあるかを先に切り分ける。
2. `operationState.currentStep`、step owner、active `taskId` を確認する。
3. required output がある場合は、mission-scoped output directory の内容を確認する。
4. operation rules と facet path が正しいか確認する。
5. Noctis self-step の問題なら `composeUserToNoctisPrompt() -> processUserMessage()` を追う。
6. worker dispatch の問題なら `dispatchCurrentOperationStepToWorker() -> dispatchTaskToWorker()` を追う。
7. completion/report の問題なら `send_report.sh -> /reports -> processReport()` を追う。
8. placeholder を使っている場合は absolute path に解決されているか確認する。
9. routing が message body token ではなく `taskId` と `next` に依存しているか確認する。
10. prompt shape を変えた場合は composer、runtime、debug preview の test をまとめて見直す。
11. delegated child task を導入した場合は `allowedWorkers`、`delegatedTasks`、same-step return の 3 点をまとめて確認する。