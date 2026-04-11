export type VSCodePreference = "auto" | "wsl" | "windows";

export const VSCODE_PREFERENCE_STORAGE_KEY = "projects_vscode_preferences";

const WINDOWS_MOUNTED_PATH_REGEX = /^\/mnt\/[a-z]\//i;

const isVSCodePreference = (value: unknown): value is VSCodePreference =>
  value === "auto" || value === "wsl" || value === "windows";

const isWindowsMountedPath = (path: string): boolean => WINDOWS_MOUNTED_PATH_REGEX.test(path);

export const resolveVSCodeTarget = (
  path: string,
  preference: VSCodePreference,
): "wsl" | "windows" => {
  if (preference === "auto") {
    return isWindowsMountedPath(path) ? "windows" : "wsl";
  }

  return preference;
};

export const getPreferenceLabel = (preference: VSCodePreference): string => {
  switch (preference) {
    case "wsl":
      return "WSL";
    case "windows":
      return "Win";
    default:
      return "Auto";
  }
};

export const getResolvedTargetLabel = (path: string, preference: VSCodePreference): string =>
  resolveVSCodeTarget(path, preference) === "windows" ? "Windows" : "WSL";

export const readVSCodePreferences = (): Record<string, VSCodePreference> => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = localStorage.getItem(VSCODE_PREFERENCE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => isVSCodePreference(value)),
    ) as Record<string, VSCodePreference>;
  } catch {
    return {};
  }
};
