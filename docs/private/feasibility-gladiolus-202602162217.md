# Feasibility & Estimates — Gladiolus (Status check)

Prepared: 2026-02-16T22:17:03Z

Status: Confirmed receipt of the previous assignment (task_1771247746). Ignis report was not available at the time of this write. Per instruction, I performed a repository scan and produced this best-effort feasibility assessment for the top 5 candidate features. If Ignis publishes a prioritized list or additional artifacts, this file will be updated accordingly.

Top 5 candidate features (repository scan, best-effort)

1) Messaging system improvements (inbox escalation, watcher, auto-notify)
2) project-register skill (automated project onboarding)
3) Playwright/browser automation skill and test harness
4) Openspec apply/ff-change automation (experimental OpenSpec workflow tooling)
5) opencode-plugin-creator skill (create plugins with hooks/template)

Summary per feature: files likely to change, required expertise, estimated dev time (hours), testing/verification plan, and major risks. This document is intentionally concise — see companion file with earlier timestamp for expanded rationale.

1) Messaging system improvements
- Files likely to change: .opencode/plugins/inbox-watcher.ts, .opencode/plugins/inbox-auto-notify.ts, .opencode/plugins/noctis-idle-capture.ts, scripts/busy_detect.sh, scripts/yaml_write_flock.sh, openspec specs
- Required expertise: TypeScript/Node.js, tmux automation, OpenSpec, concurrency and file-locking
- Estimated dev time: 20–36h (median ~28h)
- Testing: unit tests for plugin logic, integration tests with tmux/containerized harness, simulate escalation and recovery scenarios
- Major risks: race conditions, environment-specific tmux behavior, notification loops

2) project-register skill
- Files likely to change: .opencode/skills/project-register, config/projects.yaml, templates/context_template.md, context/*.md generation logic
- Required expertise: TypeScript/Node.js, YAML templating, OpenSpec
- Estimated dev time: 16–26h
- Testing: unit tests for templating/idempotency, e2e run to register sample project and validate outputs
- Major risks: accidental overwrite of existing project entries, malformed metadata

3) Playwright/browser automation skill
- Files likely to change: .opencode/skills/playwright, package.json, CI workflows
- Required expertise: Playwright, Node.js test harnesses
- Estimated dev time: 18–36h
- Testing: deterministic e2e Playwright tests and CI integration
- Major risks: CI flakiness and resource usage

4) Openspec apply / ff-change automation
- Files likely to change: .opencode/skills/openspec-apply-change, openspec/changes/*, CLI wrappers
- Required expertise: OpenSpec artifacts, TypeScript/Node.js
- Estimated dev time: 17–32h
- Testing: automated sample change flows and verification, safety checks for artifact application
- Major risks: accidental overwrites or partial application of specs

5) opencode-plugin-creator skill
- Files likely to change: .opencode/skills/opencode-plugin-creator, .opencode/plugins templates, package.json
- Required expertise: TypeScript, plugin API design
- Estimated dev time: 16–25h
- Testing: generate example plugin, run tsc --noEmit on generated code
- Major risks: template drift vs platform changes

Priority recommendation (top 2)
1) Messaging system improvements — Priority: P0 (High). Improves reliability and reduces missed tasks; recommended first.
2) project-register skill — Priority: P1 (Medium-High). Automates onboarding; useful follow-up.

Notes
- This is a best-effort snapshot produced without Ignis finalization. I will update this file when Ignis report arrives.
- For messaging changes, implement feature flags and phased rollout to mitigate risk.

End of status check report.
