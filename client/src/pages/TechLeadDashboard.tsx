import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AnalyticsEmpty,
  AnalyticsLoading,
  AnalyticsMetricCard,
  DashboardDrilldown,
  DashboardFilterBar,
} from "@/components/analytics/DashboardKit";
import { ProductLogo } from "@/components/ProductLogo";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";
import { useProjectContext } from "@/hooks/useProjectContext";
import { PRODUCT_CATALOG } from "@/lib/productCatalog";
import { trpc } from "@/lib/trpc";
import type {
  DashboardDetailRow,
  DashboardMetric,
  Project,
} from "../../../shared/types";
import {
  AlertTriangle,
  ClipboardCheck,
  FolderKanban,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

type Selection = { metric: DashboardMetric; rows: DashboardDetailRow[] } | null;

function projectRow(project: Project): DashboardDetailRow {
  return {
    id: project.id,
    title: project.name,
    subtitle: `${project.client} · GP: ${project.manager || "não definido"}`,
    status: project.status,
    projectId: project.id,
    dueDate: project.endDate,
  };
}

export default function TechLeadDashboard() {
  const [, navigate] = useLocation();
  const { rememberProject, withProject } = useProjectContext();
  const { filters, setFilters, clearFilters } = useDashboardFilters();
  const { data: projects = [], isLoading } = trpc.projects.list.useQuery();
  const [selection, setSelection] = useState<Selection>(null);
  const today = new Date().toISOString().slice(0, 10);

  const visible = useMemo(
    () =>
      projects.filter(
        project =>
          (!filters.projectIds.length ||
            filters.projectIds.includes(project.id)) &&
          (!filters.statuses.length ||
            filters.statuses.includes(project.status)) &&
          (!filters.startDate || project.endDate >= filters.startDate) &&
          (!filters.endDate || project.startDate <= filters.endDate)
      ),
    [filters, projects]
  );

  const metricDefinitions = useMemo(() => {
    const active = visible.filter(
      project => !["Concluído", "Cancelado"].includes(project.status)
    );
    const attention = active.filter(
      project => project.endDate && project.endDate < today
    );
    const withoutManager = active.filter(project => !project.manager?.trim());
    const completed = visible.filter(project => project.status === "Concluído");
    return [
      {
        metric: {
          id: "techlead.active",
          label: "Projetos em andamento",
          value: active.length,
          tone: "neutral",
          formula: "Projetos visíveis que não estão concluídos nem cancelados.",
        } as DashboardMetric,
        rows: active.map(projectRow),
      },
      {
        metric: {
          id: "techlead.late",
          label: "Projetos com prazo vencido",
          value: attention.length,
          tone: "critical",
          formula: "Projetos em andamento cuja data final é anterior a hoje.",
        } as DashboardMetric,
        rows: attention.map(projectRow),
      },
      {
        metric: {
          id: "techlead.unowned",
          label: "Sem gestor definido",
          value: withoutManager.length,
          tone: "warning",
          formula: "Projetos em andamento sem gestor preenchido.",
        } as DashboardMetric,
        rows: withoutManager.map(projectRow),
      },
      {
        metric: {
          id: "techlead.completed",
          label: "Concluídos no recorte",
          value: completed.length,
          tone: "positive",
          formula: "Projetos concluídos que cruzam o período selecionado.",
        } as DashboardMetric,
        rows: completed.map(projectRow),
      },
    ];
  }, [today, visible]);

  const statusCounts = useMemo(
    () =>
      [...new Set(visible.map(project => project.status))]
        .map(status => ({
          status,
          projects: visible.filter(project => project.status === status),
        }))
        .sort((a, b) => b.projects.length - a.projects.length),
    [visible]
  );

  const openProject = (row: DashboardDetailRow) => {
    if (!row.projectId) return;
    rememberProject(row.projectId);
    navigate(withProject("/techlead/gp-track", row.projectId));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 p-6 text-white">
        <ProductLogo
          product={PRODUCT_CATALOG.techlead}
          className="mb-4 h-12 w-44"
        />
        <h1 className="text-3xl font-bold">Central analítica de liderança</h1>
        <p className="mt-2 text-white/80">
          Saúde do portfólio, governança e exceções com acesso ao detalhe
          operacional.
        </p>
      </div>

      <DashboardFilterBar
        filters={filters}
        onChange={setFilters}
        onClear={clearFilters}
        projects={projects}
        showResources={false}
      />

      {isLoading ? (
        <AnalyticsLoading />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metricDefinitions.map(item => (
              <AnalyticsMetricCard
                key={item.metric.id}
                metric={item.metric}
                onClick={() => setSelection(item)}
              />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Distribuição por status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {statusCounts.map(item => (
                  <button
                    key={item.status}
                    className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted"
                    onClick={() =>
                      setSelection({
                        metric: {
                          id: `techlead.status.${item.status}`,
                          label: item.status,
                          value: item.projects.length,
                          formula: `Projetos com status “${item.status}” no recorte selecionado.`,
                        },
                        rows: item.projects.map(projectRow),
                      })
                    }
                  >
                    <span className="min-w-32 text-sm font-medium">
                      {item.status}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-violet-500"
                        style={{
                          width: `${Math.max(6, (item.projects.length / Math.max(visible.length, 1)) * 100)}%`,
                        }}
                      />
                    </span>
                    <strong>{item.projects.length}</strong>
                  </button>
                ))}
                {!statusCounts.length && <AnalyticsEmpty />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Atalhos operacionais</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() =>
                    navigate(
                      withProject("/techlead/gp-track", filters.projectIds[0])
                    )
                  }
                >
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  Trilha do GP e quality gates
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() =>
                    navigate(
                      withProject("/techlead/teams", filters.projectIds[0])
                    )
                  }
                >
                  <Users className="mr-2 h-4 w-4" />
                  Times e frentes
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() =>
                    navigate(
                      withProject("/techlead/indicators", filters.projectIds[0])
                    )
                  }
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Indicadores e exceções
                </Button>
                <p className="pt-2 text-xs text-muted-foreground">
                  <FolderKanban className="mr-1 inline h-3 w-3" />
                  Clique em qualquer indicador para ver os projetos que compõem
                  o resultado.
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <DashboardDrilldown
        open={Boolean(selection)}
        onOpenChange={open => !open && setSelection(null)}
        title={selection?.metric.label || ""}
        formula={selection?.metric.formula || ""}
        rows={selection?.rows || []}
        onOpenRow={openProject}
        description={
          selection
            ? `${selection.rows.length} projetos compõem este indicador. Abra um projeto para atuar na trilha.`
            : undefined
        }
      />
    </div>
  );
}
