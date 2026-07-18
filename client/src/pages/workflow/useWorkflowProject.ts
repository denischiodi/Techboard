import { useLocation } from "wouter";

const PROJECT_STORAGE_KEY = "workflow-project-id";

export function useWorkflowProject() {
  const [location] = useLocation();
  const query = location.includes("?") ? location.slice(location.indexOf("?")) : window.location.search;
  const projectId = new URLSearchParams(query).get("projectId") || localStorage.getItem(PROJECT_STORAGE_KEY) || "";
  const withProject = (path: string) => `${path}?projectId=${encodeURIComponent(projectId)}`;

  const rememberProject = (id: string) => localStorage.setItem(PROJECT_STORAGE_KEY, id);

  return { projectId, withProject, rememberProject };
}
