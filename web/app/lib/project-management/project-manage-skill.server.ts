import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSkillsCatalog, normalizeFileSkillEntry } from "@/lib/skill-catalog.server";

export const PROJECT_MANAGE_SKILL_RELATIVE_PATH = ".opencode/skills/project-manage/SKILL.md";
const PROJECT_MANAGE_UNAVAILABLE_ERROR = "Pinned project-manage skill is unavailable.";

export type ProjectManageSkillAvailability = {
  available: boolean;
  error: string | null;
  filePath: string | null;
  promptContext: string | null;
};

export function resolveProjectManageSkill(root: string): ProjectManageSkillAvailability {
  const filePath = join(root, PROJECT_MANAGE_SKILL_RELATIVE_PATH);
  if (!existsSync(filePath)) {
    return {
      available: false,
      error: PROJECT_MANAGE_UNAVAILABLE_ERROR,
      filePath: null,
      promptContext: null,
    };
  }

  try {
    const entry = normalizeFileSkillEntry(readFileSync(filePath, "utf-8"), filePath);
    return {
      available: true,
      error: null,
      filePath,
      promptContext: buildSkillsCatalog([entry]),
    };
  } catch {
    return {
      available: false,
      error: PROJECT_MANAGE_UNAVAILABLE_ERROR,
      filePath: null,
      promptContext: null,
    };
  }
}