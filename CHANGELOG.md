# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] - 2026-02-28

### Added
- **github-release skill** - Automated GitHub release workflow with version bumping, CHANGELOG generation, and GitHub Actions integration
- **Serena integration** - Enhanced code editing workflow with LSP symbol operations and codebase awareness
- **Enhanced skill discovery** - Improved mechanism for Comrades to propose and validate skill candidates
- **Knowledge graph support** - Memory MCP with entity relationships for persistent cross-session knowledge
- **Extended agent capabilities** - New OSPecX workflow for structured change management and implementation verification

### Changed
- **Release process** - Transitioned to GitHub Actions-driven release workflow with automated tagging
- **Skill promotion pipeline** - Refined Iris notification system for skill candidate evaluation
- **Agent coordination** - Enhanced YAML inbox protocol for more robust inter-agent communication
- **Developer experience** - Streamlined onboarding with improved documentation and examples

### Fixed
- **CHANGELOG automation** - Improved script robustness for version management and format validation
- **Memory persistence** - Fixed cross-session knowledge graph consistency issues
- **Agent recovery** - Enhanced session recovery after /new with better state reconstruction

### Deprecated
- `dashboard.md` - Consolidated reporting moved to web app and Crystal Inbox

### Removed
- Legacy dashboard auto-updater plugins (replaced with worklog-updater)

### Security
- Improved YAML write atomicity with flock-based protection for concurrent file access
- Enhanced GitHub token handling in release automation scripts

## [0.7.0] - 2026-02-27

### Added
- **Crystal Inbox page** - New dedicated desktop UI page for managing user notifications and messages from the multi-agent system.
- **Worklog page** - New UI page displaying real-time task progress (In Progress / Today's Results) with desktop app integration.
- **Crystal Inbox Store** - Zustand state management for Crystal Inbox with reactive updates and persistence.
- **Worklog API endpoints** - API routes for retrieving and managing task progress data.
- **Information architecture redesign** - Consolidated Crystal Inbox (`queue/inbox/crystal.yaml`), Shared Board (`docs/shared/board.md`), and Worklog (`runtime/worklog.json`) for improved knowledge sharing and visibility.
- **Worlog Updater plugin** - Automated daemon for managing task progress, escalation, and agent inactivity detection.

### Changed
- **Dashboard architecture** - Renamed and refactored dashboard routes to align with new information architecture (e.g., `_layout.dashboard.tsx` → `_layout.board.tsx`).
- **Inbox system restructuring** - Enhanced Python-based inbox reader and writer utilities for better YAML handling and resource efficiency.
- **Agent file organization** - Reorganized desktop app file structure (moved lib utilities to hooks and constants directories).
- **Plugin infrastructure** - Replaced legacy dashboard auto-updater and integrity-checker plugins with new worklog-updater plugin.

### Fixed
- **Tmux interaction reliability** - Improved stability and robustness in session management and agent state tracking.
- **Log refresh consistency** - Enhanced log refresh mechanisms across chat, inbox, and activity views.

### Removed
- **Legacy dashboard plugins** - Removed deprecated `dashboard-auto-updater.ts` and `dashboard-integrity-checker.ts` in favor of worklog-updater plugin.
- **Generated Tauri schemas** - Removed auto-generated ACL and capability manifest files to reduce repository bloat.

## [0.6.0] - 2026-02-27

### Added
- **Agent-specific initiation commands** - New commands for starting tasks with a single AI partner (Ignis, Gladiolus, or Prompto) to conserve AI resources.
- **MCP Settings page** - Dedicated desktop UI page for managing MCP configurations and viewing `opencode.json` status.
- **Ultracite Linter integration** - Integrated Ultracite for enhanced TypeScript code quality and automated checks.
- **Tmux session stability improvements** - Enhanced reliability of model retrieval and session management via robust tmux interactions.

### Changed
- **Consolidated model configuration** - Integrated model switching keywords into `config/models.yaml`, centralizing model management.
- **Report Reminder Plugin enhancement** - Switched from inbox-based reminders to direct tmux notifications to keep agent inboxes clean.
- **Code quality refinements** - Addressed accessibility warnings, non-interactive element issues, and removed unused code across the desktop application.
- **Refresh button logic** - Improved timestamp accuracy and ensured both chat and inbox logs refresh reliably after log resets.

### Fixed
- **In-app log refresh** - Fixed a bug where chat history failed to update correctly after log truncation or manual resets (e.g., via `standby.sh -c`).
- **Accessibility issues** - Resolved various accessibility and linting errors in the React-based desktop UI components.

## [0.5.0] - 2026-02-25

### Added
- **Real-time agent activity tracking** - Enhanced real-time monitoring of agent activities
- **Mode switch trigger and event listener** - Improved agent mode switching with event system
- **Typing indicator with scrolling activity log** - Better visual feedback for active agents
- **Message composer integration** - Seamless message composer integration with agent chat

### Changed
- **Agent chat UI enhancements** - Improved layout and user experience for agent chat interface
- **Message card styling** - Enhanced visual presentation and spacing for message cards
- **Component code formatting** - Improved code organization and formatting across components
- **GitHub release workflow documentation** - Clarified release process and automation guidelines

## [0.4.0] - 2026-02-24

### Added
- **Desktop app** - New Tauri-based desktop application with full multi-agent monitoring UI
- **Agent monitor page** - Real-time tmux pane output display via Tauri command and API endpoint
- **Context usage tracking** - Display agent model and context usage in Noctis column
- **Session abort functionality** - Abort active sessions and append abort status to chat log
- **OpenCode SDK v2 integration** - Session creation via OpenCode SDK with new API endpoints and UI button
- **`@` file/folder suggestions** - At-mention suggestions in the message composer for file and folder paths
- **Reports page** - Dedicated UI page for listing and fetching supplementary reports with API endpoints
- **Project management UI** - Project registration and management interface
- **Agent mode switching UI** - UI and API routes for switching agent modes; models centralized in `models.yaml`
- **Clear All Sessions** - Functionality to clear all sessions with confirmation dialog and API endpoint
- **Tab key submission** - Tab key triggers message submission or suggestion selection in the message composer
- **Persistent message composer** - Draft, active agent, and Noctis party view persisted to local storage
- **`/` slash suggestions with insertText** - Descriptive insertion text for slash commands and skill suggestions
- **New session status record** - Append new session status to chat log
- **Agent report reminder plugin** - Plugin to prompt agents for missing task reports
- **Log truncation detection** - Unified refresh for chat and inbox logs when truncation is detected
- **`create-feature-branch` command** - New slash command for creating feature branches
- **Model configuration page** - Oh-my-opencode model configuration page with API endpoints
- **Hover card for active projects** - Display detailed project information on hover in AppHeader
- **Git branch display** - Show current Git branch name for active projects in the header
- **Iris agent** - Centralized agent definitions with Iris (Guardian) as a recognized agent
- **Optimistic UI for Crystal messages** - Unique message IDs for optimistic update tracking
- **`dotenv` support** - Load environment variables from `.env` file
- **Biome linter** - Added Biome for code style and lint enforcement
- **`clean` mode for standby script** - Restart web server cleanly with `--clean` flag

### Changed
- **Agent status polling** - Replaced boolean busy/waiting states with polled agent status strings and optimistic updates
- **Model switch UX** - Moved model switch to chat column header; direct dropdown switching with optimistic updates
- **File-system based routing** - Migrated to `@react-router/fs-routes` replacing manual route definitions
- **Async data loading** - Oh-my-opencode status and models use React Router's `defer`, `Await`, and `Suspense`
- **Model switch script** - Relocated to `scripts/switch-model.sh`; model keywords updated in `config/model_switch_keywords.yaml`
- **Supplementary reports directory** - Renamed from `docs/private/` to `docs/reports/` across all references
- **Command suggestions formatting** - Updated formatting in API response

### Fixed
- **ModelSwitchBar target agent** - Remount when party view changes to reset target agent correctly
- **Noctis processing state** - Corrected update logic for Noctis agent processing state
- **Memory leak** - Clear polling interval on component unmount
- **Model and context display** - Show active party member's model and context usage correctly
- **Slash/at trigger regexes** - Added capturing groups to prevent match failures
- **React performance** - Reduced chat input lag via `React.memo` and polling hook extraction; optimized components with memoization

## [0.3.0] - 2026-02-21

### Added
- **mode selection and descriptions to standby script** - Add `--fullpower` and `--lite` mode options with descriptive help text
- **minimax-m2.5-free model support** - Update free mode to use the latest free model

### Changed
- **test workflow update** - Migrate from Python to Node.js/npm for GitHub Actions CI/CD
- **model updates** - Updated Ignis and Gladiolus agents with new model configurations

### Fixed
- **file locking improvements** - Increased retry attempts and adjusted sleep duration for more reliable file operations

## [0.2.0] - 2026-02-20

### Added
- **github-release skill** - Automate GitHub release workflows including version bumping, changelog updates, PR creation, and GitHub Release publishing
- **code-simplifier skill** - Code refactoring skill for improving clarity, consistency, and maintainability
- **TypeScript checking skill** - Verification for TypeScript code quality and error checking
- **opencode-troubleshoot skill** - Diagnostic and troubleshooting utilities for OpenCode issues
- **dashboard-auto-updater plugin** - Iris agent plugin for real-time dashboard section updates (renamed from iris-watcher)
- **iris-inbox-listener plugin** - New plugin for Iris to aggregate context from inbox messages
- **agent-chat-monitor plugin** - Plugin to display recent conversations for specific agents and write directly to `dashboard.md`
- **dashboard integrity checker plugin** - Automatically validates and enforces mandatory dashboard structure rules
- **Inbox-based messaging system** - All inter-agent communication now flows through YAML inbox files via `inbox_write.sh`
- **"Latest Report to Crystal" dashboard section** - New section for significant agent findings and proposals
- **PR-based git workflow enforcement** - All agents must create feature branches and PRs; direct pushes to main are forbidden
- **GitHub Actions CI/CD** - Test workflow for automated verification
- **gpt5mini formation** - New `--gpt5mini` mode for all agents
- **Mobile access documentation** - Guide for accessing the system from mobile devices
- **MCP integration documentation** - Model Context Protocol setup and configuration guide
- **Supplementary reports output location** - `docs/reports/` as the designated path for large output files

### Changed
- Migrated agent communication from direct tmux `send-keys` to inbox-based YAML messaging (`inbox_write.sh`)
- Renamed `iris-watcher` to `dashboard-auto-updater` for clarity across all references
- Updated `lunafreya`, `prompto`, and `gladiolus` default models from `grok-code-fast-1` to `gpt-5-mini`
- Updated `ignis` model to `gpt-5.2-codex`
- Dashboard is now English-only; removed `Inbox Status` section and all language localization logic
- Iris now owns and manages ALL dashboard sections autonomously
- "Confirmation Items" merged into the "Requires Action" section
- Noctis idle capture no longer processes chat content (delegated to `agent-chat-monitor` plugin)
- Improved agent messaging delay and responsiveness
- Enhanced inbox auto-notify to wake all target agents reliably

### Fixed
- Busy detection added to `send_message.sh` to prevent message collisions
- Refined Lunafreya instruction message filtering to avoid false triggers
- Fixed tmux commands for more reliable message delivery
- Improved logging in inbox read and Noctis capture scripts
- Duplicate notification prevention for Iris dashboard updates (debounce added)

### Security
- Added pre-flight checks for git operations in github-release skill
- Validated GitHub CLI authentication before release operations

## [0.1.0] - 2026-02-15

Initial release.
