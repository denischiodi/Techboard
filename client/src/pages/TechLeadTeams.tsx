import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AnalyticsEmpty,
  AnalyticsMetricCard,
  DashboardDrilldown,
  DashboardFilterBar,
} from "@/components/analytics/DashboardKit";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";
import { useProjectContext } from "@/hooks/useProjectContext";
import { trpc } from "@/lib/trpc";
import type {
  DashboardDetailRow,
  DashboardMetric,
  Project,
} from "../../../shared/types";
import { FolderKanban, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

const rowForProject = (project: Project): DashboardDetailRow => ({
  id: project.id,
  title: project.name,
  subtitle: `${project.client} · ${project.manager || "Sem gestor"}`,
  status: project.status,
  projectId: project.id,
  dueDate: project.endDate,
});

export default function TechLeadTeams({
  indicators = false,
}: {
  indicators?: boolean;
}) {
  const { data: projects = [], isLoading } = trpc.projects.list.useQuery();
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const { data: allocations = [] } = trpc.allocations.list.useQuery();
  const [, navigate] = useLocation();
  const { rememberProject, withProject } = useProjectContext();
  const { filters, setFilters, clearFilters } = useDashboardFilters();
  const [detail, setDetail] = useState<{
    metric: DashboardMetric;
    rows: DashboardDetailRow[];
  } | null>(null);
  const filtered = useMemo(
    () =>
      projects.filter(
        project =>
          (!filters.projectIds.length ||
            filters.projectIds.includes(project.id)) &&
          (!filters.resourceIds.length ||
            allocations.some(
              allocation =>
                allocation.projectId === project.id &&
                filters.resourceIds.includes(allocation.resourceId)
            )) &&
          (!filters.startDate || project.endDate >= filters.startDate) &&
          (!filters.endDate || project.startDate <= filters.endDate)
      ),
    [allocations, filters, projects]
  );

  const openProject = (row: DashboardDetailRow) => {
    if (!row.projectId) return;
    rememberProject(row.projectId);
    navigate(withProject("/techlead/gp-track", row.projectId));
  };

  const managers = [
    ...new Set(filtered.map(project => project.manager || "Sem gestor")),
  ];
  const allocationResourceIds = new Set(
    allocations
      .filter(item => filtered.some(project => project.id === item.projectId))
      .map(item => item.resourceId)
  );
  const scopedResources = resources.filter(
    resource =>
      resource.status === "Ativo" &&
      (!filters.resourceIds.length ||
        filters.resourceIds.includes(resource.id)) &&
      (!filters.projectIds.length || allocationResourceIds.has(resource.id))
  );
  const uncovered = filtered.filter(project =>
    project.fronts.some(
      front =>
        !allocations.some(
          allocation =>
            allocation.projectId === project.id &&
            allocation.front === front &&
            resources.some(
              resource =>
                resource.id === allocation.resourceId &&
                resource.status === "Ativo"
            )
        )
    )
  );

  if (indicators) {
    const groups = [...new Set(filtered.map(project => project.status))].map(
      status => ({
        status,
        rows: filtered
          .filter(project => project.status === status)
          .map(rowForProject),
      })
    );
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="text-sm font-medium text-violet-600">TechLead</p>
          <h1 className="text-3xl font-bold">Indicadores de governança</h1>
          <p className="mt-1 text-muted-foreground">
            Explore o portfólio e abra o detalhe operacional de cada resultado.
          </p>
        </div>
        <DashboardFilterBar
          filters={filters}
          onChange={setFilters}
          onClear={clearFilters}
          projects={projects}
          resources={resources}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(item => (
            <AnalyticsMetricCard
              key={item.status}
              metric={{
                id: `status.${item.status}`,
                label: item.status,
                value: item.rows.length,
                formula: `Projetos com status “${item.status}” no recorte selecionado.`,
              }}
              onClick={() =>
                setDetail({
                  metric: {
                    id: `status.${item.status}`,
                    label: item.status,
                    value: item.rows.length,
                    formula: `Projetos com status “${item.status}” no recorte selecionado.`,
                  },
                  rows: item.rows,
                })
              }
            />
          ))}
        </div>
        {!isLoading && !groups.length && <AnalyticsEmpty />}
        <DashboardDrilldown
          open={Boolean(detail)}
          onOpenChange={open => !open && setDetail(null)}
          title={detail?.metric.label || ""}
          formula={detail?.metric.formula || ""}
          rows={detail?.rows || []}
          onOpenRow={openProject}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm font-medium text-violet-600">TechLead</p>
        <h1 className="text-3xl font-bold">Times e frentes</h1>
        <p className="mt-1 text-muted-foreground">
          Cobertura das frentes, responsáveis e projetos acompanhados.
        </p>
      </div>
      <DashboardFilterBar
        filters={filters}
        onChange={setFilters}
        onClear={clearFilters}
        projects={projects}
        resources={resources}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <AnalyticsMetricCard
          metric={{
            id: "teams.resources",
            label: "Recursos ativos",
            value: scopedResources.length,
            tone: "positive",
            formula:
              "Recursos ativos alocados no recorte de projetos selecionado.",
          }}
        />
        <AnalyticsMetricCard
          metric={{
            id: "teams.uncovered",
            label: "Projetos com frente descoberta",
            value: uncovered.length,
            tone: uncovered.length ? "critical" : "positive",
            formula:
              "Projetos com ao menos uma frente sem recurso ativo correspondente.",
          }}
          onClick={() =>
            setDetail({
              metric: {
                id: "teams.uncovered",
                label: "Projetos com frente descoberta",
                value: uncovered.length,
                formula:
                  "Projetos com ao menos uma frente sem recurso ativo correspondente.",
              },
              rows: uncovered.map(rowForProject),
            })
          }
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {managers.map(manager => {
          const managed = filtered.filter(
            project => (project.manager || "Sem gestor") === manager
          );
          return (
            <Card key={manager}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-5 w-5 text-violet-600" />
                  {manager}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {managed.map(project => (
                    <button
                      key={project.id}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border p-2 text-left text-sm transition hover:bg-muted"
                      onClick={() => openProject(rowForProject(project))}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <FolderKanban className="h-4 w-4 shrink-0" />
                        <span className="truncate">{project.name}</span>
                      </span>
                      <Badge variant="secondary">{project.status}</Badge>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!isLoading && !managers.length && (
          <AnalyticsEmpty text="Nenhum time disponível para os filtros." />
        )}
      </div>
      <DashboardDrilldown
        open={Boolean(detail)}
        onOpenChange={open => !open && setDetail(null)}
        title={detail?.metric.label || ""}
        formula={detail?.metric.formula || ""}
        rows={detail?.rows || []}
        onOpenRow={openProject}
      />
    </div>
  );
}
