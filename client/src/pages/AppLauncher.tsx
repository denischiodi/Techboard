import { useAuth } from "@/_core/hooks/useAuth";
import { ProductLogo } from "@/components/ProductLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AnalyticsMetricCard,
  DashboardDrilldown,
  DashboardFilterBar,
} from "@/components/analytics/DashboardKit";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";
import { useProjectContext } from "@/hooks/useProjectContext";
import {
  canAccessProduct,
  firstAccessiblePath,
  PRODUCTS,
} from "@/lib/productCatalog";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FolderKanban,
  ListChecks,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  DEFAULT_PERMISSIONS,
  type Activity,
  type DashboardDetailRow,
  type DashboardMetric,
} from "../../../shared/types";

function formatGreeting(name?: string) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  return `${greeting}${name ? `, ${name.split(" ")[0]}` : ""}`;
}

export default function AppLauncher() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { projectId, rememberProject, withProject } = useProjectContext();
  const { filters, setFilters, clearFilters } = useDashboardFilters();
  const [globalSearch, setGlobalSearch] = useState("");
  const [drilldown, setDrilldown] = useState<{
    metric: DashboardMetric;
    rows: DashboardDetailRow[];
  } | null>(null);
  const { data: appUser } = trpc.access.getByEmail.useQuery(
    { email: user?.email || "" },
    { enabled: Boolean(user?.email) }
  );
  const permissions = appUser?.permissions || DEFAULT_PERMISSIONS.viewer;
  const activitiesQuery = trpc.activities.list.useQuery(undefined, {
    enabled: Boolean(permissions.activities),
    refetchOnWindowFocus: false,
  });
  const projectsQuery = trpc.projects.list.useQuery(undefined, {
    enabled: Boolean(
      permissions.projects || permissions.techmove || permissions.gpChecklist
    ),
  });
  const workflowQuery = trpc.workflow.dashboard.useQuery(undefined, {
    enabled: Boolean(permissions.techmove),
    retry: false,
  });
  const dashboardQuery = trpc.dashboard.stats.useQuery(undefined, {
    enabled: Boolean(permissions.dashboard),
    retry: false,
  });

  const scopedActivities = useMemo(() => {
    const items = activitiesQuery.data || [];
    return items.filter(item => {
      if (
        filters.projectIds.length &&
        !filters.projectIds.includes(item.projectId)
      )
        return false;
      if (
        item.dueDate &&
        (item.dueDate < filters.startDate || item.dueDate > filters.endDate)
      )
        return false;
      return true;
    });
  }, [activitiesQuery.data, filters]);
  const myActivities = useMemo(() => {
    const items = scopedActivities;
    if (!appUser) return [];
    return items
      .filter(item => item.status !== "Concluída")
      .filter(
        item =>
          item.creatorUserId === appUser.id ||
          item.assigneeUserId === appUser.id ||
          item.participantUserIds.includes(appUser.id)
      )
      .sort((a, b) => {
        const priority = { Crítica: 0, Alta: 1, Média: 2, Baixa: 3 };
        return (
          priority[a.priority] - priority[b.priority] ||
          (a.dueDate || "9999").localeCompare(b.dueDate || "9999")
        );
      });
  }, [scopedActivities, appUser]);

  const overdue = myActivities.filter(
    item => item.dueDate && item.dueDate < new Date().toISOString().slice(0, 10)
  );
  const blocked = myActivities.filter(item => item.status === "Bloqueada");
  const selectedProject = (projectsQuery.data || []).find(
    project => project.id === projectId
  );
  const workflowAlerts = workflowQuery.data?.alerts || [];
  const scopedProjects = useMemo(
    () =>
      (projectsQuery.data || []).filter(
        project =>
          (!filters.projectIds.length ||
            filters.projectIds.includes(project.id)) &&
          project.startDate <= filters.endDate &&
          project.endDate >= filters.startDate
      ),
    [projectsQuery.data, filters.endDate, filters.projectIds, filters.startDate]
  );
  const visibleWorkflowAlerts = workflowAlerts.filter(
    alert =>
      !filters.projectIds.length || filters.projectIds.includes(alert.projectId)
  );
  const portfolioMetrics: DashboardMetric[] = [
    {
      id: "portfolio-projects",
      label: "Projetos no portfólio",
      value: scopedProjects.length,
      tone: "neutral",
      formula: "Projetos visíveis no escopo selecionado.",
    },
    {
      id: "portfolio-overdue",
      label: "Atividades atrasadas",
      value: overdue.length,
      tone: overdue.length ? "critical" : "positive",
      formula: "Atividades abertas com prazo anterior à data atual.",
    },
    {
      id: "portfolio-blocked",
      label: "Bloqueios ativos",
      value: blocked.length,
      tone: blocked.length ? "warning" : "positive",
      formula: "Atividades do usuário com status Bloqueada.",
    },
    {
      id: "portfolio-alerts",
      label: "Exceções de processo",
      value: visibleWorkflowAlerts.length,
      tone: visibleWorkflowAlerts.length ? "warning" : "positive",
      formula: "Alertas de BDCQ, workshops, DCDs e gaps abertos.",
    },
  ];
  const openMetric = (metric: DashboardMetric) => {
    const projectRows = scopedProjects.map(project => ({
      id: project.id,
      title: project.name,
      subtitle: `${project.client} · ${project.manager}`,
      status: project.status,
      projectId: project.id,
      sourceUrl: "/techmove",
    }));
    const activityRows = (
      metric.id === "portfolio-blocked" ? blocked : overdue
    ).map(item => ({
      id: item.id,
      title: item.displayTitle,
      subtitle: `${item.projectName || "Operação interna"} · ${item.assigneeName || "Sem responsável"}`,
      status: item.status,
      projectId: item.projectId,
      dueDate: item.dueDate,
      sourceUrl: `/techtask/my-work?view=mine&activityId=${encodeURIComponent(item.id)}`,
    }));
    const alertRows = visibleWorkflowAlerts.map((alert, index) => ({
      id: `${alert.projectId}-${index}`,
      title: alert.label,
      subtitle: alert.projectName,
      status: alert.type,
      projectId: alert.projectId,
      sourceUrl: alert.route,
    }));
    setDrilldown({
      metric,
      rows:
        metric.id === "portfolio-projects"
          ? projectRows
          : metric.id === "portfolio-alerts"
            ? alertRows
            : activityRows,
    });
  };
  const searchResults = useMemo(() => {
    const term = globalSearch.trim().toLocaleLowerCase("pt-BR");
    if (term.length < 2) return [];
    const activityResults = (activitiesQuery.data || [])
      .filter(item =>
        [
          item.displayTitle,
          item.description,
          item.projectName,
          item.assigneeName,
          item.trackingCode,
        ].some(value =>
          String(value || "")
            .toLocaleLowerCase("pt-BR")
            .includes(term)
        )
      )
      .map(item => ({
        id: `activity-${item.id}`,
        type: "Atividade",
        title: item.displayTitle,
        detail: `${item.projectName || "Operação interna"} · ${item.status}`,
        projectId: item.projectId,
        route: `/techtask/my-work?view=mine&activityId=${encodeURIComponent(item.id)}`,
      }));
    const projectResults = (projectsQuery.data || [])
      .filter(item =>
        [item.name, item.client, item.manager, item.status].some(value =>
          String(value || "")
            .toLocaleLowerCase("pt-BR")
            .includes(term)
        )
      )
      .map(item => ({
        id: `project-${item.id}`,
        type: "Projeto",
        title: item.name,
        detail: `${item.client} · ${item.status}`,
        projectId: item.id,
        route: "/techmove",
      }));
    const alertResults = workflowAlerts
      .filter(item =>
        [item.label, item.projectName, item.type].some(value =>
          String(value || "")
            .toLocaleLowerCase("pt-BR")
            .includes(term)
        )
      )
      .map((item, index) => ({
        id: `alert-${item.projectId}-${index}`,
        type: item.type,
        title: item.label,
        detail: item.projectName,
        projectId: item.projectId,
        route: item.route,
      }));
    return [...activityResults, ...projectResults, ...alertResults].slice(
      0,
      12
    );
  }, [globalSearch, activitiesQuery.data, projectsQuery.data, workflowAlerts]);

  const openActivity = (activity: Activity) => {
    if (activity.projectId) rememberProject(activity.projectId);
    navigate(
      `/techtask/my-work?view=mine&activityId=${encodeURIComponent(activity.id)}${activity.projectId ? `&projectId=${encodeURIComponent(activity.projectId)}` : ""}`
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8">
      <section className="flex flex-col gap-4 rounded-2xl border bg-gradient-to-br from-background to-muted/50 p-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Portal Tech
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {formatGreeting(appUser?.name || user?.name)}
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Veja o que precisa da sua atenção e continue o trabalho sem perder o
            contexto.
          </p>
        </div>
        {selectedProject && (
          <Button
            variant="outline"
            onClick={() => navigate(withProject("/techmove"))}
          >
            <FolderKanban className="mr-2 h-4 w-4" />
            Continuar {selectedProject.name}
          </Button>
        )}
      </section>

      <section className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={globalSearch}
          onChange={event => setGlobalSearch(event.target.value)}
          className="h-10 bg-background pl-9"
          placeholder="Buscar projetos, atividades, responsáveis, códigos e alertas..."
          aria-label="Pesquisa global"
        />
        {globalSearch.trim().length >= 2 && (
          <Card className="absolute z-30 mt-2 w-full shadow-xl">
            <CardContent className="max-h-96 overflow-y-auto p-2">
              {searchResults.map(result => (
                <button
                  key={result.id}
                  className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-muted"
                  onClick={() => {
                    if (result.projectId) rememberProject(result.projectId);
                    setGlobalSearch("");
                    navigate(withProject(result.route, result.projectId));
                  }}
                >
                  <Badge variant="outline">{result.type}</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {result.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {result.detail}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
              {searchResults.length === 0 && (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  Nenhum resultado encontrado.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      <DashboardFilterBar
        filters={filters}
        onChange={setFilters}
        onClear={clearFilters}
        projects={projectsQuery.data || []}
        showResources={false}
      />

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Visão executiva</h2>
          <p className="text-sm text-muted-foreground">
            Portfólio, execução e exceções do mês selecionado.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {portfolioMetrics.map(metric => (
            <AnalyticsMetricCard
              key={metric.id}
              metric={metric}
              onClick={() => openMetric(metric)}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canAccessProduct(
          PRODUCTS.find(product => product.id === "techtask")!,
          permissions
        ) && (
          <>
            <MetricCard
              label="Meu trabalho"
              value={myActivities.length}
              detail="atividades abertas"
              icon={ListChecks}
              onClick={() => navigate("/techtask/my-work?view=mine")}
            />
            <MetricCard
              label="Atrasadas"
              value={overdue.length}
              detail="precisam de ação"
              icon={Clock3}
              tone={overdue.length ? "danger" : "success"}
              onClick={() =>
                navigate("/techtask/my-work?view=mine&due=overdue")
              }
            />
            <MetricCard
              label="Bloqueadas"
              value={blocked.length}
              detail="com impedimentos"
              icon={AlertTriangle}
              tone={blocked.length ? "warning" : "success"}
              onClick={() =>
                navigate("/techtask/my-work?view=mine&status=Bloqueada")
              }
            />
          </>
        )}
        {canAccessProduct(
          PRODUCTS.find(product => product.id === "techboard")!,
          permissions
        ) && (
          <MetricCard
            label="Capacidade"
            value={dashboardQuery.data?.overallocatedResources || 0}
            detail="recursos sobrealocados"
            icon={ShieldCheck}
            tone={
              dashboardQuery.data?.overallocatedResources ? "danger" : "success"
            }
            onClick={() => navigate("/techboard")}
          />
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Próximas ações
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Ordenadas por prioridade e prazo.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/techtask/my-work?view=mine")}
            >
              Ver tudo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {myActivities.slice(0, 5).map(activity => (
              <button
                key={activity.id}
                className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:bg-muted/50"
                onClick={() => openActivity(activity)}
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${activity.priority === "Crítica" ? "bg-red-500" : activity.priority === "Alta" ? "bg-orange-500" : "bg-blue-500"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {activity.displayTitle}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {activity.projectName || "Operação interna"}
                    {activity.assigneeName
                      ? ` · ${activity.assigneeName}`
                      : " · Sem responsável"}
                  </span>
                </span>
                <Badge
                  variant={
                    activity.status === "Bloqueada" ? "destructive" : "outline"
                  }
                >
                  {activity.dueDate || activity.status}
                </Badge>
              </button>
            ))}
            {!activitiesQuery.isLoading && myActivities.length === 0 && (
              <EmptyState text="Você não possui atividades pendentes." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Atenção nos projetos
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Exceções que podem comprometer o fluxo.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {visibleWorkflowAlerts.slice(0, 5).map((alert, index) => (
              <button
                key={`${alert.projectId}-${alert.type}-${index}`}
                className="block w-full rounded-xl border p-3 text-left transition hover:bg-muted/50"
                onClick={() => {
                  rememberProject(alert.projectId);
                  navigate(withProject(alert.route, alert.projectId));
                }}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {alert.projectName}
                  </span>
                  <Badge variant="outline">{alert.type}</Badge>
                </span>
                <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">
                  {alert.label}
                </span>
              </button>
            ))}
            {!workflowQuery.isLoading && visibleWorkflowAlerts.length === 0 && (
              <EmptyState text="Nenhum alerta crítico no TechMove." />
            )}
          </CardContent>
        </Card>
      </div>

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Ferramentas</h2>
          <p className="text-sm text-muted-foreground">
            Acesse cada ambiente mantendo seu projeto atual.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {PRODUCTS.map(product => {
            const allowed = canAccessProduct(product, permissions);
            return (
              <Card
                key={product.id}
                className={`group overflow-hidden transition ${allowed ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg" : "opacity-55"}`}
                onClick={() =>
                  allowed &&
                  navigate(
                    withProject(firstAccessiblePath(product, permissions))
                  )
                }
              >
                <div className={`h-1.5 bg-gradient-to-r ${product.accent}`} />
                <CardContent className="flex min-h-40 flex-col justify-between p-4">
                  <div className="flex items-start justify-between gap-4">
                    <ProductLogo product={product} />
                    {!allowed && (
                      <LockKeyhole className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold">
                      {product.name}
                      {allowed && (
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      )}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {allowed
                        ? product.description
                        : "Solicite acesso ao administrador."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
      <DashboardDrilldown
        open={Boolean(drilldown)}
        onOpenChange={open => !open && setDrilldown(null)}
        title={drilldown?.metric.label || ""}
        formula={drilldown?.metric.formula || ""}
        rows={drilldown?.rows || []}
        onOpenRow={row => {
          if (row.projectId) rememberProject(row.projectId);
          if (row.sourceUrl)
            navigate(withProject(row.sourceUrl, row.projectId));
        }}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  onClick,
  tone = "default",
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof ListChecks;
  onClick: () => void;
  tone?: "default" | "danger" | "warning" | "success";
}) {
  const colors = {
    default: "text-primary",
    danger: "text-red-600",
    warning: "text-amber-600",
    success: "text-emerald-600",
  };
  return (
    <Card
      className="cursor-pointer transition hover:shadow-md"
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-4 p-4">
        <span className="rounded-xl bg-muted p-3">
          <Icon className={`h-5 w-5 ${colors[tone]}`} />
        </span>
        <span>
          <span className="block text-2xl font-bold">{value}</span>
          <span className="text-sm font-medium">{label}</span>
          <span className="block text-xs text-muted-foreground">{detail}</span>
        </span>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      {text}
    </div>
  );
}
