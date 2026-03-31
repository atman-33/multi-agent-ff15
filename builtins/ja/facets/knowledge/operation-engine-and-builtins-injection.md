# Operation の仕組みと builtins 注入の実装メモ

## この文書の目的

この文書は、Operation runtime と prompt composition engine が、step ベースの operation schema をどのように処理し、どの builtins を各エージェントへ注入するかを整理した実装メモです。

現在の Operation は、次の 3 つのフックで進行します。

1. User -> Noctis: operation の開始、Noctis self-step の継続判定、進行中コンテキストの注入
2. Noctis -> Worker: current step に応じた Job / Knowledge / Instruction / Policy / Output Contract の注入
3. Worker -> Runtime: `ruleIndex` を評価し、manual なら Noctis guidance、auto なら次 worker への handoff を決める

---

## 1. Operation YAML schema

Operation は `builtins/{language}/operations/*.yaml` に置かれる YAML 定義です。

現在の正規 schema は次のとおりです。

- `initial_step`: 最初に実行する step 名
- `handoff_mode`: operation-level default (`manual` / `auto`)
- `steps`: step 定義の配列
- step 内の facet 参照:
	- `handoff_mode`
	- `job_file`
	- `instruction_file`
	- `knowledge_files`
	- `policy_files`
	- `output_contracts.report[].format_file`

次の legacy field は廃止されており、ローダーは受け付けません。

- `initial_movement`
- `movements`
- `max_movements`
- step 内の `edit`

`loadOperationByName()` は、まず `builtins/{language}/operations/{operationName}.yaml` を読み、見つからなければ `builtins/en/operations/{operationName}.yaml` へフォールバックします。

---

## 2. Operation State

Operation の進行状態は `mission.operationState` として保持されます。

主な状態は次のとおりです。

- `operationName`: 起動中の operation 名
- `currentStep`: 現在の step
- `iteration`: step dispatch 回数
- `status`: `running` / `waiting_for_report` / `complete` / `aborted`
- `reportDir`: 既定では `docs/reports`
- `previousResponse`: 直前 step の要約
- `stepHistory`: dispatch と完了の履歴
- `deviations`: 想定 agent からの逸脱記録

`handoff_mode` の effective value は `step.handoff_mode ?? operation.handoff_mode` で決まります。未指定の default は `manual` です。

永続化は `saveOperationState()` が行い、`runtime/noctis-missions/{missionId}.json` に書き戻されます。`runtime/` は generated state とみなし、breaking rename 後に stale state が残ることは前提にしません。

---

## 3. Hook 1: User -> Noctis

`processUserMessage()` は operation 起動と Noctis self-step の継続判定を担当します。

### 新規ミッション

新規ミッションでは次の順で処理します。

1. 既存 `operationState` がないことを確認する
2. `selectedOperation` または User メッセージから operation 名を決定する
3. Operation YAML をロードする
4. `createOperationState()` で state を初期化する
5. `initial_step` を取得する
6. `resolveStepFacets()` で current step の facet を解決する
7. `buildActivationInstruction()` で Noctis 向けの workflow extension を組み立てる
8. `recordStepDispatched()` で履歴登録する

Noctis に注入される step コンテキストには少なくとも次が含まれます。

- operation 名
- `current_step`
- role
- knowledge
- instruction
- output contract
- policy
- status output rules

### 継続メッセージ

継続時は、現在の step 担当が `noctis` で、直前応答に `[STEP:N]` が含まれる場合に `evaluateRules()` を実行します。
この tag fallback は Noctis self-step に限定されます。

遷移が発生すると `recordStepCompleted()` により以下が更新されます。

- 直前 step の完了状態
- マッチした rule index
- rule condition
- `nextStep`
- summary
- `previousResponse`

遷移後は次のどちらかが Noctis へ注入されます。

- `COMPLETE` / `ABORT` なら終端ガイダンス
- それ以外なら次 step への遷移ガイダンス

遷移が発生しない場合は `buildOperationContextSummary()` が current step の要約だけを注入します。

---

## 4. Hook 2: Noctis -> Worker

`augmentTaskPrompt()` は worker 向け prompt を step ベースで拡張します。

処理の流れは次のとおりです。

1. `operationState` から current step を取得する
2. `resolveStepFacets()` で step の facet を解決する
3. `buildAugmentedInstruction()` で worker 向け prompt を合成する
4. `recordStepDispatched()` で履歴登録する

`buildAugmentedInstruction()` が組み立てる section 順序は次のとおりです。

1. `Job`
2. `Step`
3. `Task`
4. `Previous Step Output`
5. `Knowledge`
6. `Instruction`
7. `Output Contract`
8. `Policy`
9. `Status Output Rules`

worker step の `Status Output Rules` は `[STEP:N]` ではなく、allowed outcome index と `send_report.sh --rule-index <index>` 契約を案内します。
`Previous Step Output` は `pass_previous_response` が true のときだけ入ります。`output_contracts` の構造は維持され、prompt builder は `report.name` と `output-path` も含めて案内します。

---

## 5. Hook 3: Worker -> Runtime

`processReport()` は Worker report を受け取り、現在の step の rules を評価します。

処理の流れは次のとおりです。

1. current step を取得する
2. progress report (`status=running`) なら遷移を確定せず、そのまま Noctis 共有へ進む
3. final report なら transport の `ruleIndex` を現在 step の rules 範囲で検証する
4. `evaluateRuleIndex()` で遷移先 rule を決定する
5. `recordStepCompleted()` で state を更新する
6. effective `handoff_mode` を判定する
7. auto handoff 可能なら次 worker を server-side dispatch する
8. manual/terminal の場合だけ Noctis 向け guidance を生成する

生成される YAML guidance は step 用語に統一されています。

- `completed_step`
- `matched_rule_index`
- `matched_rule_condition`
- `next_step`
- `effective_handoff_mode`
- `next_action`
- `final_step`
- `step-transition`

---

## 6. Facet の解決方法

現在の facet 解決は builtins key 名ではなく、operation YAML からの相対パス解決です。

`resolveStepFacets()` は `resolveOperationFacetPath()` を通じて、operation file の場所を基準に各 Markdown を読み込みます。

つまり、step が次のように書かれていれば、実際にその相対パスの Markdown を読みます。

- `job_file: ../facets/jobs/planner.md`
- `instruction_file: ../facets/instructions/openspec-planning.md`
- `knowledge_files:`
- `policy_files:`
- `output_contracts.report[].format_file`

この path-based resolution が current implementation の正規動作です。

---

## 7. 実装上の注意点

- operation schema は breaking change として `step` 用語に統一されている
- `max_movements` は削除済みで、state にも保持しない
- step 内の `edit` は削除済みで、ローダーは reject する
- `output_contracts` は従来どおり report 配列構造を維持する
- worker report routing は本文 tag ではなく `ruleIndex` が単一ソースである
- `handoff_mode: auto` でも次 step が `noctis` / terminal / User 確認待ちなら自動 dispatch しない
- generated runtime state は migration 対象ではなく、必要なら再生成する

---

## 8. まとめ

現在の Operation runtime は、step ベースの schema を唯一の正規形として扱い、Noctis と Worker の間で必要な facet を prompt composition engine を通じて注入します。

重要なのは次の 3 点です。

1. authored schema と runtime state の vocabulary が `step` に統一されていること
2. facet 解決が operation YAML からの相対パスで行われること
3. `output_contracts` だけは従来構造を維持していること

この前提を守れば、Operation は User -> Noctis -> Worker -> Runtime を基本経路とし、manual path のときだけ Noctis が次 action を受け取る構造で一貫して進行します。