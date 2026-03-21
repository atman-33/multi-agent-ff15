#!/usr/bin/env node

const [, , missionId, fromAgent, toAgent, type, ...bodyParts] = process.argv;

if (!missionId || !fromAgent || !toAgent || !type || bodyParts.length === 0) {
  console.error(
    "Usage: node .opencode/skills/send-team-message/scripts/send-team-message.mjs <missionId> <fromAgent> <toAgent> <type> <body>"
  );
  process.exit(1);
}

const body = bodyParts.join(" ").trim();
const origin = process.env.FF15_WEB_ORIGIN || "http://localhost:5173";

const response = await fetch(
  `${origin}/api/missions/${encodeURIComponent(missionId)}/team-messages`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromAgent, toAgent, type, body }),
  }
);

const text = await response.text();
if (!response.ok) {
  console.error(text || `HTTP ${response.status}`);
  process.exit(1);
}

console.log(text || "{}");
