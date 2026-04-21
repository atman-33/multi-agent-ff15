import {
  buildCanonicalPinnedSkillRelativePath,
  type PinnedSkillAvailability,
} from "@/lib/pinned-skill";
import { resolveCanonicalPinnedSkill } from "@/lib/pinned-skill.server";

export const PROJECT_MANAGE_SKILL_RELATIVE_PATH = buildCanonicalPinnedSkillRelativePath(
  "project-manage",
);
const PROJECT_MANAGE_UNAVAILABLE_ERROR = "Pinned project-manage skill is unavailable.";

export type ProjectManageSkillAvailability = PinnedSkillAvailability;

export function resolveProjectManageSkill(root: string): ProjectManageSkillAvailability {
  return resolveCanonicalPinnedSkill(root, {
    skillName: "project-manage",
    unavailableError: PROJECT_MANAGE_UNAVAILABLE_ERROR,
  });
}