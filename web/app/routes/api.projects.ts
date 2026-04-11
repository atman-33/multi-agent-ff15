import { getProjectRoot } from "@/lib/get-project-root.server";
import { readRegisteredProjects } from "@/lib/project-config.server";

export function loader() {
  try {
    const root = getProjectRoot();
    const projects = readRegisteredProjects(root);

    return Response.json({ projects });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
