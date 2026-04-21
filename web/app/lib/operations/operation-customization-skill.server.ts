import {
  resolveCanonicalPinnedSkill,
} from "@/lib/pinned-skill.server";
import {
  OPERATION_CUSTOMIZATION_UNAVAILABLE_ERROR,
  type OperationCustomizationSkillAvailability,
} from "@/lib/operations/operation-customization-skill";

export function resolveOperationCustomizationSkill(
  root: string,
): OperationCustomizationSkillAvailability {
  return resolveCanonicalPinnedSkill(root, {
    skillName: "operation-customization",
    unavailableError: OPERATION_CUSTOMIZATION_UNAVAILABLE_ERROR,
  });
}