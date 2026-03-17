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
DEBUG_MODE=false
MODE="normal"
SHELL_OVERRIDE=""
MODE_CONFIG_FILE="./config/models.yaml"

get_available_modes() {
    if [ ! -f "$MODE_CONFIG_FILE" ]; then
        echo ""
        return 1
    fi
    awk '/^  [a-zA-Z0-9_-]+:$/ {gsub(/:$/, "", $1); print $1}' "$MODE_CONFIG_FILE"
}

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
        -d|--debug)
            DEBUG_MODE=true
            shift
            ;;
        --mode)
            if [ "$MODE" != "normal" ]; then
                echo "Error: Only one mode can be specified"
                exit 1
            fi
            if [[ -n "$2" && "$2" != -* ]]; then
                MODE="$2"
                shift 2
            else
                echo "Error: --mode option requires a mode name"
                echo "Available modes: $(get_available_modes | tr '\n' ' ')"
                exit 1
            fi
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
            echo "  -d, --debug         Debug mode"
            echo "  --mode <name>       Start in specified mode (see below)"
            echo "  -s, --setup-only    Setup tmux session only (no OpenCode launch)"
            echo "  -t, --terminal      Open new tab in Windows Terminal"
            echo "  -shell, --shell SH  Specify shell (bash or zsh)"
            echo "                      If omitted, use config/settings.yaml setting"
            echo "  -h, --help          Show this help"
            echo ""
            echo "Examples:"
            echo "  ./standby.sh              # Resume from previous state"
            echo "  ./standby.sh -c           # Clean start (reset queues)"
            echo "  ./standby.sh --mode free  # Start in Free mode"
            echo "  ./standby.sh -c --mode fullpower  # Clean start + Full Power"
            echo ""
            echo "Model configuration:"
            echo "  See config/models.yaml"
            echo ""
            echo "Available modes:"
            if [ -f "$MODE_CONFIG_FILE" ]; then
                awk '
                    /^  [a-zA-Z0-9_-]+:$/ {current=$1; gsub(/:$/, "", current)}
                    /^    _description:/ {$1=""; desc=substr($0, 2)}
                    /^    noctis:/ && current {
                        printf "  %-12s %s\n", current":", desc
                        current=""
                        desc=""
                    }
                ' "$MODE_CONFIG_FILE"
            fi
            echo ""
            echo "Aliases:"
            echo "  ffa   → tmux attach-session -t ff15"
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

get_mode_description() {
    local mode="$1"
    if [ ! -f "$MODE_CONFIG_FILE" ]; then
        echo "$mode"
        return 1
    fi
    awk -v mode="$mode" '
        /^  [a-zA-Z0-9_-]+:$/ {current=$1; gsub(/:$/, "", current)}
        current==mode && /^    _description:/ {
            $1=""
            print substr($0, 2)
            exit
        }
    ' "$MODE_CONFIG_FILE"
}

validate_mode() {
    local mode="$1"
    if ! get_available_modes | grep -qx "$mode"; then
        echo "Error: Unknown mode '$mode'"
        echo "Available modes: $(get_available_modes | tr '\n' ' ')"
        exit 1
    fi
}

validate_mode "$MODE"
MODE_NAME=$(get_mode_description "$MODE")
if [ -z "$MODE_NAME" ]; then
    MODE_NAME="$MODE"
fi

NOCTIS_MODEL=$(require_mode_value "$MODE" "noctis" "model")
IGNIS_MODEL=$(require_mode_value "$MODE" "ignis" "model")
GLADIOLUS_MODEL=$(require_mode_value "$MODE" "gladiolus" "model")
PROMPTO_MODEL=$(require_mode_value "$MODE" "prompto" "model")
LUNAFREYA_MODEL=$(require_mode_value "$MODE" "lunafreya" "model")
IRIS_MODEL=$(get_mode_value "$MODE" "iris" "model")
IRIS_MODEL=${IRIS_MODEL:-"github-copilot/gpt-5-mini"}

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
    echo -e "\033[1;37m                       【 P A R T Y ・ 6 Agents 】\033[0m"
    echo ""
    echo -e "     \033[1;33m👑 Noctis\033[0m      \033[1;35m✨ Lunafreya\033[0m     \033[1;36m⚔ Ignis\033[0m      \033[1;34m🛡 Gladiolus\033[0m    \033[1;32m🔫 Prompto\033[0m"
    echo -e "      \033[0;90m(King)\033[0m         \033[0;90m(Oracle)\033[0m       \033[0;90m(Comrade)\033[0m      \033[0;90m(Comrade)\033[0m     \033[0;90m(Comrade)\033[0m"
    echo -e "                                                     \033[1;35m🌸 Iris\033[0m"
    echo -e "                                                      \033[0;90m(Guardian)\033[0m"
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
# STEP 1: Clean up existing tmux sessions and OpenCode processes
# ═══════════════════════════════════════════════════════════════════════════════
log_info "🧹 Cleaning up existing OpenCode processes in ff15 session..."

# Send Ctrl-C to all panes in ff15 session to gracefully stop OpenCode
if tmux has-session -t ff15 2>/dev/null; then
    # Get all pane IDs in ff15 session
    tmux list-panes -s -t ff15 -F '#{pane_id}' 2>/dev/null | while read pane_id; do
        tmux send-keys -t "$pane_id" C-c 2>/dev/null || true
    done
    log_info "  └─ Sent termination signal to all panes"
    sleep 2  # Wait for graceful shutdown
fi

log_info "🧹 Cleaning up tmux sessions..."
tmux kill-session -t ff15 2>/dev/null && log_info "  └─ ff15 session cleaned" || log_info "  └─ ff15 session not found"
# Legacy session cleanup
tmux kill-session -t kingsglaive 2>/dev/null && log_info "  └─ kingsglaive session (legacy) cleaned" || true
tmux kill-session -t noctis 2>/dev/null && log_info "  └─ noctis session (legacy) cleaned" || true

# Final cleanup: kill any remaining OpenCode processes from THIS project only
# (by checking working directory)
log_info "🧹 Cleaning up any orphaned OpenCode processes..."
CURRENT_DIR="$(pwd)"
KILLED_COUNT=0
for pid in $(pgrep -f "opencode --agent" 2>/dev/null || true); do
    if [ -d "/proc/$pid" ]; then
        # Check if process working directory matches current project
        proc_cwd=$(readlink -f "/proc/$pid/cwd" 2>/dev/null || echo "")
        if [[ "$proc_cwd" == "$CURRENT_DIR"* ]]; then
            kill "$pid" 2>/dev/null && KILLED_COUNT=$((KILLED_COUNT + 1)) || true
        fi
    fi
done
if [ $KILLED_COUNT -gt 0 ]; then
    log_info "  └─ Cleaned up $KILLED_COUNT orphaned process(es)"
else
    log_info "  └─ No orphaned processes found"
fi

# Wait for processes to fully terminate
sleep 1

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1.5: Backup previous records (--clean mode only, if content exists)
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$CLEAN_MODE" = true ]; then
    BACKUP_DIR="./logs/backup_$(date '+%Y%m%d_%H%M%S')"
    NEED_BACKUP=false

    # Check if there are inbox files with content worth backing up
    if [ -d "./queue/inbox" ] && [ "$(ls -A ./queue/inbox 2>/dev/null)" ]; then
        NEED_BACKUP=true
    fi

    if [ "$NEED_BACKUP" = true ]; then
        mkdir -p "$BACKUP_DIR" || true
        cp "./docs/shared/board.md" "$BACKUP_DIR/" 2>/dev/null || true
        cp -r "./queue/inbox" "$BACKUP_DIR/" 2>/dev/null || true
        cp "./runtime/worklog.json" "$BACKUP_DIR/" 2>/dev/null || true
        log_info "📦 Previous records backed up: $BACKUP_DIR"
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2: Ensure queue directory + reset (--clean mode only)
# ═══════════════════════════════════════════════════════════════════════════════

# Create queue directories if they don't exist (needed for first launch)
[ -d ./queue/inbox ] || mkdir -p ./queue/inbox
[ -d ./queue/metrics ] || mkdir -p ./queue/metrics

# Ensure projects directory exists
[ -d ./projects ] || mkdir -p ./projects

# Ensure shared board directory exists
[ -d ./docs/shared ] || mkdir -p ./docs/shared

# Ensure runtime directory exists
[ -d ./runtime ] || mkdir -p ./runtime

# Initialize config/current_projects.yaml if not exists
if [ ! -f ./config/current_projects.yaml ]; then
    cat > ./config/current_projects.yaml << 'EOF'
# Active projects configuration
# Managed by scripts/projects_activate.sh
project_scopes:
    noctis_team:
        active_project_ids: []
    lunafreya:
        active_project_ids: []
updated_at: ""
updated_by: ""
EOF
    log_info "Created config/current_projects.yaml"
fi

if [ "$CLEAN_MODE" = true ]; then
    log_info "📜 Discarding previous mission records..."

    # Inbox reset (all agents including crystal)
    for AGENT_NAME in noctis lunafreya ignis gladiolus prompto iris crystal; do
        echo "messages: []" > ./queue/inbox/${AGENT_NAME}.yaml
    done

    # Escalation metrics reset
    rm -f ./queue/metrics/*_escalation.yaml 2>/dev/null || true

    rm -rf ./queue/tasks 2>/dev/null || true
    rm -rf ./queue/reports 2>/dev/null || true
    rm -f ./queue/lunafreya_to_noctis.yaml 2>/dev/null || true
    rm -f ./queue/noctis_to_lunafreya.yaml 2>/dev/null || true
    rm -f ./queue/noctis_to_ignis.yaml 2>/dev/null || true

    # Runtime logs reset
    rm -rf ./runtime/logs 2>/dev/null || true
    log_info "🗑️  runtime/logs cleared"

    log_success "✅ Cleanup complete"
else
    log_info "📜 Resuming from previous state..."
    # Initialize inbox files if they don't exist (first launch without --clean)
    for AGENT_NAME in noctis lunafreya ignis gladiolus prompto iris crystal; do
        [ -f ./queue/inbox/${AGENT_NAME}.yaml ] || echo "messages: []" > ./queue/inbox/${AGENT_NAME}.yaml
    done
    log_success "✅ Queues and reports preserved"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3: Dashboard initialization (deprecated — dashboard.md archived)
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$CLEAN_MODE" = true ]; then
    log_info "📊 Dashboard deprecated — skipping initialization"
else
    log_info "📊 Dashboard deprecated — no action needed"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3.5: Shared board + worklog initialization (--clean mode only)
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$CLEAN_MODE" = true ]; then
    log_info "📋 Initializing shared board..."
    cat > ./docs/shared/board.md <<'EOF'
# Shared Board

> Knowledge sharing between Comrades.
> Rules: Check on task receipt / Add before task report

## General

EOF
    log_success "  └─ Shared board initialized"

    log_info "📊 Initializing worklog..."
    echo '{"inProgress": [], "results": []}' > ./runtime/worklog.json
    log_success "  └─ Worklog initialized"
else
    # Initialize shared board if it doesn't exist (first launch without --clean)
    if [ ! -f ./docs/shared/board.md ]; then
        cat > ./docs/shared/board.md <<'EOF'
# Shared Board

> Knowledge sharing between Comrades.
> Rules: Check on task receipt / Add before task report

## General

EOF
    fi
    # Initialize worklog if it doesn't exist
    [ -f ./runtime/worklog.json ] || echo '{"inProgress": [], "results": []}' > ./runtime/worklog.json
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4: Check tmux existence
# ═══════════════════════════════════════════════════════════════════════════════
if ! command -v flock &> /dev/null; then
    echo ""
    echo "  ╔════════════════════════════════════════════════════════╗"
    echo "  ║  [ERROR] flock not found!                              ║"
    echo "  ║  Install util-linux:  sudo apt install util-linux      ║"
    echo "  ╚════════════════════════════════════════════════════════╝"
    echo ""
    exit 1
fi

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
# STEP 5: Create ff15 session (unified session, 5 main panes + Iris)
# ═══════════════════════════════════════════════════════════════════════════════
# Normal mode layout (5 panes, Iris in hidden window):
# ┌──────────────┬──────────────┐
# │    Noctis    │  Lunafreya   │  ← Top row: Command layer
# │   (pane 0)  │   (pane 1)   │
# ├──────────────┴──────────────┤
# │ Ignis  │ Gladiolus │Prompto │  ← Bottom row: Workers
# │(pane 2)│ (pane 3)  │(pane 4)│
# └────────┴───────────┴────────┘
# + [iris] window (hidden, running in background)
#
# Debug mode layout (6 panes, Iris visible):
# ┌──────────────┬──────────────┐
# │    Noctis    │  Lunafreya   │
# │   (pane 0)   │   (pane 1)   │  (50% : 50%)
# ├──────┬───────┼───────┬──────┤
# │Ignis │Gladio │Prompto│ Iris │
# │(pn 2)│ (pn 3)│ (pn 4)│(pn 5)│  (25% each)
# └──────┴───────┴───────┴──────┘
#
AGENT_COUNT=6
log_war "⚔️ Building ff15 session (deploying ${AGENT_COUNT} agents)..."

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

# Use 'largest' window sizing so that when multiple clients attach, the pane
# dimensions are based on the largest client rather than the smallest.
# This prevents narrow-terminal reflows from wrapping OpenCode's status bar
# and breaking model-name parsing in get-current-model.sh.
tmux set-option -t ff15 -w window-size largest
log_info "  └─ window-size set to 'largest' (reflow-resistant capture)"

# Get pane-base-index
PANE_BASE=$(tmux show-options -gv pane-base-index 2>/dev/null || echo 0)
PANE_BASE=${PANE_BASE:-0}

# ═══════════════════════════════════════════════════════════════════════════════
# Layout Strategy:
# Standard mode (default): 6 panes with Iris visible on bottom-right
#   Top row (50%): Noctis (50%) | Lunafreya (50%)
#   Bottom row (50%): Ignis (25%) | Gladiolus (25%) | Prompto (25%) | Iris (25%)
# Debug mode: Reserved for future debugging features (currently same as standard)
# ═══════════════════════════════════════════════════════════════════════════════

# ─── Create layout with Iris visible on bottom-right ───
# Target layout:
#   Top row (50%): Noctis (50%) | Lunafreya (50%)
#   Bottom row (50%): Ignis (25%) | Gladiolus (25%) | Prompto (25%) | Iris (25%)

# Step 1: Split top/bottom (50/50)
tmux split-window -v -l 50% -t "ff15:main.${PANE_BASE}"
# pane 0 = top, pane 1 = bottom

# Step 2: Split top row: Noctis left, Lunafreya right (50/50)
tmux split-window -h -l 50% -t "ff15:main.${PANE_BASE}"
# pane 0 = Noctis (top-left), pane 1 = Lunafreya (top-right), pane 2 = bottom

# Step 3: Split bottom into 4 parts
# First split: Ignis (left 25%) + rest (right 75%)
tmux split-window -h -l 75% -t "ff15:main.$((PANE_BASE+2))"
# pane 0 = Noctis, pane 1 = Lunafreya, pane 2 = Ignis (bottom-left), pane 3 = rest (75%)

# Step 4: Split rest into Gladiolus (left 33.3% of rest = 25% of total) + remaining (66.6% of rest = 50% of total)
tmux split-window -h -l 66% -t "ff15:main.$((PANE_BASE+3))"
# pane 0 = Noctis, pane 1 = Lunafreya, pane 2 = Ignis, pane 3 = Gladiolus, pane 4 = rest (50%)

# Step 5: Split remaining into Prompto (left 50%) + Iris (right 50%)
tmux split-window -h -l 50% -t "ff15:main.$((PANE_BASE+4))"
# pane 0 = Noctis, pane 1 = Lunafreya, pane 2 = Ignis, pane 3 = Gladiolus, pane 4 = Prompto, pane 5 = Iris

# Final layout:
#   pane 0 = Noctis (top-left, 50% width)
#   pane 1 = Lunafreya (top-right, 50% width)
#   pane 2 = Ignis (bottom-left, 25% width)
#   pane 3 = Gladiolus (bottom-center-left, 25% width)
#   pane 4 = Prompto (bottom-center-right, 25% width)
#   pane 5 = Iris (bottom-right, 25% width)

# Configure all 6 panes
PANE_LABELS=("noctis" "lunafreya" "ignis" "gladiolus" "prompto" "iris")
PANE_COLORS=("magenta" "cyan" "red" "blue" "blue" "magenta")
PANE_COUNT=6
IRIS_PANE_TARGET="ff15:main.$((PANE_BASE+5))"

# ─── Configure all panes with agent identities ───
for i in $(seq 0 $((PANE_COUNT-1))); do
    p=$((PANE_BASE + i))
    label="${PANE_LABELS[$i]}"
    color="${PANE_COLORS[$i]}"
    target="ff15:main.${p}"

    # Set agent identity
    tmux set-option -p -t "${target}" @agent_id "${label}"
    tmux select-pane -t "${target}" -T "${label}"

    # Set prompt and working directory
    PROMPT_STR=$(generate_prompt "${label}" "${color}" "$SHELL_SETTING")
    tmux send-keys -t "${target}" "cd \"$(pwd)\" && export PS1='${PROMPT_STR}' && clear" Enter
done

# Noctis pane gets special background
tmux select-pane -t "ff15:main.${PANE_BASE}" -P 'bg=#002b36'

# Display agent names with pane-border-format
tmux set-option -t ff15 -w pane-border-status top
tmux set-option -t ff15 -w pane-border-format '#{pane_index} #{@agent_id}'

log_success "  └─ ff15 session (5 main panes + Iris) built"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5.5: Allocate Agent Endpoints
# ═══════════════════════════════════════════════════════════════════════════════
log_war "👑 Executing Endpoint Allocation..."

OPENCODE_PORT_RANGE_START=4401
OPENCODE_PORT_RANGE_END=4499

declare -A REQUESTED_PORTS=(
    ["noctis"]=4401
    ["lunafreya"]=4402
    ["ignis"]=4403
    ["gladiolus"]=4404
    ["prompto"]=4405
    ["iris"]=4406
)

declare -A ASSIGNED_PORTS
declare -A PORT_SOURCES
declare -A USED_PORTS

allocate_port() {
    local agent="$1"
    local requested="${REQUESTED_PORTS[$agent]}"
    
    # Check if requested port is available
    if ! ss -tln | grep -q ":${requested} " && [ -z "${USED_PORTS[$requested]}" ]; then
        ASSIGNED_PORTS[$agent]="$requested"
        PORT_SOURCES[$agent]="fixed"
        USED_PORTS[$requested]=1
        return 0
    fi
    
    # If not, find available port in range
    local p
    for p in $(seq $OPENCODE_PORT_RANGE_START $OPENCODE_PORT_RANGE_END); do
        if ! ss -tln | grep -q ":${p} " && [ -z "${USED_PORTS[$p]}" ]; then
            ASSIGNED_PORTS[$agent]="$p"
            PORT_SOURCES[$agent]="auto_range"
            USED_PORTS[$p]=1
            return 0
        fi
    done
    
    return 1
}

mkdir -p runtime
ENDPOINTS_MANIFEST="runtime/opencode-endpoints.json"
echo "{" > "$ENDPOINTS_MANIFEST"
echo "  \"generatedAt\": \"$(date -Iseconds)\"," >> "$ENDPOINTS_MANIFEST"
echo "  \"agents\": {" >> "$ENDPOINTS_MANIFEST"

AGENT_NAMES=("noctis" "lunafreya" "ignis" "gladiolus" "prompto" "iris")
for i in "${!AGENT_NAMES[@]}"; do
    agent="${AGENT_NAMES[$i]}"
    if allocate_port "$agent"; then
        port="${ASSIGNED_PORTS[$agent]}"
        src="${PORT_SOURCES[$agent]}"
        echo "    \"$agent\": { \"hostname\": \"127.0.0.1\", \"port\": $port, \"baseUrl\": \"http://127.0.0.1:$port\", \"portSource\": \"$src\" }$( [[ $i -lt $(( ${#AGENT_NAMES[@]} - 1 )) ]] && echo ',' || echo '' )" >> "$ENDPOINTS_MANIFEST"
    else
        echo "Error: Failed to allocate port for $agent (Range exhausted)"
        exit 1
    fi
done

echo "  }" >> "$ENDPOINTS_MANIFEST"
echo "}" >> "$ENDPOINTS_MANIFEST"
log_success "  └─ Endpoints allocated and written to $ENDPOINTS_MANIFEST"
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

    log_war "👑 Launching OpenCode for all agents (native agent mode)..."

    # All 6 agents in main window
    # Pane numbers: 0=Noctis, 1=Lunafreya, 2=Ignis, 3=Gladiolus, 4=Prompto, 5=Iris
    AGENT_MODELS=("${NOCTIS_MODEL}" "${LUNAFREYA_MODEL}" "${IGNIS_MODEL}" "${GLADIOLUS_MODEL}" "${PROMPTO_MODEL}" "${IRIS_MODEL}")
    AGENT_TARGETS=()
    for i in {0..5}; do
        AGENT_TARGETS+=("ff15:main.$((PANE_BASE+i))")
    done

    # Launch all agents
    for i in "${!AGENT_NAMES[@]}"; do
        name="${AGENT_NAMES[$i]}"
        model="${AGENT_MODELS[$i]}"
        target="${AGENT_TARGETS[$i]}"
        port="${ASSIGNED_PORTS[$name]}"

        tmux send-keys -t "${target}" "export AGENT_ID=${name} && export OPENCODE_EXPERIMENTAL_FILEWATCHER=true && opencode --agent ${name} --model ${model} --hostname 127.0.0.1 --port ${port}"
        tmux send-keys -t "${target}" Enter
        log_info "  └─ ${name} launched (--agent ${name}, target: ${target}, port: ${port})"

        # Wait for stability
        sleep 1
    done

    log_success "✅ Started in ${MODE_NAME} mode (${AGENT_COUNT} agents deployed with native agent definitions)"
    echo ""
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 6.5: Start Desktop Web App
# ═══════════════════════════════════════════════════════════════════════════════

# Read web port from config/settings.yaml (default: 13000)
WEB_PORT=13000
if [ -f "./config/settings.yaml" ]; then
    _port=$(grep -A2 '^web:' ./config/settings.yaml 2>/dev/null | grep 'port:' | awk '{print $2}' | tr -d '[:space:]')
    if [[ "$_port" =~ ^[0-9]+$ ]]; then
        WEB_PORT="$_port"
    fi
fi

log_info "🌐 Starting Desktop Web App (port: $WEB_PORT)..."
mkdir -p runtime/logs

# If clean mode, kill existing ff15 web server to pick up the latest build
if [ "$CLEAN_MODE" = true ] && lsof -Pi :"$WEB_PORT" -sTCP:LISTEN -t &>/dev/null; then
    EXISTING_CMD=$(lsof -Pi :"$WEB_PORT" -sTCP:LISTEN -Fc 2>/dev/null | grep '^c' | head -1 | sed 's/^c//')
    if echo "$EXISTING_CMD" | grep -qi "react-router\|node"; then
        EXISTING_PID=$(lsof -Pi :"$WEB_PORT" -sTCP:LISTEN -t 2>/dev/null | head -1)
        kill "$EXISTING_PID" 2>/dev/null && log_info "  └─ Stopped existing web server (PID: $EXISTING_PID) for clean restart" || true
        sleep 1
    fi
fi

# If port is already occupied by a non-ff15 process, skip launch
if lsof -Pi :"$WEB_PORT" -sTCP:LISTEN -t &>/dev/null; then
    EXISTING_CMD=$(lsof -Pi :"$WEB_PORT" -sTCP:LISTEN -Fc 2>/dev/null | grep '^c' | head -1 | sed 's/^c//')
    if echo "$EXISTING_CMD" | grep -qi "react-router\|node"; then
        log_info "  └─ ff15 web server already running on port $WEB_PORT, reusing."
    else
        log_warn "  └─ Port $WEB_PORT is occupied by '$EXISTING_CMD'. Skipping web server launch."
        log_info "  └─ Change 'web.port' in config/settings.yaml to use a different port."
    fi
else
    PORT=$WEB_PORT nohup npm run desktop:web:serve > runtime/logs/web.log 2>&1 &
    WEB_PID=$!
    log_info "  └─ Server started (PID: $WEB_PID, log: runtime/logs/web.log)"
    log_info "  └─ Waiting for server to be ready..."
    sleep 3
fi

BROWSER_OPENED=false
URL="http://localhost:$WEB_PORT"

# WSL: use Windows-side browser
if grep -qi microsoft /proc/version 2>/dev/null; then
    if command -v wslview &>/dev/null; then
        wslview "$URL" 2>/dev/null && BROWSER_OPENED=true
    fi
    if [ "$BROWSER_OPENED" = false ] && command -v powershell.exe &>/dev/null; then
        powershell.exe -NoProfile -Command "Start-Process '$URL'" 2>/dev/null && BROWSER_OPENED=true
    fi
    if [ "$BROWSER_OPENED" = false ] && command -v cmd.exe &>/dev/null; then
        cmd.exe /c start "$URL" 2>/dev/null && BROWSER_OPENED=true
    fi
else
    # Native Linux
    xdg-open "$URL" 2>/dev/null && BROWSER_OPENED=true
fi

if [ "$BROWSER_OPENED" = true ]; then
    log_success "  └─ Browser opened: $URL"
else
    log_info "  └─ Could not open browser automatically"
    log_info "  └─ Please open $URL manually"
fi
echo ""

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
echo "     【ff15 session】Unified session (${AGENT_COUNT} agents)"
echo "     ┌──────────────┬──────────────┐"
echo "     │    Noctis    │  Lunafreya   │  ← Command layer"
echo "     │   (pane 0)   │   (pane 1)   │     (50% : 50%)"
echo "     ├──────┬───────┼───────┬──────┤"
echo "     │Ignis │Gladio │Prompto│ Iris │  ← Worker layer"
echo "     │(pn 2)│ (pn 3)│ (pn 4)│(pn 5)│     (25% each)"
echo "     └──────┴───────┴───────┴──────┘"
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
echo "  │     ffa   (tmux attach-session -t ff15)                 │"
echo "  │                                                          │"
echo "  │  ※ Each agent has loaded their system prompt via         │"
echo "  │    native agent definitions (.opencode/agents/*.md).     │"
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
