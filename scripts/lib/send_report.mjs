#!/usr/bin/env node

const [, , missionId, fromAgent, taskId, status, summary, ...rest] = process.argv;

let details;
let ruleIndex;

for (let index = 0; index < rest.length; index += 1) {
  const token = rest[index];
  if (token === "--rule-index") {
    const value = rest[index + 1];
    const parsed = Number.parseInt(value ?? "", 10);
    if (!Number.isInteger(parsed)) {
      console.error("--rule-index requires an integer value");
      process.exit(1);
    }
    ruleIndex = parsed;
    index += 1;
    continue;
  }

  details = details ? `${details} ${token}` : token;
}

if (!missionId || !fromAgent || !taskId || !status || !summary) {
  console.error(
    "Usage: scripts/send_report.sh <missionId> <noctis|ignis|gladiolus|prompto> <taskId> <running|blocked|completed|failed> \"<summary>\" [details] [--rule-index <n>]"
  );
  process.exit(1);
}

const origin = process.env.FF15_WEB_ORIGIN || "http://localhost:5173";

try {
  const response = await fetch(
    `${origin}/api/missions/${encodeURIComponent(missionId)}/reports`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromAgent,
        taskId,
        status,
        summary,
        ...(details ? { details } : {}),
        ...(typeof ruleIndex === "number" ? { ruleIndex } : {}),
      }),
    }
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status}`);
  }

  console.log(text || "{}");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}