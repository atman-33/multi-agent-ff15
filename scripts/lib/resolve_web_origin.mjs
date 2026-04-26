import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveProjectRoot } from "./project_root.mjs";

function parseWebServerRecord(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (
    value.version !== 1 ||
    typeof value.projectRoot !== "string" ||
    typeof value.url !== "string" ||
    typeof value.pid !== "number"
  ) {
    return null;
  }

  return value;
}

function readRuntimeWebOrigin(env = process.env) {
  const root = resolveProjectRoot(env);
  const statePath = join(root, "runtime", "web-server.json");
  if (!existsSync(statePath)) {
    return null;
  }

  try {
    const record = parseWebServerRecord(JSON.parse(readFileSync(statePath, "utf-8")));
    if (!record || record.projectRoot !== root) {
      return null;
    }

    return record.url.trim() || null;
  } catch {
    return null;
  }
}

export function resolveWebOrigin(env = process.env) {
  const configuredOrigin = env.FF15_WEB_ORIGIN?.trim();
  if (configuredOrigin) {
    return configuredOrigin;
  }

  const runtimeOrigin = readRuntimeWebOrigin(env);
  if (runtimeOrigin) {
    return runtimeOrigin;
  }

  return "http://localhost:5173";
}
