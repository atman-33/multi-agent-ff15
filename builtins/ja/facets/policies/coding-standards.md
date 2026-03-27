# Coding Standards — Policy

## 目的

implementation movement と review movement のための品質基準および判断ルール。
これらのルールは、何が受け入れ可能か（APPROVE）、何を修正しなければならないか（REJECT）を定義する。

---

## REJECT 条件（Blocking）

| ID | Rule | REJECT When |
|----|------|-------------|
| CS-001 | Type Safety | `any` type を正当化なく使用している、またはコメントなしで型アサーションを使っている |
| CS-002 | Error Handling | エラーを黙って握りつぶしている、空の catch block がある、またはエラー伝播が不足している |
| CS-003 | Test Coverage | 新しいコードパスに対応するテストがない |
| CS-004 | Dead Code | コメントアウトしたコードを残している、未使用 import がある、到達不能コードがある |
| CS-005 | Scope Creep | 定義されたタスク範囲外の変更を、明示的な正当化なしで含めている |
| CS-006 | Breaking Change | migration path なしで Public API contract を変更している |
| CS-007 | Security | ユーザー入力を検証していない、SQL/command injection の危険がある、秘密情報をハードコードしている |
| CS-008 | Incomplete Implementation | 本番経路に TODO/FIXME stub が残っている、placeholder の戻り値がある |
| CS-009 | Convention Violation | ファイル命名、ディレクトリ構造、またはパターンが project の規約から逸脱している |
| CS-010 | Failing Tests | 変更で既存テストを壊している、または新規テストが実際には何も検証していない |

## APPROVE 条件

| ID | Rule | APPROVE When |
|----|------|--------------|
| AP-001 | Spec Compliance | 実装で spec の全要件に対応している |
| AP-002 | Test Pass | すべてのテストが通る（既存 + 新規） |
| AP-003 | Type Check | TypeScript error がない |
| AP-004 | Lint Clean | 新しい lint warning がない |
| AP-005 | Minimal Diff | 変更がタスクに集中しており、無関係な修正がない |

## 判断ガイドライン

- ひとつでも REJECT finding があれば、全体 verdict は "Needs Fix" になる
- non-blocking finding が複数あっても、REJECT にはならない
- 判断が微妙な場合は「runtime failure を引き起こすか」を基準にする。引き起こさないなら non-blocking
- 抽象的な表現より具体性を優先する。例: "Missing tests" より "CS-003: `handleSubmit()` at `form.tsx:42` has no test"
