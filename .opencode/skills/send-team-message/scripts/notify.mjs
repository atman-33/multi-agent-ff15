#!/usr/bin/env node

import { postTeamMessage } from "./_shared.mjs";

const [, , missionId, fromAgent, toAgent, ...bodyParts] = process.argv;

const QUESTION_PATTERNS = [
  /\?/, 
  /？/u,
  /(^|\s)(can you|could you|would you|will you|are you|do you|did you|have you|please reply|reply|let me know|confirm)\b/i,
  /(か\?|か？|ですか\?|ですか？|ますか\?|ますか？|してくれる\?|してくれる？|教えて|確認して)/u,
];

function looksLikeReplySeekingMessage(text) {
  return QUESTION_PATTERNS.some((pattern) => pattern.test(text));
}

if (!missionId || !fromAgent || !toAgent || bodyParts.length === 0) {
  console.error(
    "Usage: node .opencode/skills/send-team-message/scripts/notify.mjs <missionId> <fromAgent> <toAgent> <body>"
  );
  process.exit(1);
}

const origin = process.env.FF15_WEB_ORIGIN || "http://localhost:5173";
const body = bodyParts.join(" ").trim();

if (looksLikeReplySeekingMessage(body)) {
  console.error(
    '[send-team-message] notify is one-way only. This message looks like it expects a reply. Use dispatch instead.'
  );
  process.exit(1);
}

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
