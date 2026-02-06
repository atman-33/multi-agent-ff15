# multi-agent-shogun

<div align="center">

**Claude Code マルチエージェント統率システム**

*コマンド1つで、8体のAIエージェントが並列稼働*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Claude Code](https://img.shields.io/badge/Claude-Code-blueviolet)](https://claude.ai)
[![tmux](https://img.shields.io/badge/tmux-required-green)](https://github.com/tmux/tmux)

[English](README.md) | [日本語](README_ja.md)

</div>

---

## これは何？

**multi-agent-shogun** は、複数の Claude Code インスタンスを同時に実行し、戦国時代の軍制のように統率するシステムです。

**なぜ使うのか？**
- 1つの命令で、8体のAIワーカーが並列で実行
- 待ち時間なし - タスクがバックグラウンドで実行中も次の命令を出せる
- AIがセッションを跨いであなたの好みを記憶（Memory MCP）
- ダッシュボードでリアルタイム進捗確認

```
      あなた（上様）
           │
           ▼ 命令を出す
    ┌─────────────┐
    │   SHOGUN    │  ← 命令を受け取り、即座に委譲
    └──────┬──────┘
           │ YAMLファイル + tmux
    ┌──────▼──────┐
    │    KARO     │  ← タスクをワーカーに分配
    └──────┬──────┘
           │
  ┌─┬─┬─┬─┴─┬─┬─┬─┐
  │1│2│3│4│5│6│7│8│  ← 8体のワーカーが並列実行
  └─┴─┴─┴─┴─┴─┴─┴─┘
      ASHIGARU
```

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

[ZIPダウンロード](https://github.com/yohey-w/multi-agent-shogun/archive/refs/heads/main.zip) して `C:\tools\multi-agent-shogun` に展開

*または git を使用:* `git clone https://github.com/yohey-w/multi-agent-shogun.git C:\tools\multi-agent-shogun`

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
cd /mnt/c/tools/multi-agent-shogun
./first_setup.sh
```

</td>
</tr>
<tr>
<td>

**Step 4**

</td>
<td>

✅ **出陣！**

```bash
./shutsujin_departure.sh
```

</td>
</tr>
</table>

#### 🔑 初回のみ: 認証

`first_setup.sh` 完了後、一度だけ以下を実行して認証：

```bash
# 1. PATHの反映
source ~/.bashrc

# 2. OAuthログイン + Bypass Permissions承認（1コマンドで完了）
claude --dangerously-skip-permissions
#    → ブラウザが開く → Anthropicアカウントでログイン → CLIに戻る
#    → 「Bypass Permissions」の承認画面 → 「Yes, I accept」を選択（↓キーで2を選んでEnter）
#    → /exit で退出
```

認証情報は `~/.claude/` に保存され、以降は不要。

#### 📅 毎日の起動（初回セットアップ後）

**Ubuntuターミナル**（WSL）を開いて実行：

```bash
cd /mnt/c/tools/multi-agent-shogun
./shutsujin_departure.sh
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
   css    # 将軍に繋がる
   ```
4. ＋ボタンで新しいウィンドウを開いて、部下の様子も見る：
   ```sh
   ssh あなたのユーザー名@あなたのTailscale IP
   csm    # 家老+足軽の9ペインが広がる
   ```

**切り方：** Termuxのウィンドウをスワイプで閉じるだけ。tmuxセッションは生き残る。AI部下は黙々と作業を続けている。

**音声入力：** スマホの音声入力で喋れば、将軍が自然言語を理解して全軍に指示を出す。音声認識の誤字も文脈で解釈してくれる。

---

<details>
<summary>🐧 <b>Linux / Mac ユーザー</b>（クリックで展開）</summary>

### 初回セットアップ

```bash
# 1. リポジトリをクローン
git clone https://github.com/yohey-w/multi-agent-shogun.git ~/multi-agent-shogun
cd ~/multi-agent-shogun

# 2. スクリプトに実行権限を付与
chmod +x *.sh

# 3. 初回セットアップを実行
./first_setup.sh
```

### 毎日の起動

```bash
cd ~/multi-agent-shogun
./shutsujin_departure.sh
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
| `first_setup.sh` | tmux、Node.js、Claude Code CLI のインストール + Memory MCP設定 | 初回のみ |
| `shutsujin_departure.sh` | tmuxセッション作成 + Claude Code起動 + 指示書読み込み | 毎日 |

### `install.bat` が自動で行うこと：
- ✅ WSL2がインストールされているかチェック（未インストールなら案内）
- ✅ Ubuntuがインストールされているかチェック（未インストールなら案内）
- ✅ 次のステップ（`first_setup.sh` の実行方法）を案内

### `shutsujin_departure.sh` が行うこと：
- ✅ tmuxセッションを作成（shogun + multiagent）
- ✅ 全エージェントでClaude Codeを起動
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
| Claude Code CLI | `curl -fsSL https://claude.ai/install.sh \| bash` | Anthropic公式CLI（ネイティブ版を推奨。npm版は非推奨） |

</details>

---

### ✅ セットアップ後の状態

どちらのオプションでも、**10体のAIエージェント**が自動起動します：

| エージェント | 役割 | 数 |
|-------------|------|-----|
| 🏯 将軍（Shogun） | 総大将 - あなたの命令を受ける | 1 |
| 📋 家老（Karo） | 管理者 - タスクを分配 | 1 |
| ⚔️ 足軽（Ashigaru） | ワーカー - 並列でタスク実行 | 8 |

tmuxセッションが作成されます：
- `shogun` - ここに接続してコマンドを出す
- `multiagent` - ワーカーがバックグラウンドで稼働

---

## 📖 基本的な使い方

### Step 1: 将軍に接続

`shutsujin_departure.sh` 実行後、全エージェントが自動的に指示書を読み込み、作業準備完了となります。

新しいターミナルを開いて将軍に接続：

```bash
tmux attach-session -t shogun
```

### Step 2: 最初の命令を出す

将軍は既に初期化済み！そのまま命令を出せます：

```
JavaScriptフレームワーク上位5つを調査して比較表を作成せよ
```

将軍は：
1. タスクをYAMLファイルに書き込む
2. 家老（管理者）に通知
3. 即座にあなたに制御を返す（待つ必要なし！）

その間、家老はタスクを足軽ワーカーに分配し、並列実行します。

### Step 3: 進捗を確認

エディタで `dashboard.md` を開いてリアルタイム状況を確認：

```markdown
## 進行中
| ワーカー | タスク | 状態 |
|----------|--------|------|
| 足軽 1 | React調査 | 実行中 |
| 足軽 2 | Vue調査 | 実行中 |
| 足軽 3 | Angular調査 | 完了 |
```

---

## ✨ 主な特徴

### ⚡ 1. 並列実行

1つの命令で最大8つの並列タスクを生成：

```
あなた: 「5つのMCPサーバを調査せよ」
→ 5体の足軽が同時に調査開始
→ 数時間ではなく数分で結果が出る
```

### 🔄 2. ノンブロッキングワークフロー

将軍は即座に委譲して、あなたに制御を返します：

```
あなた: 命令 → 将軍: 委譲 → あなた: 次の命令をすぐ出せる
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

VSCode拡張のClaude Codeはスクショを貼り付けて事象を説明できます。このCLIシステムでも同等の機能を実現：

```
# config/settings.yaml でスクショフォルダを設定
screenshot:
  path: "/mnt/c/Users/あなたの名前/Pictures/Screenshots"

# 将軍に伝えるだけ:
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
| Layer 1: Memory MCP | `memory/shogun_memory.jsonl` | プロジェクト横断・セッションを跨ぐ長期記憶 |
| Layer 2: Project | `config/projects.yaml`, `projects/<id>.yaml`, `context/{project}.md` | プロジェクト固有情報・技術知見 |
| Layer 3: YAML Queue | `queue/shogun_to_karo.yaml`, `queue/tasks/`, `queue/reports/` | タスク管理・指示と報告の正データ |
| Layer 4: Session | CLAUDE.md, instructions/*.md | 作業中コンテキスト（/clearで破棄） |

この設計により：
- どの足軽でも任意のプロジェクトを担当可能
- エージェント切り替え時もコンテキスト継続
- 関心の分離が明確
- セッション間の知識永続化

#### /clear プロトコル（コスト最適化）

長時間作業するとコンテキスト（Layer 4）が膨れ、APIコストが増大する。`/clear` でセッション記憶を消去すれば、コストがリセットされる。Layer 1〜3はファイルとして残るので失われない。

`/clear` 後の足軽の復帰コスト: **約1,950トークン**（目標5,000の39%）

1. CLAUDE.md（自動読み込み）→ shogunシステムの一員と認識
2. `tmux display-message -t "$TMUX_PANE" -p '#{@agent_id}'` → 自分の番号を確認
3. Memory MCP 読み込み → 殿の好みを復元（~700トークン）
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
- 足軽間の作業引き継ぎが容易

---

### 🧠 モデル設定

| エージェント | モデル | 思考モード | 理由 |
|-------------|--------|----------|------|
| 将軍 | Opus | 無効 | 委譲とダッシュボード更新に深い推論は不要 |
| 家老 | Opus | 有効 | タスク分配には慎重な判断が必要 |
| 足軽1-4 | Sonnet | 有効 | コスト効率重視の標準タスク向け |
| 足軽5-8 | Opus | 有効 | 複雑なタスク向けのフル機能 |

将軍は `MAX_THINKING_TOKENS=0` で拡張思考を無効化し、高レベルな判断にはOpusの能力を維持しつつ、レイテンシとコストを削減。

#### 陣形モード

| 陣形 | 足軽1-4 | 足軽5-8 | コマンド |
|------|---------|---------|---------|
| **平時の陣**（デフォルト） | Sonnet Thinking | Opus Thinking | `./shutsujin_departure.sh` |
| **決戦の陣**（全力） | Opus Thinking | Opus Thinking | `./shutsujin_departure.sh -k` |

平時は半数を安いSonnetモデルで運用。ここぞという時に `-k`（`--kessen`）で全軍Opusの「決戦の陣」に切り替え。家老の判断で `/model opus` を送れば、個別の足軽を一時昇格させることも可能。

---

## 🧭 核心思想（Philosophy）

> **「脳死で依頼をこなすな。最速×最高のアウトプットを常に念頭に置け。」**

将軍システムは5つの核心原則に基づいて設計されている：

| 原則 | 説明 |
|------|------|
| **自律陣形設計** | テンプレートではなく、タスクの複雑さに応じて陣形を設計 |
| **並列化** | サブエージェントを活用し、単一障害点を作らない |
| **リサーチファースト** | 判断の前にエビデンスを探す |
| **継続的学習** | モデルの知識カットオフだけに頼らない |
| **三角測量** | 複数視点からのリサーチと統合的オーソライズ |

詳細: **[docs/philosophy.md](docs/philosophy.md)**

---

## 🎯 設計思想

### なぜ階層構造（将軍→家老→足軽）なのか

1. **即座の応答**: 将軍は即座に委譲し、あなたに制御を返す
2. **並列実行**: 家老が複数の足軽に同時分配
3. **単一責任**: 各役割が明確に分離され、混乱しない
4. **スケーラビリティ**: 足軽を増やしても構造が崩れない
5. **障害分離**: 1体の足軽が失敗しても他に影響しない
6. **人間への報告一元化**: 将軍だけが人間とやり取りするため、情報が整理される

### なぜ YAML + send-keys なのか

1. **状態の永続化**: YAMLファイルで構造化通信し、エージェント再起動にも耐える
2. **ポーリング不要**: イベント駆動でAPIコストを削減
3. **割り込み防止**: エージェント同士やあなたの入力への割り込みを防止
4. **デバッグ容易**: 人間がYAMLを直接読んで状況把握できる
5. **競合回避**: 各足軽に専用ファイルを割り当て
6. **2秒間隔送信**: 複数足軽への連続送信時に `sleep 2` を挟むことで、入力バッファ溢れを防止（到達率14%→87.5%に改善）

### エージェント識別（@agent_id）

各ペインに `@agent_id` というtmuxユーザーオプションを設定（例: `karo`, `ashigaru1`）。`pane_index` はペイン再配置でズレるが、`@agent_id` は `shutsujin_departure.sh` が起動時に固定設定するため変わらない。

エージェントの自己識別:
```bash
tmux display-message -t "$TMUX_PANE" -p '#{@agent_id}'
```
`-t "$TMUX_PANE"` が必須。省略するとアクティブペイン（操作中のペイン）の値が返り、誤認識の原因になる。

モデル名も `@model_name` として保存され、`pane-border-format` で常時表示。Claude Codeがペインタイトルを上書きしてもモデル名は消えない。

### なぜ dashboard.md は家老のみが更新するのか

1. **単一更新者**: 競合を防ぐため、更新責任者を1人に限定
2. **情報集約**: 家老は全足軽の報告を受ける立場なので全体像を把握
3. **一貫性**: すべての更新が1つの品質ゲートを通過
4. **割り込み防止**: 将軍が更新すると、殿の入力中に割り込む恐れあり

---

## 🛠️ スキル

初期状態ではスキルはありません。
運用中にダッシュボード（dashboard.md）の「スキル化候補」から承認して増やしていきます。

スキルは `/スキル名` で呼び出し可能。将軍に「/スキル名 を実行」と伝えるだけ。

### スキルの思想

**1. スキルはコミット対象外**

`.claude/commands/` 配下のスキルはリポジトリにコミットしない設計。理由：
- 各ユーザの業務・ワークフローは異なる
- 汎用的なスキルを押し付けるのではなく、ユーザが自分に必要なスキルを育てていく

**2. スキル取得の手順**

```
足軽が作業中にパターンを発見
    ↓
dashboard.md の「スキル化候補」に上がる
    ↓
殿（あなた）が内容を確認
    ↓
承認すれば家老に指示してスキルを作成
```

スキルはユーザ主導で増やすもの。自動で増えると管理不能になるため、「これは便利」と判断したものだけを残す。

---

## 🔌 MCPセットアップガイド

MCP（Model Context Protocol）サーバはClaudeの機能を拡張します。セットアップ方法：

### MCPとは？

MCPサーバはClaudeに外部ツールへのアクセスを提供します：
- **Notion MCP** → Notionページの読み書き
- **GitHub MCP** → PR作成、Issue管理
- **Memory MCP** → セッション間で記憶を保持

### MCPサーバのインストール

以下のコマンドでMCPサーバを追加：

```bash
# 1. Notion - Notionワークスペースに接続
claude mcp add notion -e NOTION_TOKEN=your_token_here -- npx -y @notionhq/notion-mcp-server

# 2. Playwright - ブラウザ自動化
claude mcp add playwright -- npx @playwright/mcp@latest
# 注意: 先に `npx playwright install chromium` を実行してください

# 3. GitHub - リポジトリ操作
claude mcp add github -e GITHUB_PERSONAL_ACCESS_TOKEN=your_pat_here -- npx -y @modelcontextprotocol/server-github

# 4. Sequential Thinking - 複雑な問題を段階的に思考
claude mcp add sequential-thinking -- npx -y @modelcontextprotocol/server-sequential-thinking

# 5. Memory - セッション間の長期記憶（推奨！）
# ✅ first_setup.sh で自動設定済み
# 手動で再設定する場合:
claude mcp add memory -e MEMORY_FILE_PATH="$PWD/memory/shogun_memory.jsonl" -- npx -y @modelcontextprotocol/server-memory
```

### インストール確認

```bash
claude mcp list
```

全サーバが「Connected」ステータスで表示されるはずです。

---

## 🌍 実用例

### 例1: 調査タスク

```
あなた: 「AIコーディングアシスタント上位5つを調査して比較せよ」

実行される処理:
1. 将軍が家老に委譲
2. 家老が割り当て:
   - 足軽1: GitHub Copilotを調査
   - 足軽2: Cursorを調査
   - 足軽3: Claude Codeを調査
   - 足軽4: Codeiumを調査
   - 足軽5: Amazon CodeWhispererを調査
3. 5体が同時に調査
4. 結果がdashboard.mdに集約
```

### 例2: PoC準備

```
あなた: 「このNotionページのプロジェクトでPoC準備: [URL]」

実行される処理:
1. 家老がMCP経由でNotionコンテンツを取得
2. 足軽2: 確認すべき項目をリスト化
3. 足軽3: 技術的な実現可能性を調査
4. 足軽4: PoC計画書を作成
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
│      ├── Claude Code CLIのチェック/インストール（ネイティブ版）       │
│      │       ※ npm版検出時はネイティブ版への移行を提案                │
│      └── Memory MCPサーバー設定                                      │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                      毎日の起動（毎日実行）                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  shutsujin_departure.sh                                             │
│      │                                                              │
│      ├──▶ tmuxセッションを作成                                       │
│      │         • "shogun"セッション（1ペイン）                        │
│      │         • "multiagent"セッション（9ペイン、3x3グリッド）        │
│      │                                                              │
│      ├──▶ キューファイルとダッシュボードをリセット                     │
│      │                                                              │
│      └──▶ 全エージェントでClaude Codeを起動                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

</details>

<details>
<summary><b>shutsujin_departure.sh オプション</b>（クリックで展開）</summary>

```bash
# デフォルト: フル起動（tmuxセッション + Claude Code起動）
./shutsujin_departure.sh

# セッションセットアップのみ（Claude Code起動なし）
./shutsujin_departure.sh -s
./shutsujin_departure.sh --setup-only

# タスクキューをクリア（指令履歴は保持）
./shutsujin_departure.sh -c
./shutsujin_departure.sh --clean

# 決戦の陣: 全足軽をOpusで起動（最大能力・高コスト）
./shutsujin_departure.sh -k
./shutsujin_departure.sh --kessen

# フル起動 + Windows Terminalタブを開く
./shutsujin_departure.sh -t
./shutsujin_departure.sh --terminal

# ヘルプを表示
./shutsujin_departure.sh -h
./shutsujin_departure.sh --help
```

</details>

<details>
<summary><b>よく使うワークフロー</b>（クリックで展開）</summary>

**通常の毎日の使用：**
```bash
./shutsujin_departure.sh          # 全て起動
tmux attach-session -t shogun     # 接続してコマンドを出す
```

**デバッグモード（手動制御）：**
```bash
./shutsujin_departure.sh -s       # セッションのみ作成

# 特定のエージェントでClaude Codeを手動起動
tmux send-keys -t shogun:0 'claude --dangerously-skip-permissions' Enter
tmux send-keys -t multiagent:0.0 'claude --dangerously-skip-permissions' Enter
```

**クラッシュ後の再起動：**
```bash
# 既存セッションを終了
tmux kill-session -t shogun
tmux kill-session -t multiagent

# 新しく起動
./shutsujin_departure.sh
```

</details>

<details>
<summary><b>便利なエイリアス</b>（クリックで展開）</summary>

`first_setup.sh` を実行すると、以下のエイリアスが `~/.bashrc` に自動追加されます：

```bash
alias css='tmux attach-session -t shogun'      # 将軍ウィンドウの起動
alias csm='tmux attach-session -t multiagent'  # 家老・足軽ウィンドウの起動
```

※ エイリアスを反映するには `source ~/.bashrc` を実行するか、PowerShellで `wsl --shutdown` してからターミナルを開き直してください。

</details>

---

## 📁 ファイル構成

<details>
<summary><b>クリックでファイル構成を展開</b></summary>

```
multi-agent-shogun/
│
│  ┌─────────────────── セットアップスクリプト ───────────────────┐
├── install.bat               # Windows: 初回セットアップ
├── first_setup.sh            # Ubuntu/Mac: 初回セットアップ
├── shutsujin_departure.sh    # 毎日の起動（指示書自動読み込み）
│  └────────────────────────────────────────────────────────────┘
│
├── instructions/             # エージェント指示書
│   ├── shogun.md             # 将軍の指示書
│   ├── karo.md               # 家老の指示書
│   └── ashigaru.md           # 足軽の指示書
│
├── config/
│   └── settings.yaml         # 言語その他の設定
│
├── projects/                # プロジェクト詳細（git対象外、機密情報含む）
│   └── <project_id>.yaml   # 各プロジェクトの全情報（クライアント、タスク、Notion連携等）
│
├── queue/                    # 通信ファイル
│   ├── shogun_to_karo.yaml   # 将軍から家老へのコマンド
│   ├── tasks/                # 各ワーカーのタスクファイル
│   └── reports/              # ワーカーレポート
│
├── memory/                   # Memory MCP保存場所
├── dashboard.md              # リアルタイム状況一覧
└── CLAUDE.md                 # Claude用プロジェクトコンテキスト
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

この分離設計により、将軍システムは複数の外部プロジェクトを横断的に統率しつつ、プロジェクトの詳細情報はバージョン管理の対象外に保つことができる。

---

## 🔧 トラブルシューティング

<details>
<summary><b>npm版のClaude Code CLIを使っている？</b></summary>

npm版（`npm install -g @anthropic-ai/claude-code`）は公式で非推奨（deprecated）になりました。`first_setup.sh` を再実行すると、npm版を検出してネイティブ版への移行を提案します。

```bash
# first_setup.sh を再実行
./first_setup.sh

# npm版が検出されると以下のメッセージが表示される:
# ⚠️ npm版 Claude Code CLI が検出されました（公式非推奨）
# ネイティブ版をインストールしますか? [Y/n]:

# Y を選択後、npm版をアンインストール:
npm uninstall -g @anthropic-ai/claude-code
```

</details>

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
claude --dangerously-skip-permissions --system-prompt "..."
```

</details>

<details>
<summary><b>ワーカーが停止している？</b></summary>

ワーカーのペインを確認：
```bash
tmux attach-session -t multiagent
# Ctrl+B の後に数字でペインを切り替え
```

</details>

<details>
<summary><b>将軍やエージェントが落ちた？（Claude Codeプロセスがkillされた）</b></summary>

**`css` 等のtmuxセッション起動エイリアスを使って再起動してはいけません。** これらのエイリアスはtmuxセッションを作成するため、既存のtmuxペイン内で実行するとセッションがネスト（入れ子）になり、入力が壊れてペインが使用不能になります。

**正しい再起動方法：**

```bash
# 方法1: ペイン内でclaudeを直接実行
claude --model opus --dangerously-skip-permissions

# 方法2: 家老がrespawn-paneで強制再起動（ネストも解消される）
tmux respawn-pane -t shogun:0.0 -k 'claude --model opus --dangerously-skip-permissions'
```

**誤ってtmuxをネストしてしまった場合：**
1. `Ctrl+B` の後 `d` でデタッチ（内側のセッションから離脱）
2. その後 `claude` を直接実行（`css` は使わない）
3. デタッチが効かない場合は、別のペインから `tmux respawn-pane -k` で強制リセット

</details>

---

## 📚 tmux クイックリファレンス

| コマンド | 説明 |
|----------|------|
| `tmux attach -t shogun` | 将軍に接続 |
| `tmux attach -t multiagent` | ワーカーに接続 |
| `Ctrl+B` の後 `0-8` | ペイン間を切り替え |
| `Ctrl+B` の後 `d` | デタッチ（実行継続） |
| `tmux kill-session -t shogun` | 将軍セッションを停止 |
| `tmux kill-session -t multiagent` | ワーカーセッションを停止 |

### 🖱️ マウス操作

`first_setup.sh` が `~/.tmux.conf` に `set -g mouse on` を自動設定するため、マウスによる直感的な操作が可能です：

| 操作 | 説明 |
|------|------|
| マウスホイール | ペイン内のスクロール（出力履歴の確認） |
| ペインをクリック | ペイン間のフォーカス切替 |
| ペイン境界をドラッグ | ペインのリサイズ |

キーボード操作に不慣れな場合でも、マウスだけでペインの切替・スクロール・リサイズが行えます。

---

## 🙏 クレジット

[Claude-Code-Communication](https://github.com/Akira-Papa/Claude-Code-Communication) by Akira-Papa をベースに開発。

---

## 📄 ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照。

---

<div align="center">

**AIの軍勢を統率せよ。より速く構築せよ。**

</div>
