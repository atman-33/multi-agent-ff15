import type { ActionFunctionArgs } from "react-router";
import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  readSharedSkillsState,
  writeSharedSkillsSelection,
} from "@/lib/shared-skills.server";

function buildSkillsPayload(root: string, success = false) {
  return {
    ...readSharedSkillsState(root),
    ...(success ? { success: true } : {}),
  };
}

export const loader = () => {
  try {
    return Response.json(buildSkillsPayload(getProjectRoot()));
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = (await request.json()) as {
      selectedSkillIds?: unknown;
      sharedSkillsRoot?: unknown;
    };
    const root = getProjectRoot();

    if (body.sharedSkillsRoot !== undefined) {
      return Response.json(
        { error: "sharedSkillsRoot is managed through /api/config" },
        { status: 400 },
      );
    }

    if (body.selectedSkillIds !== undefined && !Array.isArray(body.selectedSkillIds)) {
      return Response.json({ error: "selectedSkillIds must be an array" }, { status: 400 });
    }

    if (Array.isArray(body.selectedSkillIds)) {
      writeSharedSkillsSelection(root, {
        selectedSkillIds: body.selectedSkillIds.filter(
          (value): value is string => typeof value === "string",
        ),
      });
    }

    return Response.json(buildSkillsPayload(root, true));
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
};