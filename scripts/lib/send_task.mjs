#!/usr/bin/env node

import { resolveWebOrigin } from "./resolve_web_origin.mjs";

const [, , missionId, agentId, message, taskId] = process.argv;

if (!missionId || !agentId || !message) {
  console.error("Usage: scripts/send_task.sh <missionId> <ignis|gladiolus|prompto> \"<message>\" [taskId]");
  process.exit(1);
}

const origin = resolveWebOrigin(process.env);

try {
  const response = await fetch(
    `${origin}/api/missions/${encodeURIComponent(missionId)}/tasks`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        message,
        ...(taskId ? { taskId } : {}),
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
