<div align="center">

# multi-agent-ff15

**OpenCode マルチエージェント統率システム**

*コマンド1つで、5体のAIエージェントが並列稼働*

[![GitHub Stars](https://img.shields.io/github/stars/atman-33/multi-agent-ff15?style=social)](https://github.com/atman-33/multi-agent-ff15)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![OpenCode](https://img.shields.io/badge/Built_for-OpenCode-blue)](https://opencode.ai)
[![Shell](https://img.shields.io/badge/Shell%2FBash-100%25-green)]()

[English](README.md) | [日本語](README_ja.md)

</div>

<p align="center">
  <img src="assets/tmux_ff15_live_session.png" alt="multi-agent-ff15: 5エージェント並列実行 - 実際のセッション" width="800">
</p>

<p align="center"><i>Noctis（王）が3名のComrades（Ignis、Gladiolus、Prompto）に指示を出し、Lunafreya（神凪）が独立して稼働している実際のセッション画面</i></p>

---

コマンド1つで、**Noctis**（王）が**3名のComrades**（Ignis、Gladiolus、Prompto）に直接タスクを割り当て、並列で実行させます。一方、**Lunafreya**（神凪）は独立して稼働し、あなたと直接相談しながらNoctisに指示を出すこともできます。全エージェントはtmux内の独立したOpenCodeプロセスとして動作します。通信はYAMLファイルとtmux `send-keys`で行われるため、**エージェント間の調整にAPI呼び出しは不要**です。

---

## 哲学

> 「タスクを無思考で実行するな。常に『最速 × 最高の成果』を念頭に置け。」

Noctisシステムは5つの核心原則の上に構築されています:

| 原則 | 説明 |
|------|------|
| **自律的フォーメーション** | テンプレートではなく、複雑さに応じてタスク編成を設計 |
| **並列化** | サブエージェントを活用して単一障害点を防ぐ |
| **リサーチファースト** | 決定前にエビデンスを探す |
| **継続的学習** | モデルの知識カットオフのみに依存しない |
| **三角測量** | 統合された承認を伴う多角的リサーチ |

これらの原則は詳細に文書化されています: **[docs/philosophy.md](docs/philosophy.md)**

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

---

## ボトムアップスキル発見

他のフレームワークにはない機能です。

Comradesがタスクを実行すると、**再利用可能なパターンを自動的に識別**し、スキル候補として提案します。Ignisが`dashboard.md`でこれらの提案を集約し、あなた（主君）が恒久的なスキルに昇格させるかを決定します。

```
Comradeがタスク完了
    ↓
気づく: "このパターン、3つのプロジェクトで3回やった"
    ↓
YAMLで報告:  skill_candidate:
                found: true
                name: "api-endpoint-scaffold"
                reason: "3つのプロジェクトで同じRESTスキャフォールドパターンを使用"
    ↓
dashboard.mdに表示 → あなたが承認 → skills/にスキル作成
    ↓
任意のエージェントが /api-endpoint-scaffold を実行可能に
```

スキルは実際の作業から有機的に成長します — 事前定義されたテンプレートライブラリからではありません。あなたのスキルセットは**あなたの**ワークフローの反映になります。

> **フレームワーク**: [OpenCode](https://opencode.ai)をベースに構築

---

## アーキテクチャ

```
      あなた（Crystal / 上様）
            │
            ├──────────────────────────┐
            ▼                          ▼
     ┌──────────┐            ┌────────────┐
     │ NOCTIS   │ ← 王       │ LUNAFREYA  │ ← 神凪（独立稼働）
     │  (王)    │ (リーダー + │  (神凪)     │   ユーザーと直接対話
     │          │  タスク管理) │            │   Noctisに指示可能
     └────┬─────┘            └────────────┘
          │ YAML + send-keys
          ▼
     ┌────────────┬──────────┬────────────┐
     │   IGNIS    │GLADIOLUS │  PROMPTO   │ ← Comrades（3名）
     │  (軍師)    │  (盾)    │   (銃)     │
     └────────────┴──────────┴────────────┘

     セッション: ff15（統一セッション - 5ペイン）
     ペイン: 0=Noctis, 1=Lunafreya, 2=Ignis, 3=Gladiolus, 4=Prompto
```

**通信プロトコル:**
- **下向き**（命令）: YAML書き込み → `tmux send-keys`でターゲット起動
- **上向き**（報告）: YAMLのみ書き込み（入力を中断しないようsend-keysなし）
- **ポーリング**: 禁止。イベント駆動のみ。API料金は予測可能なまま。

**コンテキスト永続化（4層）:**

| レイヤー | 内容 | 永続性 |
|---------|------|--------|
| Memory MCP | 好み、ルール、プロジェクト横断知識 | すべて |
| プロジェクトファイル | `config/projects.yaml`, `context/*.md` | すべて |
| YAMLキュー | タスク、報告（信頼できる情報源） | すべて |
| セッション | `AGENTS.md`, instructions | `/new`でリセット |

`/new`後、エージェントはMemory MCP + タスクYAMLを読んで**約2,000トークン**で復旧します。高価な再プロンプトなし。

---

## パーティ編成

タスクに応じて異なる**編成**でエージェントをデプロイできます:

| 編成 | Comrades (Ignis/Gladiolus/Prompto) | リーダー (Noctis/Lunafreya) | 最適用途 |
|------|-------------------------------------|----------------------------|----------|
| **通常** (デフォルト) | Haiku 4.5 / Gemini 3 Flash | Sonnet 4.5 / Grok Fast | 日常タスク — コスト効率重視 |
| **全力** (`--fullpower`) | GPT-5.2 / Sonnet 4.5 / Gemini 3 Pro | Opus 4.6 / Grok Fast | 重要タスク — 最大能力 |
| **軽量** (`--lite`) | Haiku / Grok Fast | Haiku 4.5 | 予算重視の開発 |

```bash
./standby.sh                # 通常編成（デフォルト）
./standby.sh --fullpower    # 全力編成（プレミアムモデル）
./standby.sh --lite         # 軽量編成（予算モード）
```

Noctisは必要に応じて個別のComradesのモデルをセッション中に切り替えることもできます。

---

## 🧭 核心思想（Philosophy）

> **「脳死で依頼をこなすな。最速×最高のアウトプットを常に念頭に置け。」**

Noctisシステムは5つの核心原則に基づいて設計されている：

| 原則 | 説明 |
|------|------|
| **自律フォーメーション設計** | テンプレートではなく、タスクの複雑さに応じてフォーメーションを設計 |
| **並列化** | サブエージェントを活用し、単一障害点を作らない |
| **リサーチファースト** | 判断の前にエビデンスを探す |
| **継続的学習** | モデルの知識カットオフだけに頼らない |
| **三角測量** | 複数視点からのリサーチと統合的オーソライズ |

詳細: **[docs/philosophy.md](docs/philosophy.md)**

---

## これは何？

## 🚀 クイックスタート

### 🪟 Windowsユーザー（最も一般的）

<table>
<tr>
<td width="60">

**Step 1**

</td>
<td>

📥 **リポジトリをダウンロード**

[ZIPダウンロード](https://github.com/yohey-w/multi-agent-ff15/archive/refs/heads/main.zip) して `C:\tools\multi-agent-ff15` に展開

*または git を使用:* `git clone https://github.com/yohey-w/multi-agent-ff15.git C:\tools\multi-agent-ff15`

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

### 📱 スマホからアクセス（どこからでも指揮）

ベッドから、カフェから、トイレから。スマホでAI部下を操作できる。

**必要なもの（全部無料）：**

| 名前 | 一言で言うと | 役割 |
|------|------------|------|
| [Tailscale](https://tailscale.com/) | 外から自宅に届く道 | カフェからでもトイレからでも自宅PCに繋がる |
| SSH | その道を歩く足 | Tailscaleの道を通って自宅PCにログインする |
| [Termux](https://termux.dev/) | スマホの黒い画面 | SSHを使うために必要。スマホに入れるだけ |

**セットアップ：**

1. WSLとスマホの両方にTailscaleをインストール
2. WSL側（Auth key方式 — ブラウザ不要）：
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscaled &
   sudo tailscale up --authkey tskey-auth-XXXXXXXXXXXX
   sudo service ssh start
   ```
3. スマホのTermuxから：
   ```sh
   pkg update && pkg install openssh
   ssh あなたのユーザー名@あなたのTailscale IP
   ffa    # ff15セッションに接続
   ```

**切り方：** Termuxのウィンドウをスワイプで閉じるだけ。tmuxセッションは生き残る。AI部下は黙々と作業を続けている。

**音声入力：** スマホの音声入力で喋れば、Noctisが自然言語を理解して全員に指示を出す。音声認識の誤字も文脈で解釈してくれる。

**tmuxペイン切替：** `Ctrl+B` の後に数字（0-4）でペイン切替。0=Noctis, 1=Lunafreya, 2-4=Comrades。

---

<details>
<summary>🐧 <b>Linux / Mac ユーザー</b>（クリックで展開）</summary>

### 初回セットアップ

```bash
# 1. リポジトリをクローン
git clone https://github.com/yohey-w/multi-agent-ff15.git ~/multi-agent-ff15
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

<details>
<summary>📋 <b>スクリプトリファレンス</b>（クリックで展開）</summary>

| スクリプト | 用途 | 実行タイミング |
|-----------|------|---------------|
| `install.bat` | Windows: WSL2 + Ubuntu のセットアップ | 初回のみ |
| `first_setup.sh` | tmux、依存関係、OpenCode CLI のインストール + Memory MCP設定 | 初回のみ |
| `standby.sh` | tmuxセッション作成 + OpenCode起動 + 指示書読み込み | 毎日 |

### `install.bat` が自動で行うこと：
- ✅ WSL2がインストールされているかチェック（未インストールなら案内）
- ✅ Ubuntuがインストールされているかチェック（未インストールなら案内）
- ✅ 次のステップ（`first_setup.sh` の実行方法）を案内

### `standby.sh` が行うこと：
- ✅ tmuxセッションを作成（noctis + kingsglaive）
- ✅ 全エージェントでOpenCodeを起動
- ✅ 各エージェントに指示書を自動読み込み
- ✅ キューファイルをリセットして新しい状態に

**実行後、全エージェントが即座にコマンドを受け付ける準備完了！**

</details>

---

<details>
<summary>🔧 <b>必要環境（手動セットアップの場合）</b>（クリックで展開）</summary>

依存関係を手動でインストールする場合：

| 要件 | インストール方法 | 備考 |
|------|-----------------|------|
| WSL2 + Ubuntu | PowerShellで `wsl --install` | Windowsのみ |
| Ubuntuをデフォルトに設定 | `wsl --set-default Ubuntu` | スクリプトの動作に必要 |
| tmux | `sudo apt install tmux` | ターミナルマルチプレクサ |
| Node.js v20+ | `nvm install 20` | MCPサーバーに必要 |
| OpenCode CLI | `npm install -g opencode` または公式サイトから | OpenCode公式CLI |

</details>

---

### ✅ セットアップ後の状態

どちらのオプションでも、**5体のAIエージェント**が自動起動します：

| エージェント | 役割 | 数 |
|-------------|------|-----|
| 👑 Noctis（ノクティス） | 王 - あなたの命令を受けてタスク管理 | 1 |
| 🌙 Lunafreya（ルナフレーナ） | 神凪 - 独立稼働＆Noctisへの指示 | 1 |
| ⚔️ Comrades（イグニス、グラディオラス、プロンプト） | ワーカー - 並列でタスク実行 | 3 |

tmuxセッション:
- `ff15` - 統一セッション（5ペイン）

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

## 動作の流れ

### 1. 命令を出す

```
あなた: 「上位5つのMCPサーバを調査して比較表を作成して」
```

### 2. Noctisが即座に委譲

Noctisは`queue/tasks/{worker_name}.yaml`にタスクを書き込み、各Comradeを起動します。制御は即座にあなたに戻ります — 待機なし。

### 3. Comradesが実行

Noctisが各Comradeに直接タスクを割り当て:

| Comrade | 割り当て |
|--------|----------|
| Ignis | Notion MCP調査 + 結果の統合 |
| Gladiolus | GitHub MCP調査 |
| Prompto | Playwright MCP調査 |

### 4. 並列実行

3名のComradesが同時に調査を実行します。リアルタイムで作業を確認できます:

<p align="center">
  <img src="assets/tmux_ff15_live_session.png" alt="Comradesが並列でタスク実行中 - ライブビュー" width="800">
</p>

### 5. ダッシュボードで結果確認

`dashboard.md`を開いて、集約された結果、スキル候補、ブロッカーを確認 — すべてNoctisが管理します。

---

## 実用例

このシステムは**すべてのホワイトカラー業務**を管理します。コードだけではありません。プロジェクトはファイルシステムのどこにでも配置できます。

```yaml
# config/projects.yaml
projects:
  - id: client_x
    name: "クライアントXコンサルティング"
    path: "/mnt/c/Consulting/client_x"
    status: active
```

**調査スプリント** — 3名のComradesが異なるトピックを並列調査、数分で結果を統合。

**マルチプロジェクト管理** — コンテキストを失わずにクライアントプロジェクト間を切り替え。Memory MCPがセッション横断で好みを保持。

**ドキュメント生成** — 技術文書作成、テストケースレビュー、比較表 — エージェント間で分散して統合。

---

## ✨ 主な特徴

### ⚡ 1. 並列実行

1つの命令で最大3つの並列タスクを生成：

```
あなた: 「3つのMCPサーバを調査せよ」
→ 3名のComradesが同時に調査開始
→ 数時間ではなく数分で結果が出る
```

### 🔄 2. ノンブロッキングワークフロー

Noctisは即座に委譲して、あなたに制御を返します：

```
あなた: 命令 → Noctis: 委譲 → あなた: 次の命令をすぐ出せる
                                    ↓
                    ワーカー: バックグラウンドで実行
                                    ↓
                    ダッシュボード: 結果を表示
```

長いタスクの完了を待つ必要はありません。

### 🧠 3. セッション間記憶（Memory MCP）

AIがあなたの好みを記憶します：

```
セッション1: 「シンプルな方法が好き」と伝える
            → Memory MCPに保存

セッション2: 起動時にAIがメモリを読み込む
            → 複雑な方法を提案しなくなる
```

### 📡 4. イベント駆動（ポーリングなし）

エージェントはYAMLファイルで通信し、tmux send-keysで互いを起こします。
**ポーリングループでAPIコールを浪費しません。**

### 📸 5. スクリーンショット連携

VSCode拡張のAIコーディングツールはスクショを貼り付けて事象を説明できます。このCLIシステムでも同等の機能を実現：

```
# config/settings.yaml でスクショフォルダを設定
screenshot:
  path: "/mnt/c/Users/あなたの名前/Pictures/Screenshots"

# Noctisに伝えるだけ:
あなた: 「最新のスクショを見ろ」
あなた: 「スクショ2枚見ろ」
→ AIが即座にスクリーンショットを読み取って分析
```

**💡 Windowsのコツ:** `Win + Shift + S` でスクショが撮れます。保存先を `settings.yaml` のパスに合わせると、シームレスに連携できます。

こんな時に便利：
- UIのバグを視覚的に説明
- エラーメッセージを見せる
- 変更前後の状態を比較

### 📁 6. コンテキスト管理

効率的な知識共有のため、四層構造のコンテキストを採用：

| レイヤー | 場所 | 用途 |
|---------|------|------|
| Layer 1: Memory MCP | `memory/noctis_memory.jsonl` | プロジェクト横断・セッションを跨ぐ長期記憶 |
| Layer 2: Project | `config/projects.yaml`, `projects/<id>.yaml`, `context/{project}.md` | プロジェクト固有情報・技術知見 |
| Layer 3: YAML Queue | `queue/noctis_to_ignis.yaml`, `queue/tasks/`, `queue/reports/` | タスク管理・指示と報告の正データ |
| Layer 4: Session | AGENTS.md, instructions/*.md | 作業中コンテキスト（/newでリセット） |

#### /new プロトコル（コスト最適化）

長時間作業するとコンテキスト（Layer 4）が膨れ、APIコストが増大する。`/new` でセッション記憶を消去すれば、コストがリセットされる。Layer 1〜3はファイルとして残るので失われない。

`/new` 後のComradesの復帰コスト: **約1,950トークン**（目標5,000の39%）

1. AGENTS.md（自動読み込み）→ ff15システムの一員と認識
2. `tmux display-message -t "$TMUX_PANE" -p '#{@agent_id}'` → 自分のIDを確認
3. Memory MCP 読み込み → Crystalの好みを復元（~700トークン）
4. タスクYAML 読み込み → 次の仕事を確認（~800トークン）

「何を読ませないか」の設計がコスト削減に効いている。

### 汎用コンテキストテンプレート

すべてのプロジェクトで同じ7セクション構成のテンプレートを使用：

| セクション | 目的 |
|-----------|------|
| What | プロジェクトの概要説明 |
| Why | 目的と成功の定義 |
| Who | 関係者と責任者 |
| Constraints | 期限、予算、制約 |
| Current State | 進捗、次のアクション、ブロッカー |
| Decisions | 決定事項と理由の記録 |
| Notes | 自由記述のメモ・気づき |

この統一フォーマットにより：
- どのエージェントでも素早くオンボーディング可能
- すべてのプロジェクトで一貫した情報管理
- Comrades間の作業引き継ぎが容易

---

### 🧠 モデル設定

| エージェント | Normalモード | Full Powerモード | 理由 |
|-------------|-------------|-----------------|------|
| Noctis | Sonnet 4.5 | Opus 4.6 | 委譲とタスク管理 |
| Lunafreya | Grok Code Fast | Grok Code Fast | 独立稼働アドバイザー |
| Ignis | Haiku 4.5 | GPT-5.2 Codex | コスト効率重視 |
| Gladiolus | Haiku 4.5 | Sonnet 4.5 | コスト効率重視 |
| Prompto | Gemini 3 Flash | Gemini 3 Pro | 高速リサーチ |

#### モード構成

| モード | Comrades | Leaders (Noctis/Lunafreya) | コマンド |
|------|---------|---------|---------|
| **Normal**（デフォルト） | Haiku 4.5 / Gemini 3 Flash | Sonnet 4.5 / Grok Fast | `./standby.sh` |
| **Full Power**（全力） | GPT-5.2 / Sonnet 4.5 / Gemini 3 Pro | Opus 4.6 / Grok Fast | `./standby.sh --fullpower` |
| **Lite**（節約） | Haiku / Grok Fast | Haiku 4.5 | `./standby.sh --lite` |

普段はComradesを軽量モデルで運用。ここぞという時に `--fullpower` でプレミアムモデルに切り替え。Noctisの判断で個別のComradeを別モデルに一時切り替えることも可能。

---

## 🎯 設計思想

### なぜ階層構造（Noctis→Comrades）なのか

1. **即座の応答**: Noctisは即座に委譲し、あなたに制御を返す
2. **並列実行**: 複数のComradesに同時分配
3. **単一責任**: 各役割が明確に分離され、混乱しない
4. **スケーラビリティ**: Comradesを増やしても構造が崩れない
5. **障害分離**: 1名のComradeが失敗しても他に影響しない
6. **人間への報告一元化**: Noctisだけが人間とやり取りするため、情報が整理される
7. **独立アドバイザー**: Lunafreyaが独立稼働し、Noctisへの指示も可能

### なぜ YAML + send-keys なのか

1. **状態の永続化**: YAMLファイルで構造化通信し、エージェント再起動にも耐える
2. **ポーリング不要**: イベント駆動でAPIコストを削減
3. **割り込み防止**: エージェント同士やあなたの入力への割り込みを防止
4. **デバッグ容易**: 人間がYAMLを直接読んで状況把握できる
5. **競合回避**: 各Comradeに専用ファイルを割り当て
6. **2秒間隔送信**: 複数Comradesへの連続送信時に `sleep 2` を挟むことで、入力バッファ溢れを防止（到達率14%→87.5%に改善）

### エージェント識別（@agent_id）

各ペインに `@agent_id` というtmuxユーザーオプションを設定（例: `ignis`, `gladiolus`）。`pane_index` はペイン再配置でズレるが、`@agent_id` は `standby.sh` が起動時に固定設定するため変わらない。

エージェントの自己識別:
```bash
tmux display-message -t "$TMUX_PANE" -p '#{@agent_id}'
```
`-t "$TMUX_PANE"` が必須。省略するとアクティブペイン（操作中のペイン）の値が返り、誤認識の原因になる。

モデル名も `@model_name` として保存され、`pane-border-format` で常時表示。OpenCodeがペインタイトルを上書きしてもモデル名は消えない。

### なぜ dashboard.md はNoctisのみが更新するのか

1. **単一更新者**: 競合を防ぐため、更新責任者を1人に限定
2. **情報集約**: Noctisは全Comradesの報告を受ける立場なので全体像を把握
3. **一貫性**: すべての更新が1つの品質ゲートを通過
4. **割り込み防止**: Comradesが更新すると、Kingの入力中に割り込む恐れあり

---

## 🛠️ スキル

初期状態ではスキルはありません。
運用中にダッシュボード（dashboard.md）の「スキル化候補」から承認して増やしていきます。

スキルは `/スキル名` で呼び出し可能。Noctisに「/スキル名 を実行」と伝えるだけ。

### スキルの思想

**1. スキルはコミット対象外**

`.opencode/skills/` 配下のスキルはリポジトリにコミットしない設計。理由：
- 各ユーザの業務・ワークフローは異なる
- 汎用的なスキルを押し付けるのではなく、ユーザが自分に必要なスキルを育てていく

**2. スキル取得の手順**

```
Comradeが作業中にパターンを発見
    ↓
dashboard.md の「スキル化候補」に上がる
    ↓
King（あなた）が内容を確認
    ↓
承認すればNoctisに指示してスキルを作成
```

スキルはユーザ主導で増やすもの。自動で増えると管理不能になるため、「これは便利」と判断したものだけを残す。

---

## 🔌 MCPセットアップガイド

MCP（Model Context Protocol）サーバはOpenCodeの機能を拡張します。セットアップ方法：

### MCPとは？

MCPサーバはOpenCodeに外部ツールへのアクセスを提供します：
- **Memory MCP** → セッション間で記憶を保持
- **Playwright MCP** → ブラウザ自動化、スクリーンショット、ウェブスクレイピング

### MCPサーバのインストール

OpenCodeは設定ファイルでMCPサーバを管理します。`~/.config/opencode/opencode.json`に追加してください：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "memory": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-memory"],
      "environment": {
        "MEMORY_FILE_PATH": "$PWD/memory/noctis_memory.jsonl"
      },
      "enabled": true
    },
    "playwright": {
      "type": "local",
      "command": ["npx", "@playwright/mcp@latest"],
      "enabled": true
    }
  }
}
```

### インストール確認

```bash
opencode mcp list
```

MCPサーバのステータスを確認できます。

---

## 🔌 プラグインシステム

### ダッシュボード更新リマインダー

Noctisがステータス更新を忘れないよう、自動リマインダープラグインが組み込まれています。

#### 動作の仕組み

プラグインは**ハイブリッド通知システム**を採用:

1. **YAMLキュー** (`queue/plugin_notifications.yaml`)
   - すべての通知がここに記録される
   - Noctisは起動時やリマインダー受信時にこのファイルをチェック
   - 低優先度リマインダー（セッションアイドルなど）

2. **Direct tmux通知** (send-keys経由)
   - 高優先度アラートはNoctisペインに直接送信
   - 重要イベントの即座の可視化
   - 用途: Todo完了、新しいComradeレポート

#### トリガー

| イベント | 優先度 | 通知方法 |
|---------|-------|---------|
| セッションアイドル | 低 | YAMLのみ |
| Todo完了 | 高 | YAML + tmux send-keys |
| Comradeレポート | 高 | YAML + tmux send-keys |

#### Noctisのワークフロー

Noctisがリマインダーを受け取った時、またはセッション起動時:

1. `queue/plugin_notifications.yaml` をチェック
2. 未処理の通知を処理
3. `dashboard.md` を適宜更新
4. 処理済み通知をクリア

#### カスタムプラグインの作成

プラグインは `.opencode/plugins/` に保存され、OpenCodeが自動的にロードします。カスタムフックの作成方法については `.opencode/plugins/README.md` を参照してください。

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
1. NoctisがMCP経由でNotionコンテンツを取得し各Comradeに割り当て:
2. Ignis: 確認すべき項目をリスト化
3. Gladiolus: 技術的な実現可能性を調査
4. Prompto: PoC計画書を作成
5. 全結果がdashboard.mdに集約、会議の準備完了
```

---

## ⚙️ 設定

### 言語設定

`config/settings.yaml` を編集：

```yaml
language: ja   # 日本語のみ
language: en   # 日本語 + 英訳併記
```

---

## 🛠️ 上級者向け

<details>
<summary><b>スクリプトアーキテクチャ</b>（クリックで展開）</summary>

```
┌─────────────────────────────────────────────────────────────────────┐
│                      初回セットアップ（1回だけ実行）                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  install.bat (Windows)                                              │
│      │                                                              │
│      ├── WSL2のチェック/インストール案内                              │
│      └── Ubuntuのチェック/インストール案内                            │
│                                                                     │
│  first_setup.sh (Ubuntu/WSLで手動実行)                               │
│      │                                                              │
│      ├── tmuxのチェック/インストール                                  │
│      ├── Node.js v20+のチェック/インストール (nvm経由)                │
│      ├── OpenCode CLIのチェック/インストール                         │
│      │       ※ npm版検出時はネイティブ版への移行を提案                │
│      └── Memory MCPサーバー設定                                      │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                      毎日の起動（毎日実行）                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  standby.sh                                                          │
│      │                                                              │
│      ├──▶ tmuxセッションを作成                                       │
│      │         • "noctis"セッション（1ペイン）                        │
│      │         • "kingsglaive"セッション（5ペイン、Ignis上段+Comrades 2x2）│
│      │                                                              │
│      ├──▶ キューファイルとダッシュボードをリセット                     │
│      │                                                              │
│      └──▶ 全エージェントでOpenCodeを起動                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

</details>

<details>
<summary><b>standby.sh オプション</b>（クリックで展開）</summary>

```bash
# デフォルト: フル起動（tmuxセッション + OpenCode起動）
./standby.sh

# セッションセットアップのみ（OpenCode起動なし）
./standby.sh -s
./standby.sh --setup-only

# タスクキューをクリア（指令履歴は保持）
./standby.sh -c
./standby.sh --clean

# Full Power: 全ComradesをOpusで起動（最大能力・高コスト）
./standby.sh --fullpower

# フル起動 + Windows Terminalタブを開く
./standby.sh -t
./standby.sh --terminal

# ヘルプを表示
./standby.sh -h
./standby.sh --help
```

</details>

<details>
<summary><b>よく使うワークフロー</b>（クリックで展開）</summary>

**通常の毎日の使用：**
```bash
./standby.sh                      # 全て起動
ffa                               # 接続してコマンドを出す
```

**デバッグモード（手動制御）：**
```bash
./standby.sh -s       # セッションのみ作成

# 特定のエージェントでOpenCodeを手動起動
tmux send-keys -t ff15:0 'opencode' Enter
tmux send-keys -t ff15:2 'opencode' Enter
```

**クラッシュ後の再起動：**
```bash
# 既存セッションを終了
tmux kill-session -t ff15

# 新しく起動
./standby.sh
```

</details>

<details>
<summary><b>便利なエイリアス</b>（クリックで展開）</summary>

`first_setup.sh` を実行すると、以下のエイリアスが `~/.bashrc` (または `~/.zshrc`) に自動追加されます：

```bash
alias ffa='tmux attach-session -t ff15'  # ff15セッションに接続
```

※ エイリアスを反映するには `source ~/.bashrc` を実行するか、PowerShellで `wsl --shutdown` してからターミナルを開き直してください。

</details>

---

## 📁 ファイル構成

<details>
<summary><b>クリックでファイル構成を展開</b></summary>

```
multi-agent-ff15/
│
│  ┌─────────────────── セットアップスクリプト ───────────────────┐
├── install.bat               # Windows: 初回セットアップ
├── first_setup.sh            # Ubuntu/Mac: 初回セットアップ
├── standby.sh    # 毎日の起動（指示書自動読み込み）
│  └────────────────────────────────────────────────────────────┘
│
├── instructions/             # エージェント指示書
│   ├── noctis.md             # Noctisの指示書
│   ├── lunafreya.md          # Lunafreyaの指示書
│   ├── ignis.md              # Ignisの指示書
│   ├── gladiolus.md          # Gladiolusの指示書
│   └── prompto.md            # Promptoの指示書
│
├── config/
│   └── settings.yaml         # 言語その他の設定
│
├── projects/                # プロジェクト詳細（git対象外、機密情報含む）
│   └── <project_id>.yaml   # 各プロジェクトの全情報（クライアント、タスク、Notion連携等）
│
├── queue/                    # 通信ファイル
│   ├── lunafreya_to_noctis.yaml  # Lunafreya → Noctis 連携
│   ├── tasks/                # 各ワーカーのタスクファイル
│   │   ├── ignis.yaml
│   │   ├── gladiolus.yaml
│   │   └── prompto.yaml
│   └── reports/              # ワーカーレポート
│       ├── ignis_report.yaml
│       ├── gladiolus_report.yaml
│       └── prompto_report.yaml
│
├── memory/                   # Memory MCP保存場所
├── dashboard.md              # リアルタイム状況一覧
└── AGENTS.md                 # OpenCode用プロジェクトコンテキスト
```

</details>

---

## 📂 プロジェクト管理

このシステムは自身の開発だけでなく、**全てのホワイトカラー業務**を管理・実行する。プロジェクトのフォルダはこのリポジトリの外にあってもよい。

### 仕組み

```
config/projects.yaml          # プロジェクト一覧（ID・名前・パス・ステータスのみ）
projects/<project_id>.yaml    # 各プロジェクトの詳細情報
```

- **`config/projects.yaml`**: どのプロジェクトがあるかの一覧（サマリのみ）
- **`projects/<id>.yaml`**: そのプロジェクトの全詳細（クライアント情報、契約、タスク、関連ファイル、Notionページ等）
- **プロジェクトの実ファイル**（ソースコード、設計書等）は `path` で指定した外部フォルダに配置
- **`projects/` はGit追跡対象外**（クライアントの機密情報を含むため）

### 例

```yaml
# config/projects.yaml
projects:
  - id: my_client
    name: "クライアントXコンサルティング"
    path: "/mnt/c/Consulting/client_x"
    status: active

# projects/my_client.yaml
id: my_client
client:
  name: "クライアントX"
  company: "X株式会社"
contract:
  fee: "月額"
current_tasks:
  - id: task_001
    name: "システムアーキテクチャレビュー"
    status: in_progress
```

この分離設計により、Noctisシステムは複数の外部プロジェクトを横断的に統率しつつ、プロジェクトの詳細情報はバージョン管理の対象外に保つことができる。

---

## 🔧 トラブルシューティング



<details>
<summary><b>MCPツールが動作しない？</b></summary>

MCPツールは「遅延ロード」方式で、最初にロードが必要です：

```
# 間違い - ツールがロードされていない
mcp__memory__read_graph()  ← エラー！

# 正しい - 先にロード
ToolSearch("select:mcp__memory__read_graph")
mcp__memory__read_graph()  ← 動作！
```

</details>

<details>
<summary><b>エージェントが権限を求めてくる？</b></summary>

`--dangerously-skip-permissions` 付きで起動していることを確認：

```bash
opencode
```

</details>

<details>
<summary><b>ワーカーが停止している？</b></summary>

ワーカーのペインを確認：
```bash
tmux attach-session -t kingsglaive
# Ctrl+B の後に数字でペインを切り替え
```

</details>

<details>
<summary><b>Noctisやエージェントが落ちた？（OpenCodeプロセスがkillされた）</b></summary>

**`ffa` エイリアスを使って再起動してはいけません。** このエイリアスはtmuxセッションにアタッチするためのもので、既存のtmuxペイン内で実行するとセッションがネスト（入れ子）になり、入力が壊れてペインが使用不能になります。

**正しい再起動方法：**

```bash
# 方法1: ペイン内でopencodeを直接実行
opencode

# 方法2: Noctisがrespawn-paneで強制再起動（ネストも解消される）
tmux respawn-pane -t ff15:0 -k 'opencode'
```

**誤ってtmuxをネストしてしまった場合：**
1. `Ctrl+B` の後 `d` でデタッチ（内側のセッションから離脱）
2. その後 `opencode` を直接実行（`ffa` は使わない）
3. デタッチが効かない場合は、別のペインから `tmux respawn-pane -k` で強制リセット

</details>

---

## 📚 tmux クイックリファレンス

| コマンド | 説明 |
|----------|------|
| `ffa` (エイリアス) | ff15セッションに接続 |
| `tmux attach -t ff15` | ff15セッションに接続（フルコマンド） |
| `Ctrl+B` の後 `0-4` | ペイン間を切り替え |
| `Ctrl+B` の後 `d` | デタッチ（実行継続） |
| `tmux kill-session -t ff15` | ff15セッションを停止 |

### 🖱️ マウス操作

`first_setup.sh` が `~/.tmux.conf` に `set -g mouse on` を自動設定するため、マウスによる直感的な操作が可能です：

| 操作 | 説明 |
|------|------|
| マウスホイール | ペイン内のスクロール（出力履歴の確認） |
| ペインをクリック | ペイン間のフォーカス切替 |
| ペイン境界をドラッグ | ペインのリサイズ |

キーボード操作に不慣れな場合でも、マウスだけでペインの切替・スクロール・リサイズが行えます。

---

## 貢献

IssueとPull Requestを歓迎します。

- **バグ報告**: 再現手順を含めてIssueを作成
- **機能アイデア**: まずDiscussionで提案
- **スキル**: スキルは個人的な設計のため、このリポジトリには含まれません

---

## 🙏 クレジット

このプロジェクトは[@yohey-w](https://github.com/yohey-w)氏の[multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun)をベースにしています。オリジナルの作品と、このFF15をテーマとしたマルチエージェントシステムの基盤を提供していただいたことに深く感謝します。

主なインスピレーション元:
- マルチエージェントオーケストレーションパターンとOpenCodeエコシステム
- イベント駆動通信アーキテクチャ
- ボトムアップスキル発見システム

---

## 📄 ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照。

---

<div align="center">

**AIの軍勢を統率せよ。より速く構築せよ。**

</div>
