---
name: operation-system-contract
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

## Hook Boundaries

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

Noctis (autonomous delegation)
  -> child-task transport (scripts/send_task.sh)
  -> Runtime registers delegated child task under the current Noctis step
  -> Hook 2: composeWorkerTaskPrompt() / augmentTaskPrompt()
  -> Worker (Ignis / Gladiolus / Prompto)

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

### Hook 1: User -> Noctis

`processUserMessage()` は explicit な `selectedOperation` ref または unique な catalog match から operation を開始し、active な Noctis self-step context を再構成します。message body から `[STEP:N]` token は解析しません。

### Hook 2: Runtime -> Worker

次 step が worker-owned の場合、runtime はそれを server-side で dispatch し、operation state から workflow-aware worker prompt を構成します。

Noctis-owned autonomous step が delegated child task を出す場合も Hook 2 を使いますが、この場合の worker prompt は parent step の facet ではなく `delegation.worker_*` facet から構成されます。

### Hook 3: Agent -> Runtime Report

`processReport()` は Noctis と worker からの step report を受け取り、active task ownership と allowed `next` を検証し、step history を更新して次 action を決定します。

delegated child task report も同じ transport を使いますが、`taskId` が delegated child record に対応している場合は parent step completion ではなく same-step return として処理されます。このとき allowed `next` は `COMPLETE` または `ABORT` に限定されます。

## Completion Contract

step completion の source of truth は body tag ではなく transport metadata です。

- `taskId` は active step execution を識別する。
- `next` は次 step または terminal outcome を選ぶ。
- `message` は runtime が保存し次へ渡す canonical handoff text である。

delegated child task では `taskId` が child execution を識別し、`message` は Noctis 向けの child result summary として扱われます。report 完了後も parent step の `currentStep` は維持されます。

`message` の guidance は `next` に応じて変わりますが、transport contract 自体は変わりません。

## Workflow Identity Contract

- mission state は human-readable な `operationName` と canonical な `operationRef` を保持する。
- operation load、dispatch、report processing、debug preview は `operationRef` から workflow file を解決する。
- source-aware ref の format は builtin なら `builtin:<lang>:<fileName>`、project なら `project:<projectId>:<fileName>` である。
- plain operation name だけを持つ state は migrate せず fail closed にする。

## Prompt Composition Boundaries

prompt composition は 2 層で構成されます。

### Shared context

- `workspace-context`
- `tooling-context`
- `delegation-context`

### Workflow extension

- resolved facets
- handoff summary from the most recent completed step when canonical `message` exists
- output-path guidance / resolved prior-output references
- delegation guidance for Noctis-owned autonomous steps
- completion contract

routing は standalone な `<step>` block ではなく、runtime state と `taskId + next + message` に依存します。

delegated child worker prompt は parent Noctis step の `job` / `instruction` をそのまま流用せず、`delegation.worker_*` から compose するのが canonical です。

workflow-aware prompt を変更するときは、shared context と workflow extension のどちらを触っているかを先に明確にしてください。

## Live vs Debug Preview

`operation-debug` preview は有用ですが、live prompt delivery と byte-for-byte で一致するものではありません。

- preview input は plain operation name ではなく `operationRef` を受け取る。
- operation-debug は live runtime と同じ source-aware catalog を使い、project filter をかけても builtin workflow は表示されたままである。
- live の `composeUserToNoctisPrompt()` は workflow extension があると `delegation-context` を suppress する
- debug preview は synthetic な mission/task/report input を使う
- preview における worker-report-to-Noctis activation は synthetic report data から再構成される

prompt 差分を debug するときは、preview output と live composer/runtime behavior の両方を確認してください。

## Red Flags

- Noctis が worker dispatch を message relay で代替している。
- completion 判定が body text の token に依存している。
- live prompt と debug preview の差を bug と決め打ちしている。
- handoff や pause を runtime contract ではなく ad hoc field で表現しようとしている。
- workflow extension の変更なのに shared context だけを見ている。
- delegated child task report で `currentStep` を advance してしまう。

## Minimal Source Of Truth

- authored workflow: `builtins/{lang}/operations/*.yaml` または `projects/{projectId}/operations/*.yaml`
- authored facet files: `builtins/{lang}/facets/**` または `projects/{projectId}/facets/**`
- workflow catalog / identity: `web/app/lib/operation-definition/operation-catalog.ts` と `operationRef`
- live execution state: `runtime/noctis-missions/{missionId}/mission.json`
- live output artifacts: `runtime/noctis-missions/{missionId}/outputs/{step}/{taskId}/{filename}`
- report routing contract: `taskId + next + message`
- composition behavior: prompt builder / composer / runtime tests

workflow や prompt の変更を設計するときは、まずこの source of truth のどこを変えるのかを明確にしてください。