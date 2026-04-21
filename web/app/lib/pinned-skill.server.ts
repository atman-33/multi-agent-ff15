import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSkillsCatalog, normalizeFileSkillEntry } from "@/lib/skill-catalog.server";
import {
  buildCanonicalPinnedSkillRelativePath,
  type PinnedSkillAvailability,
} from "@/lib/pinned-skill";

export function resolveCanonicalPinnedSkill(
  root: string,
  input: {
    skillName: string;
    unavailableError: string;
  },
): PinnedSkillAvailability {
  const filePath = join(root, buildCanonicalPinnedSkillRelativePath(input.skillName));
  if (!existsSync(filePath)) {
    return {
      available: false,
      error: input.unavailableError,
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
      error: input.unavailableError,
      filePath: null,
      promptContext: null,
    };
  }
}