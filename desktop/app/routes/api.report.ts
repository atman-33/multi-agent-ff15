import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "yaml";
import { getProjectRoot } from "@/lib/get-project-root.server";

const FM_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

export function loader({ request }: { request: Request }) {
  try {
    const url = new URL(request.url);
    const filename = url.searchParams.get("file");
    const archived = url.searchParams.get("archived") === "true";

    if (!filename) {
      return Response.json({ error: "No file specified" }, { status: 400 });
    }

    // prevent path traversal
    const safeFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, "");
    const root = getProjectRoot();
    const filePath = archived
      ? join(root, "docs", "reports", "archive", safeFilename)
      : join(root, "docs", "reports", safeFilename);

    if (!existsSync(filePath)) {
      return Response.json(
        { error: `File not found: ${safeFilename}` },
        { status: 404 }
      );
    }

    const content = readFileSync(filePath, "utf-8");

    // Parse frontmatter for metadata
    let displayContent = content;
    let title = safeFilename.replace(".md", "");
    let author = "";
    let date = "";

    const fmMatch = content.match(FM_REGEX);
    if (fmMatch) {
      displayContent = content.substring(fmMatch[0].length);
      try {
        const parsed = yaml.parse(fmMatch[1]);
        if (parsed && typeof parsed === "object") {
          if (parsed.title) {
            title = parsed.title;
          }
          if (parsed.author) {
            author = parsed.author;
          }
          if (parsed.date) {
            date = String(parsed.date);
          }
        }
      } catch {
        // ignore frontmatter parse errors
      }
    }

    return Response.json({ content: displayContent, title, author, date });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
