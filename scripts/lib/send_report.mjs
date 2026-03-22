#!/usr/bin/env node

const [, , missionId, fromAgent, taskId, status, summary, details] = process.argv;

if (!missionId || !fromAgent || !taskId || !status || !summary) {
  console.error(
    "Usage: scripts/send_report.sh <missionId> <ignis|gladiolus|prompto> <taskId> <running|blocked|completed|failed> \"<summary>\" [details]"
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