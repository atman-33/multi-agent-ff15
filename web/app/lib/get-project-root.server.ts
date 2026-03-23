import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolves the multi-agent-ff15 project root at runtime in Node.js context.
 *
 * Priority:
 * 1. MULTI_AGENT_FF15_ROOT env var
 * 2. Walk up from process.cwd() looking for scripts/ + opencode.json
 * 3. Relative from this file's location (web/app/lib → project root)
 */
export function getProjectRoot(): string {
  // 1. Environment variable override
  const envRoot = process.env.MULTI_AGENT_FF15_ROOT;
  if (
    envRoot &&
    existsSync(join(envRoot, "scripts")) &&
    existsSync(join(envRoot, "opencode.json"))
  ) {
    return envRoot;
  }

  // 2. Walk up from process.cwd()
  const cwd = process.cwd();
  const parts = cwd.split("/").filter(Boolean);
  for (let i = parts.length; i >= 0; i--) {
    const candidate = i === 0 ? "/" : `/${parts.slice(0, i).join("/")}`;
    if (existsSync(join(candidate, "scripts")) && existsSync(join(candidate, "opencode.json"))) {
      return candidate;
    }
  }

  // 3. Relative from this module file:
  //    web/app/lib/get-project-root.server.ts → ../../../ = project root
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const relRoot = join(__dirname, "../../..");
    if (existsSync(join(relRoot, "scripts")) && existsSync(join(relRoot, "opencode.json"))) {
      return relRoot;
    }
  } catch {
    // import.meta.url may not resolve in all build contexts
  }

  throw new Error("Could not determine project root. Set MULTI_AGENT_FF15_ROOT env var.");
}
