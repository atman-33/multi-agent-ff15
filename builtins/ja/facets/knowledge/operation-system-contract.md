---
name: operation-system-contract
description: runtime-owned dispatch、report routing、activation prompt behavior、worker prompt composition、または live と debug の prompt 差分を変更するときに読むこと。
critical:
	- Runtime が次 actor を決定し、deterministic な worker dispatch を Noctis が手動 relay しない。
	- Canonical な step-completion transport は `taskId + next + message` である。
	- Live prompt delivery と operation-debug preview は関連しているが同一経路ではない。
---

# Operation System Contract

## 目的

この文書は、この repository における operation system の stable な runtime / prompt-composition contract を整理した reference です。

workflow routing、runtime dispatch ownership、report handling、prompt composition behavior を変更するときに参照してください。

## Runtime-Mediated Step Flow

canonical flow は runtime-mediated です。

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

deterministic な step transition では、runtime が次 actor を選び、worker dispatch を所有します。

## Hook Summary

### Hook 1: User -> Noctis

`processUserMessage()` は operation を開始し、active な Noctis self-step context を再構成します。message body から `[STEP:N]` token は解析しません。

### Hook 2: Runtime -> Worker

次 step が worker-owned の場合、runtime はそれを server-side で dispatch し、operation state から workflow-aware worker prompt を構成します。

### Hook 3: Agent -> Runtime Report

`processReport()` は Noctis と worker からの step report を受け取り、active task ownership と allowed `next` を検証し、step history を更新して次 action を決定します。

## Canonical Report Contract

step completion の source of truth は body tag ではなく transport metadata です。

- `taskId` は active step execution を識別する。
- `next` は次 step または terminal outcome を選ぶ。
- `message` は runtime が保存し次へ渡す canonical handoff text である。

Noctis step と worker step はこの completion contract を共有します。

## Shared Context vs Workflow Extension

prompt composition は 2 層で構成されます。

### Shared context

- `workspace-context`
- `tooling-context`
- `delegation-context`

### Workflow extension

- resolved facets
- completion contract
- task / previous response / output-path guidance / resolved prior-output references

routing は standalone な `<step>` block ではなく、runtime state と `taskId + next + message` に依存します。

## Live vs Debug Preview

`operation-debug` preview は有用ですが、live prompt delivery と byte-for-byte で一致するものではありません。

- live の `composeUserToNoctisPrompt()` は workflow extension があると `delegation-context` を suppress する
- debug preview は synthetic な mission/task/report input を使う
- preview における worker-report-to-Noctis activation は synthetic report data から再構成される

prompt 差分を debug するときは、preview output と live composer/runtime behavior の両方を確認してください。

## Source Of Truth

- authored workflow: `builtins/{lang}/operations/*.yaml`
- authored facet files: `builtins/{lang}/facets/**`
- authored inline step facets: `steps[].job.inline`, `steps[].instruction.inline`, `steps[].knowledge[].inline`, `steps[].policies[].inline`, `steps[].output_contracts.report[].format.inline`
- live execution state: `runtime/noctis-missions/{missionId}/mission.json`
- live output artifacts: `runtime/noctis-missions/{missionId}/outputs/{step}/{taskId}/{filename}`
- step execution identity: `OperationState.stepHistory[].taskId`
- report routing contract: `taskId + next + message`
- composition behavior: prompt builder / composer / runtime tests

## Planning Implication

workflow や prompt の変更を設計するときは、次を前提にしてください。

- dispatch は direct な agent chaining ではなく runtime-mediated である
- Noctis と worker の completion はどちらも `taskId + next + message` で解決される
- `message` の guidance は `next` に応じて変わるが、transport contract 自体は変わらない
- pause behavior は manual handoff flag ではなく explicit な Noctis-owned step で表現するべきである