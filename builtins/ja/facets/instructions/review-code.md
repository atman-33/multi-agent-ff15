# Review Code — 手順指示

## 手順

1. **前提コンテキストを理解する**
   - planning step の spec plan を読む
   - 前の steps の実装レポートとリファクタリングレポートを読む
   - 何が依頼され、何が実際に提供されたかを把握する

2. **要件を検証する**
   - spec plan の各要件を実装と照合する
   - 各要件を fulfilled / partially fulfilled / not addressed のいずれかで判定する

3. **コード品質をレビューする**
   - coding policy と standards への準拠を確認する
   - 型安全性を検証する（`any` の逃げ道がないか、適切なエラーハンドリングがあるか）
   - セキュリティ上の懸念を確認する（injection、アクセス制御、データ検証）
   - 新規または変更されたコードのテストカバレッジを確認する
   - 既存テストが引き続き通ることを確認する

4. **レビュー報告を作成する**
   - code-review output-contract の形式を使う
   - 各 finding には以下を必ず含める:
     - `finding_id`: 一意な識別子（例: `REV-001`）
     - `severity`: blocking / non-blocking
     - `location`: file:line 形式の参照
     - `description`: 問題の内容
     - `evidence`: なぜ問題なのか（必要なら policy rule を参照）
   - 全体 verdict は approved / needs_fix / critical_issues のいずれかで示す

5. **ステータスタグを出力する**
   - approved（blocking finding がない）なら approved のステータスタグ
   - blocking finding があるなら needs_fix のステータスタグ
   - 重大または根本的な問題があるなら abort のステータスタグ

## 重要ルール

- コードを変更してはならない。レビューのみを行う。
- すべての blocking finding には evidence が必要（file:line と policy 参照）。
- non-blocking finding は承認を妨げない。
- すべての要件が満たされ、blocking な問題がないなら approve する。
