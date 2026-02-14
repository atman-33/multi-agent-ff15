<div align="center">

# multi-agent-ff15

**OpenCode マルチエージェント統率システム**

*コマンド1つで、5体のAIエージェントが並列稼働*

[![GitHub Stars](https://img.shields.io/github/stars/atman-33/multi-agent-ff15?style=social)](https://github.com/atman-33/multi-agent-ff15)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![OpenCode](https://img.shields.io/badge/Built_for-OpenCode-blue)](https://opencode.ai)
[![Shell](https://img.shields.io/badge/Shell%2FBash-Core-green)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-Plugins-blue)]()

[English](README.md) | [日本語](README_ja.md)

</div>

<p align="center">
  <img src="assets/tmux_ff15_live_session.png" alt="multi-agent-ff15: 5エージェント並列実行 - 実際のセッション" width="800">
</p>

<p align="center"><i>Noctis（王）が3名のComrades（Ignis、Gladiolus、Prompto）に指示を出し、Lunafreya（神凪）が独立して稼働している実際のセッション画面</i></p>

---

コマンド1つで、**Noctis**（王）が**3名のComrades**（Ignis、Gladiolus、Prompto）に直接タスクを割り当て、並列で実行させます。一方、**Lunafreya**（神凪）は独立して稼働し、あなたと直接相談しながらNoctisに指示を出すこともできます。全エージェントはtmux内の独立したOpenCodeプロセスとして動作します。通信はYAMLファイルとtmux `send-keys`で行われるため、**エージェント間の調整にAPI呼び出しは不要**です。

> **フレームワーク**: [OpenCode](https://opencode.ai)をベースに構築

---

## なぜNoctis？

ほとんどのマルチエージェントフレームワークは、調整にAPIトークンを消費します。Noctisは違います。

| | OpenCode | LangGraph | CrewAI | **multi-agent-ff15** |
|---|---|---|---|---|
| **アーキテクチャ** | ツール付きエージェント | グラフベース状態マシン | ロールベースエージェント | tmux経由の封建的階層 |
| **並列性** | 限定的 | 並列ノード (v0.2+) | 限定的 | **5つの独立エージェント** |
| **調整コスト** | API呼び出し | API + インフラ (Postgres/Redis) | API + CrewAIプラットフォーム | **ゼロ** (YAML + tmux) |
| **可観測性** | ログのみ | LangSmith統合 | OpenTelemetry | **ライブtmuxペイン** + ダッシュボード |
| **スキル発見** | なし | なし | なし | **ボトムアップ自動提案** |
| **セットアップ** | CLIインストール | 重い (インフラ必要) | pipインストール | シェルスクリプト |

### 何が違うのか

**ゼロ調整オーバーヘッド** — エージェントはディスク上のYAMLファイルで通信します。API呼び出しは実際の作業のみで、オーケストレーションには使いません。5エージェント実行で、5エージェント分の作業のみ課金されます。

**完全な透明性** — 全エージェントが見えるtmuxペインで動作します。すべての指示、報告、決定はプレーンなYAMLファイルで、読み取り、差分確認、バージョン管理が可能です。ブラックボックスはありません。

**実戦で検証された階層** — Noctis → Comrades の指揮系統は設計段階で競合を防ぎます: 明確な所有権、エージェント専用ファイル、イベント駆動通信、ポーリングなし。Lunafre yaはこの階層外で独立して動作します。

**ボトムアップスキル発見** — Comradesがタスクを実行すると、再利用可能なパターンを自動的に識別し、スキル候補として提案します。あなたが恒久的なスキルに昇格させるかを決定します。

---

## 🚀 クイックスタート

### 🪟 Windowsユーザー（最も一般的）

<table>
<tr>
<td width="60">

**Step 1**

</td>
<td>

📥 **リポジトリをダウンロード**

[ZIPダウンロード](https://github.com/atman-33/multi-agent-ff15/archive/refs/heads/main.zip) して `C:\tools\multi-agent-ff15` に展開

*または git を使用:* `git clone https://github.com/atman-33/multi-agent-ff15.git C:\tools\multi-agent-ff15`

</td>
</tr>
<tr>
<td>

**Step 2**

</td>
<td>

🖱️ **`install.bat` を実行**

右クリック→「管理者として実行」（WSL2が未インストールの場合）。WSL2 + Ubuntu をセットアップします。

</td>
</tr>
<tr>
<td>

**Step 3**

</td>
<td>

🐧 **Ubuntu を開いて以下を実行**（初回のみ）

```bash
cd /mnt/c/tools/multi-agent-ff15
./first_setup.sh
```

</td>
</tr>
<tr>
<td>

**Step 4**

</td>
<td>

✅ **Stand by Me！**

```bash
./standby.sh
```

</td>
</tr>
</table>

#### 🔑 初回のみ: 認証

`first_setup.sh` 完了後、一度だけ以下を実行して認証：

```bash
# 1. PATHの反映
source ~/.bashrc

# 2. OpenCodeを起動
opencode
#    → 使用するAIモデルプロバイダーを選択
#    → 認証プロンプトに従う
#    → /exit で退出
```

認証情報は `~/.opencode/` に保存され、以降は不要。

#### 📅 毎日の起動（初回セットアップ後）

**Ubuntuターミナル**（WSL）を開いて実行：

```bash
cd /mnt/c/tools/multi-agent-ff15
./standby.sh
```

---

<details>
<summary>🐧 <b>Linux / Mac ユーザー</b>（クリックで展開）</summary>

### 初回セットアップ

```bash
# 1. リポジトリをクローン
git clone https://github.com/atman-33/multi-agent-ff15.git ~/multi-agent-ff15
cd ~/multi-agent-ff15

# 2. スクリプトに実行権限を付与
chmod +x *.sh

# 3. 初回セットアップを実行
./first_setup.sh
```

### 毎日の起動

```bash
cd ~/multi-agent-ff15
./standby.sh
```

</details>

---

<details>
<summary>❓ <b>WSL2とは？なぜ必要？</b>（クリックで展開）</summary>

### WSL2について

**WSL2（Windows Subsystem for Linux）** は、Windows内でLinuxを実行できる機能です。このシステムは `tmux`（Linuxツール）を使って複数のAIエージェントを管理するため、WindowsではWSL2が必要です。

### WSL2がまだない場合

問題ありません！`install.bat` を実行すると：
1. WSL2がインストールされているかチェック（なければ自動インストール）
2. Ubuntuがインストールされているかチェック（なければ自動インストール）
3. 次のステップ（`first_setup.sh` の実行方法）を案内

**クイックインストールコマンド**（PowerShellを管理者として実行）：
```powershell
wsl --install
```

その後、コンピュータを再起動して `install.bat` を再実行してください。

</details>

---

### ✅ セットアップ後の状態

**6体のAIエージェント**が自動起動します：

| エージェント | 役割 | 数 |
|-------------|------|-----|
| 👑 Noctis（ノクティス） | 王 - あなたの命令を受けてタスク管理 | 1 |
| 🌙 Lunafreya（ルナフレーナ） | 神凪 - 独立稼働＆Noctisへの指示 | 1 |
| ⚔️ Comrades（イグニス、グラディオラス、プロンプト） | ワーカー - 並列でタスク実行 | 3 |
| 🌸 Iris（イリス） | 守護者 - ダッシュボード監視＆Noctisへの通知 | 1 |

tmuxセッション: `ff15` - 統一セッション（6ペイン）

---

## 📖 基本的な使い方

### Step 1: ff15セッションに接続

`standby.sh` 実行後、全エージェントが自動的に指示書を読み込み、作業準備完了となります。

新しいターミナルを開いてff15セッションに接続：

```bash
ffa    # エイリアス（tmux attach-session -t ff15）
```

### Step 2: 最初の命令を出す

Noctisは既に初期化済み！そのまま命令を出せます：

```
JavaScriptフレームワーク上位5つを調査して比較表を作成せよ
```

Noctisは：
1. タスクをYAMLファイルに書き込む
2. Ignis（管理者）に通知
3. 即座にあなたに制御を返す（待つ必要なし！）

その間、IgnisはタスクをComradesに分配し、並列実行します。

### Step 3: 進捗を確認

エディタで `dashboard.md` を開いてリアルタイム状況を確認：

```markdown
## 進行中
| ワーカー | タスク | 状態 |
|----------|--------|------|
| Gladiolus | React調査 | 実行中 |
| Prompto | Vue調査 | 実行中 |
| Lunafreya | Angular調査 | 完了 |
```

---

## ✨ 主な特徴

### ⚡ 並列実行

1つの命令で最大3つの並列タスクを生成 — 数時間ではなく数分で結果が出る。

### 🔄 ノンブロッキングワークフロー

Noctisは即座に委譲して、あなたに制御を返します。長いタスクの完了を待つ必要はありません。

### 🧠 セッション間記憶（Memory MCP）

AIがあなたの好みをセッション横断で記憶します。一度伝えれば、永遠に記憶します。

### 📡 イベント駆動（ポーリングなし）

エージェントはYAMLファイルで通信し、tmux send-keysで互いを起こします。ポーリングループでAPIコールを浪費しません。

### 📸 スクリーンショット連携

`config/settings.yaml` でスクショフォルダを設定し、Noctisに「最新のスクショを見ろ」と伝えるだけ — AIが即座に読み取って分析します。

### 🛠️ ボトムアップスキル発見

Comradesが自動的に再利用可能なパターンを識別し、スキル候補として提案します。あなたが恒久的なスキルに昇格させるかを決定します。

---

## 🌍 実用例

### 例1: 調査タスク

```
あなた: 「AIコーディングアシスタント上位3つを調査して比較せよ」

実行される処理:
1. Noctisが各Comradeに割り当て:
   - Ignis: GitHub Copilotを調査
   - Gladiolus: Cursorを調査
   - Prompto: OpenCodeを調査
2. 3名が同時に調査
3. 結果がdashboard.mdに集約
```

### 例2: PoC準備

```
あなた: 「このNotionページのプロジェクトでPoC準備: [URL]」

実行される処理:
1. NoctisがMCP経由でNotionコンテンツを取得し各Comradeに割り当て
2. Ignis: 確認すべき項目をリスト化
3. Gladiolus: 技術的な実現可能性を調査
4. Prompto: PoC計画書を作成
5. 全結果がdashboard.mdに集約、会議の準備完了
```

---

## 📚 ドキュメント

詳細な情報は [docs](docs/) フォルダを参照してください：

- **[アーキテクチャ](docs/architecture.md)** - システム設計と通信プロトコル
- **[哲学](docs/philosophy.md)** - 核心原則と設計決定
- **[上級者向け使い方](docs/advanced-usage.md)** - スクリプトオプション、ワークフロー、カスタマイズ
- **[トラブルシューティング](docs/troubleshooting.md)** - よくある問題と解決策
- **[スマホからアクセス](docs/mobile-access.md)** - スマホから指揮
- **[MCPセットアップ](docs/mcp-setup.md)** - Model Context Protocol設定
- **[プロジェクト管理](docs/project-management.md)** - 複数プロジェクトの管理

---

## ⚙️ 設定

### 言語設定

`config/settings.yaml` を編集：

```yaml
language: ja   # 日本語のみ
language: en   # 日本語 + 英訳併記
```

### パーティ編成

```bash
./standby.sh                # 通常編成（デフォルト）
./standby.sh --fullpower    # 全力編成（プレミアムモデル）
./standby.sh --lite         # 軽量編成（予算モード）
```

---

## 📚 tmux クイックリファレンス

| コマンド | 説明 |
|---------|------|
| `ffa` (エイリアス) | ff15セッションに接続 |
| `Ctrl+B` の後 `0-5` | ペイン間を切り替え |
| `Ctrl+B` の後 `d` | デタッチ（実行継続） |
| `tmux kill-session -t ff15` | ff15セッションを停止 |

マウス操作がデフォルトで有効: スクロール、クリックでペイン切替、境界ドラッグでリサイズ。

---

## 貢献

IssueとPull Requestを歓迎します。

- **バグ報告**: 再現手順を含めてIssueを作成
- **機能アイデア**: まずDiscussionで提案
- **スキル**: スキルは個人的な設計のため、このリポジトリには含まれません

---

## 🙏 クレジット

このプロジェクトは[@yohey-w](https://github.com/yohey-w)氏の[multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun)をベースにしています。オリジナルの作品と、このFF15をテーマとしたマルチエージェントシステムの基盤を提供していただいたことに深く感謝します。

---

## 📄 ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照。

---

<div align="center">

**AIの軍勢を統率せよ。より速く構築せよ。**

</div>
