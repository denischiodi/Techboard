import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Bell,
  Cake,
  FileCheck2,
  FolderSearch,
  MessageSquare,
  UserMinus,
  UserRoundX,
  UserX,
  Workflow,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type {
  Allocation,
  DashboardDetailRow,
  DashboardMetric,
  ProjectFrontGap,
  ProjectMissingFrontsAlert,
  ResourceEndDateImpact,
  ResourceFront,
} from "../../../shared/types";
import { useLocation } from "wouter";
import { ProductLogo } from "@/components/ProductLogo";
import { PRODUCT_CATALOG } from "@/lib/productCatalog";
import {
  AnalyticsMetricCard,
  DashboardDrilldown,
  DashboardFilterBar,
} from "@/components/analytics/DashboardKit";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";

const COLORS = ["#1e3a5f", "#2563eb", "#059669", "#d97706", "#dc2626"];

function getUnallocatedResourceName(
  item: string | { id: string; name: string },
  resources: any[]
) {
  if (typeof item !== "string") return item.name || item.id;
  const resource = resources.find((res: any) => res.id === item);
  return resource ? resource.name : item;
}

function formatDisplayDate(date?: string) {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
}

function maxIsoDate(...dates: Array<string | undefined>) {
  return dates
    .filter(Boolean)
    .reduce(
      (max, date) => (!max || (date as string) > max ? (date as string) : max),
      ""
    );
}

function shouldExtendGapToProjectEnd(reason?: string) {
  const normalized = (reason || "").toLowerCase();
  return (
    normalized.includes("fim do projeto") ||
    normalized.includes("sai da consultoria")
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const { data: projects = [] } = trpc.projects.list.useQuery();
  const { data: allAllocations = [] } = trpc.allocations.list.useQuery();
  const { data: workflowSummary } = trpc.workflow.dashboard.useQuery(
    undefined,
    { retry: false }
  );
  const { filters, setFilters, clearFilters } = useDashboardFilters();
  const [selectedMetricId, setSelectedMetricId] = useState<string | null>(null);
  const createAllocation = trpc.allocations.create.useMutation({
    onSuccess: () => {
      utils.dashboard.stats.invalidate();
      utils.allocations.list.invalidate();
      toast.success("Alocação criada com sucesso!");
      setAllocModalOpen(false);
    },
    onError: error => toast.error(error.message || "Erro ao criar alocação"),
  });

  // Quick allocation modal state
  const [allocModalOpen, setAllocModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] =
    useState<ProjectMissingFrontsAlert | null>(null);
  const [allocForm, setAllocForm] = useState({
    resourceId: "",
    front: "" as string,
    startDate: "",
    endDate: "",
    hoursPerDay: 4,
  });

  const datesOverlap = (
    startA: string,
    endA: string,
    startB: string,
    endB: string
  ) => {
    return startA <= endB && endA >= startB;
  };

  const resourceMatchesFront = (resource: any, front: string) => {
    return (
      ((resource.fronts || []) as string[]).includes(front) ||
      resource.front === front
    );
  };

  const resourceHasProjectFrontConflict = (
    resourceId: string,
    projectId: string,
    front: string,
    startDate: string,
    endDate: string
  ) => {
    if (!resourceId || !projectId || !front || !startDate || !endDate)
      return false;
    if (
      (resources as any[]).find(resource => resource.id === resourceId)
        ?.skipAllocationCheck
    )
      return false;
    return (allAllocations as Allocation[]).some(
      allocation =>
        allocation.resourceId === resourceId &&
        allocation.projectId === projectId &&
        allocation.front === front &&
        datesOverlap(
          allocation.startDate,
          allocation.endDate,
          startDate,
          endDate
        )
    );
  };

  const findSuggestedResourceId = (
    projectId: string,
    front: string,
    startDate: string,
    endDate: string
  ) => {
    const matchingResources = (resources as any[]).filter(
      resource =>
        resource.status === "Ativo" &&
        resourceMatchesFront(resource, front) &&
        !resourceHasProjectFrontConflict(
          resource.id,
          projectId,
          front,
          startDate,
          endDate
        )
    );
    return matchingResources[0]?.id || "";
  };

  const getProjectEndForAllocation = (projectId: string) => {
    return (
      (projects as any[]).find(project => project.id === projectId)?.endDate ||
      ""
    );
  };

  const getResolvedGapEnd = (
    item: ProjectMissingFrontsAlert,
    gap: ProjectFrontGap
  ) => {
    const projectEnd = getProjectEndForAllocation(item.projectId);
    if (projectEnd && shouldExtendGapToProjectEnd(gap.reason))
      return maxIsoDate(gap.gapEnd, projectEnd);
    return gap.gapEnd;
  };

  const getGapLabel = (
    item: ProjectMissingFrontsAlert,
    gap: ProjectFrontGap
  ) => {
    return `${gap.front}: cobertura necessária de ${formatDisplayDate(gap.gapStart)} até ${formatDisplayDate(getResolvedGapEnd(item, gap))}. ${gap.reason}`;
  };

  const openAllocModal = (
    item: ProjectMissingFrontsAlert,
    gapInfo?: ProjectFrontGap | ResourceEndDateImpact
  ) => {
    setSelectedProject(item);
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const firstGap = gapInfo || item.gaps?.[0];
    const front = firstGap?.front || item.missingFronts[0] || "";
    const startDate =
      (firstGap
        ? "gapStart" in firstGap
          ? firstGap.gapStart
          : firstGap.impactStart
        : today.toISOString().split("T")[0]) ||
      today.toISOString().split("T")[0];
    const endDate = firstGap
      ? "gapEnd" in firstGap
        ? getResolvedGapEnd(item, firstGap)
        : maxIsoDate(
            firstGap.impactEnd,
            firstGap.projectEnd,
            getProjectEndForAllocation(item.projectId)
          )
      : nextWeek.toISOString().split("T")[0];
    const resolvedEndDate = endDate || startDate;
    setAllocForm({
      resourceId: findSuggestedResourceId(
        item.projectId,
        front,
        startDate,
        resolvedEndDate
      ),
      front,
      startDate,
      endDate: resolvedEndDate,
      hoursPerDay: 8,
    });
    setAllocModalOpen(true);
  };

  const handleQuickAllocate = () => {
    if (
      !selectedProject ||
      !allocForm.resourceId ||
      !allocForm.front ||
      !allocForm.startDate ||
      !allocForm.endDate
    ) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (allocForm.startDate > allocForm.endDate) {
      toast.error("Data de início não pode ser posterior à data de fim");
      return;
    }
    if (resourceConflictsWithSelectedProject(allocForm.resourceId)) {
      toast.error(
        "Este consultor já possui alocação nesta frente do projeto dentro do período selecionado"
      );
      return;
    }
    createAllocation.mutate({
      resourceId: allocForm.resourceId,
      projectId: selectedProject.projectId,
      phaseId: "",
      front: allocForm.front as ResourceFront,
      startDate: allocForm.startDate,
      endDate: allocForm.endDate,
      hoursPerDay: allocForm.hoursPerDay,
      allocationType: "Projeto",
      status: "Planejado",
      notes: `Alocação rápida via Dashboard - frente ${allocForm.front}`,
    });
  };

  const resourceConflictsWithSelectedProject = (resourceId: string) => {
    if (!selectedProject) return false;
    return resourceHasProjectFrontConflict(
      resourceId,
      selectedProject.projectId,
      allocForm.front,
      allocForm.startDate,
      allocForm.endDate
    );
  };

  const filteredAllocations = useMemo(
    () =>
      (allAllocations as Allocation[]).filter(
        allocation =>
          allocation.startDate <= filters.endDate &&
          allocation.endDate >= filters.startDate &&
          (!filters.projectIds.length ||
            filters.projectIds.includes(allocation.projectId)) &&
          (!filters.resourceIds.length ||
            filters.resourceIds.includes(allocation.resourceId))
      ),
    [allAllocations, filters]
  );
  const filteredResourceIds = useMemo(
    () => new Set(filteredAllocations.map(allocation => allocation.resourceId)),
    [filteredAllocations]
  );
  const filteredProjectIds = useMemo(
    () => new Set(filteredAllocations.map(allocation => allocation.projectId)),
    [filteredAllocations]
  );
  const selectedResources = useMemo(
    () =>
      (resources as any[]).filter(
        resource =>
          resource.status === "Ativo" &&
          (!filters.resourceIds.length ||
            filters.resourceIds.includes(resource.id))
      ),
    [resources, filters.resourceIds]
  );
  const selectedProjects = useMemo(
    () =>
      (projects as any[]).filter(
        project =>
          project.startDate <= filters.endDate &&
          project.endDate >= filters.startDate &&
          (!filters.projectIds.length
            ? !filters.resourceIds.length || filteredProjectIds.has(project.id)
            : filters.projectIds.includes(project.id))
      ),
    [
      projects,
      filters.endDate,
      filters.projectIds,
      filters.resourceIds,
      filters.startDate,
      filteredProjectIds,
    ]
  );
  const dailyResourceHours = useMemo(() => {
    const loads: Record<string, Record<string, number>> = {};
    filteredAllocations.forEach(allocation => {
      const start = new Date(
        `${allocation.startDate > filters.startDate ? allocation.startDate : filters.startDate}T12:00:00`
      );
      const end = new Date(
        `${allocation.endDate < filters.endDate ? allocation.endDate : filters.endDate}T12:00:00`
      );
      for (
        const day = new Date(start);
        day <= end;
        day.setDate(day.getDate() + 1)
      ) {
        if (day.getDay() === 0 || day.getDay() === 6) continue;
        const date = day.toISOString().slice(0, 10);
        loads[allocation.resourceId] ||= {};
        loads[allocation.resourceId][date] =
          (loads[allocation.resourceId][date] || 0) + allocation.hoursPerDay;
      }
    });
    return loads;
  }, [filteredAllocations, filters.endDate, filters.startDate]);
  const dailyTotals = Object.values(dailyResourceHours).flatMap(Object.values);
  const allocatedHours = dailyTotals.length
    ? dailyTotals.reduce((total, value) => total + value, 0) /
      new Set(
        Object.values(dailyResourceHours).flatMap(loads => Object.keys(loads))
      ).size
    : 0;
  const resourceHours = Object.fromEntries(
    Object.entries(dailyResourceHours).map(([resourceId, loads]) => [
      resourceId,
      Math.max(0, ...Object.values(loads)),
    ])
  );
  const overallocatedIds = new Set(
    selectedResources
      .filter(
        resource =>
          (resourceHours[resource.id] || 0) > (resource.dailyCapacity || 8)
      )
      .map(resource => resource.id)
  );
  const availableResources = selectedResources.filter(
    resource => !filteredResourceIds.has(resource.id)
  );
  const analyticsMetrics: DashboardMetric[] = [
    {
      id: "active-resources",
      label: "Recursos ativos",
      value: selectedResources.length,
      tone: "neutral",
      formula: "Recursos ativos no escopo dos filtros selecionados.",
    },
    {
      id: "active-projects",
      label: "Projetos no período",
      value: selectedProjects.length,
      tone: "neutral",
      formula:
        "Projetos com alocação no período ou explicitamente selecionados.",
    },
    {
      id: "allocated-hours",
      label: "Carga diária média",
      value: Math.round(allocatedHours),
      unit: "h/dia",
      tone: "positive",
      formula: "Média de horas alocadas por dia útil no período.",
    },
    {
      id: "overallocated",
      label: "Sobrealocados",
      value: overallocatedIds.size,
      tone: overallocatedIds.size ? "critical" : "positive",
      formula:
        "Recursos que superam sua capacidade em pelo menos um dia útil do período.",
    },
    {
      id: "available",
      label: "Sem alocação",
      value: availableResources.length,
      tone: availableResources.length ? "warning" : "positive",
      formula: "Recursos ativos sem alocação que cruze o período selecionado.",
    },
  ];
  const detailRowsByMetric: Record<string, DashboardDetailRow[]> = {
    "active-resources": selectedResources.map(resource => ({
      id: resource.id,
      title: resource.name,
      subtitle: resource.profile,
      status: resource.status,
      resourceId: resource.id,
      sourceUrl: "/techboard/resources",
    })),
    "active-projects": selectedProjects.map(project => ({
      id: project.id,
      title: project.name,
      subtitle: project.client || project.description,
      status: project.status,
      projectId: project.id,
      sourceUrl: "/techboard/projects",
    })),
    "allocated-hours": filteredAllocations.map(allocation => {
      const resource = (resources as any[]).find(
        item => item.id === allocation.resourceId
      );
      const project = (projects as any[]).find(
        item => item.id === allocation.projectId
      );
      return {
        id: allocation.id,
        title: `${resource?.name || "Recurso"} · ${allocation.hoursPerDay}h/dia`,
        subtitle: `${project?.name || "Projeto"} · ${allocation.front}`,
        status: allocation.status,
        projectId: allocation.projectId,
        resourceId: allocation.resourceId,
        sourceUrl: "/techboard/planner",
      };
    }),
    overallocated: selectedResources
      .filter(resource => overallocatedIds.has(resource.id))
      .map(resource => ({
        id: resource.id,
        title: resource.name,
        subtitle: `Pico de ${resourceHours[resource.id]}h/dia para capacidade de ${resource.dailyCapacity || 8}h/dia`,
        status: "Sobrealocado",
        resourceId: resource.id,
        sourceUrl: "/techboard/resources",
      })),
    available: availableResources.map(resource => ({
      id: resource.id,
      title: resource.name,
      subtitle: resource.profile,
      status: "Sem alocação",
      resourceId: resource.id,
      sourceUrl: "/techboard/resources",
    })),
  };
  const selectedMetric = analyticsMetrics.find(
    metric => metric.id === selectedMetricId
  );

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const phaseData = Object.entries(stats.projectsByPhase).map(
    ([name, value]) => ({ name, value: value as number })
  );

  const capacityData = [
    {
      name: "Sobrealocados",
      value: stats.overallocatedResources,
      color: "#dc2626",
    },
    { name: "Disponíveis", value: stats.availableResources, color: "#059669" },
    { name: "Em férias", value: stats.onLeaveResources, color: "#2563eb" },
    {
      name: "Alocados",
      value:
        stats.activeResources -
        stats.overallocatedResources -
        stats.availableResources -
        stats.onLeaveResources,
      color: "#d97706",
    },
  ].filter(d => d.value > 0);

  // Get resource names for unallocated
  const unallocatedResourceNames = (stats.unallocatedResources || []).map(
    item => getUnallocatedResourceName(item, resources as any[])
  );
  const activeResources = resources.filter((r: any) => r.status === "Ativo");
  const resourcesMatchingFront = activeResources.filter((r: any) =>
    resourceMatchesFront(r, allocForm.front)
  );
  const availableQuickResources = resourcesMatchingFront.filter(
    (r: any) => !resourceConflictsWithSelectedProject(r.id)
  );
  const unavailableQuickResources = resourcesMatchingFront.filter((r: any) =>
    resourceConflictsWithSelectedProject(r.id)
  );
  const selectedResourceHasProjectConflict =
    resourceConflictsWithSelectedProject(allocForm.resourceId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <ProductLogo
          product={PRODUCT_CATALOG.techboard}
          className="h-14 w-44"
        />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visão geral de capacidade e alocação
          </p>
        </div>
      </div>

      <DashboardFilterBar
        filters={filters}
        onChange={setFilters}
        onClear={clearFilters}
        projects={projects}
        resources={resources}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {analyticsMetrics.map(metric => (
          <AnalyticsMetricCard
            key={metric.id}
            metric={metric}
            onClick={() => setSelectedMetricId(metric.id)}
          />
        ))}
      </div>

      <DashboardDrilldown
        open={Boolean(selectedMetric)}
        onOpenChange={open => !open && setSelectedMetricId(null)}
        title={selectedMetric?.label || "Detalhamento"}
        formula={selectedMetric?.formula || ""}
        rows={
          selectedMetricId ? detailRowsByMetric[selectedMetricId] || [] : []
        }
        onOpenRow={row =>
          row.sourceUrl &&
          setLocation(
            `${row.sourceUrl}?${row.projectId ? `projectId=${encodeURIComponent(row.projectId)}&` : ""}${row.resourceId ? `resourceId=${encodeURIComponent(row.resourceId)}` : ""}`
          )
        }
      />

      {workflowSummary && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">TechMove de projetos</h2>
              <p className="text-sm text-muted-foreground">
                Pendências de levantamento, documentação e gaps
              </p>
            </div>
            <Button variant="outline" onClick={() => setLocation("/techmove")}>
              <Workflow className="mr-2 h-4 w-4" />
              Abrir TechMove
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card
              className="cursor-pointer border-l-4 border-l-violet-600"
              onClick={() => setLocation("/techmove")}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    TechMoves em andamento
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {workflowSummary.workflowsInProgress}
                  </p>
                </div>
                <Workflow className="h-8 w-8 text-violet-600" />
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Perguntas BDCQ pendentes
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {workflowSummary.pendingQuestions}
                  </p>
                </div>
                <MessageSquare className="h-8 w-8 text-amber-500" />
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-600">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    DCDs para aprovar
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {workflowSummary.dcdsForApproval}
                  </p>
                </div>
                <FileCheck2 className="h-8 w-8 text-blue-600" />
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-600">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Gaps sem responsável
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {workflowSummary.unassignedGaps}
                  </p>
                </div>
                <UserRoundX className="h-8 w-8 text-red-600" />
              </CardContent>
            </Card>
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Workflows por etapa atual
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(workflowSummary.stageCounts).map(
                  ([stage, count]) => (
                    <div
                      key={stage}
                      className="rounded-md border bg-muted/30 p-3"
                    >
                      <p className="text-xs text-muted-foreground">{stage}</p>
                      <p className="text-xl font-semibold">{count as number}</p>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
            <Card
              className={
                workflowSummary.alerts.length ? "border-amber-300" : ""
              }
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Bell className="h-4 w-4 text-amber-600" />
                  Pendências do Workflow ({workflowSummary.alerts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-72 overflow-y-auto">
                {workflowSummary.alerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma pendência crítica encontrada.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {workflowSummary.alerts.map((alert, index) => (
                      <button
                        key={`${alert.projectId}-${alert.type}-${index}`}
                        className="block w-full rounded-md border p-2 text-left hover:bg-muted"
                        onClick={() =>
                          setLocation(
                            `${alert.route}?projectId=${encodeURIComponent(alert.projectId)}`
                          )
                        }
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline">{alert.type}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {alert.projectName}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm">
                          {alert.label}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Alerts Section */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* Unallocated Resources */}
        <Card
          className={`flex h-[320px] flex-col overflow-hidden ${unallocatedResourceNames.length > 0 ? "border-amber-300 bg-amber-50/50" : ""}`}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <UserX className="h-4 w-4 text-amber-600" />
              Recursos sem Alocação
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto pr-3">
            {unallocatedResourceNames.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todos os recursos estão alocados esta semana.
              </p>
            ) : (
              <div className="space-y-1.5">
                {unallocatedResourceNames.map((name, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-sm">{name}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Projects Missing Fronts - Clickable */}
        <Card
          className={`flex h-[320px] flex-col overflow-hidden ${(stats.projectsMissingFronts || []).length > 0 ? "border-red-300 bg-red-50/50" : ""}`}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FolderSearch className="h-4 w-4 text-red-600" />
              Projetos Faltando Recurso
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto pr-3">
            {(stats.projectsMissingFronts || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todos os projetos têm recursos alocados para suas frentes.
              </p>
            ) : (
              <div className="space-y-2">
                {(stats.projectsMissingFronts || []).map(
                  (item: any, i: number) => (
                    <div
                      key={i}
                      className="space-y-1 p-2 rounded-md hover:bg-red-100/80 cursor-pointer transition-colors border border-transparent hover:border-red-200"
                      onClick={() => openAllocModal(item)}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">
                          {item.projectName}
                        </p>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 text-red-600 border-red-300"
                        >
                          Alocar
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {item.missingFronts.map((f: string) => (
                          <Badge
                            key={f}
                            variant="destructive"
                            className="text-xs"
                          >
                            {f}
                          </Badge>
                        ))}
                      </div>
                      {item.gaps && item.gaps.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {item.gaps.map((gap: ProjectFrontGap, gi: number) => (
                            <button
                              key={`${gap.front}-${gap.gapStart}-${gi}`}
                              type="button"
                              className="w-full text-left text-[11px] text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1 hover:bg-orange-100 hover:border-orange-300 transition-colors flex items-center justify-between gap-2"
                              onClick={e => {
                                e.stopPropagation();
                                openAllocModal(item, gap);
                              }}
                              title={`Alocar ${gap.front} de ${gap.gapStart} até ${gap.gapEnd}`}
                            >
                              <span>{getGapLabel(item, gap)}</span>
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 text-orange-700 border-orange-300 shrink-0"
                              >
                                Alocar
                              </Badge>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resource End Date Alerts */}
        <Card
          className={`flex h-[320px] flex-col overflow-hidden ${(stats.resourceEndDateAlerts || []).length > 0 ? "border-orange-300 bg-orange-50/50" : ""}`}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <UserMinus className="h-4 w-4 text-orange-600" />
              Saída de Consultores
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto pr-3">
            {(stats.resourceEndDateAlerts || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma saída impactando alocações ou projetos.
              </p>
            ) : (
              <div className="space-y-2">
                {(stats.resourceEndDateAlerts || []).map(
                  (alert: any, i: number) => (
                    <div
                      key={i}
                      className="p-2 bg-white border border-orange-200 rounded-md"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-sm font-medium text-orange-800">
                          {alert.resourceName}
                        </p>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 text-orange-700 border-orange-300"
                        >
                          Sai em {alert.endDate}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        {alert.affectedProjects.map(
                          (impact: ResourceEndDateImpact, pi: number) => (
                            <button
                              key={`${impact.projectId}-${impact.front}-${pi}`}
                              type="button"
                              className="w-full text-left text-[11px] text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1 hover:bg-orange-100 hover:border-orange-300 transition-colors flex items-center justify-between gap-2"
                              onClick={() =>
                                openAllocModal(
                                  {
                                    projectId: impact.projectId,
                                    projectName: impact.projectName,
                                    missingFronts: [impact.front],
                                    gaps: [
                                      {
                                        front: impact.front,
                                        gapStart: impact.impactStart,
                                        gapEnd: impact.impactEnd,
                                        reason: impact.reason,
                                      },
                                    ],
                                  },
                                  impact
                                )
                              }
                              title={`Alocar ${impact.front} de ${impact.impactStart} até ${impact.impactEnd}`}
                            >
                              <span>
                                <span className="font-medium">
                                  {impact.projectName}
                                </span>{" "}
                                ({impact.front}) {impact.impactStart} a{" "}
                                {impact.impactEnd}: {impact.reason}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 text-orange-700 border-orange-300 shrink-0"
                              >
                                Alocar
                              </Badge>
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Birthdays */}
        <Card
          className={`flex h-[320px] flex-col overflow-hidden ${(stats.upcomingBirthdays || []).length > 0 ? "border-purple-300 bg-purple-50/50" : ""}`}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Cake className="h-4 w-4 text-purple-600" />
              Aniversários Próximos (30 dias)
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto pr-3">
            {(stats.upcomingBirthdays || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum aniversário nos próximos 30 dias.
              </p>
            ) : (
              <div className="space-y-1.5">
                {(stats.upcomingBirthdays || []).map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cake className="h-3.5 w-3.5 text-purple-500" />
                      <span className="text-sm">{item.resourceName}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {item.daysUntil === 0
                        ? "Hoje!"
                        : item.daysUntil === 1
                          ? "Amanhã"
                          : `em ${item.daysUntil} dias`}{" "}
                      ({item.date})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Projetos por Fase
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={phaseData}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="value"
                    fill="#1e3a5f"
                    radius={[4, 4, 0, 0]}
                    name="Projetos"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              Distribuição de Capacidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={capacityData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {capacityData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Allocation Modal */}
      <Dialog open={allocModalOpen} onOpenChange={setAllocModalOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderSearch className="h-5 w-5 text-red-600" />
              Alocação Rápida — {selectedProject?.projectName}
            </DialogTitle>
          </DialogHeader>

          {selectedProject && (
            <div className="space-y-4 py-2">
              {/* Missing fronts info */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm font-medium text-red-800 mb-2">
                  Frentes sem recurso alocado:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedProject.missingFronts.map(f => (
                    <Badge
                      key={f}
                      variant={
                        allocForm.front === f ? "default" : "destructive"
                      }
                      className={`text-xs cursor-pointer transition-all ${allocForm.front === f ? "ring-2 ring-offset-1 ring-primary" : "hover:opacity-80"}`}
                      onClick={() => {
                        const gap = selectedProject.gaps.find(
                          g => g.front === f
                        );
                        const startDate = gap?.gapStart || allocForm.startDate;
                        const endDate =
                          (gap
                            ? getResolvedGapEnd(selectedProject, gap)
                            : allocForm.endDate) || startDate;
                        setAllocForm(prev => ({
                          ...prev,
                          front: f,
                          resourceId: findSuggestedResourceId(
                            selectedProject.projectId,
                            f,
                            startDate,
                            endDate
                          ),
                          startDate,
                          endDate,
                        }));
                      }}
                    >
                      {f}
                    </Badge>
                  ))}
                </div>
                {selectedProject.gaps.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {selectedProject.gaps
                      .filter(gap => gap.front === allocForm.front)
                      .map((gap, index) => (
                        <p
                          key={`${gap.front}-${gap.gapStart}-${index}`}
                          className="text-xs text-red-700"
                        >
                          {getGapLabel(selectedProject, gap)}
                        </p>
                      ))}
                  </div>
                )}
              </div>

              {/* Resource selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Recurso *</Label>
                <Select
                  value={allocForm.resourceId}
                  onValueChange={v =>
                    setAllocForm(prev => ({ ...prev, resourceId: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um recurso..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableQuickResources.length > 0 &&
                      availableQuickResources.map((r: any) => (
                        <SelectItem key={r.id} value={r.id}>
                          <span className="flex items-center gap-2">
                            {r.name}
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1"
                            >
                              {((r.fronts || []) as string[]).join(", ") ||
                                r.front}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1"
                            >
                              {r.profile}
                            </Badge>
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {resourcesMatchingFront.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Nenhum consultor ativo cadastrado para a frente{" "}
                    {allocForm.front}.
                  </p>
                )}
                {resourcesMatchingFront.length > 0 &&
                  availableQuickResources.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      Todos os consultores da frente {allocForm.front} já
                      possuem alocação nesta frente do projeto dentro do período
                      selecionado.
                    </p>
                  )}
                {unavailableQuickResources.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {unavailableQuickResources.length} recurso(s) oculto(s) por
                    já terem alocação nesta frente do projeto no período.
                  </p>
                )}
              </div>

              {/* Date range */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Data Início *</Label>
                  <Input
                    type="date"
                    value={allocForm.startDate}
                    onChange={e =>
                      setAllocForm(prev => ({
                        ...prev,
                        startDate: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Data Fim *</Label>
                  <Input
                    type="date"
                    value={allocForm.endDate}
                    onChange={e =>
                      setAllocForm(prev => ({
                        ...prev,
                        endDate: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Hours per day */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Horas por Dia</Label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={allocForm.hoursPerDay}
                  onChange={e =>
                    setAllocForm(prev => ({
                      ...prev,
                      hoursPerDay: Number(e.target.value),
                    }))
                  }
                />
              </div>

              {/* Selected resource info */}
              {allocForm.resourceId &&
                (() => {
                  const res = resources.find(
                    (r: any) => r.id === allocForm.resourceId
                  ) as any;
                  if (!res) return null;
                  return (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-blue-800">
                        Recurso selecionado:
                      </p>
                      <p className="text-sm text-blue-700 mt-1">
                        {res.name} — {res.profile} (
                        {((res.fronts || []) as string[]).join(", ") ||
                          res.front}
                        ) — Capacidade: {res.dailyCapacity}h/dia
                      </p>
                      {allocForm.hoursPerDay > res.dailyCapacity && (
                        <p className="text-xs text-red-600 mt-1 font-medium flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Atenção: horas alocadas excedem a capacidade diária do
                          recurso!
                        </p>
                      )}
                      {selectedResourceHasProjectConflict && (
                        <p className="text-xs text-red-600 mt-1 font-medium flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Este consultor já está alocado nesta frente do projeto
                          dentro do período selecionado.
                        </p>
                      )}
                    </div>
                  );
                })()}
            </div>
          )}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={() => setAllocModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={handleQuickAllocate}
              disabled={
                createAllocation.isPending ||
                !allocForm.resourceId ||
                !allocForm.front ||
                selectedResourceHasProjectConflict
              }
            >
              {createAllocation.isPending ? "Criando..." : "Criar Alocação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
