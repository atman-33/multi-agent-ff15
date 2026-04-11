import { join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";

export function getRuntimeScriptPath(scriptName: string): string {
  return join(getProjectRoot(), "scripts", scriptName);
}