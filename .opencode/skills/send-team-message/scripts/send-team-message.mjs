#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [, , intent, ...args] = process.argv;

if (!intent) {
  console.error(
    "Usage: node .opencode/skills/send-team-message/scripts/send-team-message.mjs <dispatch|notify|report> ..."
  );
  process.exit(1);
}

const intentMap = {
  dispatch: fileURLToPath(new URL("./dispatch.mjs", import.meta.url)),
  notify: fileURLToPath(new URL("./notify.mjs", import.meta.url)),
  report: fileURLToPath(new URL("./report.mjs", import.meta.url)),
};

const target = intentMap[intent];
if (!target) {
  console.error("Intent must be one of: dispatch, notify, report");
  process.exit(1);
}

const result = spawnSync(process.execPath, [target, ...args], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
