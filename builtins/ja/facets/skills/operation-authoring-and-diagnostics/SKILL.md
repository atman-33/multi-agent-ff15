---
name: Operation Authoring And Diagnostics
description: operation YAML、project workflow authoring path、source-aware operationRef、facet source 解決、output contract、output placeholder、または workflow 関連テストを安全に変更するときに読むこと。
---

# Operation Authoring And Diagnostics

## 目的

この文書は、この repository における builtin / project authored operation と facet を安全に変更するための authoring rule と diagnostics 観点を整理した reference です。

operation YAML、facet file、output contract、placeholder 挙動、workflow 関連テストを変更するときに参照してください。

## Change Surfaces

- operation YAML の step ownership、rule、source object を変える変更
- facet file の内容や path を変える変更
- output contract や placeholder reference を変える変更
- source-aware catalog、operation selector、operation-debug filter に影響する変更
- prompt builder / composer / report routing に影響する変更
- workflow 関連テストを更新する変更

## Runtime-Relevant Authoring Rules

頻繁に確認する schema field は次のとおりです。

- `initial_step`
- `steps[]`
- `steps[].job`
- `steps[].instruction`
- `steps[].skills`
- `steps[].policies`
- `steps[].delegation.allowed_workers`
- `steps[].delegation.worker_job`
- `steps[].delegation.worker_instruction`
- `steps[].delegation.worker_skills`
- `steps[].delegation.worker_policies`
- `steps[].output_contracts.report[].format`
- `steps[].rules[]`

意味上の役割の違いは次のとおりです。

- `job`: その step の stable な role、responsibility、decision principle、prohibition
- `instruction`: その step 固有の execution procedure と reference
- `skills`: current step の実行に必要な background skill や reference material
- `policies`: current step が従う constraint や convention
- `delegation.*`: Noctis-owned step が child task を worker へ委任するときの許可対象と delegated worker prompt 素材
- `output_contracts.report[].format`: report artifact の format 定義

Canonical な source form は次のとおりです。

- `job.file` / `job.inline`
- `instruction.file` / `instruction.inline`
- `skills[].file`
- `policies[].file` / `policies[].inline`
- `output_contracts.report[].format.file` / `output_contracts.report[].format.inline`

Canonical な authored location と identity は次のとおりです。

- builtin workflow: `builtins/<lang>/operations/*.yaml`
- project workflow: `projects/<project-id>/operations/*.yaml`
- builtin facets: `builtins/<lang>/facets/**`
- project facets: `projects/<project-id>/facets/**`
- canonical identity: `operationRef` (`builtin:<lang>:<fileName>` または `project:<projectId>:<fileName>`)

次の制約は runtime failure に直結しやすいので、設計時に先に確認してください。

- `initial_step` は `noctis` step を指すべきである
- list facet は authored order を保持する
- `file` source は operation YAML path からの相対パスで解決される
- same-name workflow が builtin / project source にまたがる場合でも selector と debug preview では collapse されない
- message body からの auto activation は catalog match が unambiguous な場合だけ成功する
- runtime state、Noctis Team selector、operation-debug preview は plain operation name ではなく `operationRef` を canonical key として使う
- `output_contracts.report[].format` は output filename と downstream reference に整合している必要がある
- `steps[].delegation.allowed_workers` は authored 上の上限であり、runtime では mission の allowed worker set との積集合が effective set になる
- `rules` を省略できるのは、Noctis が同じ parent step に留まる autonomous delegation step だけである

`initial_movement`、`movements`、`max_movements`、`edit`、`handoff_mode`、`job_file`、`knowledge_files` などの legacy field は canonical ではありません。

prompt を変えるときは operation YAML と参照先 facet file の両方をセットで確認してください。
