# context ディレクトリ

プロジェクト固有のコンテキストを管理するディレクトリ。

## 目的
- プロジェクトごとの知識・決定事項を保存
- セッション間での情報共有
- 新規参加者（Comrades）への引継ぎ

## ファイル構成
```
context/
  README.md           ← このファイル
  {project_id}.md     ← プロジェクト固有のコンテキスト
```

## 使い方

### 新規プロジェクト追加時

**STEP 1: テンプレートをコピー**
```bash
cp templates/context_template.md context/{project_id}.md
```

**STEP 2: 内容を編集**
- `{project_id}`, `{name}`, `{path}` 等のプレースホルダーを実際の値に置換
- 各セクションに必要な情報を記入
- 不要なセクションは削除可（柔軟に運用）

**STEP 3: config/projects.yaml に登録**
```yaml
projects:
  - id: {project_id}
    name: "{name}"
    path: "{path}"
    priority: high
    status: active
```

### 作業開始時（Comradesの手順）

**コンテキスト読み込み順序**:
1. `memory/global_context.md` を読む（システム全体の設定）
2. `context/{project_id}.md` を読む（プロジェクト固有情報）
3. `queue/tasks/{worker_name}.yaml` を読む（自分のタスク）

### テンプレート構造

テンプレートは `templates/context_template.md` を参照してください。

主要セクション:
- **基本情報**: project_id, 正式名称, パス, Notion URL
- **What/Why/Who**: プロジェクトの概要・目的・体制
- **技術スタック**: 言語, フレームワーク, データベース
- **Constraints**: 制約（期限, 予算等）
- **Current State**: 進捗状況, 次のアクション, ブロッカー
- **Decisions**: 重要な決定事項（テーブル形式）
- **Notes**: 注意事項やメモ

## 更新ルール
- 重要な決定があったら即座に更新
- 最終更新日を必ず更新
- 不要になった情報は削除（シンプルに保つ）
- Decisionsテーブルには日付・理由を必ず記載
