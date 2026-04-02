# Operation Runtime and Prompt Flow Knowledge

## Purpose

この文書は、Operation runtime が prompt composition engine を仲介して、User / Noctis / Worker の間の step execution をどのように制御するかを整理した knowledge です。

特に次の用途を想定します。

- `spec-planning` で runtime-owned dispatch を前提に artifact を設計する
- self-step / worker-step の report 契約が同じであることを確認する
- prompt preview と live prompt の差分を、taskId と `next` を含む形でデバッグする

## System View

現在の canonical flow は、Noctis も worker も runtime に structured report を返し、runtime が次 actor を決定する構成です。

```text
User
	-> Hook 1: composeUserToNoctisPrompt()
	-> Runtime: processUserMessage()
	-> Prompt Builder: buildActivationInstruction() / buildOperationContextSummary()
	-> Noctis

Noctis (self-step owner)
	-> report transport (scripts/send_report.sh + taskId + next + message)
	-> Reports API: /api/missions/{missionId}/reports
	-> Hook 3: processReport()
	-> Runtime decides: next worker dispatch / next Noctis step / terminal

Runtime
	-> dispatchCurrentOperationStepToWorker()
	-> dispatchTaskToWorker()
	-> Hook 2: composeWorkerTaskPrompt() / augmentTaskPrompt()
	-> Worker (Ignis / Gladiolus / Prompto)

Worker
	-> report transport (scripts/send_report.sh + taskId + next + message)
	-> Reports API: /api/missions/{missionId}/reports
	-> Hook 3: processReport()
	-> Runtime decides: next worker dispatch / next Noctis step / terminal
```

重要なのは、deterministic な step transition では Noctis が relay prose を書いたり `send_task.sh` で次 worker を手動 dispatch したりしないことです。次 actor の決定と worker dispatch は runtime の責務です。

## Script-Aware Flow Summary

script を含めて見ると、代表的な経路は次のとおりです。

- User から Noctis self-step を開始または継続する場合:
  `User -> /api.noctis.mission.start|continue -> composeUserToNoctisPrompt() -> processUserMessage() -> Noctis`
- Noctis self-step が完了する場合:
  `Noctis -> scripts/send_report.sh -> /api/missions/{missionId}/reports -> processReport()`
- runtime が次 worker を dispatch する場合:
  `Runtime -> dispatchCurrentOperationStepToWorker() -> dispatchTaskToWorker() -> composeWorkerTaskPrompt() -> augmentTaskPrompt() -> Worker`
- Worker が step 完了を報告する場合:
  `Worker -> scripts/send_report.sh -> /api/missions/{missionId}/reports -> processReport()`
- Worker report の結果が次 Noctis step なら:
  `Runtime -> sendWorkerReport() -> Noctis session`

`send_task.sh` は generic delegation command として残るが、operation の deterministic step transition の canonical path ではない。

## Component Responsibilities

- Operation YAML: `initial_step`、`steps`、rules、step-local facet source を定義する
- Facet Content: step ごとの job / knowledge / instruction / policy / output contract を file または inline から供給する
- Runtime: 現在 step、taskId、履歴、allowed `next` に基づく遷移、次 actor dispatch を管理する
- Prompt Composition Engine: shared context と current step 固有の workflow extension を合成する
- Report Transport: Noctis / worker の両方の step 完了を `taskId`、`next`、canonical `message` で runtime に返す
- Operation Debug Preview: synthetic state を使って runtime path に近い prompt を preview する

## Hook 1: User -> Noctis

`processUserMessage()` は operation の起動と、active な Noctis self-step の context 再構成を担当します。`[STEP:N]` の本文解析は行いません。

### New mission path

新規ミッションでは次の順で処理します。

1. `selectedOperation` または User message から operation 名を決める
2. `loadOperationByName()` で operation YAML をロードする
3. `createOperationState()` で `operationState` を初期化する
4. `initial_step` を取得する
5. step owner が Noctis なら active step taskId を生成する
6. `resolveStepFacets()` で初期 step の facet を読む
7. `buildActivationInstruction()` で self-step 用 workflow extension を作る

### Continue path

既存ミッションで current step owner が `noctis` の場合、runtime は現在 active な step の taskId を維持しつつ、同じ self-step context を再構成します。

- routing は前回 assistant 本文ではなく current step の active taskId と rules に従う
- User からの追加入力は self-step の追加コンテキストとして Noctis に渡る
- self-step の完了は必ず `send_report.sh` 側で確定する

## Hook 2: Runtime -> Worker

worker dispatch は runtime-owned です。operation の step transition 後に次 step が worker であれば、runtime が server-side に dispatch します。

処理は次の順です。

1. runtime が current step を取得する
2. active step taskId を確定する
3. `dispatchTaskToWorker()` が worker task を作成または再利用する
4. `composeWorkerTaskPrompt()` が workflow-aware worker prompt を構成する
5. `augmentTaskPrompt()` が current step の facets と report 契約を worker prompt に注入する
6. worker session に最終 prompt を配信する

worker prompt の section 順序は次のとおりです。

1. `job`
2. `task`
3. `previous-step-output` when previous response is available and required for the current step
4. `knowledge`
5. `instruction`
6. `output contracts` when defined
7. `policy`
8. `step-completion-contract`

worker step は本文末尾の `[STEP:N]` を使わず、allowed `next` と単一の `message` を `send_report.sh` で返す。

## Hook 3: Agent -> Runtime Report

`processReport()` は Noctis と worker の両方からの step report を受け、rule evaluation と次 action 決定を担当します。

処理は次の順です。

1. agent が `scripts/send_report.sh` を実行する
2. `scripts/lib/send_report.mjs` が `/api/missions/{missionId}/reports` に POST する
3. reports route が active step owner、taskId、allowed `next` を検証する
4. `evaluateNextStep()` で current step の `rules[].next` から matched rule を決める
5. `recordStepCompleted()` で `stepHistory` と `previousResponse` を canonical `message` で更新する
6. next step が worker なら runtime が `dispatchCurrentOperationStepToWorker()` を呼ぶ
7. next step が Noctis なら runtime が self-step taskId と context を準備する
8. terminal なら final guidance を返す

source of truth は report body 内のタグではなく、transport で渡される `taskId` と `next` です。

## Shared Context vs Workflow Extension

prompt composition engine は prompt を 2 層で組み立てます。

### Shared context

shared context は環境・プロジェクト共通知識です。

- `workspace-context`
- `tooling-context`
- `delegation-context`

### Workflow extension

workflow extension は current step 固有の指示です。

- resolved facets
- completion contract
- task / previous response / output-path guidance

standalone な `<step>` block は注入しません。routing の source of truth は runtime state と report transport の `taskId + next + message` です。

最終 prompt は `<operation-prompt schema="v2">` で包まれます。

## Important Live vs Debug Difference

operation-debug preview は live prompt の理解に有用ですが、完全に同じ経路ではない箇所があります。

- live の `composeUserToNoctisPrompt()` では workflow extension があると `delegation-context` を suppress する
- debug preview は synthetic missionId / taskId / report payload を使う
- worker report から Noctis step へ遷移する場合、preview は synthetic report を通じて activation context を作る

したがって prompt 差分を見るときは、preview だけでなく live path 側の composer test と runtime path を併せて確認する必要があります。

## Source of Truth

この workflow の source of truth は単一ではなく、層ごとに異なります。

- authored workflow: `builtins/{lang}/operations/*.yaml`
- authored facet files: `builtins/{lang}/facets/**`
- authored inline step facets: operation YAML の `steps[].job.inline` / `steps[].instruction.inline` / `steps[].knowledge[].inline` / `steps[].policies[].inline` / `steps[].output_contracts.report[].format.inline`
- live execution state: `runtime/noctis-missions/{missionId}.json`
- step execution identity: `OperationState.stepHistory[].taskId`
- report routing contract: `taskId` + `next` + `message`
- composition behavior: prompt builder / composer / runtime tests

## Operation Schema Reference

現在の operation schema で頻繁に見る項目は次のとおりです。

- `initial_step`
- `steps[]`
- `steps[].job`
- `steps[].instruction`
- `steps[].knowledge`
- `steps[].policies`
- `steps[].output_contracts.report[].format`
- `steps[].rules[]`

`job` と `instruction` は storage 形式ではなく意味で分けます。

- `job`: その step の担当 agent が担う役割、責務、判断原則、禁止事項
- `instruction`: その step で実行すべき具体的手順、参照先、完了に向けた進め方

その他の facet も同じ方針で naming を揃えます。

- `knowledge`: current step の実行に必要な背景知識や調査メモ。複数可
- `policies`: current step が従う制約や規約。複数可
- `output_contracts.report[].format`: report artifact の形式定義

canonical な authored form は次の source object です。

- `job.file` / `job.inline`
- `instruction.file` / `instruction.inline`
- `knowledge[].file` / `knowledge[].inline`
- `policies[].file` / `policies[].inline`
- `output_contracts.report[].format.file` / `output_contracts.report[].format.inline`

次の旧 field 名は canonical schema ではなく、使用しません。

- `steps[].job_file`
- `steps[].instruction_file`
- `steps[].knowledge_files`
- `steps[].policy_files`
- `steps[].output_contracts.report[].format_file`

現在の vocabulary は `step` に統一されています。次の legacy field は扱いません。

- `initial_movement`
- `movements`
- `max_movements`
- `edit`
- `handoff_mode`

workflow を pause させたい場合は、manual handoff flag ではなく explicit な Noctis-owned step を追加する。

## Facet Resolution Rules

facet 解決は symbolic key ではなく、operation YAML に書かれた source object をそのまま解決します。

- `job:`
	`file: ../facets/jobs/planner.md`
- `instruction:`
	`inline: | ...`
- `knowledge:`
	`- file: ../facets/knowledge/operation-engine-and-builtins-injection.md`
- `policies:`
	`- file: ../facets/policies/coding-standards.md`
- `output_contracts.report[].format:`
	`file: ../facets/output-contracts/code-review.md`

`job` / `instruction` / `knowledge` / `policies` / `format` の source 解決ルールは次のとおりです。

- `file` の場合は operation YAML からの相対パスとして解決する
- `inline` の場合は operation YAML 内の本文をそのまま採用する
- list facet は authored order のまま解決して prompt に注入する
- prompt builder の `source` attribute は file では絶対 path、inline では operation file を起点にした deterministic locator を使う

prompt 改善では operation YAML と、file source を使っている facet Markdown の両方をセットで確認する必要があります。

## File Map For Debugging

- `scripts/send_report.sh`
- `scripts/lib/send_report.mjs`
- `web/app/routes/api.noctis.mission.start.ts`
- `web/app/routes/api.noctis.mission.continue.ts`
- `web/app/routes/api.missions.$missionId.tasks.ts`
- `web/app/routes/api.missions.$missionId.reports/route.ts`
- `web/app/lib/task-dispatch.server.ts`
- `web/app/lib/team-message.server.ts`
- `web/app/lib/operation-runtime/runtime.ts`
- `web/app/lib/operation-runtime/state.ts`
- `web/app/lib/prompt-composition-engine/composer.ts`
- `web/app/lib/prompt-composition-engine/operation-prompt-builder.ts`
- `web/app/lib/operation-debug/debug-preview.server.ts`

## Practical Debug Checklist

1. 今見ているのが Hook 1 / Hook 2 / Hook 3 のどれかを先に決める
2. `operationState.currentStep`、current step owner、active `task_id` を確認する
3. operation YAML の rules と facet path が正しいかを見る
4. Noctis self-step なら `composeUserToNoctisPrompt() -> processUserMessage()` の経路を確認する
5. worker dispatch なら `dispatchCurrentOperationStepToWorker() -> dispatchTaskToWorker()` の経路を確認する
6. step report なら `send_report.sh -> /reports -> processReport()` の経路を確認する
7. routing が body text 内のタグではなく `taskId` と `next` に依存しているかを確認する
8. next step が worker か Noctis か terminal かを current state から確認する
9. prompt contract を変えたら composer / runtime / debug preview のテストを確認する

## Planning Implication

`spec-planning` では、単に OpenSpec artifact を書くだけでなく、step completion がすべて runtime 仲介の structured report で確定する前提で設計する必要があります。

特に次を前提に考えるとよいです。

- agent 間メッセージは direct chaining ではなく runtime-mediated dispatch で進む
- Noctis self-step も worker step も completion contract は `taskId + next + message` に揃う
- completion contract の `message` guidance は `next` ごとに変わる。非 terminal では runtime が次 step owner に渡す canonical handoff text として書き、`COMPLETE` / `ABORT` では final summary または blocker summary として書く
- manual handoff flag は存在せず、pause は explicit な Noctis-owned step で表現する
- prompt 改善は operation YAML、facet、composer、runtime、debug preview、tests が連動する