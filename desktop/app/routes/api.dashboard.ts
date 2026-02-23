import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/getProjectRoot.server";

/**
 * GET /api/dashboard
 * Returns the content of dashboard.md as JSON: { content: string }
 */
export async function loader() {
  try {
    const root = getProjectRoot();
    const filePath = join(root, "dashboard.md");
    if (!existsSync(filePath)) {
      return Response.json(
        { error: "dashboard.md not found" },
        { status: 404 }
      );
    }
    const content = readFileSync(filePath, "utf-8");
    return Response.json({ content });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
