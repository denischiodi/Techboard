const HIDDEN_RESOURCE_STATUSES = new Set(["inativo", "desligado"]);

function normalizeStatus(status: string) {
  return status
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isResourceVisibleInPlanningViews(status: string) {
  return !HIDDEN_RESOURCE_STATUSES.has(normalizeStatus(status));
}
