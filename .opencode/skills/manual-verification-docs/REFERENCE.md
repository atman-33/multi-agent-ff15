# Manual Verification Reference

Use these patterns when the verification cannot be completed through normal UI interaction alone.

## API Verification

- Prefer a runnable request over prose.
- Include auth placeholders, required headers, and a minimal payload.
- State exactly what to inspect in the response.

Example:

```md
- [ ] Create a payroll candidate through the public API.
    Execution steps:
    1. Export a valid token: `export API_TOKEN=<token>`
    2. Run:
       `curl -sS -X POST "$BASE_URL/api/payroll/candidates" \
         -H "Authorization: Bearer $API_TOKEN" \
         -H "Content-Type: application/json" \
         -d '{"userId":"test-user-01","month":"2026-04"}'`
    Expected result:
    - The API returns `201 Created`.
    - The response body includes a candidate id and `status: "pending"`.
    Observation point:
    - Terminal response body.
    - Server log entry for the request.
    Evidence / notes:
```

## Job Or Batch Verification

- Explain how to trigger the job.
- Tell the verifier how to know it finished.
- Point to the exact log, table, file, or UI side effect to inspect.

Example:

```md
- [ ] Rebuild the provider history snapshot job.
    Execution steps:
    1. Run: `npm run jobs:provider-history -- --provider-id test-provider-01`
    2. Wait until the command exits with status 0.
    Expected result:
    - The job completes without retries or uncaught errors.
    - A new snapshot row is written for `test-provider-01`.
    Observation point:
    - Job terminal output.
    - Snapshot table in the local database.
    Evidence / notes:
```

## Notification Or Webhook Verification

- Document how to cause the event.
- Identify where delivery is observed.
- Say whether a stubbed endpoint or local inbox is acceptable.

Example:

```md
- [ ] Confirm the reminder webhook is emitted after approval.
    Execution steps:
    1. Start the local webhook sink.
    2. Approve the target request in the app.
    Expected result:
    - Exactly one webhook is sent.
    - The payload includes the approved request id.
    Observation point:
    - Webhook sink request log.
    - App audit log entry.
    Evidence / notes:
```

## Permission Verification

- Name the role or account explicitly.
- Include the setup step if role switching is needed.
- State both the allowed and denied outcome when relevant.

Example:

```md
- [ ] Verify a viewer cannot edit provider history.
    Execution steps:
    1. Sign in as `viewer-test@example.com`.
    2. Open the provider history detail page.
    3. Attempt to edit the status field.
    Expected result:
    - The edit control is hidden or disabled.
    - Direct submission is rejected with a permission error.
    Observation point:
    - Browser UI state.
    - Network response for the rejected request.
    Evidence / notes:
```

## When Exact Steps Are Unknown

- Do not leave the verifier with generic wording such as `check the API` or `confirm the job runs`.
- Write `Maintainer input required:` followed by the missing command, endpoint, environment variable, or log location.

Example:

```md
- [ ] Confirm the backfill job updates legacy records.
    Execution steps:
    - Maintainer input required: exact command for running the legacy backfill job in the local environment.
    Expected result:
    - Legacy records are updated without data loss.
    Observation point:
    - Maintainer input required: where to inspect updated legacy records.
    Evidence / notes:
```