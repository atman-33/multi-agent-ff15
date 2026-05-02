# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.13.0] - 2026-05-02

### Added
- **Tmux transport restart controls** - Added runtime config drift detection, a tmux transport restart API, monitor restart actions, and transport status reporting in MCP config responses
- **Operation authoring validation** - Added stricter YAML schema checks and placeholder validation for `output(...)`, `setting(...)`, and `root(...)` references across operation loading and customization tooling

### Changed
- **Tmux-resident workflow handling** - Updated `standby.sh`, monitor surfaces, and composer behavior to support automatic, forced, and disabled tmux attachment modes with clearer restart guidance
- **Prompt composition contracts** - Tightened prompt builder validation so resolved step and delegated worker placeholders are checked before execution, and updated builtin operation definitions to match the stricter contracts

### Fixed
- **Mission continue endpoint resolution** - Fixed Lunafreya and Noctis mission continuation to probe the correct owner endpoint before reusing a stored session in tmux-resident mode
- **Manual verification prompt formatting** - Fixed output contract formatting in the manual verification step so generated operation prompts remain valid under the stricter placeholder validation rules

### Deprecated
- None

### Removed
- None

### Security
- None

## [0.12.0] - 2026-05-01

### Added
- **Operation system and authoring surfaces** - Added operation catalog loading, prompt composition and preview/apply flows, built-in English and Japanese facets, jobs, output contracts, and Iris-facing authoring and debug tools for customizable workflows
- **Lunafreya mission runtime** - Added Lunafreya mission routes, ambient banter, tmux transport runtime and dispatcher support, owned-session routing, mission output browsing, and execution workspace handling across the web app and scripts
- **Project and server management tools** - Added project rename/delete helpers, shared skills configuration, OpenCode SDK Lab routes, and dedicated web/OpenCode server control helpers with tests

### Changed
- **Chat and mission UX** - Improved session rendering, draft persistence, message detail sheets, output detail routing, mission summaries, prompt inspection, and model selection flows across Noctis Team, OpenCode, and operations screens
- **Setup and runtime plumbing** - Updated `first_setup.sh`, `standby.sh`, config templates, model definitions, and transport/bootstrap logic to support managed sessions, tmux-based missions, and browser-driven operations
- **Agent and workflow assets** - Expanded Copilot/OpenCode prompts, skills, and agent definitions to cover PR assistance, TDD, architecture review, PRD flows, and operation customization workflows

### Fixed
- **Session and transport reliability** - Fixed owned-session reads, dispatch abort and cancellation handling, transport readiness, pending transcript resync, and mission recovery behavior in the tmux-backed runtime
- **Configuration and server handling** - Fixed web origin resolution, local config bootstrap, API status/error handling, and server control flows for browser-first operation
- **Message and report presentation** - Fixed live draft rendering, copy interactions, detail-sheet APIs, manual verification/report handling, and workflow message presentation edge cases

### Deprecated
- None

### Removed
- **Deprecated skill scaffolds and command aliases** - Removed superseded skill scaffolding assets and old `.opencode/command/*` paths after migrating to the consolidated `.opencode/commands/*` layout

### Security
- None

## [0.11.0] - 2026-03-24

### Added
- **Browser-based web dashboard** - Added the React Router web application as the primary interface for Noctis Team, OpenCode sessions, reports, MCP settings, server status, and project browsing
- **Noctis Team mission workflow** - Added mission history, resume/archive actions, party status surfaces, streaming chat, banter logs, and mission runtime APIs for the browser experience
- **Config management UI** - Added a dedicated configuration screen plus server helpers and API routes for editing `config/settings.yaml` and bootstrapping required local config files
- **OpenSpec workflow assets** - Added Copilot/OpenSpec prompts and skills for apply, archive, continue, explore, onboarding, sync, and verify workflows

### Changed
- **Project architecture** - Completed the transition from the previous desktop/Tauri app to the browser-first `web/` application structure and updated documentation, setup flow, and assets accordingly
- **Session and report UX** - Improved OpenCode session browsing, report navigation, page layout reuse, tab handling, and markdown rendering for richer long-form output review
- **Release and CI plumbing** - Updated GitHub Actions workflows and npm lockfile handling to match the web app release process and checks

### Fixed
- **Message/session reliability** - Improved session owner resolution, message fetch error handling, intermediate detail rendering, and server recovery logic across the web dashboard
- **Configuration bootstrap** - Fixed fresh-environment startup by auto-creating required config files instead of relying on committed local settings
- **Release validation** - Fixed `web-checks` lockfile mismatch issues by syncing the npm lockfile with newly added web dependencies

### Deprecated
- None

### Removed
- **Legacy desktop app** - Removed the superseded `desktop/` application and related Tauri-only assets, scripts, and routes after the web dashboard became the primary interface

### Security
- None

## [0.10.0] - 2026-03-17

### Added
- **Project-aware desktop workflow** - Added scoped project management, active project status surfaces, and project-specific instruction injection across the desktop app and backend
- **Richer chat inspection tools** - Added chat detail sheets, execution cards, markdown rendering, timeline helpers, and report detail views for reviewing agent output
- **VS Code opening support** - Added API support for opening files in VS Code from the desktop experience

### Changed
- **Agent chat experience** - Improved the agent chat column, message composer, message cards, and activity streaming with better expansion behavior, draft handling, and Noctis formation controls
- **Project and report plumbing** - Refined project loading, active project APIs, report metadata handling, and YAML config readers to support scoped multi-project workflows more reliably
- **Configuration and setup defaults** - Updated model configuration, setup scripts, standby behavior, and OpenCode configuration to match the latest desktop workflow

### Fixed
- **Instruction and report integration** - Fixed project instruction prepending, report handling, and chat draft integration issues in the desktop stack
- **Suggestion and activity reliability** - Improved at-suggestion handling, mode switching events, agent activity updates, and stream refresh behavior

### Deprecated
- None

### Removed
- None

### Security
- None

## [0.9.0] - 2026-03-09

### Added
- **`solo-noctis` command** - Added a dedicated command for operating with Noctis alone without assigning work to Comrades
- **Chat convenience controls** - Added unread message count, scroll-to-bottom action, and copy actions for message cards and report markdown

### Changed
- **Desktop chat workflow** - Expanded message cards by default, removed composer message length limits, and improved inbox ordering and slash suggestion behavior
- **Agent and model configuration** - Updated agent instructions, model definitions, and framework guidance to match the latest operating workflow
- **Release skill safety** - The github-release skill now requires explicit user confirmation when the next release version is not specified

### Fixed
- **Report and chat UI polish** - Refined report detail layout, chat column behavior, and component formatting for a more consistent desktop experience
- **Desktop integration cleanup** - Removed outdated API/Tauri handling tied to superseded behavior and refreshed the web app screenshot asset

### Deprecated
- None

### Removed
- Obsolete desktop app code paths related to the previous message page and backend bridge behavior

### Security
- None

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

[0.11.0]: https://github.com/atman-33/multi-agent-ff15/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/atman-33/multi-agent-ff15/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/atman-33/multi-agent-ff15/compare/v0.8.0...v0.9.0

[0.13.0]: https://github.com/atman-33/multi-agent-ff15/compare/v0.12.0...v0.13.0
