import { existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { filename, action: archiveAction } = body as {
      filename: string;
      action: "archive" | "restore";
    };

    if (!(filename && ["archive", "restore"].includes(archiveAction))) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    // prevent path traversal
    const safeFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, "");
    const root = getProjectRoot();
    const reportsDir = join(root, "docs", "reports");
    const archiveDir = join(root, "docs", "reports", "archive");

    if (archiveAction === "archive") {
      const src = join(reportsDir, safeFilename);
      const dest = join(archiveDir, safeFilename);
      if (!existsSync(src)) {
        return Response.json({ error: "File not found" }, { status: 404 });
      }
      if (!existsSync(archiveDir)) {
        mkdirSync(archiveDir, { recursive: true });
      }
      renameSync(src, dest);
    } else {
      // restore
      const src = join(archiveDir, safeFilename);
      const dest = join(reportsDir, safeFilename);
      if (!existsSync(src)) {
        return Response.json(
          { error: "File not found in archive" },
          { status: 404 }
        );
      }
      renameSync(src, dest);
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
