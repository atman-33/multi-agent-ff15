# Project Guidelines

## Architecture

- This repository contains a browser-based multi-agent dashboard plus supporting scripts and configuration. Keep changes within the existing structure: `web/` for the React Router app, `config/` for YAML configuration, `projects/` for project definitions, `runtime/` for generated runtime data, `scripts/` for automation helpers, and `docs/reports/` for report artifacts.
- Treat `runtime/` and log outputs as generated state unless the task explicitly requires changing the code that produces them.
- Follow the FF15 agent hierarchy already defined in `AGENTS.md`: the user is `Crystal`, the primary user-facing agent is `Noctis`, and supporting agents report back through that structure.

## Conventions

- Write repository artifacts in English unless the user explicitly asks for another language. This includes source files, comments, instructions, reports, and documentation updates.
- Never perform git operations unless the user explicitly asks for them.
- When the user asks for a report or a report update, place active reports under `docs/reports/` and move archived or superseded reports under `docs/reports/archive/`.
- Prefer updating existing helpers and patterns before introducing new top-level scripts, config files, or subsystems.

## Build And Test

- Use the root npm scripts for web app work: `npm run web:dev`, `npm run web:build`, `npm run web:typecheck`, `npm run web:lint`, and `npm run web:test`.
- For environment setup and local startup flows, prefer the documented entry points `./first_setup.sh` and `./standby.sh` instead of inventing alternate bootstrapping steps.

## Scope

- For files under `web/`, also follow the scoped rules in `.github/instructions/web-app.instructions.md`.