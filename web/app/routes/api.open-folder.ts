import { exec } from "node:child_process";

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { path } = (await request.json()) as { path?: string };
    if (!path) {
      return Response.json({ error: "Path is required" }, { status: 400 });
    }

    exec("explorer.exe .", { cwd: path }, (error) => {
      if (error && error.code !== 1) {
        console.error("Failed to open folder:", error);
      }
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error opening folder:", error);
    return Response.json({ error: "Failed to open folder" }, { status: 500 });
  }
}
