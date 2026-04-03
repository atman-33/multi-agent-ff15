# Operation Diagnostics Reference

Read this file when the task involves routing, prompt composition, report transport, output placeholders, or debug-preview mismatches.

## Triage Flow

1. Confirm whether the issue is in user-to-Noctis activation, runtime-to-worker dispatch, or agent-to-runtime report processing.
2. Verify `taskId`, `next`, the active step owner, and mission-scoped outputs.
3. Confirm that routing depends on runtime state rather than free-form message tags.
4. Compare live behavior with operation-debug preview. Treat differences as expected unless the contract itself changed.
5. Review prompt builder, composer, runtime, and debug-preview tests together when prompt shape changes.

## Useful Files

- `scripts/send_report.sh`
- `scripts/lib/send_report.mjs`
- `web/app/lib/task-dispatch.server.ts`
- `web/app/lib/team-message.server.ts`
- `web/app/lib/operation-runtime/runtime.ts`
- `web/app/lib/operation-runtime/state.ts`
- `web/app/lib/prompt-composition-engine/composer.ts`
- `web/app/lib/prompt-composition-engine/operation-prompt-builder.ts`
- `web/app/lib/operation-debug/debug-preview.server.ts`
- `web/app/routes/api.missions.$missionId.reports/route.ts`

## Diagnostic Guardrails

- Placeholder failures are real composition failures, not soft warnings.
- Live prompt delivery and debug preview are related but not byte-identical.
- Fix contract mismatches at the authored workflow or runtime layer, not by adding ad hoc prompt text.