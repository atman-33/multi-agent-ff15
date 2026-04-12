export const DEFAULT_LUNAFREYA_JOB_FILE_NAME = "lunafreya-autonomous.md";
export const DEFAULT_LUNAFREYA_JOB_LABEL = "Default (Lunafreya Autonomous)";

export function getLunafreyaJobDisplayLabel(input: {
  selectedJobLabel?: string | null;
  selectedJobId?: string | null;
}): string {
  const selectedJobLabel = input.selectedJobLabel?.trim();
  if (selectedJobLabel) {
    return selectedJobLabel;
  }

  const selectedJobId = input.selectedJobId?.trim();
  if (selectedJobId) {
    return selectedJobId;
  }

  return DEFAULT_LUNAFREYA_JOB_LABEL;
}