import { useCallback } from "react";
import { useLocation } from "wouter";

export const PROJECT_CONTEXT_STORAGE_KEY = "tech-portal-project-id";
const LEGACY_PROJECT_STORAGE_KEY = "workflow-project-id";

function currentProjectFromLocation(location: string) {
  const query = location.includes("?") ? location.slice(location.indexOf("?")) : "";
  return new URLSearchParams(query).get("projectId") || "";
}

export function readProjectContext(location = window.location.href) {
  return currentProjectFromLocation(location)
    || localStorage.getItem(PROJECT_CONTEXT_STORAGE_KEY)
    || localStorage.getItem(LEGACY_PROJECT_STORAGE_KEY)
    || "";
}

export function useProjectContext() {
  const [location] = useLocation();
  const projectId = readProjectContext(location);

  const rememberProject = useCallback((id: string) => {
    if (!id) return;
    localStorage.setItem(PROJECT_CONTEXT_STORAGE_KEY, id);
    localStorage.setItem(LEGACY_PROJECT_STORAGE_KEY, id);
  }, []);

  const withProject = useCallback((path: string, explicitProjectId = projectId) => {
    if (!explicitProjectId) return path;
    const [pathname, query = ""] = path.split("?");
    const params = new URLSearchParams(query);
    params.set("projectId", explicitProjectId);
    return `${pathname}?${params.toString()}`;
  }, [projectId]);

  return { projectId, rememberProject, withProject };
}
