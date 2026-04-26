export type PinnedSkillAvailability = {
  available: boolean;
  error: string | null;
  filePath: string | null;
  promptContext: string | null;
};

export function buildCanonicalPinnedSkillRelativePath(skillName: string): string {
  return `.opencode/skills/${skillName}/SKILL.md`;
}