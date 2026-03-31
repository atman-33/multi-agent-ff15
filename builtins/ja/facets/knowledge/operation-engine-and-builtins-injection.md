# Operation の仕組みと builtins 注入の実装メモ

## この文書の目的

この文書は、[docs/reports/operations-system-mvp-design-v3-20260327.md] の設計意図と、`web/app/lib/operation-engine/` および関連 API ルートの実装を照合し、2026-03-27 時点での **Operation の実際の動作** と **builtins ファイルが各エージェントへ注入される流れ** を整理したものです。

結論から言うと、Operation は現在、以下の 3 つのフックで動きます。

1. User -> Noctis: オペレーション開始、Noctis self-movement の継続判定、進行中コンテキストの注入
2. Noctis -> Worker: movement に応じた Job / Knowledge / Instruction / Policy / Output Contract の注入
3. Worker -> Noctis: レポート中の `[STEP:N]` をもとに状態遷移し、次 movement のガイダンスを Noctis に返す

---

## 1. Operation の実体

Operation は、`builtins/{language}/operations/*.yaml` に置かれる YAML 定義です。

実装上は `loadOperationByName()` が Operation を読み込みます。

- 第 1 優先: `builtins/{language}/operations/{operationName}.yaml`
- フォールバック: `builtins/en/operations/{operationName}.yaml`

つまり、アプリの言語設定が `ja` なら、まず `builtins/ja/operations/` を見て、なければ `builtins/en/operations/` を見ます。

利用可能な Operation 一覧は `listAvailableOperations()` が列挙し、UI の `/api/noctis/operations` から Noctis Team 画面へ渡されます。

---

## 2. Operation State はどこに保存されるか

Operation の進行状態は `mission.operationState` としてミッションに保持されます。

主な状態は次の通りです。

- `operationName`: 起動中の Operation 名
- `currentMovement`: 現在の movement
- `iteration`: movement dispatch 回数
- `status`: `running` / `waiting_for_report` / `complete` / `aborted`
- `reportDir`: 既定では `docs/reports`
- `previousResponse`: 直前 movement の要約
- `movementHistory`: dispatch と完了の履歴
- `deviations`: 想定 agent からの逸脱記録

永続化は `saveOperationState()` が行い、最終的には `runtime/noctis-missions/{missionId}.json` に書き戻されます。

---

## 3. Hook 1: User -> Noctis

### 3.1 起動ポイント

Hook 1 は次の 2 つの API ルートから呼ばれます。

- `web/app/routes/api.noctis.mission.start.ts`
- `web/app/routes/api.noctis.mission.continue.ts`

どちらも Noctis へ `promptAsync()` する直前に `processUserMessage()` を呼びます。

### 3.2 新規ミッション時の動作

新規ミッションでは `processUserMessage()` が次の順序で処理します。

1. 既存 `operationState` が無いことを確認
2. `selectedOperation` があればそれを優先
3. 無ければ、User のメッセージ本文から Operation 名を検出
4. Operation YAML をロード
5. `createOperationState()` で状態を初期化
6. 初期 movement を取得
7. movement に必要な builtins ファセットを解決
8. `buildActivationInstruction()` で Noctis 向け起動コンテキストを生成
9. その movement を `recordMovementDispatched()` で履歴登録
10. 生成した追加コンテキストを、User の元メッセージより前に差し込んで Noctis へ送る

このとき Noctis に注入されるのは、`[OPERATION_ACTIVATED]` で始まる起動文です。

内容には少なくとも以下が含まれます。

- operation 名
- description
- current_movement
- your_role
- operation context
- knowledge
- instruction
- output contract
- policy
- status output rules

### 3.3 継続時の動作

継続 API では、まず OpenCode セッションから直前の Noctis 応答を取得し、その後 `processUserMessage()` に渡します。

もし現在 movement の担当が `noctis` で、直前応答に `[STEP:N]` が含まれていれば、`evaluateRules()` が **最後に現れたタグ** を使って次 movement を決定します。

遷移が発生すると、`recordMovementCompleted()` により以下が更新されます。

- 直前 movement の完了状態
- マッチした rule index
- rule condition
- next movement
- summary
- `previousResponse`

そのうえで、

- 次が `COMPLETE` / `ABORT` なら終端ガイダンス
- それ以外なら次 movement への遷移ガイダンス

が Noctis への追加コンテキストとして注入されます。

### 3.4 進行中の通常注入

継続時に遷移が発生しない場合でも、`buildOperationContextSummary()` が生成する `[OPERATION_CONTEXT]` が Noctis へ注入されます。

ここには次が含まれます。

- 現在 movement
- 進行番号
- iteration / maxMovements
- 最後に完了した movement
- 次に期待される agent

---

## 4. Hook 2: Noctis -> Worker

### 4.1 起動ポイント

Hook 2 は `web/app/lib/task-dispatch.server.ts` の `dispatchTaskToWorker()` で動きます。

流れは次の通りです。

1. `buildCompactTaskPrompt()` で、Noctis が Worker に渡す元タスク文を作る
2. ミッションに `operationState` があれば `augmentTaskPrompt()` を呼ぶ
3. 現在 movement に対応する builtins ファセットを解決する
4. `buildAugmentedInstruction()` で Worker 向け最終プロンプトを合成する
5. その movement を `recordMovementDispatched()` で履歴登録する

### 4.2 Worker に注入される順序

`buildAugmentedInstruction()` は、次の順でセクションを組み立てます。

1. `Job`
2. `Policy Summary`
3. `Operation Context`
4. `Task`
5. `Previous Movement Output`
6. `Knowledge`
7. `Instruction`
8. `Output Contract`
9. `Policy`
10. `Status Output Rules`

この順序は、設計レポート v3 の意図とほぼ一致しています。

特に重要なのは次の 3 点です。

- `Policy Summary` は full policy の前に置かれ、`REJECT` 行だけを上部に再掲する
- `Knowledge` は長すぎる場合 2000 文字で切られる
- `Previous Movement Output` は `pass_previous_response` が true のときだけ入る

### 4.3 Worker に送られるプロンプトは 2 層ある

Worker に送られる `parts` は、Operation 専用の本文だけではありません。実際には次の 2 つが送られます。

1. `buildInjectedPromptContext()` が作る `<internal-context>`
2. OperationEngine が作る augmented instruction

`<internal-context>` には builtins ではなく、システム側の実行コンテキストが入ります。

具体的には次が含まれます。

- `mission_id`
- `session_id`
- `allowed_workers`
- active projects の一覧
- 各 project の `instruction_files`
- Serena activation のヒント
- OpenSpec 実行ルートのヒント

つまり、Worker は

- システム共通の `<internal-context>`
- Operation 固有の builtins ファセット群

の両方を受け取って動きます。

---

## 5. Hook 3: Worker -> Noctis

### 5.1 起動ポイント

Hook 3 は `web/app/lib/team-message.server.ts` の `deliverMissionMessage()` で動きます。

条件は次の通りです。

- メッセージ種別が `report`
- 宛先が `noctis`
- `operationState` が `running` または `waiting_for_report`

### 5.2 レポート処理の流れ

条件に合うと `processReport()` が呼ばれます。

1. 現在 movement を取得
2. `reportBody` と `reportDetails` を連結
3. `evaluateRules()` で最後の `[STEP:N]` を評価
4. `recordMovementCompleted()` で状態遷移
5. 次 movement 向け、または終端向けのガイダンスを生成
6. そのガイダンスを、Worker レポート本文の末尾に追記して Noctis へ送る

ここで Noctis は、単なるレポート本文だけでなく、OperationEngine が付与した「次に何をすべきか」のガイダンスも受け取ります。

---

## 6. builtins ファイルはどう解決されるか

### 6.1 Operation YAML の解決

Operation 自体は以下の 2 層解決です。

1. `builtins/{language}/operations/{name}.yaml`
2. `builtins/en/operations/{name}.yaml`

### 6.2 Facet Markdown の解決

movement が参照する各ファセットは `resolveMovementFacets()` から `loadFacetFile()` を通じて解決されます。

解決順序は次の通りです。

1. `builtins/{language}/facets/{type}/{key}.md`
2. `builtins/en/facets/{type}/{key}.md`

対象 type は次の 5 種類です。

- `jobs`
- `instructions`
- `knowledge`
- `policies`
- `output-contracts`

つまり、Operation YAML が movement に `job: reviewer` と書いていれば、実際には `builtins/ja/facets/jobs/reviewer.md` のようなファイルを読みます。

### 6.3 注入先の違い

builtins は、相手エージェントによって注入形が少し異なります。

- Noctis の self-movement 起動時: `buildActivationInstruction()` で注入
- Worker task 発行時: `buildAugmentedInstruction()` で注入
- Noctis 継続時の通常メッセージ: movement ファセット全文ではなく、`[OPERATION_CONTEXT]` の要約を注入

---

## 7. 実装上の重要な注意点

設計書 v3 とコードは大筋で整合していますが、2026-03-27 時点では次の差分があります。

### 7.1 Operation YAML のスキーマ差分

現行の `builtins/ja/operations/openspec-dev.yaml` は、movement 内で次のような **path 指定形式** を使っています。

- `job_file`
- `instruction_file`
- `knowledge_files`
- `policy_files`
- `format_file`

しかしローダー `normalizeMovement()` が実際に読むのは次の **key 指定形式** です。

- `job`
- `instruction`
- `knowledge`
- `policy`
- `output_contracts.report[].format`

この差分を変換する処理は、現行コード上では見当たりません。

そのため、**今チェックインされている Operation YAML のままでは、facet 注入が期待通りに解決されない可能性があります**。

言い換えると、実装側の注入メカニズムは存在しますが、YAML 側が現行ローダーの期待スキーマへ揃っていることが前提です。

### 7.2 Output Contract の出力先は固定的

設計書 v3 では output-contract 側の指定パスを優先し、無ければ `docs/reports/` へ出す方針でした。

一方、現行コードでは `createOperationState()` が `reportDir = docs/reports` を初期値にし、`buildOutputContractSection()` は常に次の形で出力先を案内します。

`docs/reports/{report.name}`

つまり、**現時点では report ごとの任意パス指定は実装されていません**。

### 7.3 `resolveOperationFacetPath()` は現状ほぼ使われていない

`operation-loader.ts` には、Operation YAML から相対パスの facet を絶対パスへ解決する `resolveOperationFacetPath()` があります。

ただし、現行の注入処理は `loadFacetFile()` による builtins キー解決を使っており、この関数が実運用の主経路にはなっていません。

これは、設計の途中で「YAML から相対パスで直接読む方式」から「builtins キー名で解決する方式」へ寄った名残と考えられます。

---

## 8. まとめ

現行実装の OperationEngine は、設計レポート v3 の狙い通り、次の 3 フックでオペレーションを進行させます。

1. User -> Noctis で起動と self-movement 継続判定を行う
2. Noctis -> Worker で builtins ファセットを組み立てて task prompt を強化する
3. Worker -> Noctis で `[STEP:N]` を評価し、次 movement ガイダンスを返す

builtins の注入経路は明確で、language ごとの builtins を優先し、なければ English builtins にフォールバックします。

ただし、現時点では次の注意が必要です。

- Operation YAML の checked-in 形式とローダー期待形式に差がある
- Output Contract の出力先カスタム指定は未実装で、既定は `docs/reports`

したがって、「OperationEngine の枠組み自体は実装済みだが、Operation YAML の記述方式は現行ローダーへ合わせて整える必要がある」が、現在の正確な整理です。