---
name: operation-authoring-and-diagnostics
description: operation YAML、facet の source 解決、output contract、output placeholder、workflow debug 経路、または prompt/routing 関連テストを変更するときに読むこと。
critical:
  - Canonical な operation schema は `initial_step` と `steps` を使い、各 facet source は `file` または `inline` の source object で表現する。
  - knowledge と policy の list は authored order を保持する。
  - output placeholder は既存の mission-scoped file に解決できなければ prompt build が失敗する。
---

# Operation Authoring And Diagnostics

## 目的

この文書は、この repository における operation の authoring 方法と、prompt/routing の挙動を変えたときの debug 観点を整理した reference です。

operation YAML、facet file、output contract、placeholder 挙動、workflow 関連テストを変更するときに参照してください。

## Operation Schema Reference

頻繁に使う schema field は次のとおりです。

- `initial_step`
- `steps[]`
- `steps[].job`
- `steps[].instruction`
- `steps[].knowledge`
- `steps[].policies`
- `steps[].output_contracts.report[].format`
- `steps[].rules[]`

意味上の役割の違いは次のとおりです。

- `job`: その step の stable な role、responsibility、decision principle、prohibition
- `instruction`: その step 固有の execution procedure と reference
- `knowledge`: current step の実行に必要な background knowledge や reference material
- `policies`: current step が従う constraint や convention
- `output_contracts.report[].format`: report artifact の format 定義

Canonical な source form は次のとおりです。

- `job.file` / `job.inline`
- `instruction.file` / `instruction.inline`
- `knowledge[].file` / `knowledge[].inline`
- `policies[].file` / `policies[].inline`
- `output_contracts.report[].format.file` / `output_contracts.report[].format.inline`

`initial_movement`、`movements`、`max_movements`、`edit`、`handoff_mode`、`job_file`、`knowledge_files` などの legacy field は canonical ではありません。

## Facet Resolution Rules

facet source は、operation YAML に authored された source object から直接解決されます。

- `file` source は operation YAML path からの相対パスとして解決する
- `inline` source は authored された inline text をそのまま使う
- list facet は authored order を保持する
- prompt を変えるときは operation YAML と参照先 facet file の両方をセットで確認する

## Output Contract And Placeholder Rules

- step が `output_contracts.report[]` を定義している場合、prompt composition は mission-scoped output file 向けの guidance を注入する
- canonical output path は `runtime/noctis-missions/{missionId}/outputs/{step}/{taskId}/{filename}` に置かれる
- required output file が不足している場合、reports route は completion を reject する
- 後続 instruction では `{{ output("step", "latest", "file") }}` や `{{ output("step", "task:<taskId>", "file") }}` を使える
- placeholder が解決できない場合、prompt build は明示的に失敗しなければならない
- `spec-plan.md` には `change_name` や `change_path` のような machine-readable frontmatter を持たせられる

## Diagnostics Map

よく確認する file は次のとおりです。

- `scripts/send_report.sh`
- `scripts/lib/send_report.mjs`
- `web/app/routes/api.noctis.mission.start.ts`
- `web/app/routes/api.noctis.mission.continue.ts`
- `web/app/routes/api.missions.$missionId.reports/route.ts`
- `web/app/lib/task-dispatch.server.ts`
- `web/app/lib/team-message.server.ts`
- `web/app/lib/operation-runtime/runtime.ts`
- `web/app/lib/operation-runtime/state.ts`
- `web/app/lib/prompt-composition-engine/composer.ts`
- `web/app/lib/prompt-composition-engine/operation-prompt-builder.ts`
- `web/app/lib/operation-debug/debug-preview.server.ts`

## Practical Debug Checklist

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