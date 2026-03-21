#!/usr/bin/env node

const [, , missionId, fromAgent, toAgent, type, taskId, ...bodyParts] = process.argv;

if (!missionId || !fromAgent || !toAgent || !type || !taskId || bodyParts.length === 0) {
  console.error(
    "Usage: node .opencode/skills/send-team-message/scripts/dispatch.mjs <missionId> <fromAgent> <toAgent> <instruction|handoff> <taskId> <body>"
  );
  process.exit(1);
}

if (fromAgent !== "noctis") {
  console.error("dispatch.mjs only allows fromAgent=noctis");
  process.exit(1);
}

if (type !== "instruction" && type !== "handoff") {
  console.error("dispatch.mjs only supports type=instruction|handoff");
  process.exit(1);
}

const origin = process.env.FF15_WEB_ORIGIN || "http://localhost:5173";
const message = bodyParts.join(" ").trim();

try {
  const response = await fetch(`${origin}/api/task/dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      missionId,
      agentId: toAgent,
      taskId,
      message,
      missionObjective: message,
      outputSchema: "WorkerResult JSON",
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status}`);
  }

  console.log(text || "{}");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
