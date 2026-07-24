import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ArrowRight, Workflow } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ProductLogo } from "@/components/ProductLogo";
import { PRODUCT_CATALOG } from "@/lib/productCatalog";
import {
  AnalyticsEmpty,
  AnalyticsLoading,
  AnalyticsMetricCard,
  DashboardDrilldown,
  DashboardFilterBar,
} from "@/components/analytics/DashboardKit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";
import { trpc } from "@/lib/trpc";
import type {
  DashboardDetailRow,
  DashboardMetric,
} from "../../../shared/types";

const STAGES = [
  "Escopo",
  "BDCQ",
  "Workshops",
  "DCD",
  "Gaps",
  "Configurações",
  "Testes",
  "Concluído",
];
const COLORS = [
  "#0f766e",
  "#0d9488",
  "#14b8a6",
  "#2dd4bf",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#22c55e",
];

export default function TechMoveDashboard() {
  const [, navigate] = useLocation();
  const { filters, setFilters, clearFilters } = useDashboardFilters();
  const { data: projects = [], isLoading: projectsLoading } =
    trpc.projects.list.useQuery();
  const { data: summary, isLoading: summaryLoading } =
    trpc.workflow.dashboard.useQuery();
  const { data: projectIndicators = [], isLoading: indicatorsLoading } =
    trpc.workflow.projectIndicators.useQuery();
  const [detail, setDetail] = useState<{
    metric: DashboardMetric;
    rows: DashboardDetailRow[];
  } | null>(null);

  const visibleProjects = useMemo(() => {
    const selected = new Set(filters.projectIds);
    return selected.size
      ? projects.filter(project => selected.has(project.id))
      : projects;
  }, [filters.projectIds, projects]);
  const visibleProjectIds = useMemo(
    () => new Set(visibleProjects.map(project => project.id)),
    [visibleProjects]
  );
  const indicators = useMemo(
    () =>
      projectIndicators.filter(indicator =>
        visibleProjectIds.has(indicator.projectId)
      ),
    [projectIndicators, visibleProjectIds]
  );
  const projectById = useMemo(
    () => new Map(projects.map(project => [project.id, project])),
    [projects]
  );
  const alerts = useMemo(
    () =>
      (summary?.alerts || []).filter(alert =>
        visibleProjectIds.has(alert.projectId)
      ),
    [summary?.alerts, visibleProjectIds]
  );
  const stageData = useMemo(
    () =>
      STAGES.map(stage => ({
        stage,
        value: indicators.filter(item => item.stage === stage).length,
      })),
    [indicators]
  );
  const rowsFor = (
    predicate: (item: (typeof projectIndicators)[number]) => boolean
  ): DashboardDetailRow[] =>
    indicators.filter(predicate).map(item => ({
      id: item.projectId,
      title: projectById.get(item.projectId)?.name || "Projeto",
      subtitle:
        projectById.get(item.projectId)?.client || "Jornada de implementação",
      status: item.stage,
      projectId: item.projectId,
      sourceUrl: "/techmove/projects",
    }));
  const alertRows: DashboardDetailRow[] = alerts.map((alert, index) => ({
    id: `${alert.projectId}-${alert.type}-${index}`,
    title: alert.label,
    subtitle: alert.projectName,
    status: alert.type,
    projectId: alert.projectId,
    sourceUrl: alert.route,
  }));
  const pendingRows = alertRows.filter(row => row.status === "BDCQ");
  const dcdRows = alertRows.filter(row => row.status === "DCD");
  const gapRows = alertRows.filter(row => row.status === "Gap");
  const metrics: DashboardMetric[] = [
    {
      id: "workflow.active",
      label: "Jornadas em andamento",
      value: indicators.filter(item => item.stage !== "Concluído").length,
      tone: "neutral",
      formula: "Projetos com jornada iniciada e etapa diferente de Concluído.",
    },
    {
      id: "workflow.pendingQuestions",
      label: "BDCQ crítico",
      value: pendingRows.length,
      tone: pendingRows.length ? "warning" : "positive",
      formula:
        "Perguntas BDCQ sem resposta há mais de sete dias exibidas nas exceções.",
    },
    {
      id: "workflow.dcdApproval",
      label: "DCDs parados",
      value: dcdRows.length,
      tone: dcdRows.length ? "warning" : "positive",
      formula: "DCDs em rascunho sem atualização há mais de quatorze dias.",
    },
    {
      id: "workflow.unassignedGaps",
      label: "Gaps sem responsável",
      value: gapRows.length,
      tone: gapRows.length ? "critical" : "positive",
      formula: "Gaps abertos sem responsável presentes na lista de exceções.",
    },
  ];
  const openMetric = (metric: DashboardMetric) => {
    const rows =
      metric.id === "workflow.active"
        ? rowsFor(item => item.stage !== "Concluído")
        : metric.id === "workflow.unassignedGaps"
          ? gapRows
          : metric.id === "workflow.dcdApproval"
            ? dcdRows
            : pendingRows;
    setDetail({ metric, rows });
  };
  const loading = projectsLoading || summaryLoading || indicatorsLoading;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <ProductLogo
            product={PRODUCT_CATALOG.techmove}
            className="mb-3 h-12 w-44"
          />
          <h1 className="text-3xl font-bold">Controle da jornada</h1>
          <p className="mt-1 text-muted-foreground">
            Gargalos, pendências e evolução do processo de implementação.
          </p>
        </div>
        <Button onClick={() => navigate("/techmove/projects")}>
          <Workflow className="mr-2 h-4 w-4" />
          Abrir projetos
        </Button>
      </div>
      <DashboardFilterBar
        filters={filters}
        onChange={setFilters}
        onClear={clearFilters}
        projects={projects}
        showResources={false}
        showPeriod={false}
      />
      {loading ? (
        <AnalyticsLoading />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(metric => (
            <AnalyticsMetricCard
              key={metric.id}
              metric={metric}
              onClick={() => openMetric(metric)}
            />
          ))}
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Funil da jornada</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {indicators.length === 0 ? (
              <AnalyticsEmpty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageData} margin={{ left: 0, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="stage"
                    angle={-20}
                    textAnchor="end"
                    height={64}
                    fontSize={12}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="value"
                    name="Projetos"
                    radius={[6, 6, 0, 0]}
                    onClick={data => {
                      const item = data as unknown as {
                        stage?: string;
                        value?: number;
                      };
                      if (item.stage)
                        setDetail({
                          metric: {
                            id: `stage.${item.stage}`,
                            label: `Etapa ${item.stage}`,
                            value: item.value || 0,
                            formula: `Projetos cuja próxima etapa da jornada é ${item.stage}.`,
                          },
                          rows: rowsFor(
                            indicator => indicator.stage === item.stage
                          ),
                        });
                    }}
                  >
                    {stageData.map((entry, index) => (
                      <Cell
                        key={entry.stage}
                        fill={COLORS[index]}
                        className="cursor-pointer"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Distribuição do portfólio</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {indicators.length === 0 ? (
              <AnalyticsEmpty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stageData.filter(item => item.value)}
                    dataKey="value"
                    nameKey="stage"
                    innerRadius={58}
                    outerRadius={94}
                    paddingAngle={2}
                  >
                    {stageData
                      .filter(item => item.value)
                      .map(item => (
                        <Cell
                          key={item.stage}
                          fill={COLORS[STAGES.indexOf(item.stage)]}
                        />
                      ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Exceções prioritárias
          </CardTitle>
          <Badge variant="outline">{alerts.length} itens</Badge>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <AnalyticsEmpty text="Nenhuma exceção encontrada nos projetos selecionados." />
          ) : (
            <div className="divide-y">
              {alerts.slice(0, 12).map((alert, index) => (
                <button
                  key={`${alert.projectId}-${index}`}
                  className="flex w-full items-center gap-3 py-3 text-left hover:bg-muted/50"
                  onClick={() =>
                    navigate(`${alert.route}?projectId=${alert.projectId}`)
                  }
                >
                  <Badge variant="outline">{alert.type}</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {alert.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {alert.projectName}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <DashboardDrilldown
        open={Boolean(detail)}
        onOpenChange={open => !open && setDetail(null)}
        title={detail?.metric.label || ""}
        formula={detail?.metric.formula || ""}
        rows={detail?.rows || []}
        onOpenRow={row =>
          row.sourceUrl &&
          navigate(
            `${row.sourceUrl}?projectId=${encodeURIComponent(row.projectId || "")}`
          )
        }
      />
    </div>
  );
}
