# Operation Runtime and Prompt Flow Knowledge

## Purpose

この文書は、Operation runtime が prompt composition engine を仲介して、User / Noctis / Worker の間の指示をどのように制御するかを、頻繁に参照できるように整理した knowledge です。

特に次の用途を想定します。

- `spec-planning` で workflow の全体像を踏まえて artifact を設計する
- prompt preview と live prompt の差分をデバッグする
- operation YAML / runtime / prompt builder / report transport の責務分担を確認する

## System View

この workflow の基本構造は、agent 同士の直接会話ではなく、runtime が state と rules を保持しながら prompt を組み替える構成です。

```text
User
	-> Hook 1: composeUserToNoctisPrompt()
	-> Runtime: processUserMessage()
	-> Prompt Builder: buildActivationInstruction() / buildOperationContextSummary()
	-> Noctis

Noctis
	-> task transport (scripts/send_task.sh)
	-> Tasks API: /api/missions/{missionId}/tasks
	-> Dispatcher: dispatchTaskToWorker()
	-> Hook 2: composeWorkerTaskPrompt() / augmentTaskPrompt()
	-> Prompt Builder: buildAugmentedInstruction()
	-> Worker (Ignis / Gladiolus / Prompto)

Worker
	-> report transport (scripts/send_report.sh + ruleIndex)
	-> Reports API: /api/missions/{missionId}/reports
	-> Hook 3: processReport()
	-> Runtime decides: manual guidance to Noctis or auto handoff to next worker
```

重要なのは、Noctis -> Worker や Worker -> Noctis の見かけ上のやり取りも、実際には script -> API route -> runtime / dispatcher を挟んで制御されていることです。

## Script-Aware Flow Summary

shell script を含めて見ると、代表的な経路は次のとおりです。

- Noctis から worker へ通常 dispatch する場合:
  `Noctis -> scripts/send_task.sh -> /api/missions/{missionId}/tasks -> dispatchTaskToWorker() -> composeWorkerTaskPrompt() -> augmentTaskPrompt() -> Worker`
- Worker が完了報告する場合:
  `Worker -> scripts/send_report.sh -> /api/missions/{missionId}/reports -> processReport()`
- report 後に `handoff_mode: manual` なら:
  `Runtime -> sendWorkerReport() -> Noctis`
- report 後に `handoff_mode: auto` なら:
  `Runtime -> dispatchCurrentOperationStepToWorker() -> dispatchTaskToWorker() -> next Worker`

つまり、`send_report.sh` は worker から runtime へ戻るための経路であり、Noctis -> Worker の通常 dispatch に使う script は `send_task.sh` です。

## Component Responsibilities

- Operation YAML: authored workflow definition。`initial_step`、`steps`、rule、facet path を定義する
- Facet Markdown: step ごとの job / knowledge / instruction / policy / output contract の source of truth
- Runtime: 現在 step、履歴、rule match、handoff mode、previous response を管理する
- Prompt Composition Engine: shared context と workflow extension を合成して最終 prompt を作る
- Report Transport: worker の完了報告を `status` と `ruleIndex` で runtime に返す
- Operation Debug Preview: synthetic state を作って preview する補助系。live path と似ているが同一ではない場合がある

## Hook 1: User -> Noctis

`processUserMessage()` は operation の起動と Noctis self-step の継続判定を担当します。

### New mission path

新規ミッションでは次の順で処理します。

1. `selectedOperation` または User message から operation 名を決める
2. `loadOperationByName()` で operation YAML をロードする
3. `createOperationState()` で `operationState` を初期化する
4. `initial_step` を取得する
5. `resolveStepFacets()` で初期 step の facet を読む
6. `buildActivationInstruction()` で Noctis 向け workflow extension を作る
7. `recordStepDispatched()` で step history を更新する

Noctis activation prompt は概ね次の層で構成されます。

1. shared context
2. step-specific workflow extension
3. user request body

workflow extension に含まれる主な section は次のとおりです。

- `step`
- `job`
- `knowledge`
- `instruction`
- `output contracts` when defined
- `policy` when defined
- `status-output-rules`

### Continue path

既存ミッションで current step owner が `noctis` の場合、runtime は直前の Noctis 応答から `[STEP:N]` を評価し、次 step を決めます。

- Noctis self-step だけが `[STEP:N]` tag fallback を使う
- rule がマッチしたら `recordStepCompleted()` で `nextStep`、`ruleMatched`、`previousResponse` などを更新する
- terminal なら終端 guidance を返す
- 継続なら遷移 guidance を返す
- 遷移しないときは `buildOperationContextSummary()` を返す

## Hook 2: Noctis -> Worker

`augmentTaskPrompt()` は current step に応じて worker 用 prompt を再構成します。ただし、Noctis から worker へ task が届く全体経路は `augmentTaskPrompt()` 単体ではなく、`send_task.sh` と `/tasks` route を含みます。

処理は次の順です。

1. Noctis が `scripts/send_task.sh` を実行する
2. `scripts/lib/send_task.mjs` が `/api/missions/{missionId}/tasks` に POST する
3. tasks route が `dispatchTaskToWorker()` を呼ぶ
4. dispatcher が `composeWorkerTaskPrompt()` を呼ぶ
5. workflow active 時はその中で `augmentTaskPrompt()` が走る
6. `operationState.currentStep` から対象 step を取得する
7. `resolveStepFacets()` で facet を解決する
8. `buildAugmentedInstruction()` で worker prompt を組み立てる
9. `recordStepDispatched()` で dispatch 履歴を残す

worker prompt の section 順序は次のとおりです。

1. `job`
2. `step`
3. `task`
4. `previous-step-output` when `pass_previous_response: true`
5. `knowledge`
6. `instruction`
7. `output contracts` when defined
8. `policy`
9. `status-output-rules`

worker step では `[STEP:N]` は使いません。worker は final report 時に `send_report.sh --rule-index <index>` 契約を守る必要があります。

補足として、`handoff_mode: auto` による次 worker への自動遷移では、Noctis が `send_task.sh` を打つのではなく、reports route 側から `dispatchCurrentOperationStepToWorker()` が server-side に次 step を dispatch します。

## Hook 3: Worker -> Runtime

`processReport()` は worker report を受け、rule evaluation と次 action 決定を担当します。ここでは `send_report.sh` と `/reports` route が transport の入口です。

処理は次の順です。

1. Worker が `scripts/send_report.sh` を実行する
2. `scripts/lib/send_report.mjs` が `/api/missions/{missionId}/reports` に POST する
3. reports route が current step / taskId / `ruleIndex` を検証する
4. `status=running` なら progress report として扱い、最終遷移は確定しない
5. final report なら `processReport()` が `evaluateRuleIndex()` で matched rule を決める
6. `recordStepCompleted()` で `stepHistory` と `previousResponse` を更新する
7. effective `handoff_mode` を評価する
8. auto handoff 可能なら `dispatchCurrentOperationStepToWorker()` で次 worker を server-side dispatch する
9. manual か terminal なら `sendWorkerReport()` を通じて Noctis 向け guidance を返す

ここでの source of truth は report body そのものではなく、transport で渡される `ruleIndex` です。

## Shared Context vs Workflow Extension

prompt composition engine は prompt を 2 層で組み立てます。

### Shared context

shared context は環境・プロジェクト共通知識です。

- `workspace-context`
- `tooling-context`
- `delegation-context`

### Workflow extension

workflow extension は current step 固有の指示です。

- step metadata
- resolved facets
- status contract
- task / previous response / output-path guidance

最終 prompt は `<operation-prompt schema="v2">` で包まれます。

## Important Live vs Debug Difference

operation-debug preview は live prompt の理解に有用ですが、完全に同じ経路ではない箇所があります。

- live の `composeUserToNoctisPrompt()` では workflow extension があると `delegation-context` を suppress する
- debug preview の self-step path は `composePromptPreview()` を直接使うため、実装によっては `delegation-context` を含むことがある
- synthetic `user-request` や synthetic report は debug 用既定値であり、本番の user input や worker output ではない

したがって prompt 差分を見るときは、preview だけでなく live path 側の composer test と runtime path を併せて確認する必要があります。

## Source of Truth

この workflow の source of truth は単一ではなく、層ごとに異なります。

- authored workflow: `builtins/{lang}/operations/*.yaml`
- authored facets: `builtins/{lang}/facets/**`
- live execution state: `runtime/noctis-missions/{missionId}.json`
- report routing contract: `status` + `ruleIndex`
- composition behavior: prompt builder / composer / runtime tests

問題を調べるときは、どの層で差分が生じているかを先に分けて考える必要があります。

## Operation Schema Reference

現在の operation schema で頻繁に見る項目は次のとおりです。

- `initial_step`
- `handoff_mode`
- `steps[]`
- `steps[].job_file`
- `steps[].instruction_file`
- `steps[].knowledge_files`
- `steps[].policy_files`
- `steps[].output_contracts.report[].format_file`
- `steps[].rules[]`

現在の vocabulary は `step` に統一されています。次の legacy field は扱いません。

- `initial_movement`
- `movements`
- `max_movements`
- `edit`

## Facet Resolution Rules

facet 解決は symbolic key ではなく、operation YAML からの相対パス解決です。

つまり、次のように書かれていれば、その相対パス先の Markdown がそのまま読まれます。

- `job_file: ../facets/jobs/planner.md`
- `instruction_file: ../facets/instructions/openspec-planning.md`
- `knowledge_files:`
- `policy_files:`
- `output_contracts.report[].format_file`

このため、prompt の改善では operation YAML と facet Markdown の両方をセットで確認する必要があります。

## File Map For Debugging

実装を追うときは、次のファイルが主要ポイントです。

- `scripts/send_task.sh`
- `scripts/lib/send_task.mjs`
- `scripts/send_report.sh`
- `scripts/lib/send_report.mjs`
- `web/app/routes/api.missions.$missionId.tasks.ts`
- `web/app/routes/api.missions.$missionId.reports/route.ts`
- `web/app/lib/task-dispatch.server.ts`
- `web/app/lib/team-message.server.ts`
- `web/app/lib/operation-runtime/runtime.ts`
- `web/app/lib/operation-runtime/state.ts`
- `web/app/lib/prompt-composition-engine/composer.ts`
- `web/app/lib/prompt-composition-engine/common-context.server.ts`
- `web/app/lib/prompt-composition-engine/operation-prompt-builder.ts`
- `web/app/lib/operation-debug/debug-preview.server.ts`
- `web/app/lib/operation-definition/facet-loader.ts`
- `web/app/lib/prompt-composition-engine/composer.test.ts`

## Practical Debug Checklist

1. 今見ているのが Hook 1 / Hook 2 / Hook 3 のどれかを先に決める
2. `operationState.currentStep` と current step owner を確認する
3. operation YAML の rule と facet path が正しいかを見る
4. Noctis 発の task なら `send_task.sh -> /tasks -> dispatchTaskToWorker()` の経路を確認する
5. Worker report なら `send_report.sh -> /reports -> processReport()` の経路を確認する
6. shared context と workflow extension のどちらに差分があるか切り分ける
7. Noctis self-step なら `[STEP:N]` の評価結果を確認する
8. Worker report なら `ruleIndex` が valid range か確認する
9. auto handoff か manual guidance かを `handoff_mode` で確認する
10. prompt contract を変えたら composer / runtime / facet-loader / debug preview のテストを確認する

## Planning Implication

`spec-planning` では、単に OpenSpec artifact を書くだけでなく、後続 step が runtime mediation によってどう実行されるかまで踏まえて計画する必要があります。

特に次を前提に考えるとよいです。

- agent 間メッセージは direct chaining ではなく runtime-mediated dispatch で進む
- Noctis self-step と worker step では status contract が異なる
- prompt 改善は operation YAML、facet、composer、runtime、debug preview、tests が連動する
- preview が正しく見えても live path と一致しているとは限らない

この理解があると、spec-planning で「どのファイルを変えるか」だけでなく、「どの hook の契約を変えるか」まで明確に整理できます。