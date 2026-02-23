import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/getProjectRoot.server";

export async function loader({ request }: { request: Request }) {
  try {
    const url = new URL(request.url);
    const filename = url.searchParams.get("file");

    if (!filename) {
      return Response.json({ error: "No file specified" }, { status: 400 });
    }

    // prevent path traversal
    const safeFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, "");
    const root = getProjectRoot();
    const filePath = join(root, "docs", "reports", safeFilename);

    if (!existsSync(filePath)) {
      return Response.json(
        { error: `File not found: ${safeFilename}` },
        { status: 404 }
      );
    }

    const content = readFileSync(filePath, "utf-8");

    // strip out YAML frontmatter for viewing, optional, but maybe nice?
    // let's leave it in, if we parse it out frontend can handle it
    let displayContent = content;
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if (fmMatch) {
      displayContent = content.substring(fmMatch[0].length);
    }

    return Response.json({ content: displayContent });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
