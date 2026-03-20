import { getProjectRoot } from "@/lib/get-project-root.server";
import { readReportDocument } from "@/lib/report-metadata.server";

export function loader({ request }: { request: Request }) {
  try {
    const url = new URL(request.url);
    const filename = url.searchParams.get("file");
    const archived = url.searchParams.get("archived") === "true";

    if (!filename) {
      return Response.json({ error: "No file specified" }, { status: 400 });
    }

    const root = getProjectRoot();
    const report = readReportDocument(root, filename, archived);

    if (!report) {
      return Response.json({ error: `File not found: ${filename}` }, { status: 404 });
    }

    return Response.json({
      archived: report.archived,
      author: report.author,
      content: report.content,
      date: report.date,
      filePath: report.filePath,
      filename: report.filename,
      tags: report.tags,
      title: report.title,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
