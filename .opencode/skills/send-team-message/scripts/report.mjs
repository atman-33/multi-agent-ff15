#!/usr/bin/env node

import { postTeamMessage } from "./_shared.mjs";

const [, , missionId, fromAgent, taskId, type, ...bodyParts] = process.argv;

if (!missionId || !fromAgent || !taskId || !type || bodyParts.length === 0) {
  console.error(
    "Usage: node .opencode/skills/send-team-message/scripts/report.mjs <missionId> <fromAgent> <taskId> <report|update> <body>"
  );
  process.exit(1);
}

if (type !== "report" && type !== "update") {
  console.error("report.mjs only supports type=report|update");
  process.exit(1);
}

const origin = process.env.FF15_WEB_ORIGIN || "http://localhost:5173";
const body = bodyParts.join(" ").trim();

try {
  const result = await postTeamMessage(origin, missionId, {
    fromAgent,
    toAgent: "noctis",
    type,
    body,
    taskId,
    replyRequested: false,
  });
  console.log(result);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
