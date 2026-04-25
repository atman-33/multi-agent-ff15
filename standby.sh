#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

WEB_PORT=13000
WEB_URL="http://localhost:${WEB_PORT}"
WEB_LOG="runtime/logs/web.log"
BUILD_OUTPUT="web/build/server/index.js"
ACTION="start"
RUN_BUILD=false
SERVER_STATE="stopped"
SERVER_PID=""
SERVER_CMD=""

log_info() {
    echo -e "\033[1;33m[INFO]\033[0m $1"
}

log_success() {
    echo -e "\033[1;32m[OK]\033[0m $1"
}

log_warn() {
    echo -e "\033[1;31m[WARN]\033[0m $1"
}

show_help() {
    echo ""
    echo "⚔️ multi-agent-ff15 Standby Script"
    echo ""
    echo "Usage: ./standby.sh [options]"
    echo ""
    echo "Options:"
    echo "  -b, --build    Build the web app before launch"
    echo "      --stop     Stop the managed web server if it is running"
    echo "      --status   Print the managed web server status"
    echo "  -h, --help     Show this help"
    echo ""
    echo "Examples:"
    echo "  ./standby.sh"
    echo "  ./standby.sh --build"
    echo "  ./standby.sh --stop"
    echo "  ./standby.sh --status"
    echo ""
}

show_battle_cry() {
    clear

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
}

show_party_roll_call() {
    echo -e "  \033[1;33m行くぞ、王の剣を抜く時間だ\033[0m"
    echo ""
    echo -e "    \033[1;33m👑 Noctis\033[0m      「 目的地は決まってる。アプリを起動するぞ 」"
    sleep 0.2
    echo -e "    \033[1;36m⚔ Ignis\033[0m       「 段取りは済んでいる。いつでも進める 」"
    sleep 0.2
    echo -e "    \033[1;34m🛡 Gladiolus\033[0m  「 細かいことはいい。前に出りゃいいんだろ 」"
    sleep 0.2
    echo -e "    \033[1;32m🔫 Prompto\033[0m     「 おっけー！ 景気よく始めようぜ 」"
    sleep 0.2
    echo -e "    \033[1;35m🌸 Iris\033[0m        「 みんなの準備、ちゃんと見届けるからね 」"
    sleep 0.2
    echo -e "    \033[1;35m✨ Lunafreya\033[0m  「 道は開かれています。どうかご無事で 」"
    sleep 0.2
    echo ""
    echo -e "  \033[1;36m出発準備完了。スタンバイを開始する\033[0m"
    echo ""
}

require_command() {
    local command_name="$1"

    if ! command -v "$command_name" >/dev/null 2>&1; then
        log_warn "Required command not found: $command_name"
        exit 1
    fi
}

require_port_lookup() {
    if command -v lsof >/dev/null 2>&1 || command -v ss >/dev/null 2>&1; then
        return
    fi

    log_warn "Required command not found: lsof or ss"
    exit 1
}

set_action() {
    local next_action="$1"

    if [ "$ACTION" != "start" ] && [ "$ACTION" != "$next_action" ]; then
        log_warn "Choose only one action: start, stop, or status."
        show_help
        exit 1
    fi

    ACTION="$next_action"
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -b|--build)
                RUN_BUILD=true
                shift
                ;;
            --stop)
                set_action "stop"
                shift
                ;;
            --status)
                set_action "status"
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_warn "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done

    if [ "$RUN_BUILD" = true ] && [ "$ACTION" != "start" ]; then
        log_warn "--build can only be used when starting the web app."
        show_help
        exit 1
    fi
}

ensure_dependencies() {
    if [ ! -d "web/node_modules" ]; then
        log_info "Installing web dependencies..."
        npm run web:install
    fi
}

ensure_build_artifact() {
    if [ -f "$BUILD_OUTPUT" ]; then
        return
    fi

    log_warn "Production build was not found: $BUILD_OUTPUT"
    log_info "Run ./standby.sh --build to create the production bundle first."
    exit 1
}

get_listening_pid() {
    if command -v lsof >/dev/null 2>&1; then
        lsof -ti tcp:"$WEB_PORT" -sTCP:LISTEN 2>/dev/null | head -1
        return
    fi

    if command -v ss >/dev/null 2>&1; then
        ss -ltnp 2>/dev/null | awk -v port=":${WEB_PORT}" '$4 ~ port { if (match($0, /pid=([0-9]+)/, arr)) { print arr[1]; exit } }'
    fi
}

get_process_command() {
    local process_pid="$1"

    ps -p "$process_pid" -o args= 2>/dev/null || true
}

is_managed_server_command() {
    local process_command="$1"

    printf '%s\n' "$process_command" | grep -qiE 'react-router-serve|node.*(web/)?build/server/index.js|node.*(web/)?server\.js|npm --prefix web run start|npm run web:start'
}

refresh_server_state() {
    local listening_pid
    local listening_cmd

    SERVER_STATE="stopped"
    SERVER_PID=""
    SERVER_CMD=""

    listening_pid="$(get_listening_pid || true)"
    if [ -z "$listening_pid" ]; then
        return
    fi

    listening_cmd="$(get_process_command "$listening_pid")"

    SERVER_PID="$listening_pid"
    SERVER_CMD="$listening_cmd"

    if is_managed_server_command "$listening_cmd"; then
        SERVER_STATE="running"
        return
    fi

    SERVER_STATE="occupied"
}

print_server_status() {
    refresh_server_state

    case "$SERVER_STATE" in
        running)
            log_success "Web server is running: ${WEB_URL} (PID: ${SERVER_PID})"
            log_info "Log: ${WEB_LOG}"
            return 0
            ;;
        stopped)
            log_info "Web server is not running."
            return 1
            ;;
        occupied)
            log_warn "Port ${WEB_PORT} is already in use by another process."
            log_warn "$SERVER_CMD"
            return 2
            ;;
    esac
}

stop_managed_server() {
    refresh_server_state

    case "$SERVER_STATE" in
        stopped)
            log_info "Web server is not running."
            return 0
            ;;
        occupied)
            log_warn "Port ${WEB_PORT} is already in use by another process."
            log_warn "$SERVER_CMD"
            return 1
            ;;
    esac

    log_info "Stopping existing web server on port ${WEB_PORT} (PID: ${SERVER_PID})..."
    kill "$SERVER_PID" 2>/dev/null || true
    sleep 1

    refresh_server_state
    case "$SERVER_STATE" in
        stopped)
            log_success "Web server stopped."
            return 0
            ;;
        running)
            log_warn "Web server is still running after stop request."
            return 1
            ;;
        occupied)
            log_warn "Port ${WEB_PORT} is now in use by another process."
            log_warn "$SERVER_CMD"
            return 1
            ;;
    esac
}

stop_existing_server() {
    refresh_server_state

    case "$SERVER_STATE" in
        stopped)
            return
            ;;
        occupied)
            log_warn "Port ${WEB_PORT} is already in use by another process."
            log_warn "$SERVER_CMD"
            exit 1
            ;;
    esac

    log_info "Stopping existing web server on port ${WEB_PORT} (PID: ${SERVER_PID})..."
    kill "$SERVER_PID" 2>/dev/null || true
    sleep 1

    refresh_server_state
    if [ "$SERVER_STATE" != "stopped" ]; then
        log_warn "Port ${WEB_PORT} is not available after stopping the existing web server."
        if [ -n "$SERVER_CMD" ]; then
            log_warn "$SERVER_CMD"
        fi
        exit 1
    fi
}

wait_for_server() {
    local attempt

    for attempt in $(seq 1 30); do
        if curl -fsS "$WEB_URL" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done

    return 1
}

open_browser() {
    if grep -qi microsoft /proc/version 2>/dev/null; then
        if command -v wslview >/dev/null 2>&1; then
            wslview "$WEB_URL" >/dev/null 2>&1 && return 0
        fi

        if command -v powershell.exe >/dev/null 2>&1; then
            powershell.exe -NoProfile -Command "Start-Process '$WEB_URL'" >/dev/null 2>&1 && return 0
        fi
    fi

    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$WEB_URL" >/dev/null 2>&1 && return 0
    fi

    return 1
}

start_server() {
    local start_command

    start_command="cd '$SCRIPT_DIR/web' && PORT='$WEB_PORT' npm run start"

    if command -v setsid >/dev/null 2>&1; then
        setsid bash -lc "$start_command" > "$WEB_LOG" 2>&1 < /dev/null &
    else
        nohup bash -lc "$start_command" > "$WEB_LOG" 2>&1 < /dev/null &
    fi

    echo $!
}

require_command npm
parse_args "$@"
require_port_lookup

case "$ACTION" in
    status)
        print_server_status
        exit $?
        ;;
    stop)
        stop_managed_server
        exit $?
        ;;
esac

require_command curl

mkdir -p runtime/logs

show_battle_cry
show_party_roll_call

log_info "Preparing production web app..."
ensure_dependencies

if [ "$RUN_BUILD" = true ]; then
    log_info "Building web app..."
    npm run web:build
else
    ensure_build_artifact
fi

stop_existing_server

log_info "Starting web app on ${WEB_URL} ..."
WEB_PID="$(start_server)"

if wait_for_server; then
    log_success "Web app is ready: ${WEB_URL}"
    log_info "Log: ${WEB_LOG}"
else
    log_warn "Web app did not become ready in time."
    log_warn "Check log: ${WEB_LOG}"
    exit 1
fi

if open_browser; then
    log_success "Browser opened."
else
    log_warn "Could not open a browser automatically."
    log_info "Open ${WEB_URL} manually."
fi

log_success "Standby complete. Web server PID: ${WEB_PID}"
