# Feasibility & Estimates — Gladiolus

Prepared: 2026-02-16T22:15:46Z

Note: Ignis's detailed analysis report was not available at the time of this assessment. The following are best-effort feasibility estimates produced by scanning the repository and existing artifacts (openspec, skills, and plugins). Estimates are provisional and should be revised after Ignis publishes the feature candidate selection.

Top 5 candidate features (inferred from repository and recent changes)

1) Messaging system improvements (inbox escalation, watcher, auto-notify)
2) project-register skill (automated project onboarding)
3) Playwright/browser automation skill and test harness
4) Openspec apply/ff-change automation (experimental OpenSpec workflow tooling)
5) opencode-plugin-creator skill (create plugins with hooks/template)

For each candidate: files likely to change, required expertise, estimated dev time (hours), testing/verification plan, and major risks.

---

1) Messaging system improvements (inbox escalation, watcher, auto-notify)

Files likely to change
- .opencode/plugins/inbox-watcher.ts
- .opencode/plugins/inbox-auto-notify.ts
- .opencode/plugins/noctis-idle-capture.ts
- scripts/busy_detect.sh
- scripts/yaml_write_flock.sh
- openspec/changes/archive/*/specs/* (spec updates)
- docs/* (design and troubleshooting updates)

Required expertise
- TypeScript/Node.js
- tmux session behavior and automation
- OpenSpec artifacts and spec-driven development
- Concurrency, file-locking (flock), and YAML atomic writes

Estimated dev time (best-effort)
- Analysis & design: 4–6h
- Implementation (core plugin changes): 8–16h
- Integration & e2e tests (tmux environment): 6–10h
- Docs & roll-out: 2–4h
- Total: 20–36h (median ~28h)

Testing / verification plan
- Unit tests for plugin logic where possible (mock filesystem, simulate inbox YAML)
- Integration tests that run the plugin in a headless tmux environment or containerized test harness
- Simulate scenarios: unread message escalation, busy detection, restart/recovery, concurrent writes
- Run repository's stress tests (tests/stress_test_*) and busy detection scripts
- Manual verification on staging environment (observe proper wake signals and no duplicate notifications)

Major risks
- Race conditions around inbox writes and wake signals
- Differences in tmux behavior across environments causing flaky tests
- Notification loops (plugin triggers notifications that generate more events)
- Regressions in existing flock/atomic write behavior

Recommendation: High priority. This improves reliability and reduces missed tasks; likely to provide immediate operational value.

---

2) project-register skill (automated project onboarding)

Files likely to change
- .opencode/skills/project-register/**
- config/projects.yaml
- templates/context_template.md
- context/{new_project}.md generation logic
- .github/workflows/ (if CI automation added)

Required expertise
- TypeScript/Node.js
- OpenSpec and repository templates
- YAML templating and file generation

Estimated dev time
- Analysis & spec: 2–4h
- Implementation: 8–12h
- Tests & validation (template outputs, idempotency): 4–6h
- Docs & examples: 2–4h
- Total: 16–26h (median ~20h)

Testing / verification plan
- Unit tests for templating and file creation (idempotency)
- End-to-end: run skill to register a sample project, verify config/projects.yaml updated, context file created with correct metadata
- CI linting for generated files (YAML validity)

Major risks
- Inadvertent overwrites of existing project entries (need safe merge strategy)
- Missing or malformed metadata from user input
- Permission/ownership expectations for generated files

Recommendation: Medium-high priority. Automates a repetitive task and reduces onboarding friction.

---

3) Playwright / browser automation skill

Files likely to change
- .opencode/skills/playwright/**
- package.json (add playwright dependency)
- .github/workflows/playwright.yaml (test runners)
- docs/private/ (examples)

Required expertise
- Playwright and browser automation
- Node.js test harnesses and CI integration

Estimated dev time
- Analysis & test matrix: 2–4h
- Implementation and sample scripts: 8–16h
- CI integration and cross-platform test runs: 6–12h
- Docs & examples: 2–4h
- Total: 18–36h (median ~24h)

Testing / verification plan
- Create deterministic end-to-end test(s) using Playwright against a sample page or internal staging app
- CI matrix with headless and headed runs if needed

Major risks
- CI flakiness, heavy resource usage in CI
- Browser version mismatches across runners

Recommendation: Medium. Adds powerful automation and testing capability, but operational cost in CI resources.

---

4) Openspec apply / ff-change automation

Files likely to change
- .opencode/skills/openspec-apply-change/**
- openspec/changes/* (increase tooling and artifact generation)
- scripts that call openspec CLI

Required expertise
- OpenSpec CLI and artifacts
- TypeScript/Node.js for wrapper logic

Estimated dev time
- Analysis & mapping to artifacts: 3–5h
- Implementation: 8–16h
- Tests & validation (artifact-to-main sync): 4–8h
- Docs: 2–3h
- Total: 17–32h (median ~22h)

Testing / verification plan
- Automated runs on a sample change: create change, implement artifacts, run sync/verify
- Validate that generated artifacts conform to repo layout and do not overwrite main specs unexpectedly

Major risks
- Breaking change syncs, accidental overwrites, or partial application of artifacts

Recommendation: Medium. Useful for developer velocity; requires careful safety checks.

---

5) opencode-plugin-creator skill

Files likely to change
- .opencode/skills/opencode-plugin-creator/**
- .opencode/plugins/ (new templates and example plugin)
- package.json / build scripts for plugin templates

Required expertise
- TypeScript, Node.js, plugin API design
- Developer ergonomics and templates

Estimated dev time
- Analysis & design: 2–4h
- Implementation (templates, CLI wrappers): 8–12h
- Tests & example plugin: 4–6h
- Docs: 2–3h
- Total: 16–25h (median ~18h)

Testing / verification plan
- Create example plugin from template and run it in staging
- Linting/type-check (tsc --noEmit) on generated plugin

Major risks
- Keeping generated plugin code up to date with platform changes

Recommendation: Medium-low. Nice developer ergonomics improvement; lower immediate operational impact than messaging.

---

Priority recommendation (top 2)

1) Messaging system improvements — Priority: P0 (High)
- Why: Directly improves reliability of the agent workflow (fewer missed tasks, predictable recovery). The repository already contains plugins and specs in this area, so changes are high-impact and reasonably scoped.

Quick implementation plan (Messaging improvements)
1. Confirm exact scenarios to cover (escalation thresholds, busy detection rules) — 2h
2. Update/extend .opencode/plugins/inbox-watcher.ts and inbox-auto-notify.ts with robust backoff and dedup logic — 8–12h
3. Add unit tests for core logic and simulate YAML inbox changes — 4h
4. Create integration test harness using a disposable tmux session or container that runs standby.sh and exercises scenarios — 6–8h
5. Documentation and rollout checklist (staging verification, metrics to monitor) — 2–4h

Estimated completion for top priority (Messaging): 22–30h end-to-end

2) project-register skill — Priority: P1 (Medium-High)
- Why: Repetitive manual process; automating onboarding increases developer velocity and is straightforward to validate.

Quick implementation plan (project-register)
1. Define input schema and safe merge behavior for config/projects.yaml — 1–2h
2. Implement skill scaffolding that writes context/{project}.md from template and updates config/projects.yaml — 6–10h
3. Write unit tests and e2e verification for idempotency — 3–5h
4. Docs and example runbook — 2h

Estimated completion for project-register: 12–19h

---

Notes and next steps
- These are best-effort estimates produced without Ignis's prioritized feature list. When Ignis publishes the top 5 feature candidates, Gladiolus will update each feature's file list and refine time estimates to reflect Ignis's exact scope and any prototype artifacts.
- Risk mitigation suggestions: for messaging changes, add feature flags and phased rollout; for file-generation tasks, implement dry-run and backup modes.

Artifact location
- This report: docs/private/feasibility-gladiolus-202602162215.md

End of report.
