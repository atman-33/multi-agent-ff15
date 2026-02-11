#!/bin/bash
# ⚔️ multi-agent-ff15 起動スクリプト（毎日の起動用）
# Daily Deployment Script for Multi-Agent Orchestration System
#
# 使用方法:
#   ./standby.sh           # 全エージェント起動（前回の状態を維持）
#   ./standby.sh -c        # キューをリセットして起動（クリーンスタート）
#   ./standby.sh -s        # セットアップのみ（OpenCode起動なし）
#   ./standby.sh -h        # ヘルプ表示

set -e

# スクリプトのディレクトリを取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 言語設定を読み取り（デフォルト: ja）
LANG_SETTING="ja"
if [ -f "./config/settings.yaml" ]; then
    LANG_SETTING=$(grep "^language:" ./config/settings.yaml 2>/dev/null | awk '{print $2}' || echo "ja")
fi

# シェル設定を読み取り（デフォルト: bash）
SHELL_SETTING="bash"
if [ -f "./config/settings.yaml" ]; then
    SHELL_SETTING=$(grep "^shell:" ./config/settings.yaml 2>/dev/null | awk '{print $2}' || echo "bash")
fi

# 色付きログ関数（FF15風）
log_info() {
    echo -e "\033[1;33m[INFO]\033[0m $1"
}

log_success() {
    echo -e "\033[1;32m[OK]\033[0m $1"
}

log_war() {
    echo -e "\033[1;31m[>>]\033[0m $1"
}

# ═══════════════════════════════════════════════════════════════════════════════
# プロンプト生成関数（bash/zsh対応）
# ───────────────────────────────────────────────────────────────────────────────
# 使用法: generate_prompt "ラベル" "色" "シェル"
# 色: red, green, blue, magenta, cyan, yellow
# ═══════════════════════════════════════════════════════════════════════════════
generate_prompt() {
    local label="$1"
    local color="$2"
    local shell_type="$3"

    if [ "$shell_type" == "zsh" ]; then
        # zsh用: %F{color}%B...%b%f 形式
        echo "(%F{${color}}%B${label}%b%f) %F{green}%B%~%b%f%# "
    else
        # bash用: \[\033[...m\] 形式
        local color_code
        case "$color" in
            red)     color_code="1;31" ;;
            green)   color_code="1;32" ;;
            yellow)  color_code="1;33" ;;
            blue)    color_code="1;34" ;;
            magenta) color_code="1;35" ;;
            cyan)    color_code="1;36" ;;
            *)       color_code="1;37" ;;  # white (default)
        esac
        echo "(\[\033[${color_code}m\]${label}\[\033[0m\]) \[\033[1;32m\]\w\[\033[0m\]\$ "
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# オプション解析
# ═══════════════════════════════════════════════════════════════════════════════
SETUP_ONLY=false
OPEN_TERMINAL=false
CLEAN_MODE=false
MODE="normal"
SHELL_OVERRIDE=""
MODE_CONFIG_FILE="./config/models.yaml"

while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--setup-only)
            SETUP_ONLY=true
            shift
            ;;
        -c|--clean)
            CLEAN_MODE=true
            shift
            ;;
        --fullpower)
            if [ "$MODE" != "normal" ]; then
                echo "エラー: モードは1つのみ指定できます"
                exit 1
            fi
            MODE="fullpower"
            shift
            ;;
        --lite)
            if [ "$MODE" != "normal" ]; then
                echo "エラー: モードは1つのみ指定できます"
                exit 1
            fi
            MODE="lite"
            shift
            ;;
        --free-kimi)
            if [ "$MODE" != "normal" ]; then
                echo "エラー: モードは1つのみ指定できます"
                exit 1
            fi
            MODE="free-kimi"
            shift
            ;;
        --free-glm)
            if [ "$MODE" != "normal" ]; then
                echo "エラー: モードは1つのみ指定できます"
                exit 1
            fi
            MODE="free-glm"
            shift
            ;;
        -t|--terminal)
            OPEN_TERMINAL=true
            shift
            ;;
        -shell|--shell)
            if [[ -n "$2" && "$2" != -* ]]; then
                SHELL_OVERRIDE="$2"
                shift 2
            else
                echo "エラー: -shell オプションには bash または zsh を指定してください"
                exit 1
            fi
            ;;
        -h|--help)
            echo ""
            echo "⚔️ multi-agent-ff15 起動スクリプト"
            echo ""
            echo "使用方法: ./standby.sh [オプション]"
            echo ""
            echo "オプション:"
            echo "  -c, --clean         キューとダッシュボードをリセットして起動（クリーンスタート）"
            echo "                      未指定時は前回の状態を維持して起動"
            echo "  --fullpower         Full Powerモードで起動"
            echo "  --lite              Liteモードで起動"
            echo "  --free-kimi         無料モード（Kimi K2.5）で起動"
            echo "  --free-glm          無料モード（GLM 4.7）で起動"
            echo "  -s, --setup-only    tmuxセッションのセットアップのみ（OpenCode起動なし）"
            echo "  -t, --terminal      Windows Terminal で新しいタブを開く"
            echo "  -shell, --shell SH  シェルを指定（bash または zsh）"
            echo "                      未指定時は config/settings.yaml の設定を使用"
            echo "  -h, --help          このヘルプを表示"
            echo ""
            echo "例:"
            echo "  ./standby.sh              # 前回の状態を維持してスタート"
            echo "  ./standby.sh -c           # クリーンスタート（キューリセット）"
            echo "  ./standby.sh -s           # セットアップのみ（手動でOpenCode起動）"
            echo "  ./standby.sh -t           # 全エージェント起動 + ターミナルタブ展開"
            echo "  ./standby.sh -shell bash  # bash用プロンプトで起動"
            echo "  ./standby.sh --fullpower  # Full Powerモードでスタート"
            echo "  ./standby.sh --lite       # Liteモードでスタート"
            echo "  ./standby.sh --free-kimi  # 無料モード（Kimi K2.5）でスタート"
            echo "  ./standby.sh --free-glm   # 無料モード（GLM 4.7）でスタート"
            echo "  ./standby.sh -c --fullpower  # クリーンスタート＋Full Powerモード"
            echo "  ./standby.sh -shell zsh   # zsh用プロンプトで起動"
            echo ""
            echo "モデル構成:"
            echo "  config/models.yaml を参照"
            echo ""
            echo "モード構成:"
            echo "  Normal（デフォルト）:    標準構成"
            echo "  Full Power（--fullpower）: 高性能構成"
            echo "  Lite（--lite）:           低コスト構成"
            echo "  Free Kimi（--free-kimi）: 無料（Kimi K2.5）"
            echo "  Free GLM（--free-glm）:   無料（GLM 4.7）"
            echo ""
            echo "エイリアス:"
            echo "  csnt  → cd /mnt/c/tools/multi-agent-ff15 && ./standby.sh"
            echo "  csf   → tmux attach-session -t ff15"
            echo ""
            exit 0
            ;;
        *)
            echo "不明なオプション: $1"
            echo "./standby.sh -h でヘルプを表示"
            exit 1
            ;;
    esac
done

# シェル設定のオーバーライド（コマンドラインオプション優先）
if [ -n "$SHELL_OVERRIDE" ]; then
    if [[ "$SHELL_OVERRIDE" == "bash" || "$SHELL_OVERRIDE" == "zsh" ]]; then
        SHELL_SETTING="$SHELL_OVERRIDE"
    else
        echo "エラー: -shell オプションには bash または zsh を指定してください（指定値: $SHELL_OVERRIDE）"
        exit 1
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# モデル設定の読み込み
# ═══════════════════════════════════════════════════════════════════════════════
# 新構造: modes.<mode>.<agent>.<key> (e.g. modes.normal.noctis.model)
get_mode_value() {
    local mode="$1"
    local agent="$2"
    local key="$3"

    if [ ! -f "$MODE_CONFIG_FILE" ]; then
        echo ""
        return 1
    fi

    awk -v mode="$mode" -v agent="$agent" -v key="$key" '
        $1 == "modes:" {in_modes=1; next}
        in_modes && /^  [a-zA-Z]/ && $1 == mode":" {in_mode=1; next}
        in_modes && in_mode && /^  [a-zA-Z]/ && $1 != mode":" {in_mode=0}
        in_mode && /^    [a-zA-Z]/ && $1 == agent":" {in_agent=1; next}
        in_mode && in_agent && /^    [a-zA-Z]/ && $1 != agent":" {in_agent=0}
        in_agent && $1 == key":" {
            val = $2
            for (i=3; i<=NF; i++) val = val " " $i
            print val
            exit
        }
    ' "$MODE_CONFIG_FILE"
}

require_mode_value() {
    local mode="$1"
    local agent="$2"
    local key="$3"
    local value

    value=$(get_mode_value "$mode" "$agent" "$key")
    if [ -z "$value" ]; then
        echo "エラー: ${MODE_CONFIG_FILE} の modes.${mode}.${agent}.${key} が見つかりません"
        exit 1
    fi
    echo "$value"
}

case "$MODE" in
    normal) MODE_NAME="Normal" ;;
    fullpower) MODE_NAME="Full Power" ;;
    lite) MODE_NAME="Lite" ;;
    free-kimi) MODE_NAME="Free (Kimi K2.5)" ;;
    free-glm) MODE_NAME="Free (GLM 4.7)" ;;
    *)
        echo "エラー: 未対応のモード: $MODE"
        exit 1
        ;;
esac

NOCTIS_MODEL=$(require_mode_value "$MODE" "noctis" "model")
NOCTIS_LABEL=$(require_mode_value "$MODE" "noctis" "label")
IGNIS_MODEL=$(require_mode_value "$MODE" "ignis" "model")
IGNIS_LABEL=$(require_mode_value "$MODE" "ignis" "label")
GLADIOLUS_MODEL=$(require_mode_value "$MODE" "gladiolus" "model")
GLADIOLUS_LABEL=$(require_mode_value "$MODE" "gladiolus" "label")
PROMPTO_MODEL=$(require_mode_value "$MODE" "prompto" "model")
PROMPTO_LABEL=$(require_mode_value "$MODE" "prompto" "label")
LUNAFREYA_MODEL=$(require_mode_value "$MODE" "lunafreya" "model")
LUNAFREYA_LABEL=$(require_mode_value "$MODE" "lunafreya" "label")

# ═══════════════════════════════════════════════════════════════════════════════
# 起動バナー表示
# ═══════════════════════════════════════════════════════════════════════════════
show_battle_cry() {
    clear

    # FF15 タイトルスクリーン
    echo ""
    echo -e "\033[0;90m    ═══════════════════════════════════════════════════════════════════════\033[0m"
    echo ""
    echo -e "                                     \033[1;36m✦\033[0m"
    echo ""
    echo -e "\033[1;37m                     F I N A L    F A N T A S Y\033[0m"
    echo ""
    echo -e "\033[1;33m                          ██╗  ██╗██╗   ██╗\033[0m"
    echo -e "\033[1;33m                          ╚██╗██╔╝██║   ██║\033[0m"
    echo -e "\033[1;33m                           ╚███╔╝ ██║   ██║\033[0m"
    echo -e "\033[1;33m                           ██╔██╗ ╚██╗ ██╔╝\033[0m"
    echo -e "\033[1;33m                          ██╔╝ ██╗ ╚████╔╝\033[0m"
    echo -e "\033[1;33m                          ╚═╝  ╚═╝  ╚═══╝\033[0m"
    echo ""
    echo -e "\033[0;90m                      ── multi-agent-ff15 ──\033[0m"
    echo ""
    echo -e "\033[0;90m    ═══════════════════════════════════════════════════════════════════════\033[0m"
    echo ""

    # ═══════════════════════════════════════════════════════════════════════════
    # Party Formation
    # ═══════════════════════════════════════════════════════════════════════════
    echo -e "\033[1;37m                       【 P A R T Y ・ 5 Agents 】\033[0m"
    echo ""
    echo -e "     \033[1;33m👑 Noctis\033[0m      \033[1;35m✨ Lunafreya\033[0m     \033[1;36m⚔ Ignis\033[0m      \033[1;34m🛡 Gladiolus\033[0m    \033[1;32m🔫 Prompto\033[0m"
    echo -e "      \033[0;90m(King)\033[0m         \033[0;90m(Oracle)\033[0m       \033[0;90m(Comrade)\033[0m      \033[0;90m(Comrade)\033[0m     \033[0;90m(Comrade)\033[0m"
    echo ""
    echo -e "                     \033[1;36m「 了解、いつでも準備OKだ 」\033[0m"
    echo ""

    # ═══════════════════════════════════════════════════════════════════════════
    # システム情報
    # ═══════════════════════════════════════════════════════════════════════════
    echo -e "\033[0;90m    ─────────────────────────────────────────────────────────────────────────\033[0m"
    echo -e "    \033[1;33m⚔\033[0m \033[1;37mmulti-agent-ff15\033[0m  〜 \033[0;37mFF15マルチエージェント並列開発システム\033[0m 〜"
    echo -e "    \033[0;37m  Noctis: 統括+タスク管理 │ Lunafreya: 独立 │ Comrades: 実働×3\033[0m"
    echo -e "\033[0;90m    ─────────────────────────────────────────────────────────────────────────\033[0m"
    echo ""
}

# バナー表示実行
show_battle_cry

echo -e "  \033[1;33m行くぞ、パーティ編成開始だ\033[0m (Setting up the battlefield)"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1: 既存セッションクリーンアップ
# ═══════════════════════════════════════════════════════════════════════════════
log_info "🧹 既存セッションをクリア中..."
tmux kill-session -t ff15 2>/dev/null && log_info "  └─ ff15セッション、クリア完了" || log_info "  └─ ff15セッションは存在せず"
# Legacy session cleanup
tmux kill-session -t kingsglaive 2>/dev/null && log_info "  └─ kingsglaiveセッション（レガシー）、クリア完了" || true
tmux kill-session -t noctis 2>/dev/null && log_info "  └─ noctisセッション（レガシー）、クリア完了" || true

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1.5: 前回記録のバックアップ（--clean時のみ、内容がある場合）
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$CLEAN_MODE" = true ]; then
    BACKUP_DIR="./logs/backup_$(date '+%Y%m%d_%H%M%S')"
    NEED_BACKUP=false

    if [ -f "./dashboard.md" ]; then
        if grep -q "cmd_" "./dashboard.md" 2>/dev/null; then
            NEED_BACKUP=true
        fi
    fi

    if [ "$NEED_BACKUP" = true ]; then
        mkdir -p "$BACKUP_DIR" || true
        cp "./dashboard.md" "$BACKUP_DIR/" 2>/dev/null || true
        cp -r "./queue/reports" "$BACKUP_DIR/" 2>/dev/null || true
        cp -r "./queue/tasks" "$BACKUP_DIR/" 2>/dev/null || true
        cp "./queue/lunafreya_to_noctis.yaml" "$BACKUP_DIR/" 2>/dev/null || true
        log_info "📦 前回の記録をバックアップ: $BACKUP_DIR"
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2: キューディレクトリ確保 + リセット（--clean時のみリセット）
# ═══════════════════════════════════════════════════════════════════════════════

# queue ディレクトリが存在しない場合は作成（初回起動時に必要）
[ -d ./queue/reports ] || mkdir -p ./queue/reports
[ -d ./queue/tasks ] || mkdir -p ./queue/tasks

if [ "$CLEAN_MODE" = true ]; then
    log_info "📜 前回のミッション記録を破棄中..."

    # Comrade task file reset (ignis, gladiolus, prompto)
    for WORKER_NAME in ignis gladiolus prompto; do
        cat > ./queue/tasks/${WORKER_NAME}.yaml << EOF
# ${WORKER_NAME} task file
task:
  task_id: null
  parent_cmd: null
  description: null
  target_path: null
  status: idle
  timestamp: ""
EOF
    done

    # Comrade report file reset (ignis, gladiolus, prompto)
    for WORKER_NAME in ignis gladiolus prompto; do
        cat > ./queue/reports/${WORKER_NAME}_report.yaml << EOF
worker_id: ${WORKER_NAME}
task_id: null
timestamp: ""
status: idle
result: null
EOF
    done

    # Lunafreya → Noctis coordination channel reset
    cat > ./queue/lunafreya_to_noctis.yaml << EOF
# Lunafreya → Noctis coordination channel
command:
  command_id: null
  description: null
  priority: null
  status: idle
  timestamp: ""
EOF

    # Remove legacy files if they exist
    rm -f ./queue/noctis_to_ignis.yaml 2>/dev/null || true
    rm -f ./queue/tasks/iris.yaml 2>/dev/null || true
    rm -f ./queue/reports/iris_report.yaml 2>/dev/null || true
    rm -f ./queue/tasks/lunafreya.yaml 2>/dev/null || true
    rm -f ./queue/reports/lunafreya_report.yaml 2>/dev/null || true

    log_success "✅ クリーンアップ完了"
else
    log_info "📜 前回の状態を維持してスタート..."
    log_success "✅ キュー・報告ファイルはそのまま継続"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3: ダッシュボード初期化（--clean時のみ）
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$CLEAN_MODE" = true ]; then
    log_info "📊 ダッシュボードを初期化中..."
    TIMESTAMP=$(date "+%Y-%m-%d %H:%M")

    if [ "$LANG_SETTING" = "ja" ]; then
        # 日本語のみ
        cat > ./dashboard.md << EOF
# 📊 ミッション状況
最終更新: ${TIMESTAMP}

## 🚨 要対応 - Crystal、ご判断をお願いいたします
なし

## 🔄 進行中 - 只今、ミッション遂行中です
なし

## ✅ 本日の達成結果
| 時刻 | フィールド | 任務 | 結果 |
|------|------|------|------|

## 🎯 スキル化候補 - 承認待ち
なし

## 🛠️ 生成されたスキル
なし

## ⏸️ 待機中
なし

## ❓ 確認事項
なし
EOF
    else
        # 日本語 + 翻訳併記
        cat > ./dashboard.md << EOF
# 📊 ミッション状況 (Battle Status Report)
最終更新 (Last Updated): ${TIMESTAMP}

## 🚨 要対応 - Crystal、ご判断をお願いいたします (Action Required - Awaiting Crystal's Decision)
なし (None)

## 🔄 進行中 - 只今、ミッション遂行中です (In Progress - Currently in Battle)
なし (None)

## ✅ 本日の達成結果 (Today's Achievements)
| 時刻 (Time) | フィールド (Battlefield) | 任務 (Mission) | 結果 (Result) |
|------|------|------|------|

## 🎯 スキル化候補 - 承認待ち (Skill Candidates - Pending Approval)
なし (None)

## 🛠️ 生成されたスキル (Generated Skills)
なし (None)

## ⏸️ 待機中 (On Standby)
なし (None)

## ❓ 確認事項 (Questions for Lord)
なし (None)
EOF
    fi

    log_success "  └─ ダッシュボード初期化完了 (言語: $LANG_SETTING, シェル: $SHELL_SETTING)"
else
    log_info "📊 前回のダッシュボードを維持"
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4: tmux の存在確認
# ═══════════════════════════════════════════════════════════════════════════════
if ! command -v tmux &> /dev/null; then
    echo ""
    echo "  ╔════════════════════════════════════════════════════════╗"
    echo "  ║  [ERROR] tmux not found!                              ║"
    echo "  ║  tmux が見つかりません                                 ║"
    echo "  ╠════════════════════════════════════════════════════════╣"
    echo "  ║  Run first_setup.sh first:                            ║"
    echo "  ║  まず first_setup.sh を実行してください:               ║"
    echo "  ║     ./first_setup.sh                                  ║"
    echo "  ╚════════════════════════════════════════════════════════╝"
    echo ""
    exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5: ff15 セッション作成（統一セッション・5ペイン）
# ═══════════════════════════════════════════════════════════════════════════════
# Layout:
# ┌──────────────┬──────────────┐
# │    Noctis    │  Lunafreya   │  ← Top row: Command layer
# │   (pane 0)  │   (pane 1)   │
# ├──────────────┴──────────────┤
# │ Ignis  │ Gladiolus │Prompto │  ← Bottom row: Workers
# │(pane 2)│ (pane 3)  │(pane 4)│
# └────────┴───────────┴────────┘
#
log_war "⚔️ ff15セッションを構築中（5名配備）..."

# セッション作成（最初のペインが Noctis になる）
if ! tmux new-session -d -s ff15 -n "main" -x 200 -y 50 2>/dev/null; then
    echo ""
    echo "  ╔════════════════════════════════════════════════════════════╗"
    echo "  ║  [ERROR] Failed to create tmux session 'ff15'             ║"
    echo "  ║  tmux セッション 'ff15' の作成に失敗しました              ║"
    echo "  ╠════════════════════════════════════════════════════════════╣"
    echo "  ║  An existing session may be running.                     ║"
    echo "  ║  既存セッションが残っている可能性があります              ║"
    echo "  ║                                                          ║"
    echo "  ║  Check: tmux ls                                          ║"
    echo "  ║  Kill:  tmux kill-session -t ff15                         ║"
    echo "  ╚════════════════════════════════════════════════════════════╝"
    echo ""
    exit 1
fi

# pane-base-index を取得
PANE_BASE=$(tmux show-options -gv pane-base-index 2>/dev/null || echo 0)
PANE_BASE=${PANE_BASE:-0}

# --- Step A: Top row split (Noctis left | Lunafreya right) ---
# Split pane 0 horizontally → creates pane 1 (Lunafreya)
tmux split-window -h -t "ff15:main.${PANE_BASE}"

# --- Step B: Bottom row creation ---
# Split Noctis (pane 0) vertically → creates bottom-left pane (Ignis)
tmux split-window -v -t "ff15:main.${PANE_BASE}"

# --- Step C: Split bottom-right area ---
# Split Lunafreya (pane 1) vertically → creates bottom-right area
# After split-v on pane 0, pane indices shift:
#   pane 0 = Noctis (top-left)
#   pane 1 = Ignis (bottom-left) — newly created
#   pane 2 = Lunafreya (top-right) — shifted from 1 to 2
# Now split Lunafreya (pane 2) vertically:
tmux split-window -v -t "ff15:main.$((PANE_BASE+2))"

# After this split:
#   pane 0 = Noctis (top-left)
#   pane 1 = Ignis (bottom-left)
#   pane 2 = Lunafreya (top-right)
#   pane 3 = bottom-right (new from Lunafreya split)

# --- Step D: Split bottom-right into Gladiolus and Prompto ---
tmux split-window -h -t "ff15:main.$((PANE_BASE+3))"

# After this split:
#   pane 0 = Noctis (top-left)
#   pane 1 = Ignis (bottom-left)
#   pane 2 = Lunafreya (top-right)
#   pane 3 = Gladiolus (bottom-center)
#   pane 4 = Prompto (bottom-right)

# --- Step E: Split bottom-left (Ignis) to give space for 3 equal columns ---
# We need Ignis to share the bottom row equally with Gladiolus and Prompto
# Current bottom layout: Ignis(50%) | Gladiolus(25%) | Prompto(25%)
# We want: Ignis(33%) | Gladiolus(33%) | Prompto(33%)
# This is tricky. Let me use a different approach.

# Actually, let me redo the layout strategy. The simplest approach:
# 1. Start with initial pane (Noctis)
# 2. Split top/bottom (50/50)
# 3. Split top left/right (Noctis | Lunafreya)
# 4. Split bottom into 3 (Ignis | Gladiolus | Prompto)

# Kill extra panes and restart layout
tmux kill-pane -t "ff15:main.$((PANE_BASE+4))" 2>/dev/null || true
tmux kill-pane -t "ff15:main.$((PANE_BASE+3))" 2>/dev/null || true
tmux kill-pane -t "ff15:main.$((PANE_BASE+2))" 2>/dev/null || true
tmux kill-pane -t "ff15:main.$((PANE_BASE+1))" 2>/dev/null || true

# Restart with clean layout
# Pane 0: Noctis (full window initially)

# Split top/bottom (Noctis top, bottom row below)
tmux split-window -v -t "ff15:main.${PANE_BASE}"
# pane 0 = Noctis (top), pane 1 = bottom

# Split top row: Noctis left, Lunafreya right
tmux split-window -h -t "ff15:main.${PANE_BASE}"
# pane 0 = Noctis (top-left), pane 1 = Lunafreya (top-right), pane 2 = bottom

# Split bottom into 3: first split creates Ignis left + rest right
# pane 2 is the bottom row
tmux split-window -h -l 66% -t "ff15:main.$((PANE_BASE+2))"
# pane 2 = Ignis (bottom-left ~33%), pane 3 = bottom-right (~66%)

# Split bottom-right into Gladiolus + Prompto
tmux split-window -h -t "ff15:main.$((PANE_BASE+3))"
# pane 2 = Ignis, pane 3 = Gladiolus, pane 4 = Prompto

# Final layout:
#   pane 0 = Noctis (top-left)
#   pane 1 = Lunafreya (top-right)
#   pane 2 = Ignis (bottom-left)
#   pane 3 = Gladiolus (bottom-center)
#   pane 4 = Prompto (bottom-right)

# ─── Configure all 5 panes ───
PANE_LABELS=("noctis" "lunafreya" "ignis" "gladiolus" "prompto")
PANE_MODELS=("${NOCTIS_LABEL}" "${LUNAFREYA_LABEL}" "${IGNIS_LABEL}" "${GLADIOLUS_LABEL}" "${PROMPTO_LABEL}")
PANE_COLORS=("magenta" "cyan" "red" "blue" "blue")

for i in {0..4}; do
    p=$((PANE_BASE + i))
    label="${PANE_LABELS[$i]}"
    model="${PANE_MODELS[$i]}"
    color="${PANE_COLORS[$i]}"

     # Set agent identity
     tmux set-option -p -t "ff15:main.${p}" @agent_id "${label}"
     tmux select-pane -t "ff15:main.${p}" -T "${label}"

    # Set prompt and working directory
    PROMPT_STR=$(generate_prompt "${label}" "${color}" "$SHELL_SETTING")
    tmux send-keys -t "ff15:main.${p}" "cd \"$(pwd)\" && export PS1='${PROMPT_STR}' && clear" Enter
done

# Noctis pane gets special background
tmux select-pane -t "ff15:main.${PANE_BASE}" -P 'bg=#002b36'

# pane-border-format でエージェント名を表示
tmux set-option -t ff15 -w pane-border-status top
tmux set-option -t ff15 -w pane-border-format '#{pane_index} #{@agent_id}'

log_success "  └─ ff15セッション（5ペイン）、構築完了"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 6: OpenCode Code 起動（-s / --setup-only のときはスキップ）
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$SETUP_ONLY" = false ]; then
    # OpenCode Code CLI の存在チェック
    if ! command -v opencode &> /dev/null; then
        log_info "⚠️  opencode コマンドが見つかりません"
        echo "  first_setup.sh を再実行してください:"
        echo "    ./first_setup.sh"
        exit 1
    fi

    log_war "👑 全員に OpenCode Code を起動中..."

    # Agent models and pane indices
    AGENT_NAMES=("noctis" "lunafreya" "ignis" "gladiolus" "prompto")
    AGENT_MODELS=("${NOCTIS_MODEL}" "${LUNAFREYA_MODEL}" "${IGNIS_MODEL}" "${GLADIOLUS_MODEL}" "${PROMPTO_MODEL}")
    AGENT_LABELS=("${NOCTIS_LABEL}" "${LUNAFREYA_LABEL}" "${IGNIS_LABEL}" "${GLADIOLUS_LABEL}" "${PROMPTO_LABEL}")

    for i in {0..4}; do
        p=$((PANE_BASE + i))
        name="${AGENT_NAMES[$i]}"
        model="${AGENT_MODELS[$i]}"
        label="${AGENT_LABELS[$i]}"

        tmux send-keys -t "ff15:main.${p}" "opencode --model ${model}"
        tmux send-keys -t "ff15:main.${p}" Enter
        log_info "  └─ ${name}（${label}）、起動完了"

        # 少し待機（安定のため）
        sleep 1
    done

    log_success "✅ ${MODE_NAME}でスタート（Noctis: ${NOCTIS_LABEL}, Lunafreya: ${LUNAFREYA_LABEL}, Ignis: ${IGNIS_LABEL}, Gladiolus: ${GLADIOLUS_LABEL}, Prompto: ${PROMPTO_LABEL}）"
    echo ""

    # ═══════════════════════════════════════════════════════════════════════════
    # STEP 6.5: 各エージェントに指示書を読み込ませる
    # ═══════════════════════════════════════════════════════════════════════════
    log_war "📜 各エージェントに指示書を読み込ませ中..."
    echo ""

    echo "  OpenCode Code の起動を待機中（最大30秒）..."

    # Noctisの起動を確認（最大30秒待機）
    for i in {1..30}; do
        if tmux capture-pane -t "ff15:main.${PANE_BASE}" -p | grep -q "bypass permissions"; then
            echo "  └─ Noctisの OpenCode Code 起動確認完了（${i}秒）"
            break
        fi
        sleep 1
    done

    # Noctisに指示書を読み込ませる
    log_info "  └─ Noctisに指示書を伝達中..."
    tmux send-keys -t "ff15:main.${PANE_BASE}" "instructions/noctis.md を読んで役割を理解してくれ。"
    sleep 0.5
    tmux send-keys -t "ff15:main.${PANE_BASE}" Enter

    # Lunafreyaに指示書を読み込ませる
    sleep 2
    log_info "  └─ Lunafreyaに指示書を伝達中..."
    tmux send-keys -t "ff15:main.$((PANE_BASE+1))" "instructions/lunafreya.md を読んで役割を理解してください。あなたはLunafreya（ルナフレーナ/神凪）です。"
    sleep 0.5
    tmux send-keys -t "ff15:main.$((PANE_BASE+1))" Enter

    # Comradesに指示書を読み込ませる（各自専用ファイル）
    sleep 2
    log_info "  └─ Comradesに指示書を伝達中..."
    COMRADE_NAMES=("ignis" "gladiolus" "prompto")
    COMRADE_LABELS=("Ignis（イグニス/軍師）" "Gladiolus（グラディオラス/盾）" "Prompto（プロンプト/銃）")
    COMRADE_INSTRUCTION_FILES=("instructions/ignis.md" "instructions/gladiolus.md" "instructions/prompto.md")
    for i in {0..2}; do
        p=$((PANE_BASE + 2 + i))
        tmux send-keys -t "ff15:main.${p}" "${COMRADE_INSTRUCTION_FILES[$i]} を読んで役割を理解してください。あなたは${COMRADE_LABELS[$i]}です。"
        sleep 0.3
        tmux send-keys -t "ff15:main.${p}" Enter
        sleep 0.5
    done

    log_success "✅ 全員に指示書伝達完了"
    echo ""
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 7: 環境確認・完了メッセージ
# ═══════════════════════════════════════════════════════════════════════════════
log_info "🔍 パーティを確認中..."
echo ""
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  📺 Tmuxセッション (Sessions)                                  │"
echo "  └──────────────────────────────────────────────────────────┘"
tmux list-sessions | sed 's/^/     /'
echo ""
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  📋 パーティ編成 (Formation)                                   │"
echo "  └──────────────────────────────────────────────────────────┘"
echo ""
echo "     【ff15セッション】統一セッション（全5エージェント）"
echo "     ┌──────────────┬──────────────┐"
echo "     │    Noctis    │  Lunafreya   │  ← Command layer"
echo "     │   (pane 0)  │   (pane 1)   │"
echo "     ├──────────────┴──────────────┤"
echo "     │ Ignis  │ Gladiolus │Prompto │  ← Worker layer"
echo "     │(pane 2)│ (pane 3)  │(pane 4)│"
echo "     └────────┴───────────┴────────┘"
echo ""

echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║  ⚔️ 出発準備完了！行くぞ、みんな！                              ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

if [ "$SETUP_ONLY" = true ]; then
    echo "  ⚠️  セットアップのみモード: OpenCode Codeは未起動です"
    echo ""
    echo "  手動でOpenCodeを起動するには:"
    echo "  ┌──────────────────────────────────────────────────────────┐"
    echo "  │  # 全エージェントを一斉起動                                │"
    echo "  │  for p in \$(seq $PANE_BASE $((PANE_BASE+4))); do         │"
    echo "  │      tmux send-keys -t ff15:main.\$p \                    │"
    echo "  │      'opencode' Enter                                    │"
    echo "  │  done                                                    │"
    echo "  └──────────────────────────────────────────────────────────┘"
    echo ""
fi

echo "  次のステップ:"
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  ff15セッションにアタッチして命令を開始:                      │"
echo "  │     tmux attach-session -t ff15   (または: csf)          │"
echo "  │                                                          │"
echo "  │  ※ 各エージェントは指示書を読み込み済み。                 │"
echo "  │    すぐに命令を開始できます。                             │"
echo "  └──────────────────────────────────────────────────────────┘"
echo ""
echo "  ════════════════════════════════════════════════════════════"
echo "   行くぞ、仲間とともに！ (Let's go, together with our comrades!)"
echo "  ════════════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 8: Windows Terminal でタブを開く（-t オプション時のみ）
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$OPEN_TERMINAL" = true ]; then
    log_info "📺 Windows Terminal でタブを展開中..."

    # Windows Terminal が利用可能か確認
    if command -v wt.exe &> /dev/null; then
        wt.exe -w 0 new-tab wsl.exe -e bash -c "tmux attach-session -t ff15"
        log_success "  └─ ターミナルタブ展開完了"
    else
        log_info "  └─ wt.exe が見つかりません。手動でアタッチしてください。"
    fi
    echo ""
fi
