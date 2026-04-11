import { useCallback, useEffect, useRef, useState } from "react";

export interface ProjectRegistryEntry {
  branchName?: string;
  defaultBaseBranch?: string;
  displayName: string;
  id: string;
  path: string;
}

export interface ProjectRegistryData {
  projects: ProjectRegistryEntry[];
}

function areProjectEntriesEqual(
  left: ProjectRegistryEntry[],
  right: ProjectRegistryEntry[]
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const candidate = right[index];

      return (
        candidate !== undefined &&
        entry.id === candidate.id &&
        entry.displayName === candidate.displayName &&
        entry.path === candidate.path &&
        entry.branchName === candidate.branchName &&
        entry.defaultBaseBranch === candidate.defaultBaseBranch
      );
    })
  );
}

function areProjectRegistryDataEqual(
  left: ProjectRegistryData | null,
  right: ProjectRegistryData
): boolean {
  if (!left) {
    return false;
  }

  return areProjectEntriesEqual(left.projects, right.projects);
}

export function useProjectRegistry() {
  const [data, setData] = useState<ProjectRegistryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!hasLoadedRef.current) {
      setLoading(true);
    }

    try {
      const res = await fetch("/api/projects");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = (await res.json()) as ProjectRegistryData & { error?: string };
      if (json.error) {
        throw new Error(json.error);
      }

      const nextData: ProjectRegistryData = { projects: json.projects ?? [] };
      setData((current) => (areProjectRegistryDataEqual(current, nextData) ? current : nextData));
      setError((current) => (current === null ? current : null));
    } catch (nextError) {
      const message = String(nextError);
      setError((current) => (current === message ? current : message));
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();

    const intervalId = window.setInterval(() => {
      void fetchData();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchData]);

  return { data, error, loading, refresh: fetchData };
}