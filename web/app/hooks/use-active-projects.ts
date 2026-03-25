import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectScope } from "@/lib/project-scopes";

export interface ProjectEntry {
  branchName?: string;
  displayName: string;
  id: string;
  path: string;
}

export interface ActiveProjectsData {
  configUpdatedAt: string;
  projectScopes: Record<ProjectScope, { activeProjectIds: string[] }>;
  projects: ProjectEntry[];
}

function areProjectEntriesEqual(left: ProjectEntry[], right: ProjectEntry[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((project, index) => {
    const other = right[index];
    return (
      project.id === other?.id &&
      project.displayName === other.displayName &&
      project.path === other.path &&
      project.branchName === other.branchName
    );
  });
}

function areActiveProjectsDataEqual(left: ActiveProjectsData | null, right: ActiveProjectsData) {
  if (!left) {
    return false;
  }

  if (left.configUpdatedAt !== right.configUpdatedAt) {
    return false;
  }

  if (!areProjectEntriesEqual(left.projects, right.projects)) {
    return false;
  }

  return (
    left.projectScopes.noctis_team.activeProjectIds.join("\u0000") ===
      right.projectScopes.noctis_team.activeProjectIds.join("\u0000") &&
    left.projectScopes.lunafreya.activeProjectIds.join("\u0000") ===
      right.projectScopes.lunafreya.activeProjectIds.join("\u0000")
  );
}

export function useActiveProjects() {
  const [data, setData] = useState<ActiveProjectsData | null>(null);
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
      const json = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }

      const nextData = json as ActiveProjectsData;
      setData((current) => (areActiveProjectsDataEqual(current, nextData) ? current : nextData));
      setError((current) => (current === null ? current : null));
    } catch (e) {
      const message = String(e);
      setError((current) => (current === message ? current : message));
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    const intervalId = setInterval(fetchData, 5000);

    const handler = () => {
      fetchData();
    };
    window.addEventListener("active-projects-changed", handler);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("active-projects-changed", handler);
    };
  }, [fetchData]);

  return { data, loading, error, refresh: fetchData };
}
