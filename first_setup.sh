#!/bin/bash
# ============================================================
# first_setup.sh - multi-agent-ff15 初回セットアップスクリプト
# Ubuntu / WSL / Mac 用環境構築ツール
# ============================================================
# 実行方法:
#   chmod +x first_setup.sh
#   ./first_setup.sh
# ============================================================

set -e

# 色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# アイコン付きログ関数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}\n"
}

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 結果追跡用変数
RESULTS=()
HAS_ERROR=false

echo ""
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║  ⚔️ multi-agent-ff15 インストーラー                         ║"
echo "  ║     Initial Setup Script for Ubuntu / WSL                    ║"
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  このスクリプトは初回セットアップ用です。"
echo "  依存関係の確認とディレクトリ構造の作成を行います。"
echo ""
echo "  インストール先: $SCRIPT_DIR"
echo ""

# ============================================================
# STEP 1: OS チェック
# ============================================================
log_step "STEP 1: システム環境チェック"

# OS情報を取得
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_NAME=$NAME
    OS_VERSION=$VERSION_ID
    log_info "OS: $OS_NAME $OS_VERSION"
else
    OS_NAME="Unknown"
    log_warn "OS情報を取得できませんでした"
fi

# WSL チェック
if grep -qi microsoft /proc/version 2>/dev/null; then
    log_info "環境: WSL (Windows Subsystem for Linux)"
    IS_WSL=true
else
    log_info "環境: Native Linux"
    IS_WSL=false
fi

RESULTS+=("システム環境: OK")

# ============================================================
# STEP 2: tmux チェック・インストール
# ============================================================
log_step "STEP 2: tmux チェック"

if command -v tmux &> /dev/null; then
    TMUX_VERSION=$(tmux -V | awk '{print $2}')
    log_success "tmux がインストール済みです (v$TMUX_VERSION)"
    RESULTS+=("tmux: OK (v$TMUX_VERSION)")
else
    log_warn "tmux がインストールされていません"
    echo ""

    # Ubuntu/Debian系かチェック
    if command -v apt-get &> /dev/null; then
        log_info "tmux をインストール中..."
        if ! sudo -n apt-get update -qq 2>/dev/null; then
            if ! sudo apt-get update -qq 2>/dev/null; then
                log_error "sudo の実行に失敗しました。ターミナルから直接実行してください"
                RESULTS+=("tmux: インストール失敗 (sudo失敗)")
                HAS_ERROR=true
            fi
        fi

        if [ "$HAS_ERROR" != true ]; then
            if ! sudo -n apt-get install -y tmux 2>/dev/null; then
                if ! sudo apt-get install -y tmux 2>/dev/null; then
                    log_error "tmux のインストールに失敗しました"
                    RESULTS+=("tmux: インストール失敗")
                    HAS_ERROR=true
                fi
            fi
        fi

        if command -v tmux &> /dev/null; then
            TMUX_VERSION=$(tmux -V | awk '{print $2}')
            log_success "tmux インストール完了 (v$TMUX_VERSION)"
            RESULTS+=("tmux: インストール完了 (v$TMUX_VERSION)")
        else
            log_error "tmux のインストールに失敗しました"
            RESULTS+=("tmux: インストール失敗")
            HAS_ERROR=true
        fi
    else
        log_error "apt-get が見つかりません。手動で tmux をインストールしてください"
        echo ""
        echo "  インストール方法:"
        echo "    Ubuntu/Debian: sudo apt-get install tmux"
        echo "    Fedora:        sudo dnf install tmux"
        echo "    macOS:         brew install tmux"
        RESULTS+=("tmux: 未インストール (手動インストール必要)")
        HAS_ERROR=true
    fi
fi

# ============================================================
# STEP 3: tmux マウススクロール設定
# ============================================================
log_step "STEP 3: tmux マウススクロール設定"

TMUX_CONF="$HOME/.tmux.conf"
TMUX_MOUSE_SETTING="set -g mouse on"

if [ -f "$TMUX_CONF" ] && grep -qF "$TMUX_MOUSE_SETTING" "$TMUX_CONF" 2>/dev/null; then
    log_info "tmux マウス設定は既に ~/.tmux.conf に存在します"
else
    log_info "~/.tmux.conf に '$TMUX_MOUSE_SETTING' を追加中..."
    echo "" >> "$TMUX_CONF"
    echo "# マウススクロール有効化 (added by first_setup.sh)" >> "$TMUX_CONF"
    echo "$TMUX_MOUSE_SETTING" >> "$TMUX_CONF"
    log_success "tmux マウス設定を追加しました"
fi

# tmux が起動中の場合は即反映
if command -v tmux &> /dev/null && tmux list-sessions &> /dev/null; then
    log_info "tmux が起動中のため、設定を即反映します..."
    if tmux source-file "$TMUX_CONF" 2>/dev/null; then
        log_success "tmux 設定を再読み込みしました"
    else
        log_warn "tmux 設定の再読み込みに失敗しました（手動で tmux source-file ~/.tmux.conf を実行してください）"
    fi
else
    log_info "tmux は起動していないため、次回起動時に反映されます"
fi

RESULTS+=("tmux マウス設定: OK")

# ============================================================
# STEP 4: Node.js チェック
# ============================================================
log_step "STEP 4: Node.js チェック"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    log_success "Node.js がインストール済みです ($NODE_VERSION)"

    # バージョンチェック（18以上推奨）
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | tr -d 'v')
    if [ "$NODE_MAJOR" -lt 18 ]; then
        log_warn "Node.js 18以上を推奨します（現在: $NODE_VERSION）"
        RESULTS+=("Node.js: OK (v$NODE_MAJOR - 要アップグレード推奨)")
    else
        RESULTS+=("Node.js: OK ($NODE_VERSION)")
    fi
else
    log_warn "Node.js がインストールされていません"
    echo ""

    # nvm が既にインストール済みか確認
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        log_info "nvm が既にインストール済みです。Node.js をセットアップ中..."
        \. "$NVM_DIR/nvm.sh"
    else
        # nvm 自動インストール
        log_info "nvm をインストール中..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi

    # nvm が利用可能なら Node.js をインストール
    if command -v nvm &> /dev/null; then
        log_info "Node.js 20 をインストール中..."
        nvm install 20 || true
        nvm use 20 || true

        if command -v node &> /dev/null; then
            NODE_VERSION=$(node -v)
            log_success "Node.js インストール完了 ($NODE_VERSION)"
            RESULTS+=("Node.js: インストール完了 ($NODE_VERSION)")
        else
            log_error "Node.js のインストールに失敗しました"
            RESULTS+=("Node.js: インストール失敗")
            HAS_ERROR=true
        fi
    elif [ "$HAS_ERROR" != true ]; then
        log_error "nvm のインストールに失敗しました"
        echo ""
        echo "  手動でインストールしてください:"
        echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
        echo "    source ~/.bashrc"
        echo "    nvm install 20"
        echo ""
        RESULTS+=("Node.js: 未インストール (nvm失敗)")
        HAS_ERROR=true
    fi
fi

# npm チェック
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    log_success "npm がインストール済みです (v$NPM_VERSION)"
else
    if command -v node &> /dev/null; then
        log_warn "npm が見つかりません（Node.js と一緒にインストールされるはずです）"
    fi
fi

# ============================================================
# STEP 5: OpenCode Code CLI チェック（ネイティブ版）
# ※ npm版は公式非推奨（deprecated）。ネイティブ版を使用する。
#    Node.jsはMCPサーバー（npx経由）で引き続き必要。
# ============================================================
log_step "STEP 5: OpenCode Code CLI チェック"

# ネイティブ版の既存インストールを検出するため、PATHに ~/.local/bin を含める
export PATH="$HOME/.local/bin:$PATH"

NEED_OPENCODE_INSTALL=false
HAS_NPM_OPENCODE=false

if command -v opencode &> /dev/null; then
    # opencode コマンドは存在する → 実際に動くかチェック
    OPENCODE_VERSION=$(opencode --version 2>&1)
    OPENCODE_PATH=$(which opencode 2>/dev/null)

    if [ $? -eq 0 ] && [ "$OPENCODE_VERSION" != "unknown" ] && [[ "$OPENCODE_VERSION" != *"not found"* ]]; then
        # 動作する opencode が見つかった → npm版かネイティブ版かを判定
        if echo "$OPENCODE_PATH" | grep -qi "npm\|node_modules\|AppData"; then
            # npm版が動いている
            HAS_NPM_OPENCODE=true
            log_warn "npm版 OpenCode Code CLI が検出されました（公式非推奨）"
            log_info "検出パス: $OPENCODE_PATH"
            log_info "バージョン: $OPENCODE_VERSION"
            echo ""
            echo "  npm版は公式で非推奨（deprecated）となっています。"
            echo "  ネイティブ版をインストールし、npm版はアンインストールすることを推奨します。"
            echo ""
            if [ ! -t 0 ]; then
                REPLY="Y"
            else
                read -p "  ネイティブ版をインストールしますか? [Y/n]: " REPLY
            fi
            REPLY=${REPLY:-Y}
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                NEED_OPENCODE_INSTALL=true
                # npm版のアンインストール案内
                echo ""
                log_info "先にnpm版をアンインストールしてください:"
                if echo "$OPENCODE_PATH" | grep -qi "mnt/c\|AppData"; then
                    echo "  Windows の PowerShell で:"
                    echo "    npm uninstall -g @anthropic-ai/opencode-code"
                else
                    echo "    npm uninstall -g @anthropic-ai/opencode-code"
                fi
                echo ""
            else
                log_warn "ネイティブ版への移行をスキップしました（npm版で続行）"
                RESULTS+=("OpenCode Code CLI: OK (npm版・移行推奨)")
            fi
        else
            # ネイティブ版が正常に動作している
            log_success "OpenCode Code CLI がインストール済みです（ネイティブ版）"
            log_info "バージョン: $OPENCODE_VERSION"
            RESULTS+=("OpenCode Code CLI: OK")
        fi
    else
        # command -v で見つかるが動かない（npm版でNode.js無し等）
        log_warn "OpenCode Code CLI が見つかりましたが正常に動作しません"
        log_info "検出パス: $OPENCODE_PATH"
        if echo "$OPENCODE_PATH" | grep -qi "npm\|node_modules\|AppData"; then
            HAS_NPM_OPENCODE=true
            log_info "→ npm版（Node.js依存）が検出されました"
        else
            log_info "→ バージョン取得に失敗しました"
        fi
        NEED_OPENCODE_INSTALL=true
    fi
else
    # opencode コマンドが見つからない
    NEED_OPENCODE_INSTALL=true
fi

if [ "$NEED_OPENCODE_INSTALL" = true ]; then
    log_info "ネイティブ版 OpenCode Code CLI をインストールします"
    log_info "OpenCode Code CLI をインストール中（ネイティブ版）..."
    curl -fsSL https://opencode.ai/install.sh | bash

    # PATHを更新（インストール直後は反映されていない可能性）
    export PATH="$HOME/.local/bin:$PATH"

    # .bashrc に永続化（重複追加を防止）
    if ! grep -q 'export PATH="\$HOME/.local/bin:\$PATH"' "$HOME/.bashrc" 2>/dev/null; then
        echo '' >> "$HOME/.bashrc"
        echo '# OpenCode Code CLI PATH (added by first_setup.sh)' >> "$HOME/.bashrc"
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
        log_info "~/.local/bin を ~/.bashrc の PATH に追加しました"
    fi

    if command -v opencode &> /dev/null; then
        OPENCODE_VERSION=$(opencode --version 2>/dev/null || echo "unknown")
        log_success "OpenCode Code CLI インストール完了（ネイティブ版）"
        log_info "バージョン: $OPENCODE_VERSION"
        RESULTS+=("OpenCode Code CLI: インストール完了")

        # npm版が残っている場合の案内
        if [ "$HAS_NPM_OPENCODE" = true ]; then
            echo ""
            log_info "ネイティブ版がPATHで優先されるため、npm版は無効化されます"
            log_info "npm版を完全に削除するには以下を実行してください:"
            if echo "$OPENCODE_PATH" | grep -qi "mnt/c\|AppData"; then
                echo "  Windows の PowerShell で:"
                echo "    npm uninstall -g @anthropic-ai/opencode-code"
            else
                echo "    npm uninstall -g @anthropic-ai/opencode-code"
            fi
        fi
    else
        log_error "インストールに失敗しました。パスを確認してください"
        log_info "~/.local/bin がPATHに含まれているか確認してください"
        RESULTS+=("OpenCode Code CLI: インストール失敗")
        HAS_ERROR=true
    fi
fi

# ============================================================
# STEP 6: ディレクトリ構造作成
# ============================================================
log_step "STEP 6: ディレクトリ構造作成"

# 必要なディレクトリ一覧
DIRECTORIES=(
    "queue/tasks"
    "queue/reports"
    "config"
    "status"
    "instructions"
    "logs"
    "demo_output"
    "skills"
    "memory"
)

CREATED_COUNT=0
EXISTED_COUNT=0

for dir in "${DIRECTORIES[@]}"; do
    if [ ! -d "$SCRIPT_DIR/$dir" ]; then
        mkdir -p "$SCRIPT_DIR/$dir"
        log_info "作成: $dir/"
        CREATED_COUNT=$((CREATED_COUNT + 1))
    else
        EXISTED_COUNT=$((EXISTED_COUNT + 1))
    fi
done

if [ $CREATED_COUNT -gt 0 ]; then
    log_success "$CREATED_COUNT 個のディレクトリを作成しました"
fi
if [ $EXISTED_COUNT -gt 0 ]; then
    log_info "$EXISTED_COUNT 個のディレクトリは既に存在します"
fi

RESULTS+=("ディレクトリ構造: OK (作成:$CREATED_COUNT, 既存:$EXISTED_COUNT)")

# ============================================================
# STEP 7: 設定ファイル初期化
# ============================================================
log_step "STEP 7: 設定ファイル確認"

# config/settings.yaml
if [ ! -f "$SCRIPT_DIR/config/settings.yaml" ]; then
    log_info "config/settings.yaml を作成中..."
    cat > "$SCRIPT_DIR/config/settings.yaml" << EOF
# multi-agent-ff15 設定ファイル

# 言語設定
# ja: 日本語（FF15風日本語のみ、併記なし）
# en: 英語（FF15風日本語 + 英訳併記）
# その他の言語コード（es, zh, ko, fr, de 等）も対応
language: ja

# シェル設定
# bash: bash用プロンプト（デフォルト）
# zsh: zsh用プロンプト
shell: bash

# スキル設定
skill:
  # スキル保存先（このプロジェクト専用 - 必ずここに保存すること）
  path: "$SCRIPT_DIR/.opencode/skills/"

# ログ設定
logging:
  level: info  # debug | info | warn | error
  path: "$SCRIPT_DIR/logs/"
EOF
    log_success "settings.yaml を作成しました"
else
    log_info "config/settings.yaml は既に存在します"
fi

# config/projects.yaml
if [ ! -f "$SCRIPT_DIR/config/projects.yaml" ]; then
    log_info "config/projects.yaml を作成中..."
    cat > "$SCRIPT_DIR/config/projects.yaml" << 'EOF'
projects:
  - id: sample_project
    name: "Sample Project"
    path: "/path/to/your/project"
    priority: high
    status: active

current_project: sample_project
EOF
    log_success "projects.yaml を作成しました"
else
    log_info "config/projects.yaml は既に存在します"
fi

# memory/global_context.md（システム全体のコンテキスト）
if [ ! -f "$SCRIPT_DIR/memory/global_context.md" ]; then
    log_info "memory/global_context.md を作成中..."
    cat > "$SCRIPT_DIR/memory/global_context.md" << 'EOF'
# グローバルコンテキスト
最終更新: (未設定)

## システム方針
- (殿の好み・方針をここに記載)

## プロジェクト横断の決定事項
- (複数プロジェクトに影響する決定をここに記載)

## 注意事項
- (全エージェントが知るべき注意点をここに記載)
EOF
    log_success "global_context.md を作成しました"
else
    log_info "memory/global_context.md は既に存在します"
fi

RESULTS+=("設定ファイル: OK")

# ============================================================
# STEP 8: Worker用タスク・レポートファイル初期化
# ============================================================
log_step "STEP 8: キューファイル初期化"

# Worker用タスクファイル作成 (Comrades: ignis, gladiolus, prompto)
for WORKER_NAME in ignis gladiolus prompto; do
    TASK_FILE="$SCRIPT_DIR/queue/tasks/${WORKER_NAME}.yaml"
    if [ ! -f "$TASK_FILE" ]; then
        cat > "$TASK_FILE" << EOF
# ${WORKER_NAME} task file
task:
  task_id: null
  parent_cmd: null
  description: null
  target_path: null
  status: idle
  timestamp: ""
EOF
    fi
done
log_info "Comradeタスクファイル (ignis/gladiolus/prompto) を確認/作成しました"

# Comrade用レポートファイル作成
for WORKER_NAME in ignis gladiolus prompto; do
    REPORT_FILE="$SCRIPT_DIR/queue/reports/${WORKER_NAME}_report.yaml"
    if [ ! -f "$REPORT_FILE" ]; then
        cat > "$REPORT_FILE" << EOF
worker_id: ${WORKER_NAME}
task_id: null
timestamp: ""
status: idle
result: null
EOF
    fi
done
log_info "Comradeレポートファイル (ignis/gladiolus/prompto) を確認/作成しました"

# Lunafreya → Noctis coordination channel
LUNA_CHANNEL="$SCRIPT_DIR/queue/lunafreya_to_noctis.yaml"
if [ ! -f "$LUNA_CHANNEL" ]; then
    cat > "$LUNA_CHANNEL" << EOF
# Lunafreya → Noctis coordination channel
command:
  command_id: null
  description: null
  priority: null
  status: idle
  timestamp: ""
EOF
    log_info "Lunafreya→Noctis連携チャンネルを作成しました"
fi

RESULTS+=("キューファイル: OK")

# ============================================================
# STEP 9: スクリプト実行権限付与
# ============================================================
log_step "STEP 9: 実行権限設定"

SCRIPTS=(
    "standby.sh"
    "first_setup.sh"
)

for script in "${SCRIPTS[@]}"; do
    if [ -f "$SCRIPT_DIR/$script" ]; then
        chmod +x "$SCRIPT_DIR/$script"
        log_info "$script に実行権限を付与しました"
    fi
done

RESULTS+=("実行権限: OK")

# ============================================================
# STEP 10: Shell alias設定（マルチシェル対応）
# ============================================================
log_step "STEP 10: alias設定（マルチシェル対応）"

# 検出されたシェル設定ファイル
DETECTED_SHELLS=()
ALIAS_ADDED=false
SOURCE_COMMANDS=()

# ffa alias定義
EXPECTED_FFA_BASH="alias ffa='tmux attach -t ff15'"
EXPECTED_FFA_FISH="alias ffa='tmux attach -t ff15'"

# ============================================================
# bash サポート
# ============================================================
BASHRC_FILE="$HOME/.bashrc"
if [ -f "$BASHRC_FILE" ]; then
    DETECTED_SHELLS+=("bash")
    if ! grep -q "alias ffa=" "$BASHRC_FILE" 2>/dev/null; then
        # alias が存在しない → 新規追加
        echo "" >> "$BASHRC_FILE"
        echo "# multi-agent-ff15 aliases (added by first_setup.sh)" >> "$BASHRC_FILE"
        echo "$EXPECTED_FFA_BASH" >> "$BASHRC_FILE"
        log_info "bash: alias ffa を追加しました"
        ALIAS_ADDED=true
    elif ! grep -qF "$EXPECTED_FFA_BASH" "$BASHRC_FILE" 2>/dev/null; then
        # alias は存在するがパスが異なる → 更新
        if sed -i "s|alias ffa=.*|$EXPECTED_FFA_BASH|" "$BASHRC_FILE" 2>/dev/null; then
            log_info "bash: alias ffa を更新しました"
        else
            log_warn "bash: alias ffa の更新に失敗しました"
        fi
        ALIAS_ADDED=true
    else
        log_info "bash: alias ffa は既に正しく設定されています"
    fi
    SOURCE_COMMANDS+=("source ~/.bashrc")
fi

# ============================================================
# zsh サポート
# ============================================================
ZSHRC_FILE="$HOME/.zshrc"
if [ -f "$ZSHRC_FILE" ]; then
    DETECTED_SHELLS+=("zsh")
    if ! grep -q "alias ffa=" "$ZSHRC_FILE" 2>/dev/null; then
        # alias が存在しない → 新規追加
        echo "" >> "$ZSHRC_FILE"
        echo "# multi-agent-ff15 aliases (added by first_setup.sh)" >> "$ZSHRC_FILE"
        echo "$EXPECTED_FFA_BASH" >> "$ZSHRC_FILE"
        log_info "zsh: alias ffa を追加しました"
        ALIAS_ADDED=true
    elif ! grep -qF "$EXPECTED_FFA_BASH" "$ZSHRC_FILE" 2>/dev/null; then
        # alias は存在するがパスが異なる → 更新
        if sed -i "s|alias ffa=.*|$EXPECTED_FFA_BASH|" "$ZSHRC_FILE" 2>/dev/null; then
            log_info "zsh: alias ffa を更新しました"
        else
            log_warn "zsh: alias ffa の更新に失敗しました"
        fi
        ALIAS_ADDED=true
    else
        log_info "zsh: alias ffa は既に正しく設定されています"
    fi
    SOURCE_COMMANDS+=("source ~/.zshrc")
fi

# ============================================================
# fish サポート
# ============================================================
FISHCONFIG_FILE="$HOME/.config/fish/config.fish"
if [ -f "$FISHCONFIG_FILE" ]; then
    DETECTED_SHELLS+=("fish")
    if ! grep -q "alias ffa" "$FISHCONFIG_FILE" 2>/dev/null; then
        # alias が存在しない → 新規追加
        echo "" >> "$FISHCONFIG_FILE"
        echo "# multi-agent-ff15 aliases (added by first_setup.sh)" >> "$FISHCONFIG_FILE"
        echo "$EXPECTED_FFA_FISH" >> "$FISHCONFIG_FILE"
        log_info "fish: alias ffa を追加しました"
        ALIAS_ADDED=true
    elif ! grep -qF "$EXPECTED_FFA_FISH" "$FISHCONFIG_FILE" 2>/dev/null; then
        # alias は存在するがパスが異なる → 更新
        if sed -i "s|alias ffa.*|$EXPECTED_FFA_FISH|" "$FISHCONFIG_FILE" 2>/dev/null; then
            log_info "fish: alias ffa を更新しました"
        else
            log_warn "fish: alias ffa の更新に失敗しました"
        fi
        ALIAS_ADDED=true
    else
        log_info "fish: alias ffa は既に正しく設定されています"
    fi
    SOURCE_COMMANDS+=("source ~/.config/fish/config.fish")
fi

# ============================================================
# 検出結果とサマリー
# ============================================================
if [ ${#DETECTED_SHELLS[@]} -eq 0 ]; then
    log_warn "シェル設定ファイルが見つかりませんでした"
    log_info "サポート対象: bash (~/.bashrc), zsh (~/.zshrc), fish (~/.config/fish/config.fish)"
    RESULTS+=("alias設定: シェル設定ファイル未検出")
else
    log_success "検出されたシェル: ${DETECTED_SHELLS[*]}"
    RESULTS+=("alias設定: OK (${DETECTED_SHELLS[*]})")
fi

if [ "$ALIAS_ADDED" = true ] && [ ${#SOURCE_COMMANDS[@]} -gt 0 ]; then
    log_success "alias設定を追加しました"
    log_warn "alias を反映するには、以下のいずれかを実行してください："
    
    # 各シェルのsourceコマンドを表示
    for i in "${!SOURCE_COMMANDS[@]}"; do
        log_info "  $((i + 1)). ${SOURCE_COMMANDS[$i]}"
    done
    
    if [ "$IS_WSL" = true ]; then
        log_info "  または: PowerShell で 'wsl --shutdown' してからターミナルを開き直す"
        log_info "  ※ ウィンドウを閉じるだけでは WSL が終了しないため反映されません"
    fi
fi

# ============================================================
# STEP 10.5: WSL メモリ最適化設定
# ============================================================
if [ "$IS_WSL" = true ]; then
    log_step "STEP 10.5: WSL メモリ最適化設定"

    # .wslconfig の確認・設定（Windows側のユーザーディレクトリに配置）
    WIN_USER_DIR=$(cmd.exe /C "echo %USERPROFILE%" 2>/dev/null | tr -d '\r')
    if [ -n "$WIN_USER_DIR" ]; then
        # Windows パスを WSL パスに変換
        WSLCONFIG_PATH=$(wslpath "$WIN_USER_DIR")/.wslconfig

        if [ -f "$WSLCONFIG_PATH" ]; then
            if grep -q "autoMemoryReclaim" "$WSLCONFIG_PATH" 2>/dev/null; then
                log_info ".wslconfig に autoMemoryReclaim は既に設定済みです"
            else
                log_info ".wslconfig に autoMemoryReclaim=gradual を追加中..."
                # [experimental] セクションがあるか確認
                if grep -q "\[experimental\]" "$WSLCONFIG_PATH" 2>/dev/null; then
                    # [experimental] セクションの直後に追加
                    sed -i '/\[experimental\]/a autoMemoryReclaim=gradual' "$WSLCONFIG_PATH"
                else
                    echo "" >> "$WSLCONFIG_PATH"
                    echo "[experimental]" >> "$WSLCONFIG_PATH"
                    echo "autoMemoryReclaim=gradual" >> "$WSLCONFIG_PATH"
                fi
                log_success ".wslconfig に autoMemoryReclaim=gradual を追加しました"
                log_warn "反映には 'wsl --shutdown' 後の再起動が必要です"
            fi
        else
            log_info ".wslconfig を新規作成中..."
            cat > "$WSLCONFIG_PATH" << 'EOF'
[experimental]
autoMemoryReclaim=gradual
EOF
            log_success ".wslconfig を作成しました (autoMemoryReclaim=gradual)"
            log_warn "反映には 'wsl --shutdown' 後の再起動が必要です"
        fi

        RESULTS+=("WSL メモリ最適化: OK (.wslconfig設定済み)")
    else
        log_warn "Windowsユーザーディレクトリの取得に失敗しました"
        log_info "手動で %USERPROFILE%\\.wslconfig に以下を追加してください:"
        echo "  [experimental]"
        echo "  autoMemoryReclaim=gradual"
        RESULTS+=("WSL メモリ最適化: 手動設定必要")
    fi

    # 即時キャッシュクリアの案内
    log_info "メモリキャッシュを即時クリアするには以下を実行:"
    echo "  sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches'"
else
    log_info "WSL環境ではないため、メモリ最適化設定をスキップ"
fi

# ============================================================
# STEP 11: Memory MCP セットアップ
# ============================================================
log_step "STEP 11: Memory MCP セットアップ"

if command -v opencode &> /dev/null; then
    OPENCODE_CONFIG_DIR="$HOME/.config/opencode"
    OPENCODE_CONFIG_FILE="$OPENCODE_CONFIG_DIR/opencode.json"
    
    if [ ! -d "$OPENCODE_CONFIG_DIR" ]; then
        mkdir -p "$OPENCODE_CONFIG_DIR"
    fi
    
    if [ -f "$OPENCODE_CONFIG_FILE" ] && grep -q "memory" "$OPENCODE_CONFIG_FILE" 2>/dev/null; then
        log_info "Memory MCP は既に設定済みです"
        RESULTS+=("Memory MCP: OK (設定済み)")
    else
        log_info "Memory MCP を設定中..."
        if [ ! -f "$OPENCODE_CONFIG_FILE" ]; then
            cat > "$OPENCODE_CONFIG_FILE" << EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "mcp": {
    "memory": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-memory"],
      "environment": {
        "MEMORY_FILE_PATH": "$SCRIPT_DIR/memory/noctis_memory.jsonl"
      },
      "enabled": true
    }
  }
}
EOF
            log_success "Memory MCP 設定完了"
            RESULTS+=("Memory MCP: 設定完了")
        else
            log_warn "既存のopencode.jsonにMemory MCPを手動で追加してください"
            echo "  追加内容:"
            echo '  "memory": {'
            echo '    "type": "local",'
            echo '    "command": ["npx", "-y", "@modelcontextprotocol/server-memory"],'
            echo "    \"environment\": {"
            echo "      \"MEMORY_FILE_PATH\": \"$SCRIPT_DIR/memory/noctis_memory.jsonl\""
            echo '    },'
            echo '    "enabled": true'
            echo '  }'
            RESULTS+=("Memory MCP: 手動設定が必要")
        fi
    fi
else
    log_warn "opencode コマンドが見つからないため Memory MCP 設定をスキップ"
    RESULTS+=("Memory MCP: スキップ (opencode未インストール)")
fi

# ============================================================
# 結果サマリー
# ============================================================
echo ""
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║  📋 セットアップ結果サマリー                                  ║"
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo ""

for result in "${RESULTS[@]}"; do
    if [[ $result == *"未インストール"* ]] || [[ $result == *"失敗"* ]]; then
        echo -e "  ${RED}✗${NC} $result"
    elif [[ $result == *"アップグレード"* ]] || [[ $result == *"スキップ"* ]]; then
        echo -e "  ${YELLOW}!${NC} $result"
    else
        echo -e "  ${GREEN}✓${NC} $result"
    fi
done

echo ""

if [ "$HAS_ERROR" = true ]; then
    echo "  ╔══════════════════════════════════════════════════════════════╗"
    echo "  ║  ⚠️  一部の依存関係が不足しています                           ║"
    echo "  ╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "  上記の警告を確認し、不足しているものをインストールしてください。"
    echo "  すべての依存関係が揃ったら、再度このスクリプトを実行して確認できます。"
else
    echo "  ╔══════════════════════════════════════════════════════════════╗"
    echo "  ║  ✅ セットアップ完了！準備完了です！                      ║"
    echo "  ╚══════════════════════════════════════════════════════════════╝"
fi

echo ""
echo "  ┌──────────────────────────────────────────────────────────────┐"
echo "  │  📜 次のステップ                                             │"
echo "  └──────────────────────────────────────────────────────────────┘"
echo ""
echo "  ⚠️  初回のみ: 以下を手動で実行してください"
echo ""
echo "  STEP 0: PATHの反映（このシェルにインストール結果を反映）"
echo "     source ~/.bashrc"
echo ""
echo "  STEP A: OpenCodeを起動して認証"
echo "     opencode"
echo ""
echo "     1. 使用するAIモデルプロバイダーを選択"
echo "     2. 認証プロンプトに従ってログイン"
echo "     3. /exit で退出"
echo ""
echo "     ※ 一度認証すれば ~/.opencode/ に保存され、以降は不要です"
echo ""
echo "  ────────────────────────────────────────────────────────────────"
echo ""
echo "  Stand by Me！（全エージェント起動）:"
echo "     ./standby.sh"
echo ""
echo "  オプション:"
echo "     ./standby.sh -s            # セットアップのみ（OpenCode手動起動）"
echo "     ./standby.sh -t            # Windows Terminalタブ展開"
echo "     ./standby.sh -shell bash   # bash用プロンプトで起動"
echo "     ./standby.sh -shell zsh    # zsh用プロンプトで起動"
echo ""
echo "  ※ シェル設定は config/settings.yaml の shell: でも変更可能です"
echo ""
echo "  詳細は README.md を参照してください。"
echo ""
echo "  ════════════════════════════════════════════════════════════════"
echo "   Stand by Me！ (Stand by Me!)"
echo "  ════════════════════════════════════════════════════════════════"
echo ""

# 依存関係不足の場合は exit 1 を返す（install.bat が検知できるように）
if [ "$HAS_ERROR" = true ]; then
    exit 1
fi