import { useMemo, useState } from "react";
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
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, KanbanSquare } from "lucide-react";
import { useLocation } from "wouter";
import { ProductLogo } from "@/components/ProductLogo";
import { PRODUCT_CATALOG } from "@/lib/productCatalog";
import {
  AnalyticsEmpty,
  AnalyticsLoading,
  AnalyticsMetricCard,
  DashboardDrilldown,
  DashboardFilterBar,
} from "@/components/analytics/DashboardKit";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";
import type {
  Activity,
  DashboardDetailRow,
  DashboardMetric,
} from "../../../shared/types";

const STATUS_COLORS: Record<string, string> = {
  "A fazer": "#64748b",
  "Em andamento": "#2563eb",
  Bloqueada: "#dc2626",
  "Em validação": "#d97706",
  Concluída: "#059669",
};

export default function TechTaskDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { filters, setFilters, clearFilters } = useDashboardFilters();
  const [view, setView] = useState<"mine" | "team" | "portfolio">("mine");
  const [detail, setDetail] = useState<{
    metric: DashboardMetric;
    rows: DashboardDetailRow[];
  } | null>(null);
  const { data: appUser } = trpc.access.getByEmail.useQuery(
    { email: user?.email || "" },
    { enabled: Boolean(user?.email) }
  );
  const { data: activities = [], isLoading } = trpc.activities.list.useQuery();
  const { data: projects = [] } = trpc.projects.list.useQuery();
  const { data: allocations = [] } = trpc.allocations.list.useQuery();
  const today = new Date().toISOString().slice(0, 10);
  const mine = useMemo(
    () =>
      activities.filter(
        item =>
          appUser &&
          (item.creatorUserId === appUser.id ||
            item.assigneeUserId === appUser.id ||
            item.participantUserIds.includes(appUser.id))
      ),
    [activities, appUser]
  );
  const scoped = useMemo(() => {
    const teamProjects = new Set(
      allocations
        .filter(
          item =>
            !appUser?.teamFronts?.length ||
            appUser.teamFronts.includes(item.front)
        )
        .map(item => item.projectId)
    );
    const base =
      view === "mine"
        ? mine
        : view === "team"
          ? activities.filter(
              item =>
                item.scope === "project" && teamProjects.has(item.projectId)
            )
          : activities;
    return base.filter(
      item =>
        (!filters.projectIds.length ||
          filters.projectIds.includes(item.projectId)) &&
        (!filters.responsibleIds.length ||
          filters.responsibleIds.includes(item.assigneeUserId)) &&
        (!filters.statuses.length || filters.statuses.includes(item.status)) &&
        (!item.dueDate ||
          (item.dueDate >= filters.startDate &&
            item.dueDate <= filters.endDate))
    );
  }, [activities, allocations, appUser?.teamFronts, filters, mine, view]);
  const overdue = scoped.filter(
    item => item.dueDate && item.dueDate < today && item.status !== "Concluída"
  );
  const dueSoonLimit = new Date(Date.now() + 7 * 86400000)
    .toISOString()
    .slice(0, 10);
  const metrics: DashboardMetric[] = [
    {
      id: "tasks.open",
      label: "Em aberto",
      value: scoped.filter(item => item.status !== "Concluída").length,
      tone: "neutral",
      formula: "Atividades visíveis ainda não concluídas.",
    },
    {
      id: "tasks.progress",
      label: "Em andamento",
      value: scoped.filter(item => item.status === "Em andamento").length,
      tone: "neutral",
      formula: "Atividades com status Em andamento.",
    },
    {
      id: "tasks.overdue",
      label: "Atrasadas",
      value: overdue.length,
      tone: overdue.length ? "critical" : "positive",
      formula: "Prazo anterior a hoje e status diferente de Concluída.",
    },
    {
      id: "tasks.blocked",
      label: "Bloqueadas",
      value: scoped.filter(item => item.status === "Bloqueada").length,
      tone: scoped.some(item => item.status === "Bloqueada")
        ? "warning"
        : "positive",
      formula: "Atividades atualmente com status Bloqueada.",
    },
  ];
  const statusData = Object.keys(STATUS_COLORS).map(status => ({
    status,
    value: scoped.filter(item => item.status === status).length,
  }));
  const projectData = projects
    .map(project => ({
      name: project.name,
      value: scoped.filter(item => item.projectId === project.id).length,
    }))
    .filter(item => item.value)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const rows = (items: Activity[]): DashboardDetailRow[] =>
    items.map(item => ({
      id: item.id,
      title: item.displayTitle || item.title,
      subtitle: `${item.projectName || "Interna"} · ${item.assigneeName || "Sem responsável"}`,
      status: item.status,
      projectId: item.projectId,
      dueDate: item.dueDate,
      sourceUrl: `/techtask/board?activityId=${encodeURIComponent(item.id)}`,
    }));
  const openMetric = (metric: DashboardMetric) => {
    const items =
      metric.id === "tasks.progress"
        ? scoped.filter(item => item.status === "Em andamento")
        : metric.id === "tasks.overdue"
          ? overdue
          : metric.id === "tasks.blocked"
            ? scoped.filter(item => item.status === "Bloqueada")
            : scoped.filter(item => item.status !== "Concluída");
    setDetail({ metric, rows: rows(items) });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <ProductLogo
            product={PRODUCT_CATALOG.techtask}
            className="mb-3 h-12 w-44"
          />
          <h1 className="text-3xl font-bold">Controle da execução</h1>
          <p className="mt-1 text-muted-foreground">
            Prioridades, fluxo, prazos e gargalos das atividades.
          </p>
        </div>
        <Button onClick={() => navigate("/techtask/board")}>
          <KanbanSquare className="mr-2 h-4 w-4" />
          Abrir Kanban
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(["mine", "team", "portfolio"] as const).map(option => (
          <Button
            key={option}
            variant={view === option ? "default" : "outline"}
            size="sm"
            onClick={() => setView(option)}
          >
            {option === "mine"
              ? "Meu trabalho"
              : option === "team"
                ? "Meu time"
                : "Portfólio"}
          </Button>
        ))}
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
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fluxo por status</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {scoped.length === 0 ? (
              <AnalyticsEmpty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData.filter(item => item.value)}
                    dataKey="value"
                    nameKey="status"
                    innerRadius={58}
                    outerRadius={95}
                    paddingAngle={2}
                    onClick={data => {
                      const status = String(
                        (data as { status?: string }).status || ""
                      );
                      const items = scoped.filter(
                        item => item.status === status
                      );
                      setDetail({
                        metric: {
                          id: `tasks.status.${status}`,
                          label: status,
                          value: items.length,
                          formula: `Atividades com status ${status}.`,
                        },
                        rows: rows(items),
                      });
                    }}
                  >
                    {statusData
                      .filter(item => item.value)
                      .map(item => (
                        <Cell
                          key={item.status}
                          className="cursor-pointer"
                          fill={STATUS_COLORS[item.status]}
                        />
                      ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Atividades por projeto</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {projectData.length === 0 ? (
              <AnalyticsEmpty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={projectData}
                  layout="vertical"
                  margin={{ left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="value"
                    name="Atividades"
                    fill="#f97316"
                    radius={[0, 6, 6, 0]}
                    onClick={data => {
                      const name = String(
                        (data as { name?: string }).name || ""
                      );
                      const items = scoped.filter(
                        item => item.projectName === name
                      );
                      setDetail({
                        metric: {
                          id: `tasks.project.${name}`,
                          label: name,
                          value: items.length,
                          formula: `Atividades vinculadas ao projeto ${name}.`,
                        },
                        rows: rows(items),
                      });
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Fila prioritária
          </CardTitle>
        </CardHeader>
        <CardContent>
          {overdue.length === 0 &&
          !scoped.some(
            item =>
              item.status === "Bloqueada" ||
              (item.dueDate && item.dueDate <= dueSoonLimit)
          ) ? (
            <AnalyticsEmpty text="Nenhuma atividade crítica para os filtros selecionados." />
          ) : (
            <div className="space-y-2">
              {[...scoped]
                .filter(
                  item =>
                    item.status === "Bloqueada" ||
                    (item.dueDate &&
                      item.dueDate <= dueSoonLimit &&
                      item.status !== "Concluída")
                )
                .sort((a, b) =>
                  (a.dueDate || "9999").localeCompare(b.dueDate || "9999")
                )
                .slice(0, 10)
                .map(item => (
                  <button
                    key={item.id}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left hover:bg-muted"
                    onClick={() =>
                      navigate(
                        `/techtask/board?activityId=${encodeURIComponent(item.id)}`
                      )
                    }
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {item.displayTitle || item.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.projectName || "Atividade interna"} ·{" "}
                        {item.assigneeName || "Sem responsável"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      {item.status === "Bloqueada" ? "Bloqueada" : item.dueDate}
                    </span>
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
        onOpenRow={row => row.sourceUrl && navigate(row.sourceUrl)}
      />
    </div>
  );
}
