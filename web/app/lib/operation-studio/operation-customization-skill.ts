import {
  buildCanonicalPinnedSkillRelativePath,
  type PinnedSkillAvailability,
} from "@/lib/pinned-skill";

export const OPERATION_CUSTOMIZATION_SKILL_RELATIVE_PATH =
  buildCanonicalPinnedSkillRelativePath("operation-customization");
export const OPERATION_CUSTOMIZATION_UNAVAILABLE_ERROR =
  "Pinned operation-customization skill is unavailable.";

export type OperationCustomizationSkillAvailability = PinnedSkillAvailability;