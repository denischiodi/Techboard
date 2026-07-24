import { useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CalendarClock,
  Grid3X3,
  List,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useWorkflowProject } from "./useWorkflowProject";

const PHASES = ["Prepare", "Explore", "Realize", "Deploy", "Run"];
const RISK_STRATEGIES = [
  { value: "avoid", label: "Evitar" },
  { value: "mitigate", label: "Mitigar" },
  { value: "transfer", label: "Transferir" },
  { value: "accept", label: "Aceitar" },
] as const;
const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

const INITIAL_FORM = {
  kind: "risk" as "risk" | "issue",
  title: "",
  description: "",
  phase: "Prepare",
  module: "",
  scopeItemIds: [] as string[],
  category: "",
  cause: "",
  consequence: "",
  probability: 3,
  impact: 3,
  strategy: "" as "" | "avoid" | "mitigate" | "transfer" | "accept",
  responsePlan: "",
  workaround: "",
  rootCause: "",
  responsibleId: "",
  sponsorId: "",
  nextAction: "",
  dueDate: "",
  reviewDate: "",
  required: false,
  status: "open",
};

const severityLabel = (severity: number) =>
  severity >= 20
    ? "Crítico"
    : severity >= 12
      ? "Alto"
      : severity >= 6
        ? "Médio"
        : "Baixo";
const severityClass = (severity: number) =>
  severity >= 20
    ? "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
    : severity >= 12
      ? "border-orange-300 bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200"
      : severity >= 6
        ? "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
const statusLabel = (status: string) =>
  ({
    open: "Aberto",
    monitoring: "Em monitoramento",
    in_progress: "Em tratamento",
    mitigated: "Mitigado",
    resolved: "Resolvido",
    accepted: "Aceito",
    closed: "Encerrado",
  })[status] || status;

export default function RaidPage() {
  const { projectId } = useWorkflowProject();
  const [showAdd, setShowAdd] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [deletingItem, setDeletingItem] = useState<any | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [matrixFilter, setMatrixFilter] = useState<{
    probability: number;
    impact: number;
  } | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);

  const {
    data: items = [],
    refetch,
    isLoading,
  } = trpc.workflow.delivery.raid.list.useQuery({ projectId });
  const { data: scopeItems = [] } = trpc.workflow.scopeItems.list.useQuery({
    projectId,
    offset: 0,
    limit: 500,
  });
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const { data: allocations = [] } = trpc.allocations.list.useQuery();
  const { data: lookups } = trpc.settings.getLookups.useQuery();
  const createRaid = trpc.workflow.delivery.raid.create.useMutation({
    onSuccess: (created: any) => {
      void refetch();
      setShowAdd(false);
      setForm(INITIAL_FORM);
      toast.success(
        `${created.code || (created.kind === "issue" ? "Issue" : "Risco")} criado com sucesso`
      );
    },
    onError: error =>
      toast.error(error.message || "Não foi possível criar o registro"),
  });
  const updateRaid = trpc.workflow.delivery.raid.update.useMutation({
    onSuccess: (updated: any) => {
      void refetch();
      setShowAdd(false);
      setEditingItem(null);
      setForm(INITIAL_FORM);
      toast.success(
        `${updated.kind === "issue" ? "Issue" : "Risco"} atualizado com sucesso`
      );
    },
    onError: error =>
      toast.error(error.message || "Não foi possível atualizar o registro"),
  });
  const archiveRaid = trpc.workflow.delivery.raid.archive.useMutation({
    onSuccess: () => {
      void refetch();
      const kind = deletingItem?.kind === "issue" ? "Issue" : "Risco";
      setDeletingItem(null);
      setDeleteConfirmation("");
      setDeleteReason("");
      toast.success(`${kind} apagado com sucesso`);
    },
    onError: error =>
      toast.error(error.message || "Não foi possível apagar o registro"),
  });

  const projectResourceIds = useMemo(
    () =>
      new Set(
        allocations
          .filter((allocation: any) => allocation.projectId === projectId)
          .map((allocation: any) => allocation.resourceId)
      ),
    [allocations, projectId]
  );
  const allocatedResources = useMemo(
    () =>
      resources
        .filter((resource: any) => projectResourceIds.has(resource.id))
        .sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [resources, projectResourceIds]
  );
  const modules = useMemo(
    () =>
      [
        ...new Set([
          ...(lookups?.fronts || [])
            .filter((item: any) => item.active)
            .map((item: any) => item.value),
          ...scopeItems.map((item: any) => item.module).filter(Boolean),
        ]),
      ].sort(),
    [lookups, scopeItems]
  );

  const openItems = items.filter(
    (item: any) => !["closed", "resolved"].includes(item.status)
  );
  const risks = openItems.filter((item: any) => item.kind === "risk");
  const issues = openItems.filter((item: any) => item.kind === "issue");
  const critical = openItems.filter((item: any) => Number(item.severity) >= 20);
  const overdue = openItems.filter(
    (item: any) =>
      item.dueDate && item.dueDate < new Date().toISOString().slice(0, 10)
  );
  const withoutPlan = openItems.filter(
    (item: any) => !item.responsePlan?.trim()
  );
  const exposure = risks.reduce(
    (total: number, item: any) => total + Number(item.severity || 0),
    0
  );

  const filtered = items.filter((item: any) => {
    const term = search.trim().toLowerCase();
    const matchesSearch =
      !term ||
      [
        item.code,
        item.title,
        item.description,
        item.module,
        item.category,
        item.nextAction,
      ].some(value =>
        String(value || "")
          .toLowerCase()
          .includes(term)
      );
    const matchesKind = kindFilter === "all" || item.kind === kindFilter;
    const matchesPhase = phaseFilter === "all" || item.phase === phaseFilter;
    const severity = Number(item.severity || 0);
    const matchesSeverity =
      severityFilter === "all" ||
      (severityFilter === "critical" && severity >= 20) ||
      (severityFilter === "high" && severity >= 12 && severity < 20) ||
      (severityFilter === "medium" && severity >= 6 && severity < 12) ||
      (severityFilter === "low" && severity < 6);
    const matchesMatrix =
      !matrixFilter ||
      (Number(item.probability) === matrixFilter.probability &&
        Number(item.impact) === matrixFilter.impact);
    return (
      matchesSearch &&
      matchesKind &&
      matchesPhase &&
      matchesSeverity &&
      matchesMatrix
    );
  });

  const matrixCounts = useMemo(() => {
    const counts = new Map<string, number>();
    risks.forEach((item: any) => {
      const key = `${item.probability}-${item.impact}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [risks]);

  const toggleScopeItem = (id: string) =>
    setForm(current => ({
      ...current,
      scopeItemIds: current.scopeItemIds.includes(id)
        ? current.scopeItemIds.filter(scopeId => scopeId !== id)
        : [...current.scopeItemIds, id],
    }));

  const openCreate = () => {
    setEditingItem(null);
    setForm(INITIAL_FORM);
    setShowAdd(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    setForm({
      ...INITIAL_FORM,
      kind: item.kind === "issue" ? "issue" : "risk",
      title: item.title || "",
      description: item.description || "",
      phase: item.phase || "Prepare",
      module: item.module || "",
      scopeItemIds: Array.isArray(item.scopeItemIds) ? item.scopeItemIds : [],
      category: item.category || "",
      cause: item.cause || "",
      consequence: item.consequence || "",
      probability: Number(item.probability || 1),
      impact: Number(item.impact || 1),
      strategy: item.strategy || "",
      responsePlan: item.responsePlan || "",
      workaround: item.workaround || "",
      rootCause: item.rootCause || "",
      responsibleId: item.responsibleId || "",
      sponsorId: item.sponsorId || "",
      nextAction: item.nextAction || "",
      dueDate: item.dueDate || "",
      reviewDate: item.reviewDate || "",
      required: Boolean(item.required),
      status: item.status || "open",
    });
    setShowAdd(true);
  };

  const closeForm = () => {
    if (createRaid.isPending || updateRaid.isPending) return;
    setShowAdd(false);
    setEditingItem(null);
    setForm(INITIAL_FORM);
  };

  const submit = () => {
    if (!form.title.trim()) {
      toast.error("Informe o título");
      return;
    }
    const data = {
      ...form,
      module: form.module === "general" ? "" : form.module,
      attachments: editingItem?.evidences || [],
      approvalPolicy:
        form.kind === "risk" && form.strategy === "accept"
          ? { mode: "any" as const, minimumApprovals: 1 }
          : { mode: "none" as const, minimumApprovals: 1 },
    };
    if (editingItem) {
      const { kind: _kind, ...updateData } = data;
      updateRaid.mutate({
        projectId,
        id: editingItem.id,
        data: updateData,
      });
      return;
    }
    createRaid.mutate({ projectId, data });
  };

  const confirmArchive = () => {
    if (!deletingItem) return;
    archiveRaid.mutate({
      projectId,
      id: deletingItem.id,
      confirmation: deleteConfirmation,
      reason: deleteReason,
    });
  };

  return (
    <div className="space-y-5 p-3 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Issues e Riscos</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Visão executiva RAID para antecipar exposição, decisões e bloqueios
            da entrega.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Novo risco ou issue
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          {
            label: "Exposição a riscos",
            value: exposure,
            detail: `${risks.length} riscos abertos`,
            icon: Target,
            tone: "text-primary",
          },
          {
            label: "Issues abertas",
            value: issues.length,
            detail: "Problemas materializados",
            icon: AlertOctagon,
            tone: "text-orange-600",
          },
          {
            label: "Críticos",
            value: critical.length,
            detail: "Severidade 20–25",
            icon: ShieldAlert,
            tone: "text-red-600",
          },
          {
            label: "Atrasados",
            value: overdue.length,
            detail: "Prazo de resposta vencido",
            icon: CalendarClock,
            tone: "text-red-600",
          },
          {
            label: "Sem plano",
            value: withoutPlan.length,
            detail: "Exigem ação do responsável",
            icon: AlertTriangle,
            tone: "text-amber-600",
          },
          {
            label: "Em acompanhamento",
            value: openItems.length,
            detail: `${items.length} registros no total`,
            icon: List,
            tone: "text-blue-600",
          },
        ].map(metric => (
          <Card key={metric.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {metric.label}
                </p>
                <metric.icon className={`h-4 w-4 ${metric.tone}`} />
              </div>
              <p className="mt-2 text-2xl font-bold">{metric.value}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {metric.detail}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(420px,0.9fr)_minmax(0,1.35fr)]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  Matriz de riscos 5 × 5
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Probabilidade × impacto. Clique em uma célula para filtrar.
                </p>
              </div>
              {matrixFilter && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setMatrixFilter(null)}
                >
                  Limpar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-[auto_repeat(5,minmax(42px,1fr))] gap-1 text-center text-xs">
              <div className="flex items-center justify-center px-1 font-medium text-muted-foreground">
                P \ I
              </div>
              {[1, 2, 3, 4, 5].map(impact => (
                <div
                  key={impact}
                  className="py-1 font-medium text-muted-foreground"
                >
                  {impact}
                </div>
              ))}
              {[5, 4, 3, 2, 1].flatMap(probability => [
                <div
                  key={`label-${probability}`}
                  className="flex items-center justify-center font-medium text-muted-foreground"
                >
                  {probability}
                </div>,
                ...[1, 2, 3, 4, 5].map(impact => {
                  const severity = probability * impact;
                  const count =
                    matrixCounts.get(`${probability}-${impact}`) || 0;
                  const active =
                    matrixFilter?.probability === probability &&
                    matrixFilter?.impact === impact;
                  return (
                    <button
                      key={`${probability}-${impact}`}
                      type="button"
                      className={`min-h-11 rounded-md border font-semibold transition hover:scale-[1.03] hover:shadow-sm ${severityClass(severity)} ${active ? "ring-2 ring-primary ring-offset-1" : ""}`}
                      onClick={() =>
                        setMatrixFilter(active ? null : { probability, impact })
                      }
                      aria-label={`Probabilidade ${probability}, impacto ${impact}, ${count} riscos`}
                    >
                      <span className="block text-sm">{severity}</span>
                      <span className="text-[10px] font-normal">
                        {count} {count === 1 ? "risco" : "riscos"}
                      </span>
                    </button>
                  );
                }),
              ])}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <Badge className={severityClass(3)}>Baixo</Badge>
              <Badge className={severityClass(8)}>Médio</Badge>
              <Badge className={severityClass(15)}>Alto</Badge>
              <Badge className={severityClass(25)}>Crítico</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Foco do Diretor de Delivery
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 dark:bg-red-950/20">
              <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                Decisões e escalonamentos
              </p>
              <div className="mt-2 space-y-2">
                {critical.slice(0, 3).map((item: any) => (
                  <div
                    key={item.id}
                    className="rounded-md bg-background/80 p-2 text-xs"
                  >
                    <p className="font-medium">
                      {item.code} · {item.title}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {item.nextAction || "Definir próxima ação e responsável."}
                    </p>
                  </div>
                ))}
                {!critical.length && (
                  <p className="text-xs text-muted-foreground">
                    Nenhum item crítico aberto.
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-sm font-semibold">Disciplina de resposta</p>
              <div className="mt-3 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Com plano de resposta
                  </span>
                  <strong>
                    {openItems.length - withoutPlan.length}/{openItems.length}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Com responsável</span>
                  <strong>
                    {openItems.filter((item: any) => item.responsibleId).length}
                    /{openItems.length}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Revisão programada
                  </span>
                  <strong>
                    {openItems.filter((item: any) => item.reviewDate).length}/
                    {openItems.length}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Escalonados</span>
                  <strong>
                    {openItems.filter((item: any) => item.escalated).length}
                  </strong>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border bg-background p-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar código, título, módulo ou ação..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
        <select
          className={`${SELECT_CLASS} lg:w-40`}
          value={kindFilter}
          onChange={event => setKindFilter(event.target.value)}
          aria-label="Filtrar por tipo"
        >
          <option value="all">Riscos e issues</option>
          <option value="risk">Riscos</option>
          <option value="issue">Issues</option>
        </select>
        <select
          className={`${SELECT_CLASS} lg:w-40`}
          value={phaseFilter}
          onChange={event => setPhaseFilter(event.target.value)}
          aria-label="Filtrar por fase"
        >
          <option value="all">Todas as fases</option>
          {PHASES.map(phase => (
            <option key={phase} value={phase}>
              {phase}
            </option>
          ))}
        </select>
        <select
          className={`${SELECT_CLASS} lg:w-40`}
          value={severityFilter}
          onChange={event => setSeverityFilter(event.target.value)}
          aria-label="Filtrar por severidade"
        >
          <option value="all">Toda severidade</option>
          <option value="critical">Crítico</option>
          <option value="high">Alto</option>
          <option value="medium">Médio</option>
          <option value="low">Baixo</option>
        </select>
        <div className="flex rounded-md border p-1 lg:ml-auto">
          <Button
            size="sm"
            variant={view === "cards" ? "secondary" : "ghost"}
            onClick={() => setView("cards")}
          >
            <Grid3X3 className="mr-2 h-4 w-4" />
            Cartões
          </Button>
          <Button
            size="sm"
            variant={view === "table" ? "secondary" : "ghost"}
            onClick={() => setView("table")}
          >
            <List className="mr-2 h-4 w-4" />
            Lista
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Carregando visão de Delivery...
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">Nenhum risco ou issue encontrado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Registre o primeiro item ou ajuste os filtros.
            </p>
          </CardContent>
        </Card>
      ) : view === "cards" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item: any) => {
            const responsible = resources.find(
              (resource: any) => resource.id === item.responsibleId
            );
            return (
              <Card
                key={item.id}
                className={Number(item.severity) >= 20 ? "border-red-300" : ""}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={
                          item.kind === "issue" ? "destructive" : "secondary"
                        }
                      >
                        {item.kind === "issue" ? "Issue" : "Risco"}
                      </Badge>
                      <Badge className={severityClass(Number(item.severity))}>
                        {severityLabel(Number(item.severity))} · {item.severity}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs text-muted-foreground">
                        {item.code}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={`Editar ${item.code}`}
                        onClick={() => openEdit(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label={`Apagar ${item.code}`}
                        onClick={() => {
                          setDeletingItem(item);
                          setDeleteConfirmation("");
                          setDeleteReason("");
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <h3 className="mt-3 font-semibold leading-snug">
                    {item.title}
                  </h3>
                  {item.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                    <Badge variant="outline">{item.phase}</Badge>
                    <Badge variant="outline">{item.module || "Geral"}</Badge>
                    <Badge variant="outline">{statusLabel(item.status)}</Badge>
                  </div>
                  <div className="mt-4 space-y-2 border-t pt-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">
                        Responsável:{" "}
                      </span>
                      {responsible?.name || "Não atribuído"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        Próxima ação:{" "}
                      </span>
                      {item.nextAction || "Não definida"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Prazo: </span>
                      {item.dueDate || "Não definido"}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Fase/Módulo</TableHead>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Próxima ação</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">
                      {item.code}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          item.kind === "issue" ? "destructive" : "secondary"
                        }
                      >
                        {item.kind === "issue" ? "Issue" : "Risco"}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-56 font-medium">
                      {item.title}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">
                        {item.phase} · {item.module || "Geral"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={severityClass(Number(item.severity))}>
                        {item.severity} · {severityLabel(Number(item.severity))}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {resources.find(
                        (resource: any) => resource.id === item.responsibleId
                      )?.name || "Não atribuído"}
                    </TableCell>
                    <TableCell className="min-w-52 text-xs">
                      {item.nextAction || "Não definida"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {statusLabel(item.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label={`Editar ${item.code}`}
                          onClick={() => openEdit(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label={`Apagar ${item.code}`}
                          onClick={() => {
                            setDeletingItem(item);
                            setDeleteConfirmation("");
                            setDeleteReason("");
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={showAdd}
        onOpenChange={open => {
          if (!open) closeForm();
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-x-hidden overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItem
                ? `Editar ${editingItem.kind === "issue" ? "issue" : "risco"} ${editingItem.code}`
                : "Novo risco ou issue"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0 [&_[data-slot=select-trigger]]:w-full">
              <div>
                <Label>Tipo *</Label>
                <select
                  className={SELECT_CLASS}
                  value={form.kind}
                  disabled={Boolean(editingItem)}
                  onChange={event => {
                    const value = event.target.value as "risk" | "issue";
                    setForm(current => ({
                      ...current,
                      kind: value,
                      strategy: value === "issue" ? "" : current.strategy,
                    }));
                  }}
                >
                  <option value="risk">Risco — evento futuro</option>
                  <option value="issue">Issue — problema ocorrido</option>
                </select>
              </div>
              <div>
                <Label>Fase</Label>
                <select
                  className={SELECT_CLASS}
                  value={form.phase}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      phase: event.target.value,
                    }))
                  }
                >
                  {PHASES.map(phase => (
                    <option key={phase} value={phase}>
                      {phase}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Módulo</Label>
                <select
                  className={SELECT_CLASS}
                  value={form.module || "general"}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      module: event.target.value,
                    }))
                  }
                >
                  <option value="general">Geral</option>
                  {modules.map(module => (
                    <option key={module} value={module}>
                      {module}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Categoria</Label>
                <Input
                  value={form.category}
                  placeholder="Prazo, escopo, técnico..."
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Status</Label>
                <select
                  className={SELECT_CLASS}
                  value={form.status}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                >
                  <option value="open">Aberto</option>
                  <option value="monitoring">Em monitoramento</option>
                  <option value="in_progress">Em tratamento</option>
                  <option value="mitigated">Mitigado</option>
                  <option value="resolved">Resolvido</option>
                  <option value="accepted">Aceito</option>
                  <option value="closed">Encerrado</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Título *</Label>
              <Input
                value={form.title}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Descreva objetivamente o evento"
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Causa</Label>
                <Textarea
                  value={form.cause}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      cause: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Consequência para a entrega</Label>
                <Textarea
                  value={form.consequence}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      consequence: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0 [&_[data-slot=select-trigger]]:w-full">
              <div>
                <Label>Probabilidade (1–5)</Label>
                <select
                  className={SELECT_CLASS}
                  value={String(form.probability)}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      probability: Number(event.target.value),
                    }))
                  }
                >
                  {[1, 2, 3, 4, 5].map(value => (
                    <option key={value} value={String(value)}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Impacto (1–5)</Label>
                <select
                  className={SELECT_CLASS}
                  value={String(form.impact)}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      impact: Number(event.target.value),
                    }))
                  }
                >
                  {[1, 2, 3, 4, 5].map(value => (
                    <option key={value} value={String(value)}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Severidade calculada</Label>
                <div
                  className={`mt-1 rounded-md border px-3 py-2 text-sm font-semibold ${severityClass(form.probability * form.impact)}`}
                >
                  {form.probability * form.impact} ·{" "}
                  {severityLabel(form.probability * form.impact)}
                </div>
              </div>
              {form.kind === "risk" && (
                <div>
                  <Label>Estratégia</Label>
                  <select
                    className={SELECT_CLASS}
                    value={form.strategy || "undefined"}
                    onChange={event => {
                      const strategy = event.target.value as
                        | typeof form.strategy
                        | "undefined";
                      setForm(current => ({
                        ...current,
                        strategy: strategy === "undefined" ? "" : strategy,
                      }));
                    }}
                  >
                    <option value="undefined">Definir depois</option>
                    {RISK_STRATEGIES.map(strategy => (
                      <option key={strategy.value} value={strategy.value}>
                        {strategy.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>
                  {form.kind === "risk"
                    ? "Plano de resposta"
                    : "Plano de resolução"}
                </Label>
                <Textarea
                  value={form.responsePlan}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      responsePlan: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label>
                  {form.kind === "risk"
                    ? "Plano alternativo/contingência"
                    : "Contorno"}
                </Label>
                <Textarea
                  value={form.workaround}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      workaround: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            {form.kind === "issue" && (
              <div>
                <Label>Causa raiz</Label>
                <Textarea
                  value={form.rootCause}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      rootCause: event.target.value,
                    }))
                  }
                />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0 [&_[data-slot=select-trigger]]:w-full">
              <div>
                <Label>Responsável</Label>
                <select
                  className={SELECT_CLASS}
                  value={form.responsibleId || "unassigned"}
                  onChange={event => {
                    const responsibleId = event.target.value;
                    setForm(current => ({
                      ...current,
                      responsibleId:
                        responsibleId === "unassigned" ? "" : responsibleId,
                    }));
                  }}
                >
                  <option value="unassigned">Não atribuído</option>
                  {allocatedResources.map((resource: any) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Patrocinador</Label>
                <select
                  className={SELECT_CLASS}
                  value={form.sponsorId || "unassigned"}
                  onChange={event => {
                    const sponsorId = event.target.value;
                    setForm(current => ({
                      ...current,
                      sponsorId: sponsorId === "unassigned" ? "" : sponsorId,
                    }));
                  }}
                >
                  <option value="unassigned">Não atribuído</option>
                  {allocatedResources.map((resource: any) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Prazo</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Próxima revisão</Label>
                <Input
                  type="date"
                  value={form.reviewDate}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      reviewDate: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <Label>Próxima ação</Label>
              <Input
                value={form.nextAction}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    nextAction: event.target.value,
                  }))
                }
                placeholder="Ação concreta, responsável e resultado esperado"
              />
            </div>
            {scopeItems.length > 0 && (
              <div>
                <Label>Scope items relacionados</Label>
                <div className="mt-1 grid max-h-36 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                  {scopeItems.map((item: any) => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-start gap-2 text-sm"
                    >
                      <Checkbox
                        checked={form.scopeItemIds.includes(item.id)}
                        onCheckedChange={() => toggleScopeItem(item.id)}
                      />
                      <span>
                        {item.code ? `${item.code} · ` : ""}
                        {item.name}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({item.module || "Geral"})
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.required}
                onCheckedChange={required =>
                  setForm(current => ({
                    ...current,
                    required: Boolean(required),
                  }))
                }
              />
              Este item pode bloquear um marco da entrega
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeForm}>
              Cancelar
            </Button>
            <Button
              onClick={submit}
              disabled={
                createRaid.isPending ||
                updateRaid.isPending ||
                !form.title.trim()
              }
            >
              {editingItem
                ? updateRaid.isPending
                  ? "Salvando..."
                  : "Salvar alterações"
                : createRaid.isPending
                  ? "Criando..."
                  : "Criar registro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deletingItem)}
        onOpenChange={open => {
          if (!open && !archiveRaid.isPending) {
            setDeletingItem(null);
            setDeleteConfirmation("");
            setDeleteReason("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Apagar {deletingItem?.kind === "issue" ? "issue" : "risco"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium">
                {deletingItem?.code} · {deletingItem?.title}
              </p>
              <p className="mt-1 text-muted-foreground">
                O registro será retirado dos indicadores e preservado na
                auditoria. Sua numeração nunca será reutilizada.
              </p>
            </div>
            <div>
              <Label>Justificativa *</Label>
              <Textarea
                value={deleteReason}
                onChange={event => setDeleteReason(event.target.value)}
                placeholder="Explique por que este registro deve ser apagado"
              />
            </div>
            <div>
              <Label>
                Digite {deletingItem?.code || "o código"} para confirmar *
              </Label>
              <Input
                value={deleteConfirmation}
                onChange={event => setDeleteConfirmation(event.target.value)}
                placeholder={deletingItem?.code || ""}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingItem(null)}
              disabled={archiveRaid.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmArchive}
              disabled={
                archiveRaid.isPending ||
                deleteReason.trim().length < 5 ||
                deleteConfirmation.trim().toUpperCase() !==
                  String(deletingItem?.code || "").toUpperCase()
              }
            >
              {archiveRaid.isPending ? "Apagando..." : "Apagar registro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
