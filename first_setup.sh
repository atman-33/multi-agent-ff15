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
echo "  It checks dependencies and creates directory structure."
echo ""
echo "  Installation directory: $SCRIPT_DIR"
echo ""

# ============================================================
# STEP 1: OS check
# ============================================================
log_step "STEP 1: System environment check"

# Get OS information
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_NAME=$NAME
    OS_VERSION=$VERSION_ID
    log_info "OS: $OS_NAME $OS_VERSION"
else
    OS_NAME="Unknown"
    log_warn "Could not retrieve OS information"
fi

# WSL check
if grep -qi microsoft /proc/version 2>/dev/null; then
    log_info "Environment: WSL (Windows Subsystem for Linux)"
    IS_WSL=true
else
    log_info "Environment: Native Linux"
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

    # Check if Ubuntu/Debian system
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

# Apply settings immediately if tmux is running
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
# STEP 4: Node.js check
# ============================================================
log_step "STEP 4: Node.js check"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    log_success "Node.js is already installed ($NODE_VERSION)"

    # Version check (18+ recommended)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | tr -d 'v')
    if [ "$NODE_MAJOR" -lt 18 ]; then
        log_warn "Node.js 18+ is recommended (current: $NODE_VERSION)"
        RESULTS+=("Node.js: OK (v$NODE_MAJOR - upgrade recommended)")
    else
        RESULTS+=("Node.js: OK ($NODE_VERSION)")
    fi
else
    log_warn "Node.js is not installed"
    echo ""

    # Check if nvm is already installed
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        log_info "nvm is already installed. Setting up Node.js..."
        \. "$NVM_DIR/nvm.sh"
    else
        # Auto-install nvm
        log_info "Installing nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi

    # Install Node.js if nvm is available
    if command -v nvm &> /dev/null; then
        log_info "Installing Node.js 20..."
        nvm install 20 || true
        nvm use 20 || true

        if command -v node &> /dev/null; then
            NODE_VERSION=$(node -v)
            log_success "Node.js installation complete ($NODE_VERSION)"
            RESULTS+=("Node.js: Installation complete ($NODE_VERSION)")
        else
            log_error "Failed to install Node.js"
            RESULTS+=("Node.js: Installation failed")
            HAS_ERROR=true
        fi
    elif [ "$HAS_ERROR" != true ]; then
        log_error "Failed to install nvm"
        echo ""
        echo "  Please install manually:"
        echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
        echo "    source ~/.bashrc"
        echo "    nvm install 20"
        echo ""
        RESULTS+=("Node.js: Not installed (nvm failed)")
        HAS_ERROR=true
    fi
fi

# npm check
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    log_success "npm is already installed (v$NPM_VERSION)"
else
    if command -v node &> /dev/null; then
        log_warn "npm not found (should be installed with Node.js)"
    fi
fi

# ============================================================
# STEP 5: OpenCode CLI check (native version)
# Note: npm version is officially deprecated. Use native version.
#       Node.js is still required for MCP servers (via npx).
# ============================================================
log_step "STEP 5: OpenCode CLI check"

# Add ~/.local/bin to PATH to detect existing native installation
export PATH="$HOME/.local/bin:$PATH"

NEED_OPENCODE_INSTALL=false
HAS_NPM_OPENCODE=false

if command -v opencode &> /dev/null; then
    # opencode command exists → check if it actually works
    OPENCODE_VERSION=$(opencode --version 2>&1)
    OPENCODE_PATH=$(which opencode 2>/dev/null)

    if [ $? -eq 0 ] && [ "$OPENCODE_VERSION" != "unknown" ] && [[ "$OPENCODE_VERSION" != *"not found"* ]]; then
        # Working opencode found → determine if npm or native version
        if echo "$OPENCODE_PATH" | grep -qi "npm\|node_modules\|AppData"; then
            # npm version is running
            HAS_NPM_OPENCODE=true
            log_warn "npm version OpenCode CLI detected (officially deprecated)"
            log_info "Detected path: $OPENCODE_PATH"
            log_info "Version: $OPENCODE_VERSION"
            echo ""
            echo "  The npm version is officially deprecated."
            echo "  It is recommended to install the native version and uninstall the npm version."
            echo ""
            if [ ! -t 0 ]; then
                REPLY="Y"
            else
                read -p "  Install native version? [Y/n]: " REPLY
            fi
            REPLY=${REPLY:-Y}
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                NEED_OPENCODE_INSTALL=true
                # npm version uninstall guide
                echo ""
                log_info "Please uninstall the npm version first:"
                if echo "$OPENCODE_PATH" | grep -qi "mnt/c\|AppData"; then
                    echo "  In Windows PowerShell:"
                    echo "    npm uninstall -g @anthropic-ai/opencode-code"
                else
                    echo "    npm uninstall -g @anthropic-ai/opencode-code"
                fi
                echo ""
            else
                log_warn "Skipped migration to native version (continuing with npm version)"
                RESULTS+=("OpenCode CLI: OK (npm version - migration recommended)")
            fi
        else
            # Native version is working properly
            log_success "OpenCode CLI is already installed (native version)"
            log_info "Version: $OPENCODE_VERSION"
            RESULTS+=("OpenCode CLI: OK")
        fi
    else
        # command -v finds it but it doesn't work (e.g., npm version without Node.js)
        log_warn "OpenCode CLI found but not working properly"
        log_info "Detected path: $OPENCODE_PATH"
        if echo "$OPENCODE_PATH" | grep -qi "npm\|node_modules\|AppData"; then
            HAS_NPM_OPENCODE=true
            log_info "→ npm version (Node.js-dependent) detected"
        else
            log_info "→ Failed to retrieve version"
        fi
        NEED_OPENCODE_INSTALL=true
    fi
else
    # opencode command not found
    NEED_OPENCODE_INSTALL=true
fi

if [ "$NEED_OPENCODE_INSTALL" = true ]; then
    log_info "Installing native version OpenCode CLI"
    log_info "Installing OpenCode CLI (native version)..."
    curl -fsSL https://opencode.ai/install.sh | bash

    # Update PATH (may not be reflected immediately after installation)
    export PATH="$HOME/.local/bin:$PATH"

    # Persist to .bashrc (prevent duplicate additions)
    if ! grep -q 'export PATH="\$HOME/.local/bin:\$PATH"' "$HOME/.bashrc" 2>/dev/null; then
        echo '' >> "$HOME/.bashrc"
        echo '# OpenCode CLI PATH (added by first_setup.sh)' >> "$HOME/.bashrc"
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
        log_info "Added ~/.local/bin to PATH in ~/.bashrc"
    fi

    if command -v opencode &> /dev/null; then
        OPENCODE_VERSION=$(opencode --version 2>/dev/null || echo "unknown")
        log_success "OpenCode CLI installation complete (native version)"
        log_info "Version: $OPENCODE_VERSION"
        RESULTS+=("OpenCode CLI: Installation complete")

        # Guide if npm version remains
        if [ "$HAS_NPM_OPENCODE" = true ]; then
            echo ""
            log_info "Native version will be prioritized in PATH, npm version will be disabled"
            log_info "To completely remove the npm version, run:"
            if echo "$OPENCODE_PATH" | grep -qi "mnt/c\|AppData"; then
                echo "  In Windows PowerShell:"
                echo "    npm uninstall -g @anthropic-ai/opencode-code"
            else
                echo "    npm uninstall -g @anthropic-ai/opencode-code"
            fi
        fi
    else
        log_error "Installation failed. Please check the path"
        log_info "Please check if ~/.local/bin is included in PATH"
        RESULTS+=("OpenCode CLI: Installation failed")
        HAS_ERROR=true
    fi
fi

# ============================================================
# STEP 6: Create directory structure
# ============================================================
log_step "STEP 6: Create directory structure"

# Required directories
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
        log_info "Created: $dir/"
        CREATED_COUNT=$((CREATED_COUNT + 1))
    else
        EXISTED_COUNT=$((EXISTED_COUNT + 1))
    fi
done

if [ $CREATED_COUNT -gt 0 ]; then
    log_success "Created $CREATED_COUNT directories"
fi
if [ $EXISTED_COUNT -gt 0 ]; then
    log_info "$EXISTED_COUNT directories already exist"
fi

RESULTS+=("Directory structure: OK (created:$CREATED_COUNT, existing:$EXISTED_COUNT)")
if [ $EXISTED_COUNT -gt 0 ]; then
    log_info "$EXISTED_COUNT directories already exist"
fi

RESULTS+=("Directory structure: OK (created:$CREATED_COUNT, existing:$EXISTED_COUNT)")

# ============================================================
# STEP 7: Initialize configuration files
# ============================================================
log_step "STEP 7: Check configuration files"

# config/settings.yaml
if [ ! -f "$SCRIPT_DIR/config/settings.yaml" ]; then
    log_info "Creating config/settings.yaml..."
    cat > "$SCRIPT_DIR/config/settings.yaml" << EOF
# multi-agent-ff15 configuration file

# Language settings
# ja: Japanese (FF15-style Japanese only, no translation)
# en: English (FF15-style Japanese + English translation)
# Other language codes (es, zh, ko, fr, de, etc.) are also supported
language: ja

# Shell settings
# bash: bash prompts (default)
# zsh: zsh prompts
shell: bash

# Skill settings
skill:
  # Skill storage location (project-specific - must save here)
  path: "$SCRIPT_DIR/.opencode/skills/"

# Logging settings
logging:
  level: info  # debug | info | warn | error
  path: "$SCRIPT_DIR/logs/"
EOF
    log_success "Created settings.yaml"
else
    log_info "config/settings.yaml already exists"
fi

# config/projects.yaml
if [ ! -f "$SCRIPT_DIR/config/projects.yaml" ]; then
    log_info "Creating config/projects.yaml..."
    cat > "$SCRIPT_DIR/config/projects.yaml" << 'EOF'
projects:
  - id: sample_project
    name: "Sample Project"
    path: "/path/to/your/project"
    priority: high
    status: active

current_project: sample_project
EOF
    log_success "Created projects.yaml"
else
    log_info "config/projects.yaml already exists"
fi

# memory/global_context.md (system-wide context)
if [ ! -f "$SCRIPT_DIR/memory/global_context.md" ]; then
    log_info "Creating memory/global_context.md..."
    cat > "$SCRIPT_DIR/memory/global_context.md" << 'EOF'
# Global Context
Last Updated: (not set)

## System Policy
- (Describe your preferences and policies here)

## Cross-Project Decisions
- (Record decisions affecting multiple projects here)

## Notes
- (Record important notes for all agents here)
EOF
    log_success "Created global_context.md"
else
    log_info "memory/global_context.md already exists"
fi

RESULTS+=("Configuration files: OK")

# ============================================================
# STEP 8: Initialize worker task/report files
# ============================================================
log_step "STEP 8: Initialize queue files"

# Create worker task files (Comrades: ignis, gladiolus, prompto)
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
log_info "Verified/created Comrade task files (ignis/gladiolus/prompto)"

# Create Comrade report files
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
log_info "Verified/created Comrade report files (ignis/gladiolus/prompto)"

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
    log_info "Created Lunafreya→Noctis coordination channel"
fi

RESULTS+=("Queue files: OK")

# ============================================================
# STEP 9: Grant script execution permissions
# ============================================================
log_step "STEP 9: Set execution permissions"

SCRIPTS=(
    "standby.sh"
    "first_setup.sh"
)

for script in "${SCRIPTS[@]}"; do
    if [ -f "$SCRIPT_DIR/$script" ]; then
        chmod +x "$SCRIPT_DIR/$script"
        log_info "Granted execution permission to $script"
    fi
done

RESULTS+=("Execution permissions: OK")

# ============================================================
# STEP 10: Shell alias setup (multi-shell support)
# ============================================================
log_step "STEP 10: alias setup (multi-shell support)"

# Detected shell configuration files
DETECTED_SHELLS=()
ALIAS_ADDED=false
SOURCE_COMMANDS=()

# ffa alias definition
EXPECTED_FFA_BASH="alias ffa='tmux attach -t ff15'"
EXPECTED_FFA_FISH="alias ffa='tmux attach -t ff15'"

# ============================================================
# bash support
# ============================================================
BASHRC_FILE="$HOME/.bashrc"
if [ -f "$BASHRC_FILE" ]; then
    DETECTED_SHELLS+=("bash")
    if ! grep -q "alias ffa=" "$BASHRC_FILE" 2>/dev/null; then
        # alias doesn't exist → add new
        echo "" >> "$BASHRC_FILE"
        echo "# multi-agent-ff15 aliases (added by first_setup.sh)" >> "$BASHRC_FILE"
        echo "$EXPECTED_FFA_BASH" >> "$BASHRC_FILE"
        log_info "bash: Added alias ffa"
        ALIAS_ADDED=true
    elif ! grep -qF "$EXPECTED_FFA_BASH" "$BASHRC_FILE" 2>/dev/null; then
        # alias exists but path differs → update
        if sed -i "s|alias ffa=.*|$EXPECTED_FFA_BASH|" "$BASHRC_FILE" 2>/dev/null; then
            log_info "bash: Updated alias ffa"
        else
            log_warn "bash: Failed to update alias ffa"
        fi
        ALIAS_ADDED=true
    else
        log_info "bash: alias ffa is already configured correctly"
    fi
    SOURCE_COMMANDS+=("source ~/.bashrc")
fi

# ============================================================
# zsh support
# ============================================================
ZSHRC_FILE="$HOME/.zshrc"
if [ -f "$ZSHRC_FILE" ]; then
    DETECTED_SHELLS+=("zsh")
    if ! grep -q "alias ffa=" "$ZSHRC_FILE" 2>/dev/null; then
        # alias doesn't exist → add new
        echo "" >> "$ZSHRC_FILE"
        echo "# multi-agent-ff15 aliases (added by first_setup.sh)" >> "$ZSHRC_FILE"
        echo "$EXPECTED_FFA_BASH" >> "$ZSHRC_FILE"
        log_info "zsh: Added alias ffa"
        ALIAS_ADDED=true
    elif ! grep -qF "$EXPECTED_FFA_BASH" "$ZSHRC_FILE" 2>/dev/null; then
        # alias exists but path differs → update
        if sed -i "s|alias ffa=.*|$EXPECTED_FFA_BASH|" "$ZSHRC_FILE" 2>/dev/null; then
            log_info "zsh: Updated alias ffa"
        else
            log_warn "zsh: Failed to update alias ffa"
        fi
        ALIAS_ADDED=true
    else
        log_info "zsh: alias ffa is already configured correctly"
    fi
    SOURCE_COMMANDS+=("source ~/.zshrc")
fi

# ============================================================
# fish support
# ============================================================
FISHCONFIG_FILE="$HOME/.config/fish/config.fish"
if [ -f "$FISHCONFIG_FILE" ]; then
    DETECTED_SHELLS+=("fish")
    if ! grep -q "alias ffa" "$FISHCONFIG_FILE" 2>/dev/null; then
        # alias doesn't exist → add new
        echo "" >> "$FISHCONFIG_FILE"
        echo "# multi-agent-ff15 aliases (added by first_setup.sh)" >> "$FISHCONFIG_FILE"
        echo "$EXPECTED_FFA_FISH" >> "$FISHCONFIG_FILE"
        log_info "fish: Added alias ffa"
        ALIAS_ADDED=true
    elif ! grep -qF "$EXPECTED_FFA_FISH" "$FISHCONFIG_FILE" 2>/dev/null; then
        # alias exists but path differs → update
        if sed -i "s|alias ffa.*|$EXPECTED_FFA_FISH|" "$FISHCONFIG_FILE" 2>/dev/null; then
            log_info "fish: Updated alias ffa"
        else
            log_warn "fish: Failed to update alias ffa"
        fi
        ALIAS_ADDED=true
    else
        log_info "fish: alias ffa is already configured correctly"
    fi
    SOURCE_COMMANDS+=("source ~/.config/fish/config.fish")
fi

# ============================================================
# Detection results and summary
# ============================================================
if [ ${#DETECTED_SHELLS[@]} -eq 0 ]; then
    log_warn "Shell configuration files not found"
    log_info "Supported: bash (~/.bashrc), zsh (~/.zshrc), fish (~/.config/fish/config.fish)"
    RESULTS+=("alias setup: Shell configuration files not detected")
else
    log_success "Detected shells: ${DETECTED_SHELLS[*]}"
    RESULTS+=("alias setup: OK (${DETECTED_SHELLS[*]})")
    
    # Display per-shell status explicitly
    for shell in "${DETECTED_SHELLS[@]}"; do
        log_info "  - $shell: ffa alias configured ✓"
    done
fi

if [ "$ALIAS_ADDED" = true ] && [ ${#SOURCE_COMMANDS[@]} -gt 0 ]; then
    log_success "Added/updated alias configuration"
    log_warn "To apply aliases, run one of the following:"
    
    # Display source commands for each shell
    for i in "${!SOURCE_COMMANDS[@]}"; do
        log_info "  $((i + 1)). ${SOURCE_COMMANDS[$i]}"
    done
    
    if [ "$IS_WSL" = true ]; then
        log_info "  Or: Run 'wsl --shutdown' in PowerShell then reopen terminal"
        log_info "  Note: Simply closing the window will not terminate WSL"
    fi
elif [ ${#DETECTED_SHELLS[@]} -gt 0 ]; then
    # Even when no changes were made, confirm everything is ready
    log_success "All shell aliases are already configured correctly"
fi

# ============================================================
# STEP 10.5: WSL Memory Optimization Settings
# ============================================================
if [ "$IS_WSL" = true ]; then
    log_step "STEP 10.5: WSL Memory Optimization Settings"

    # Check/configure .wslconfig (placed in Windows user directory)
    WIN_USER_DIR=$(cmd.exe /C "echo %USERPROFILE%" 2>/dev/null | tr -d '\r')
    if [ -n "$WIN_USER_DIR" ]; then
        # Convert Windows path to WSL path
        WSLCONFIG_PATH=$(wslpath "$WIN_USER_DIR")/.wslconfig

        if [ -f "$WSLCONFIG_PATH" ]; then
            if grep -q "autoMemoryReclaim" "$WSLCONFIG_PATH" 2>/dev/null; then
                log_info "autoMemoryReclaim is already configured in .wslconfig"
            else
                log_info "Adding autoMemoryReclaim=gradual to .wslconfig..."
                # Check if [experimental] section exists
                if grep -q "\[experimental\]" "$WSLCONFIG_PATH" 2>/dev/null; then
                    # Add right after [experimental] section
                    sed -i '/\[experimental\]/a autoMemoryReclaim=gradual' "$WSLCONFIG_PATH"
                else
                    echo "" >> "$WSLCONFIG_PATH"
                    echo "[experimental]" >> "$WSLCONFIG_PATH"
                    echo "autoMemoryReclaim=gradual" >> "$WSLCONFIG_PATH"
                fi
                log_success "Added autoMemoryReclaim=gradual to .wslconfig"
                log_warn "Requires 'wsl --shutdown' and restart to take effect"
            fi
        else
            log_info "Creating new .wslconfig..."
            cat > "$WSLCONFIG_PATH" << 'EOF'
[experimental]
autoMemoryReclaim=gradual
EOF
            log_success "Created .wslconfig (autoMemoryReclaim=gradual)"
            log_warn "Requires 'wsl --shutdown' and restart to take effect"
        fi

        RESULTS+=("WSL Memory Optimization: OK (.wslconfig configured)")
    else
        log_warn "Failed to get Windows user directory"
        log_info "Manually add the following to %USERPROFILE%\\.wslconfig:"
        echo "  [experimental]"
        echo "  autoMemoryReclaim=gradual"
        RESULTS+=("WSL Memory Optimization: Manual configuration required")
    fi

    # Instructions for immediate cache clearing
    log_info "To clear memory cache immediately, run:"
    echo "  sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches'"
else
    log_info "Not a WSL environment, skipping memory optimization settings"
fi

# ============================================================
# STEP 11: Memory MCP Setup
# ============================================================
log_step "STEP 11: Memory MCP Setup"

if command -v opencode &> /dev/null; then
    OPENCODE_CONFIG_DIR="$HOME/.config/opencode"
    OPENCODE_CONFIG_FILE="$OPENCODE_CONFIG_DIR/opencode.json"
    
    if [ ! -d "$OPENCODE_CONFIG_DIR" ]; then
        mkdir -p "$OPENCODE_CONFIG_DIR"
    fi
    
    if [ -f "$OPENCODE_CONFIG_FILE" ] && grep -q "memory" "$OPENCODE_CONFIG_FILE" 2>/dev/null; then
        log_info "Memory MCP is already configured"
        RESULTS+=("Memory MCP: OK (configured)")
    else
        log_info "Configuring Memory MCP..."
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
            log_success "Memory MCP configuration complete"
            RESULTS+=("Memory MCP: Configuration complete")
        else
            log_warn "Please manually add Memory MCP to existing opencode.json"
            echo "  Content to add:"
            echo '  "memory": {'
            echo '    "type": "local",'
            echo '    "command": ["npx", "-y", "@modelcontextprotocol/server-memory"],'
            echo "    \"environment\": {"
            echo "      \"MEMORY_FILE_PATH\": \"$SCRIPT_DIR/memory/noctis_memory.jsonl\""
            echo '    },'
            echo '    "enabled": true'
            echo '  }'
            RESULTS+=("Memory MCP: Manual configuration required")
        fi
    fi
else
    log_warn "opencode command not found, skipping Memory MCP setup"
    RESULTS+=("Memory MCP: Skipped (opencode not installed)")
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
echo "  ────────────────────────────────────────────────────────────────"
echo ""
echo "  Stand by Me! (Launch all agents):"
echo "     ./standby.sh"
echo ""
echo "  Options:"
echo "     ./standby.sh -s            # Setup only (manual OpenCode launch)"
echo "     ./standby.sh -t            # Windows Terminal tab layout"
echo "     ./standby.sh -shell bash   # Launch with bash prompt"
echo "     ./standby.sh -shell zsh    # Launch with zsh prompt"
echo ""
echo "  ※ Shell settings can also be changed in config/settings.yaml with shell: option"
echo ""
echo "  See README.md for details."
echo ""
echo "  ════════════════════════════════════════════════════════════════"
echo "   Stand by Me!"
echo "  ════════════════════════════════════════════════════════════════"
echo ""

# Return exit 1 if dependencies are missing (so install.bat can detect it)
if [ "$HAS_ERROR" = true ]; then
    exit 1
fi