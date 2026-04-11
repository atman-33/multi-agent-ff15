import { useCallback, useEffect, useState } from "react";
import {
  readVSCodePreferences,
  type VSCodePreference,
  VSCODE_PREFERENCE_STORAGE_KEY,
} from "@/lib/vscode-preferences";

export const useVSCodePreferences = () => {
  const [vscodePreferences, setVSCodePreferences] = useState<Record<string, VSCodePreference>>({});

  useEffect(() => {
    setVSCodePreferences(readVSCodePreferences());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(VSCODE_PREFERENCE_STORAGE_KEY, JSON.stringify(vscodePreferences));
  }, [vscodePreferences]);

  const updateVSCodePreference = useCallback((projectId: string, preference: VSCodePreference) => {
    setVSCodePreferences((prev) => ({ ...prev, [projectId]: preference }));
  }, []);

  return {
    vscodePreferences,
    updateVSCodePreference,
  };
};
