#!/usr/bin/env node

const [, , missionId, toAgent, body] = process.argv;

if (!missionId || !toAgent || !body) {
  console.error("Usage: scripts/send_message.sh <missionId> <ignis|gladiolus|prompto> \"<message>\"");
  process.exit(1);
}

const origin = process.env.FF15_WEB_ORIGIN || "http://localhost:5173";

try {
  const response = await fetch(
    `${origin}/api/missions/${encodeURIComponent(missionId)}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toAgent, body }),
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