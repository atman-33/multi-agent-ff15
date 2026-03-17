import { useCallback, useEffect, useState } from "react";
import type { ProjectScope } from "@/lib/project-scopes";

export interface ProjectEntry {
  branchName?: string;
  displayName: string;
  id: string;
  path: string;
  updatedAt: string;
}

export interface ActiveProjectsData {
  configUpdatedAt: string;
  projectScopes: Record<ProjectScope, { activeProjectIds: string[] }>;
  projects: ProjectEntry[];
}

/**
 * Hook to fetch and keep active project state in sync with the server.
 * Listens for the custom "active-projects-changed" browser event so that
 * different parts of the UI (sidebar chip, projects page) stay consistent.
 */
export function useActiveProjects() {
  const [data, setData] = useState<ActiveProjectsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }
      setData(json as ActiveProjectsData);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
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
