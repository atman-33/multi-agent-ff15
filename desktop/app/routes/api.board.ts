import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";

/**
 * GET /api/board
 * Returns the content of docs/shared/board.md as JSON: { content: string }
 */
export function loader() {
  try {
    const root = getProjectRoot();
    const filePath = join(root, "docs/shared/board.md");
    if (!existsSync(filePath)) {
      return Response.json({ error: "board.md not found" }, { status: 404 });
    }
    const content = readFileSync(filePath, "utf-8");
    return Response.json({ content });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
