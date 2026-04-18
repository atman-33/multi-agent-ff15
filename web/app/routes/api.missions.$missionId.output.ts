import { readMissionOutputDocument } from "@/lib/mission-output-metadata.server";
import { getMission } from "@/lib/mission-store";

export function loader({ request, params }: { request: Request; params: { missionId?: string } }) {
  const missionId = params.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const mission = getMission(missionId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const step = url.searchParams.get("step");
  const taskId = url.searchParams.get("taskId");
  const filename = url.searchParams.get("file");

  if (!step) {
    return Response.json({ error: "Missing step" }, { status: 400 });
  }
  if (!taskId) {
    return Response.json({ error: "Missing taskId" }, { status: 400 });
  }
  if (!filename) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  try {
    const output = readMissionOutputDocument({ missionId, step, taskId, filename });
    if (!output) {
      return Response.json({ error: `File not found: ${filename}` }, { status: 404 });
    }

    return Response.json({
      author: output.author,
      content: output.content,
      date: output.date,
      displayMode: output.displayMode,
      filePath: output.filePath,
      filename: output.filename,
      frontmatter: output.frontmatter,
      metadata: output.metadata ?? null,
      rawContent: output.rawContent,
      step: output.step,
      tags: output.tags,
      taskId: output.taskId,
      title: output.title,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Invalid ")) {
      return Response.json({ error: message }, { status: 400 });
    }

    return Response.json({ error: message }, { status: 500 });
  }
}