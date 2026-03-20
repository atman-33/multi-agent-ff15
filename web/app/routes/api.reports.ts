import { existsSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { listReports } from "@/lib/report-metadata.server";

export interface ReportMeta {
  archived?: boolean;
  author: string;
  date: string;
  filename: string;
  filePath?: string;
  tags: string[];
  title: string;
}

export function loader({ request }: { request: Request }) {
  try {
    const url = new URL(request.url);
    const archived = url.searchParams.get("archived") === "true";
    const root = getProjectRoot();
    const reportsDir = archived
      ? join(root, "docs", "reports", "archive")
      : join(root, "docs", "reports");

    if (!existsSync(reportsDir)) {
      return Response.json({ reports: [] });
    }
    const reports = listReports(root, { includeArchived: archived }).filter(
      (report) => report.archived === archived
    );

    return Response.json({ reports });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
