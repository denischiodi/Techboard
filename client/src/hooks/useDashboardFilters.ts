import { useCallback, useMemo, useState } from "react";
import type { DashboardFilters } from "../../../shared/types";

const STORAGE_KEY = "analytics-dashboard-filters-v1";

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

export function defaultDashboardFilters(): DashboardFilters {
  return {
    ...monthRange(),
    projectIds: [],
    resourceIds: [],
    fronts: [],
    responsibleIds: [],
    statuses: [],
    criticalities: [],
  };
}

export function useDashboardFilters() {
  const [filters, setFiltersState] = useState<DashboardFilters>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored
        ? { ...defaultDashboardFilters(), ...JSON.parse(stored) }
        : defaultDashboardFilters();
    } catch {
      return defaultDashboardFilters();
    }
  });

  const setFilters = useCallback(
    (
      next: DashboardFilters | ((current: DashboardFilters) => DashboardFilters)
    ) => {
      setFiltersState(current => {
        const value = typeof next === "function" ? next(current) : next;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
        return value;
      });
    },
    []
  );

  const clearFilters = useCallback(
    () => setFilters(defaultDashboardFilters()),
    [setFilters]
  );
  const activeCount = useMemo(
    () =>
      filters.projectIds.length +
      filters.resourceIds.length +
      filters.fronts.length +
      filters.responsibleIds.length +
      filters.statuses.length +
      filters.criticalities.length,
    [filters]
  );

  return { filters, setFilters, clearFilters, activeCount };
}
