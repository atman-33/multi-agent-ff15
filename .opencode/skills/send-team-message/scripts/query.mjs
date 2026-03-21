#!/usr/bin/env node

import { postTeamMessage } from "./_shared.mjs";

const [, , missionId, fromAgent, toAgent, ...bodyParts] = process.argv;

if (!missionId || !fromAgent || !toAgent || bodyParts.length === 0) {
  console.error(
    "Usage: node .opencode/skills/send-team-message/scripts/query.mjs <missionId> <fromAgent> <toAgent> <body>"
  );
  process.exit(1);
}

const origin = process.env.FF15_WEB_ORIGIN || "http://localhost:5173";
const body = bodyParts.join(" ").trim();

try {
  const result = await postTeamMessage(origin, missionId, {
    fromAgent,
    toAgent,
    type: "notify",
    body,
  });
  console.log(result);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
