#!/bin/bash
# ============================================================
# first_setup.sh - multi-agent-ff15 First-time Setup Script
# Environment setup tool for Ubuntu / WSL / Mac
# ============================================================
# How to run:
#   chmod +x first_setup.sh
#   ./first_setup.sh
# ============================================================

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Icon-based log functions
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

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

OPENCODE_CONFIG_PATH="$SCRIPT_DIR/opencode.json"
OPENCODE_CONFIG_TEMPLATE_PATH="$SCRIPT_DIR/config/opencode.template.json"
SETTINGS_PATH="$SCRIPT_DIR/config/settings.yaml"

# Result tracking variables
RESULTS=()
HAS_ERROR=false

echo ""
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║  ⚔️ multi-agent-ff15 Installer                               ║"
echo "  ║     Initial Setup Script for Ubuntu / WSL                    ║"
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  This script is for first-time setup."
echo "  It checks dependencies and configures the environment."
echo ""
echo "  Installation directory: $SCRIPT_DIR"
echo ""

# ============================================================
# STEP 1: OS check
# ============================================================
log_step "STEP 1: System environment check"

if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_NAME=$NAME
    OS_VERSION=$VERSION_ID
    log_info "OS: $OS_NAME $OS_VERSION"
else
    OS_NAME="Unknown"
    log_warn "Could not retrieve OS information"
fi

if grep -qi microsoft /proc/version 2>/dev/null; then
    log_info "Environment: WSL (Windows Subsystem for Linux)"
    IS_WSL=true
else
    log_info "Environment: Native Linux / Mac"
    IS_WSL=false
fi

RESULTS+=("System environment: OK")

# ============================================================
# STEP 2: tmux check / install
# ============================================================
log_step "STEP 2: tmux check"

if command -v tmux &> /dev/null; then
    TMUX_VERSION=$(tmux -V | awk '{print $2}')
    log_success "tmux is already installed (v$TMUX_VERSION)"
    RESULTS+=("tmux: OK (v$TMUX_VERSION)")
else
    log_warn "tmux is not installed"
    echo ""

    if command -v apt-get &> /dev/null; then
        log_info "Installing tmux..."
        if ! sudo -n apt-get update -qq 2>/dev/null; then
            if ! sudo apt-get update -qq 2>/dev/null; then
                log_error "Failed to run sudo. Please execute directly from terminal"
                RESULTS+=("tmux: Installation failed (sudo failed)")
                HAS_ERROR=true
            fi
        fi

        if [ "$HAS_ERROR" != true ]; then
            if ! sudo -n apt-get install -y tmux 2>/dev/null; then
                if ! sudo apt-get install -y tmux 2>/dev/null; then
                    log_error "Failed to install tmux"
                    RESULTS+=("tmux: Installation failed")
                    HAS_ERROR=true
                fi
            fi
        fi

        if command -v tmux &> /dev/null; then
            TMUX_VERSION=$(tmux -V | awk '{print $2}')
            log_success "tmux installation complete (v$TMUX_VERSION)"
            RESULTS+=("tmux: Installation complete (v$TMUX_VERSION)")
        else
            log_error "Failed to install tmux"
            RESULTS+=("tmux: Installation failed")
            HAS_ERROR=true
        fi
    else
        log_error "apt-get not found. Please manually install tmux"
        echo ""
        echo "  Installation methods:"
        echo "    Ubuntu/Debian: sudo apt-get install tmux"
        echo "    Fedora:        sudo dnf install tmux"
        echo "    macOS:         brew install tmux"
        RESULTS+=("tmux: Not installed (manual installation required)")
        HAS_ERROR=true
    fi
fi

# ============================================================
# STEP 3: tmux mouse scroll settings
# ============================================================
log_step "STEP 3: tmux mouse scroll settings"

TMUX_CONF="$HOME/.tmux.conf"
TMUX_MOUSE_SETTING="set -g mouse on"

if [ -f "$TMUX_CONF" ] && grep -qF "$TMUX_MOUSE_SETTING" "$TMUX_CONF" 2>/dev/null; then
    log_info "tmux mouse settings already exist in ~/.tmux.conf"
else
    log_info "Adding '$TMUX_MOUSE_SETTING' to ~/.tmux.conf..."
    echo "" >> "$TMUX_CONF"
    echo "# Enable mouse scroll (added by first_setup.sh)" >> "$TMUX_CONF"
    echo "$TMUX_MOUSE_SETTING" >> "$TMUX_CONF"
    log_success "Added tmux mouse settings"
fi

if command -v tmux &> /dev/null && tmux list-sessions &> /dev/null; then
    log_info "tmux is running, applying settings immediately..."
    if tmux source-file "$TMUX_CONF" 2>/dev/null; then
        log_success "Reloaded tmux configuration"
    else
        log_warn "Failed to reload tmux configuration (please manually run: tmux source-file ~/.tmux.conf)"
    fi
else
    log_info "tmux is not running, settings will apply on next launch"
fi

RESULTS+=("tmux mouse settings: OK")

# ============================================================
# STEP 4: uv / uvx check
# Note: uvx is required by the serena MCP server (generated opencode.json).
#       uv installs to ~/.local/bin, which must be in PATH.
# ============================================================
log_step "STEP 4: uv / uvx check (required for serena MCP)"

# Ensure ~/.local/bin is in PATH for this session
export PATH="$HOME/.local/bin:$PATH"

if command -v uvx &> /dev/null; then
    UV_VERSION=$(uv --version 2>&1 | awk '{print $2}')
    log_success "uv is already installed (v$UV_VERSION)"
    log_info "uvx path: $(which uvx)"
    RESULTS+=("uv / uvx: OK (v$UV_VERSION)")
else
    log_warn "uv is not installed"
    log_info "Installing uv (includes uvx)..."
    echo ""

    if curl -LsSf https://astral.sh/uv/install.sh | sh; then
        # Reload PATH after installation
        export PATH="$HOME/.local/bin:$PATH"

        if command -v uvx &> /dev/null; then
            UV_VERSION=$(uv --version 2>&1 | awk '{print $2}')
            log_success "uv installation complete (v$UV_VERSION)"
            log_info "uvx path: $(which uvx)"
            RESULTS+=("uv / uvx: Installation complete (v$UV_VERSION)")
        else
            log_error "uv was installed but uvx is not found in PATH"
            log_info "Expected location: $HOME/.local/bin/uvx"
            RESULTS+=("uv / uvx: Installation failed (not found in PATH)")
            HAS_ERROR=true
        fi
    else
        log_error "Failed to install uv"
        echo ""
        echo "  Please install manually:"
        echo "    curl -LsSf https://astral.sh/uv/install.sh | sh"
        echo "    source ~/.bashrc"
        echo ""
        RESULTS+=("uv / uvx: Installation failed")
        HAS_ERROR=true
    fi
fi

# Persist ~/.local/bin to shell configuration files (prevent "not found" on next login)
LOCAL_BIN_EXPORT='export PATH="$HOME/.local/bin:$PATH"'

for RC_FILE in "$HOME/.bashrc" "$HOME/.zshrc"; do
    if [ -f "$RC_FILE" ]; then
        if ! grep -qF 'local/bin' "$RC_FILE" 2>/dev/null; then
            echo "" >> "$RC_FILE"
            echo "# uv / OpenCode PATH (added by first_setup.sh)" >> "$RC_FILE"
            echo "$LOCAL_BIN_EXPORT" >> "$RC_FILE"
            log_info "Added ~/.local/bin to PATH in $RC_FILE"
        else
            log_info "~/.local/bin already present in $RC_FILE"
        fi
    fi
done

if [ -f "$HOME/.config/fish/config.fish" ]; then
    if ! grep -q 'local/bin' "$HOME/.config/fish/config.fish" 2>/dev/null; then
        echo "" >> "$HOME/.config/fish/config.fish"
        echo "# uv / OpenCode PATH (added by first_setup.sh)" >> "$HOME/.config/fish/config.fish"
        echo "set -x PATH \$HOME/.local/bin \$PATH" >> "$HOME/.config/fish/config.fish"
        log_info "Added ~/.local/bin to PATH in ~/.config/fish/config.fish"
    else
        log_info "~/.local/bin already present in ~/.config/fish/config.fish"
    fi
fi

# ============================================================
# STEP 5: Local OpenCode config bootstrap
# ============================================================
log_step "STEP 5: Local OpenCode config bootstrap"

if [ -f "$OPENCODE_CONFIG_PATH" ]; then
    log_info "Local opencode.json already exists"
    RESULTS+=("opencode.json: OK (existing local config)")
elif [ -f "$OPENCODE_CONFIG_TEMPLATE_PATH" ]; then
    cp "$OPENCODE_CONFIG_TEMPLATE_PATH" "$OPENCODE_CONFIG_PATH"
    log_success "Created local opencode.json from template"
    RESULTS+=("opencode.json: Created from template")
else
    log_error "Missing opencode config template: $OPENCODE_CONFIG_TEMPLATE_PATH"
    RESULTS+=("opencode.json: Bootstrap failed (missing template)")
    HAS_ERROR=true
fi

# ============================================================
# STEP 6: Transport mode bootstrap
# ============================================================
log_step "STEP 6: Transport mode bootstrap"

CURRENT_TRANSPORT_MODE=""
if [ -f "$SETTINGS_PATH" ]; then
    CURRENT_TRANSPORT_MODE="$(awk -F ':' '/^[[:space:]]*transport_mode:/ {
        value=$2
        sub(/^[[:space:]]+/, "", value)
        gsub(/["\047]/, "", value)
        print value
        exit
    }' "$SETTINGS_PATH")"
fi

if [ -n "$CURRENT_TRANSPORT_MODE" ]; then
    log_info "transport_mode already configured as $CURRENT_TRANSPORT_MODE"
    RESULTS+=("transport_mode: OK ($CURRENT_TRANSPORT_MODE)")
elif [ -f "$SETTINGS_PATH" ]; then
    echo "" >> "$SETTINGS_PATH"
    echo "# Default transport mode (added by first_setup.sh)" >> "$SETTINGS_PATH"
    echo "transport_mode: tmux-resident" >> "$SETTINGS_PATH"
    log_success "Initialized transport_mode to tmux-resident"
    RESULTS+=("transport_mode: Initialized (tmux-resident)")
else
    mkdir -p "$(dirname "$SETTINGS_PATH")"
    printf '%s\n' \
        '# multi-agent-ff15 configuration file' \
        '' \
        '# Language setting' \
        '# ja: Japanese only (FF15-style Japanese, no bilingual output)' \
        '# en: English (FF15-style Japanese + English translation in parentheses)' \
        '# Other language codes (es, zh, ko, fr, de, etc.) also supported' \
        'language: en' \
        'shared_skills_root: skills' \
        'transport_mode: tmux-resident' \
        > "$SETTINGS_PATH"
    log_success "Created config/settings.yaml with tmux-resident transport mode"
    RESULTS+=("transport_mode: Initialized (tmux-resident)")
fi

# ============================================================
# Results Summary
# ============================================================
echo ""
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║  📋 Setup Results Summary                                     ║"
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo ""

for result in "${RESULTS[@]}"; do
    if [[ $result == *"not installed"* ]] || [[ $result == *"failed"* ]]; then
        echo -e "  ${RED}✗${NC} $result"
    elif [[ $result == *"upgrade"* ]] || [[ $result == *"Skipped"* ]]; then
        echo -e "  ${YELLOW}!${NC} $result"
    else
        echo -e "  ${GREEN}✓${NC} $result"
    fi
done

echo ""

if [ "$HAS_ERROR" = true ]; then
    echo "  ╔══════════════════════════════════════════════════════════════╗"
    echo "  ║  ⚠️  Some dependencies are missing                            ║"
    echo "  ╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "  Review the warnings above and install missing items."
    echo "  Once all dependencies are ready, run this script again to verify."
else
    echo "  ╔══════════════════════════════════════════════════════════════╗"
    echo "  ║  ✅ Setup complete! Ready to go!                              ║"
    echo "  ╚══════════════════════════════════════════════════════════════╝"
fi

echo ""
echo "  ┌──────────────────────────────────────────────────────────────┐"
echo "  │  📜 Next Steps                                                │"
echo "  └──────────────────────────────────────────────────────────────┘"
echo ""
echo "  ⚠️  First time only: Execute the following manually"
echo ""
echo "  STEP 0: Apply PATH changes (reflect installation results to this shell)"
echo "     source ~/.bashrc"
echo ""
echo "  STEP A: Start OpenCode for authentication"
echo "     opencode"
echo ""
echo "     1. Select your preferred AI model provider"
echo "     2. Follow authentication prompts to log in"
echo "     3. Exit with /exit"
echo ""
echo "     ※ Once authenticated, credentials are saved to ~/.opencode/ and won't be needed again"
echo ""
echo "  STEP B: Start the dashboard (tmux-resident is the default transport)"
echo "     ./standby.sh --build"
echo ""
echo "  ════════════════════════════════════════════════════════════════"
echo "   Stand by Me!"
echo "  ════════════════════════════════════════════════════════════════"
echo ""

if [ "$HAS_ERROR" = true ]; then
    exit 1
fi
