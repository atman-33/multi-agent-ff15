# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


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
- **Supplementary reports output location** - `docs/private/` as the designated path for large output files

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

[0.2.0]: https://github.com/atman-33/multi-agent-ff15/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/atman-33/multi-agent-ff15/releases/tag/v0.1.0

[0.3.0]: https://github.com/atman-33/multi-agent-ff15/compare/v0.2.0...v0.3.0