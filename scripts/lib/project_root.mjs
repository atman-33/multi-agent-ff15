import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function isProjectRoot(candidate) {
  return (
    typeof candidate === "string" &&
    candidate.length > 0 &&
    existsSync(join(candidate, "scripts")) &&
    (existsSync(join(candidate, "package.json")) || existsSync(join(candidate, "opencode.json")))
  );
}

export function resolveProjectRoot(env = process.env) {
  if (isProjectRoot(env.MULTI_AGENT_FF15_ROOT)) {
    return env.MULTI_AGENT_FF15_ROOT;
  }

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const derivedRoot = resolve(currentDir, "../..");
  if (isProjectRoot(derivedRoot)) {
    return derivedRoot;
  }

  throw new Error("Could not determine project root. Set MULTI_AGENT_FF15_ROOT.");
}
