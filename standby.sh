#!/bin/bash
# ⚔️ multi-agent-ff15 Deployment Script (Daily Startup)
# Daily Deployment Script for Multi-Agent Orchestration System
#
# Usage:
#   ./standby.sh           # Start all agents (preserve previous state)
#   ./standby.sh -c        # Clean start (reset queues)
#   ./standby.sh -s        # Setup only (no OpenCode launch)
#   ./standby.sh -h        # Show help

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Read language setting (default: ja)
LANG_SETTING="ja"
if [ -f "./config/settings.yaml" ]; then
    LANG_SETTING=$(grep "^language:" ./config/settings.yaml 2>/dev/null | awk '{print $2}' || echo "ja")
fi

# Read shell setting (default: bash)
SHELL_SETTING="bash"
if [ -f "./config/settings.yaml" ]; then
    SHELL_SETTING=$(grep "^shell:" ./config/settings.yaml 2>/dev/null | awk '{print $2}' || echo "bash")
fi

# Colored log functions (FF15 style)
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
# Prompt generation function (bash/zsh support)
# ───────────────────────────────────────────────────────────────────────────────
# Usage: generate_prompt "label" "color" "shell"
# Colors: red, green, blue, magenta, cyan, yellow
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
# Option parsing
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
                echo "Error: Only one mode can be specified"
                exit 1
            fi
            MODE="fullpower"
            shift
            ;;
        --lite)
            if [ "$MODE" != "normal" ]; then
                echo "Error: Only one mode can be specified"
                exit 1
            fi
            MODE="lite"
            shift
            ;;
        --free-kimi)
            if [ "$MODE" != "normal" ]; then
                echo "Error: Only one mode can be specified"
                exit 1
            fi
            MODE="free-kimi"
            shift
            ;;
        --free-glm)
            if [ "$MODE" != "normal" ]; then
                echo "Error: Only one mode can be specified"
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
                echo "Error: -shell option requires bash or zsh"
                exit 1
            fi
            ;;
        -h|--help)
            echo ""
            echo "⚔️ multi-agent-ff15 Deployment Script"
            echo ""
            echo "Usage: ./standby.sh [options]"
            echo ""
            echo "Options:"
            echo "  -c, --clean         Clean start (reset queues and dashboard)"
            echo "                      If omitted, resume from previous state"
            echo "  --fullpower         Start in Full Power mode"
            echo "  --lite              Start in Lite mode"
            echo "  --free-kimi         Start in Free mode (Kimi K2.5)"
            echo "  --free-glm          Start in Free mode (GLM 4.7)"
            echo "  -s, --setup-only    Setup tmux session only (no OpenCode launch)"
            echo "  -t, --terminal      Open new tab in Windows Terminal"
            echo "  -shell, --shell SH  Specify shell (bash or zsh)"
            echo "                      If omitted, use config/settings.yaml setting"
            echo "  -h, --help          Show this help"
            echo ""
            echo "Examples:"
            echo "  ./standby.sh              # Resume from previous state"
            echo "  ./standby.sh -c           # Clean start (reset queues)"
            echo "  ./standby.sh -s           # Setup only (manual OpenCode launch)"
            echo "  ./standby.sh -t           # Start all agents + open terminal tab"
            echo "  ./standby.sh -shell bash  # Start with bash prompt"
            echo "  ./standby.sh --fullpower  # Start in Full Power mode"
            echo "  ./standby.sh --lite       # Start in Lite mode"
            echo "  ./standby.sh --free-kimi  # Start in Free mode (Kimi K2.5)"
            echo "  ./standby.sh --free-glm   # Start in Free mode (GLM 4.7)"
            echo "  ./standby.sh -c --fullpower  # Clean start + Full Power mode"
            echo "  ./standby.sh -shell zsh   # Start with zsh prompt"
            echo ""
            echo "Model configuration:"
            echo "  See config/models.yaml"
            echo ""
            echo "Mode configuration:"
            echo "  Normal (default):         Standard configuration"
            echo "  Full Power (--fullpower): High-performance configuration"
            echo "  Lite (--lite):            Low-cost configuration"
            echo "  Free Kimi (--free-kimi):  Free (Kimi K2.5)"
            echo "  Free GLM (--free-glm):    Free (GLM 4.7)"
            echo ""
            echo "Aliases:"
            echo "  csnt  → cd /mnt/c/tools/multi-agent-ff15 && ./standby.sh"
            echo "  csf   → tmux attach-session -t ff15"
            echo ""
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Run ./standby.sh -h for help"
            exit 1
            ;;
    esac
done

# Shell setting override (command-line option takes priority)
if [ -n "$SHELL_OVERRIDE" ]; then
    if [[ "$SHELL_OVERRIDE" == "bash" || "$SHELL_OVERRIDE" == "zsh" ]]; then
        SHELL_SETTING="$SHELL_OVERRIDE"
    else
        echo "Error: -shell option requires bash or zsh (provided: $SHELL_OVERRIDE)"
        exit 1
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Load model configuration
# ═══════════════════════════════════════════════════════════════════════════════
# New structure: modes.<mode>.<agent>.<key> (e.g. modes.normal.noctis.model)
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
        echo "Error: modes.${mode}.${agent}.${key} not found in ${MODE_CONFIG_FILE}"
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
        echo "Error: Unsupported mode: $MODE"
        exit 1
        ;;
esac

NOCTIS_MODEL=$(require_mode_value "$MODE" "noctis" "model")
IGNIS_MODEL=$(require_mode_value "$MODE" "ignis" "model")
GLADIOLUS_MODEL=$(require_mode_value "$MODE" "gladiolus" "model")
PROMPTO_MODEL=$(require_mode_value "$MODE" "prompto" "model")
LUNAFREYA_MODEL=$(require_mode_value "$MODE" "lunafreya" "model")

# ═══════════════════════════════════════════════════════════════════════════════
# Startup banner
# ═══════════════════════════════════════════════════════════════════════════════
show_battle_cry() {
    clear

    # FF15 title screen
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
    # System information
    # ═══════════════════════════════════════════════════════════════════════════
    echo -e "\033[0;90m    ─────────────────────────────────────────────────────────────────────────\033[0m"
    echo -e "    \033[1;33m⚔\033[0m \033[1;37mmulti-agent-ff15\033[0m  〜 \033[0;37mFF15 Multi-Agent Parallel Development System\033[0m 〜"
    echo -e "    \033[0;37m  Noctis: Oversight+Task Mgmt │ Lunafreya: Independent │ Comrades: Workers×3\033[0m"
    echo -e "\033[0;90m    ─────────────────────────────────────────────────────────────────────────\033[0m"
    echo ""
}

# Execute banner display
show_battle_cry

echo -e "  \033[1;33m行くぞ、パーティ編成開始だ\033[0m (Setting up the battlefield)"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1: Clean up existing sessions
# ═══════════════════════════════════════════════════════════════════════════════
log_info "🧹 Cleaning up existing sessions..."
tmux kill-session -t ff15 2>/dev/null && log_info "  └─ ff15 session cleaned" || log_info "  └─ ff15 session not found"
# Legacy session cleanup
tmux kill-session -t kingsglaive 2>/dev/null && log_info "  └─ kingsglaive session (legacy) cleaned" || true
tmux kill-session -t noctis 2>/dev/null && log_info "  └─ noctis session (legacy) cleaned" || true

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1.5: Backup previous records (--clean mode only, if content exists)
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
        log_info "📦 Previous records backed up: $BACKUP_DIR"
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2: Ensure queue directory + reset (--clean mode only)
# ═══════════════════════════════════════════════════════════════════════════════

# Create queue directories if they don't exist (needed for first launch)
[ -d ./queue/reports ] || mkdir -p ./queue/reports
[ -d ./queue/tasks ] || mkdir -p ./queue/tasks

if [ "$CLEAN_MODE" = true ]; then
    log_info "📜 Discarding previous mission records..."

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

    log_success "✅ Cleanup complete"
else
    log_info "📜 Resuming from previous state..."
    log_success "✅ Queues and reports preserved"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3: Dashboard initialization (--clean mode only)
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$CLEAN_MODE" = true ]; then
    log_info "📊 Initializing dashboard..."
    TIMESTAMP=$(date "+%Y-%m-%d %H:%M")

    # English version (unified for all language settings)
    cat > ./dashboard.md << EOF
# 📊 Mission Status
Last Updated: ${TIMESTAMP}

## 🚨 Requires Action
None

## 🔄 In Progress
None

## ✅ Today's Results
| Time | Field | Mission | Result |
|------|-------|---------|--------|

## 🎯 Skill Candidates - Awaiting Approval
None

## 🛠️ Generated Skills
None

## ⏸️ On Standby
None

## ❓ Confirmation Items
None
EOF

    log_success "  └─ Dashboard initialized (language: $LANG_SETTING, shell: $SHELL_SETTING)"
else
    log_info "📊 Preserving previous dashboard"
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4: Check tmux existence
# ═══════════════════════════════════════════════════════════════════════════════
if ! command -v tmux &> /dev/null; then
    echo ""
    echo "  ╔════════════════════════════════════════════════════════╗"
    echo "  ║  [ERROR] tmux not found!                              ║"
    echo "  ║  tmux not found                                        ║"
    echo "  ╠════════════════════════════════════════════════════════╣"
    echo "  ║  Run first_setup.sh first:                            ║"
    echo "  ║  Please run first_setup.sh first:                     ║"
    echo "  ║     ./first_setup.sh                                  ║"
    echo "  ╚════════════════════════════════════════════════════════╝"
    echo ""
    exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5: Create ff15 session (unified session, 5 panes)
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
log_war "⚔️ Building ff15 session (deploying 5 agents)..."

# Create session (first pane becomes Noctis)
if ! tmux new-session -d -s ff15 -n "main" -x 200 -y 50 2>/dev/null; then
    echo ""
    echo "  ╔════════════════════════════════════════════════════════════╗"
    echo "  ║  [ERROR] Failed to create tmux session 'ff15'             ║"
    echo "  ║  Failed to create tmux session 'ff15'                     ║"
    echo "  ╠════════════════════════════════════════════════════════════╣"
    echo "  ║  An existing session may be running.                     ║"
    echo "  ║  An existing session may remain.                         ║"
    echo "  ║                                                          ║"
    echo "  ║  Check: tmux ls                                          ║"
    echo "  ║  Kill:  tmux kill-session -t ff15                         ║"
    echo "  ╚════════════════════════════════════════════════════════════╝"
    echo ""
    exit 1
fi

# Get pane-base-index
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
PANE_COLORS=("magenta" "cyan" "red" "blue" "blue")

for i in {0..4}; do
    p=$((PANE_BASE + i))
    label="${PANE_LABELS[$i]}"
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

# Display agent names with pane-border-format
tmux set-option -t ff15 -w pane-border-status top
tmux set-option -t ff15 -w pane-border-format '#{pane_index} #{@agent_id}'

log_success "  └─ ff15 session (5 panes) built"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 6: Launch OpenCode (skip if -s / --setup-only)
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$SETUP_ONLY" = false ]; then
    # Check OpenCode CLI existence
    if ! command -v opencode &> /dev/null; then
        log_info "⚠️  opencode command not found"
        echo "  Please re-run first_setup.sh:"
        echo "    ./first_setup.sh"
        exit 1
    fi

    log_war "👑 Launching OpenCode for all agents..."

    # Agent models and pane indices
    AGENT_NAMES=("noctis" "lunafreya" "ignis" "gladiolus" "prompto")
    AGENT_MODELS=("${NOCTIS_MODEL}" "${LUNAFREYA_MODEL}" "${IGNIS_MODEL}" "${GLADIOLUS_MODEL}" "${PROMPTO_MODEL}")

    for i in {0..4}; do
        p=$((PANE_BASE + i))
        name="${AGENT_NAMES[$i]}"
        model="${AGENT_MODELS[$i]}"

        tmux send-keys -t "ff15:main.${p}" "opencode --model ${model}"
        tmux send-keys -t "ff15:main.${p}" Enter
        log_info "  └─ ${name} launched"

        # Wait for stability
        sleep 1
    done

    log_success "✅ Started in ${MODE_NAME} mode (5 agents deployed)"
    echo ""

    # ═══════════════════════════════════════════════════════════════════════════
    # STEP 6.5: Load instruction files for each agent
    # ═══════════════════════════════════════════════════════════════════════════
    log_war "📜 Loading instruction files for each agent..."
    echo ""

    echo "  Waiting for OpenCode launch (max 30 seconds)..."

    # Wait for Noctis launch (max 30 seconds)
    for i in {1..30}; do
        if tmux capture-pane -t "ff15:main.${PANE_BASE}" -p | grep -q "bypass permissions"; then
            echo "  └─ Noctis OpenCode launch confirmed (${i} seconds)"
            break
        fi
        sleep 1
    done

    # Send instruction file to Noctis
    log_info "  └─ Delivering instructions to Noctis..."
    tmux send-keys -t "ff15:main.${PANE_BASE}" "instructions/noctis.md を読んで役割を理解してくれ。"
    sleep 0.5
    tmux send-keys -t "ff15:main.${PANE_BASE}" Enter

    # Send instruction file to Lunafreya
    sleep 2
    log_info "  └─ Delivering instructions to Lunafreya..."
    tmux send-keys -t "ff15:main.$((PANE_BASE+1))" "instructions/lunafreya.md を読んで役割を理解してください。あなたはLunafreya（ルナフレーナ/神凪）です。"
    sleep 0.5
    tmux send-keys -t "ff15:main.$((PANE_BASE+1))" Enter

    # Send instruction files to Comrades (individual files)
    sleep 2
    log_info "  └─ Delivering instructions to Comrades..."
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

    log_success "✅ Instruction delivery complete"
    echo ""
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 7: Environment check and completion message
# ═══════════════════════════════════════════════════════════════════════════════
log_info "🔍 Checking party status..."
echo ""
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  📺 Tmux Sessions                                         │"
echo "  └──────────────────────────────────────────────────────────┘"
tmux list-sessions | sed 's/^/     /'
echo ""
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  📋 Party Formation                                       │"
echo "  └──────────────────────────────────────────────────────────┘"
echo ""
echo "     【ff15 session】Unified session (all 5 agents)"
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
    echo "  ⚠️  Setup-only mode: OpenCode not launched"
    echo ""
    echo "  To manually launch OpenCode:"
    echo "  ┌──────────────────────────────────────────────────────────┐"
    echo "  │  # Launch all agents at once                             │"
    echo "  │  for p in \$(seq $PANE_BASE $((PANE_BASE+4))); do         │"
    echo "  │      tmux send-keys -t ff15:main.\$p \                    │"
    echo "  │      'opencode' Enter                                    │"
    echo "  │  done                                                    │"
    echo "  └──────────────────────────────────────────────────────────┘"
    echo ""
fi

echo "  Next steps:"
echo "  ┌──────────────────────────────────────────────────────────┐"
echo "  │  Attach to ff15 session and start commanding:            │"
echo "  │     tmux attach-session -t ff15   (or: csf)              │"
echo "  │                                                          │"
echo "  │  ※ Each agent has loaded their instructions.            │"
echo "  │    You can start commanding immediately.                 │"
echo "  └──────────────────────────────────────────────────────────┘"
echo ""
echo "  ════════════════════════════════════════════════════════════"
echo "   行くぞ、仲間とともに！ (Let's go, together with our comrades!)"
echo "  ════════════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 8: Open tab in Windows Terminal (-t option only)
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$OPEN_TERMINAL" = true ]; then
    log_info "📺 Opening tabs in Windows Terminal..."

    # Check if Windows Terminal is available
    if command -v wt.exe &> /dev/null; then
        wt.exe -w 0 new-tab wsl.exe -e bash -c "tmux attach-session -t ff15"
        log_success "  └─ Terminal tab opened"
    else
        log_info "  └─ wt.exe not found. Please attach manually."
    fi
    echo ""
fi
