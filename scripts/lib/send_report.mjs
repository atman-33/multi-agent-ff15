#!/usr/bin/env node

const [, , missionId, fromAgent, taskId, next, message, ...rest] = process.argv;

const canonicalMessage = [message, ...rest].filter(Boolean).join(" ").trim();

if (!missionId || !fromAgent || !taskId || !next || !canonicalMessage) {
  console.error(
    "Usage: scripts/send_report.sh <missionId> <noctis|ignis|gladiolus|prompto> <taskId> <next> \"<message>\""
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
        next,
        message: canonicalMessage,
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