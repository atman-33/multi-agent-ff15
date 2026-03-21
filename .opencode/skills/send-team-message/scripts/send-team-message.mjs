#!/usr/bin/env node

const [, , intent] = process.argv;

if (!intent) {
  console.error(
    "Usage: node .opencode/skills/send-team-message/scripts/send-team-message.mjs <dispatch|query|report> ..."
  );
  process.exit(1);
}

const intentMap = {
  dispatch: "./dispatch.mjs",
  query: "./notify.mjs",
  report: "./report.mjs",
};

const target = intentMap[intent];
if (!target) {
  console.error("Intent must be one of: dispatch, query, report");
  process.exit(1);
}

await import(target);
