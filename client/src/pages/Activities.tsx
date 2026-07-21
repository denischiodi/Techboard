import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowDown, ArrowUp, CalendarDays, CheckCircle2, Circle, Download, ExternalLink, FileUp,
  GripVertical, ListChecks, MessageSquare, Paperclip, Plus, Search, Trash2, Upload, UserPlus, Users,
} from "lucide-react";
import type { Activity, ActivityPriority, ActivityScope, ActivityStage, ActivityStatus } from "../../../shared/types";

const STATUSES: ActivityStatus[] = ["A fazer", "Em andamento", "Bloqueada", "Em validação", "Concluída"];
const PRIORITIES: ActivityPriority[] = ["Baixa", "Média", "Alta", "Crítica"];
const STAGES: ActivityStage[] = ["DCD", "BDCQ", "TESTE", "GERAL"];

const statusStyles: Record<ActivityStatus, string> = {
  "A fazer": "border-slate-300 bg-slate-50/60",
  "Em andamento": "border-blue-300 bg-blue-50/60",
  "Bloqueada": "border-red-300 bg-red-50/60",
  "Em validação": "border-amber-300 bg-amber-50/60",
  "Concluída": "border-emerald-300 bg-emerald-50/60",
};

const priorityStyles: Record<ActivityPriority, string> = {
  Baixa: "bg-slate-100 text-slate-700", Média: "bg-blue-100 text-blue-700",
  Alta: "bg-orange-100 text-orange-800", Crítica: "bg-red-100 text-red-800",
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação";
}

function ActivityCard({ activity, onOpen }: { activity: Activity; onOpen: () => void }) {
  const draggable = useDraggable({ id: activity.id, data: { activity } });
  const completed = activity.checklist.filter(item => item.completed).length;
  const total = activity.checklist.length;
  return (
    <Card
      ref={draggable.setNodeRef}
      style={{ transform: draggable.transform ? `translate3d(${draggable.transform.x}px,${draggable.transform.y}px,0)` : undefined }}
      className={`cursor-pointer bg-background shadow-sm transition hover:shadow-md ${draggable.isDragging ? "z-50 opacity-70" : ""}`}
      onClick={onOpen}
    >
      <CardHeader className="space-y-2 p-3 pb-1">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm leading-snug">{activity.displayTitle}</CardTitle>
          <button {...draggable.listeners} {...draggable.attributes} onClick={event => event.stopPropagation()} className="cursor-grab text-muted-foreground" aria-label="Mover atividade">
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge className={priorityStyles[activity.priority]} variant="secondary">{activity.priority}</Badge>
          {activity.sourceType !== "manual" && <Badge variant="outline">{activity.sourceType.replaceAll("_", " ")}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-2">
        <p className="line-clamp-2 text-xs text-muted-foreground">{activity.description || "Sem descrição"}</p>
        {total > 0 && <div className="space-y-1"><div className="flex justify-between text-[11px] text-muted-foreground"><span className="flex items-center gap-1"><ListChecks className="h-3 w-3" />Checklist</span><span>{completed}/{total}</span></div><Progress value={(completed / total) * 100} className="h-1.5" /></div>}
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">{activity.assigneeName || "Sem responsável"}</span>
          {activity.dueDate && <span className={`flex shrink-0 items-center gap-1 ${activity.status !== "Concluída" && activity.dueDate < new Date().toISOString().slice(0, 10) ? "font-semibold text-red-600" : ""}`}><CalendarDays className="h-3 w-3" />{activity.dueDate}</span>}
        </div>
        <div className="flex gap-3 text-[11px] text-muted-foreground"><span className="flex items-center gap-1"><Users className="h-3 w-3" />{activity.participants.length}</span><span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{activity.comments.length}</span><span className="flex items-center gap-1"><Paperclip className="h-3 w-3" />{activity.attachments.length}</span></div>
      </CardContent>
    </Card>
  );
}

function KanbanColumn({ status, activities, onOpen }: { status: ActivityStatus; activities: Activity[]; onOpen: (activity: Activity) => void }) {
  const droppable = useDroppable({ id: status });
  return (
    <section ref={droppable.setNodeRef} className={`flex min-h-[420px] w-[290px] shrink-0 flex-col rounded-xl border p-2 ${statusStyles[status]} ${droppable.isOver ? "ring-2 ring-primary/40" : ""}`}>
      <header className="mb-2 flex items-center justify-between px-1 py-1"><h2 className="text-sm font-semibold">{status}</h2><Badge variant="secondary">{activities.length}</Badge></header>
      <div className="space-y-2">{activities.map(activity => <ActivityCard key={activity.id} activity={activity} onOpen={() => onOpen(activity)} />)}{activities.length === 0 && <div className="rounded-lg border border-dashed bg-background/50 p-6 text-center text-xs text-muted-foreground">Arraste uma atividade para cá</div>}</div>
    </section>
  );
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function splitIds(value: unknown) {
  return String(value || "").split(/[;,]/).map(item => item.trim()).filter(Boolean);
}

function excelDate(value: unknown, XLSX: typeof import("xlsx")) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : text;
}

function dateForExcel(value: string) {
  return value ? new Date(`${value}T12:00:00`) : "";
}

export default function Activities() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: appUser } = trpc.access.getByEmail.useQuery({ email: user?.email || "" }, { enabled: Boolean(user?.email) });
  const activitiesQuery = trpc.activities.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data: projects = [] } = trpc.projects.list.useQuery();
  const [view, setView] = useState<"mine" | "projects" | "internal">("mine");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState<"all" | "overdue" | "not_overdue" | "no_due">("all");
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("activityId"));
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ scope: "project" as ActivityScope, projectId: "", stage: "GERAL" as ActivityStage, title: "", description: "", priority: "Média" as ActivityPriority, assigneeUserId: "", dueDate: "" });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const eligibleUsers = trpc.activities.eligibleUsers.useQuery({ scope: createForm.scope, projectId: createForm.projectId }, { enabled: createOpen && (createForm.scope === "internal" || Boolean(createForm.projectId)) });
  const updateActivity = trpc.activities.update.useMutation({ onSuccess: async () => { await utils.activities.list.invalidate(); }, onError: error => toast.error(error.message) });
  const createActivity = trpc.activities.create.useMutation({ onSuccess: async data => { setCreateOpen(false); setCreateForm({ scope: "project", projectId: "", stage: "GERAL", title: "", description: "", priority: "Média", assigneeUserId: "", dueDate: "" }); await utils.activities.list.invalidate(); setSelectedId(data.id); toast.success("Atividade criada"); }, onError: error => toast.error(error.message) });
  const importExcel = trpc.activities.importExcel.useMutation({
    onSuccess: async result => {
      await utils.activities.list.invalidate();
      const summary = `${result.created} criada(s), ${result.updated} atualizada(s)`;
      if (result.errors.length) toast.warning(`${summary}. ${result.errors.length} linha(s) com erro: ${result.errors.slice(0, 3).map(error => `linha ${error.rowNumber}: ${error.message}`).join("; ")}`);
      else toast.success(`Importação concluída: ${summary}`);
    },
    onError: error => toast.error(error.message),
  });

  const activities = activitiesQuery.data || [];
  const selected = activities.find(activity => activity.id === selectedId) || null;
  const filtered = useMemo(() => activities.filter(activity => {
    if (view === "mine" && appUser && !(activity.creatorUserId === appUser.id || activity.assigneeUserId === appUser.id || activity.participantUserIds.includes(appUser.id))) return false;
    if (view === "projects" && activity.scope !== "project") return false;
    if (view === "internal" && activity.scope !== "internal") return false;
    if (projectFilter !== "all" && activity.projectId !== projectFilter) return false;
    if (priorityFilter !== "all" && activity.priority !== priorityFilter) return false;
    if (assigneeFilter === "none" && activity.assigneeUserId) return false;
    if (assigneeFilter !== "all" && assigneeFilter !== "none" && activity.assigneeUserId !== assigneeFilter) return false;
    const today = new Date().toISOString().slice(0, 10);
    const overdue = Boolean(activity.dueDate && activity.status !== "Concluída" && activity.dueDate < today);
    if (dueFilter === "overdue" && !overdue) return false;
    if (dueFilter === "not_overdue" && (!activity.dueDate || overdue)) return false;
    if (dueFilter === "no_due" && activity.dueDate) return false;
    const term = normalizeSearch(search);
    const searchable = [
      activity.title, activity.displayTitle, activity.trackingCode, activity.stage, activity.description, activity.assigneeName, activity.creatorName, activity.projectName,
      activity.status, activity.priority, activity.dueDate, activity.scope === "project" ? "projeto" : "operacao interna",
      ...activity.participants.flatMap(participant => [participant.name, participant.email]),
    ];
    return !term || searchable.some(value => normalizeSearch(value || "").includes(term));
  }), [activities, appUser, view, projectFilter, priorityFilter, assigneeFilter, dueFilter, search]);

  const assignees = useMemo(() => [...new Map(activities.filter(activity => activity.assigneeUserId).map(activity => [activity.assigneeUserId, activity.assigneeName || "Usuário sem nome"])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [activities]);

  const handleExportExcel = async () => {
    const XLSX = await import("xlsx");
    const pending = activities.filter(activity => activity.status !== "Concluída");
    const rows = pending.map(activity => ({
      ID: activity.id, Escopo: activity.scope, "Projeto ID": activity.projectId, Projeto: activity.projectName,
      Etapa: activity.stage, Número: activity.sequenceNumber, Acompanhamento: activity.trackingCode,
      Título: activity.displayTitle, "Título original": activity.title, Descrição: activity.description, Status: activity.status, Prioridade: activity.priority,
      "Responsável ID": activity.assigneeUserId, Responsável: activity.assigneeName,
      "E-mail do responsável": activity.participants.find(person => person.id === activity.assigneeUserId)?.email || "",
      "Criador ID": activity.creatorUserId, Criador: activity.creatorName, Prazo: dateForExcel(activity.dueDate),
      Origem: activity.sourceType, "Chave da origem": activity.sourceKey, "URL da origem": activity.sourceUrl,
      Resolvida: activity.sourceResolved ? "Sim" : "Não",
      "Participantes IDs": activity.participantUserIds.join("; "),
      Participantes: activity.participants.map(person => `${person.name} <${person.email}>`).join("; "),
      Checklist: activity.checklist.map(item => `${item.completed ? "[x]" : "[ ]"} ${item.description}${item.assigneeName ? ` (${item.assigneeName})` : ""}`).join(" | "),
      Comentários: activity.comments.map(item => `${item.authorName}: ${item.content}`).join(" | "),
      Anexos: activity.attachments.map(item => `${item.fileName}: ${item.url}`).join(" | "),
      Histórico: activity.history.map(item => `${item.createdAt} - ${item.actorName}: ${item.action}`).join(" | "),
      "Concluída em": activity.completedAt, "Criada em": activity.createdAt, "Atualizada em": activity.updatedAt,
    }));
    const sheet = XLSX.utils.json_to_sheet(rows, { cellDates: true });
    sheet["!autofilter"] = { ref: sheet["!ref"] || "A1:Y1" };
    const headers = Object.keys(rows[0] || { ID: "" });
    sheet["!cols"] = headers.map(header => ({ wch: Math.min(55, Math.max(12, header.length + 2, ...rows.map(row => String(row[header as keyof typeof row] || "").length + 2))) }));
    const dueDateIndex = headers.indexOf("Prazo");
    if (dueDateIndex >= 0) {
      const dueDateColumn = XLSX.utils.encode_col(dueDateIndex);
      for (let row = 2; row <= rows.length + 1; row += 1) if (sheet[`${dueDateColumn}${row}`]) sheet[`${dueDateColumn}${row}`].z = "yyyy-mm-dd";
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Pendências Kanban");
    XLSX.writeFile(workbook, `pendencias-kanban-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleImportExcel = async (file?: File) => {
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
      const localErrors: string[] = [];
      const rows = rawRows.flatMap((row, index) => {
        const rowNumber = index + 2;
        const scopeText = normalizeSearch(String(row.Escopo || ""));
        const scope: ActivityScope | "" = scopeText === "internal" || scopeText.includes("interna") ? "internal" : scopeText === "project" || scopeText === "projeto" ? "project" : "";
        const status = STATUSES.find(item => normalizeSearch(item) === normalizeSearch(String(row.Status || "A fazer")));
        const priority = PRIORITIES.find(item => normalizeSearch(item) === normalizeSearch(String(row.Prioridade || "Média")));
        const stageText = String(row.Etapa || "").trim().toUpperCase();
        const stage = stageText ? STAGES.find(item => item === stageText) : undefined;
        const title = String(row["Título original"] || row["Título"] || row.Titulo || "").trim();
        const dueDate = excelDate(row.Prazo, XLSX);
        if (!scope || !status || !priority || !title || (stageText && !stage) || (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) {
          localErrors.push(`linha ${rowNumber}: escopo, título, status, prioridade ou prazo inválido`);
          return [];
        }
        return [{
          rowNumber, id: String(row.ID || "").trim(), scope, projectId: String(row["Projeto ID"] || "").trim(), stage,
          title, description: String(row["Descrição"] || row.Descricao || ""), status, priority,
          assigneeUserId: String(row["Responsável ID"] || row["Responsavel ID"] || "").trim(),
          participantUserIds: splitIds(row["Participantes IDs"]), dueDate,
        }];
      });
      if (!rows.length) throw new Error(localErrors[0] || "A planilha não contém linhas para importar");
      if (localErrors.length) toast.warning(`${localErrors.length} linha(s) ignoradas: ${localErrors.slice(0, 3).join("; ")}`);
      importExcel.mutate({ rows });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      if (excelInputRef.current) excelInputRef.current.value = "";
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activity = activities.find(item => item.id === event.active.id);
    const status = event.over?.id as ActivityStatus | undefined;
    if (!activity || !status || !STATUSES.includes(status) || activity.status === status) return;
    updateActivity.mutate({ id: activity.id, expectedUpdatedAt: activity.updatedAt, data: { status } });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div><h1 className="text-2xl font-bold">Atividades</h1><p className="text-sm text-muted-foreground">Tarefas manuais e pendências integradas dos projetos.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void handleExportExcel()}><Download className="mr-2 h-4 w-4" />Baixar Excel</Button>
          <Button variant="outline" disabled={importExcel.isPending} onClick={() => excelInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Importar Excel</Button>
          <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={event => void handleImportExcel(event.target.files?.[0])} />
          <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Nova atividade</Button>
        </div>
      </div>
      <Card><CardContent className="flex flex-col gap-3 p-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="flex gap-1 rounded-lg bg-muted p-1">{(["mine", "projects", "internal"] as const).map(key => <Button key={key} size="sm" variant={view === key ? "default" : "ghost"} onClick={() => setView(key)}>{key === "mine" ? "Minhas" : key === "projects" ? "Projetos" : "Operação interna"}</Button>)}</div>
        <div className="relative min-w-64 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar em título, projeto, pessoas, status..." className="pl-9" /></div>
        <Select value={projectFilter} onValueChange={setProjectFilter}><SelectTrigger className="w-full lg:w-52"><SelectValue placeholder="Projeto" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os projetos</SelectItem>{[...new Map(activities.filter(item => item.projectId).map(item => [item.projectId, item.projectName])).entries()].map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select>
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}><SelectTrigger className="w-full lg:w-52"><SelectValue placeholder="Responsável" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os responsáveis</SelectItem><SelectItem value="none">Sem responsável</SelectItem>{assignees.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select>
        <Select value={dueFilter} onValueChange={value => setDueFilter(value as typeof dueFilter)}><SelectTrigger className="w-full lg:w-44"><SelectValue placeholder="Prazo" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os prazos</SelectItem><SelectItem value="overdue">Atrasadas</SelectItem><SelectItem value="not_overdue">Não atrasadas</SelectItem><SelectItem value="no_due">Sem prazo</SelectItem></SelectContent></Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}><SelectTrigger className="w-full lg:w-40"><SelectValue placeholder="Prioridade" /></SelectTrigger><SelectContent><SelectItem value="all">Prioridades</SelectItem>{PRIORITIES.map(priority => <SelectItem key={priority} value={priority}>{priority}</SelectItem>)}</SelectContent></Select>
      </CardContent></Card>
      {activitiesQuery.isLoading ? <div className="p-12 text-center text-muted-foreground">Sincronizando atividades...</div> :
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}><div className="flex gap-3 overflow-x-auto pb-4">{STATUSES.map(status => <KanbanColumn key={status} status={status} activities={filtered.filter(activity => activity.status === status)} onOpen={activity => setSelectedId(activity.id)} />)}</div></DndContext>}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Nova atividade</DialogTitle></DialogHeader><div className="space-y-4">
        <div><Label>Quadro</Label><Select value={createForm.scope} onValueChange={(scope: ActivityScope) => setCreateForm(form => ({ ...form, scope, projectId: "", stage: scope === "internal" ? "GERAL" : form.stage, assigneeUserId: "" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="project">Projeto</SelectItem><SelectItem value="internal">Operação interna</SelectItem></SelectContent></Select></div>
        {createForm.scope === "project" && <div><Label>Projeto</Label><Select value={createForm.projectId} onValueChange={projectId => setCreateForm(form => ({ ...form, projectId, assigneeUserId: "" }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{projects.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>}
        {createForm.scope === "project" && <div><Label>Etapa de origem</Label><Select value={createForm.stage} onValueChange={(stage: ActivityStage) => setCreateForm(form => ({ ...form, stage }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STAGES.map(stage => <SelectItem key={stage} value={stage}>{stage}</SelectItem>)}</SelectContent></Select></div>}
        <div><Label>Título</Label><Input value={createForm.title} onChange={event => setCreateForm(form => ({ ...form, title: event.target.value }))} /></div>
        <div><Label>Descrição</Label><Textarea value={createForm.description} onChange={event => setCreateForm(form => ({ ...form, description: event.target.value }))} /></div>
        <div className="grid gap-3 sm:grid-cols-2"><div><Label>Responsável</Label><Select value={createForm.assigneeUserId || "none"} onValueChange={value => setCreateForm(form => ({ ...form, assigneeUserId: value === "none" ? "" : value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem responsável</SelectItem>{(eligibleUsers.data || []).map(person => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Prioridade</Label><Select value={createForm.priority} onValueChange={(priority: ActivityPriority) => setCreateForm(form => ({ ...form, priority }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map(priority => <SelectItem key={priority} value={priority}>{priority}</SelectItem>)}</SelectContent></Select></div></div>
        <div><Label>Prazo</Label><Input type="date" value={createForm.dueDate} onChange={event => setCreateForm(form => ({ ...form, dueDate: event.target.value }))} /></div>
      </div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button disabled={!createForm.title.trim() || (createForm.scope === "project" && !createForm.projectId) || createActivity.isPending} onClick={() => createActivity.mutate({ ...createForm, participantUserIds: [] })}>Criar</Button></DialogFooter></DialogContent></Dialog>

      {selected && <ActivityDetails key={`${selected.id}:${selected.updatedAt}`} activity={selected} appUserId={appUser?.id || ""} isAdmin={appUser?.role === "admin"} open={Boolean(selectedId)} onOpenChange={open => !open && setSelectedId(null)} onNavigate={setLocation} />}
    </div>
  );
}

function ActivityDetails({ activity, appUserId, isAdmin, open, onOpenChange, onNavigate }: { activity: Activity; appUserId: string; isAdmin: boolean; open: boolean; onOpenChange: (open: boolean) => void; onNavigate: (path: string) => void }) {
  const utils = trpc.useUtils();
  const canEdit = isAdmin || activity.creatorUserId === appUserId || activity.assigneeUserId === appUserId || activity.participantUserIds.includes(appUserId);
  const [comment, setComment] = useState("");
  const [checkForm, setCheckForm] = useState({ description: "", assigneeUserId: "", dueDate: "", required: true });
  const [contentForm, setContentForm] = useState({ title: activity.title, description: activity.description, priority: activity.priority });
  const eligible = trpc.activities.eligibleUsers.useQuery({ scope: activity.scope, projectId: activity.projectId });
  const invalidate = async () => { await utils.activities.list.invalidate(); };
  const mutationOptions = { onSuccess: invalidate, onError: (error: { message: string }) => toast.error(error.message) };
  const update = trpc.activities.update.useMutation(mutationOptions);
  const archive = trpc.activities.archive.useMutation({ onSuccess: async () => { await invalidate(); onOpenChange(false); toast.success("Card excluído"); }, onError: (error: { message: string }) => toast.error(error.message) });
  const join = trpc.activities.join.useMutation(mutationOptions);
  const checklistCreate = trpc.activities.checklistCreate.useMutation({ ...mutationOptions, onSuccess: async () => { setCheckForm({ description: "", assigneeUserId: "", dueDate: "", required: true }); await invalidate(); } });
  const checklistUpdate = trpc.activities.checklistUpdate.useMutation(mutationOptions);
  const checklistDelete = trpc.activities.checklistDelete.useMutation(mutationOptions);
  const reorder = trpc.activities.checklistReorder.useMutation(mutationOptions);
  const addComment = trpc.activities.comment.useMutation({ ...mutationOptions, onSuccess: async () => { setComment(""); await invalidate(); } });
  const upload = trpc.activities.upload.useMutation(mutationOptions);
  const completeCount = activity.checklist.filter(item => item.completed).length;

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= activity.checklist.length) return;
    const ids = activity.checklist.map(item => item.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate({ activityId: activity.id, itemIds: ids });
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    try {
      const fileData = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = reject; reader.readAsDataURL(file); });
      upload.mutate({ activityId: activity.id, fileName: file.name, contentType: file.type || "application/octet-stream", fileData });
    } catch (error) { toast.error(errorMessage(error)); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle className="pr-8">{activity.displayTitle}</DialogTitle></DialogHeader>
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2"><Badge>{activity.projectName}</Badge><Badge className={priorityStyles[activity.priority]}>{activity.priority}</Badge>{activity.sourceType !== "manual" && <Badge variant="outline">Origem: {activity.sourceType.replaceAll("_", " ")}</Badge>}{activity.sourceResolved && <Badge className="bg-emerald-100 text-emerald-800">Origem resolvida</Badge>}{isAdmin && <Button className="ml-auto" size="sm" variant="destructive" disabled={archive.isPending} onClick={() => { if (window.confirm(`Excluir o card ${activity.trackingCode}? O número de acompanhamento não será reutilizado.`)) archive.mutate({ id: activity.id }); }}><Trash2 className="mr-2 h-4 w-4" />Excluir card</Button>}</div>
      {!canEdit && <Button variant="outline" onClick={() => join.mutate({ id: activity.id })}><UserPlus className="mr-2 h-4 w-4" />Participar para colaborar</Button>}
      <div className="grid gap-3 sm:grid-cols-3"><div><Label>Status</Label><Select disabled={!canEdit} value={activity.status} onValueChange={(status: ActivityStatus) => update.mutate({ id: activity.id, expectedUpdatedAt: activity.updatedAt, data: { status } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div><div><Label>Responsável</Label><Select disabled={!canEdit} value={activity.assigneeUserId || "none"} onValueChange={assigneeUserId => update.mutate({ id: activity.id, expectedUpdatedAt: activity.updatedAt, data: { assigneeUserId: assigneeUserId === "none" ? "" : assigneeUserId } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem responsável</SelectItem>{(eligible.data || []).map(person => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Prazo</Label><Input disabled={!canEdit} type="date" value={activity.dueDate} onChange={event => update.mutate({ id: activity.id, expectedUpdatedAt: activity.updatedAt, data: { dueDate: event.target.value } })} /></div></div>
      {activity.sourceType === "manual" && canEdit ? <section className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">Conteúdo</h3><div><Label>Título</Label><Input value={contentForm.title} onChange={event => setContentForm(form => ({ ...form, title: event.target.value }))} /></div><div><Label>Descrição</Label><Textarea value={contentForm.description} onChange={event => setContentForm(form => ({ ...form, description: event.target.value }))} /></div><div className="max-w-48"><Label>Prioridade</Label><Select value={contentForm.priority} onValueChange={(priority: ActivityPriority) => setContentForm(form => ({ ...form, priority }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map(priority => <SelectItem key={priority} value={priority}>{priority}</SelectItem>)}</SelectContent></Select></div><Button disabled={!contentForm.title.trim()} onClick={() => update.mutate({ id: activity.id, expectedUpdatedAt: activity.updatedAt, data: contentForm })}>Salvar conteúdo</Button></section> : <div><Label>Descrição</Label><p className="mt-1 whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm">{activity.description || "Sem descrição"}</p></div>}
      {activity.sourceUrl && <Button variant="outline" onClick={() => onNavigate(activity.sourceUrl)}><ExternalLink className="mr-2 h-4 w-4" />Abrir origem</Button>}

      <section className="space-y-3 rounded-xl border p-4"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 font-semibold"><ListChecks className="h-4 w-4" />Checklist</h3><span className="text-sm text-muted-foreground">{completeCount} de {activity.checklist.length}</span></div>{activity.checklist.length > 0 && <Progress value={(completeCount / activity.checklist.length) * 100} />}
        <div className="space-y-2">{activity.checklist.map((item, index) => <div key={item.id} className="flex items-start gap-2 rounded-lg border p-2"><Checkbox disabled={!canEdit} checked={item.completed} onCheckedChange={completed => checklistUpdate.mutate({ activityId: activity.id, itemId: item.id, data: { completed: Boolean(completed) } })} className="mt-1" /><div className="min-w-0 flex-1"><p className={`text-sm ${item.completed ? "text-muted-foreground line-through" : ""}`}>{item.description}{item.required && <span className="ml-1 text-red-500">*</span>}</p><p className="text-xs text-muted-foreground">{item.assigneeName || "Sem responsável"}{item.dueDate ? ` · ${item.dueDate}` : ""}</p></div>{canEdit && <div className="flex"><Button variant="ghost" size="icon" onClick={() => moveItem(index, -1)} disabled={index === 0}><ArrowUp className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" onClick={() => moveItem(index, 1)} disabled={index === activity.checklist.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" onClick={() => checklistDelete.mutate({ activityId: activity.id, itemId: item.id })}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div>}</div>)}</div>
        {canEdit && <div className="grid gap-2 border-t pt-3 sm:grid-cols-2"><Input value={checkForm.description} onChange={event => setCheckForm(form => ({ ...form, description: event.target.value }))} placeholder="Novo item do checklist" /><Select value={checkForm.assigneeUserId || "none"} onValueChange={value => setCheckForm(form => ({ ...form, assigneeUserId: value === "none" ? "" : value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem responsável</SelectItem>{(eligible.data || []).map(person => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent></Select><Input type="date" value={checkForm.dueDate} onChange={event => setCheckForm(form => ({ ...form, dueDate: event.target.value }))} /><label className="flex items-center gap-2 text-sm"><Checkbox checked={checkForm.required} onCheckedChange={required => setCheckForm(form => ({ ...form, required: Boolean(required) }))} />Item obrigatório</label><Button className="sm:col-span-2" disabled={!checkForm.description.trim()} onClick={() => checklistCreate.mutate({ activityId: activity.id, ...checkForm })}><Plus className="mr-2 h-4 w-4" />Adicionar item</Button></div>}
        {activity.checklist.some(item => item.required && !item.completed) && <p className="flex items-center gap-2 text-xs text-amber-700"><AlertTriangle className="h-4 w-4" />Itens obrigatórios pendentes impedem a conclusão da atividade.</p>}
      </section>

      <section className="space-y-3 rounded-xl border p-4"><h3 className="flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4" />Comentários</h3><div className="max-h-52 space-y-2 overflow-y-auto">{activity.comments.map(item => <div key={item.id} className="rounded-lg bg-muted/50 p-2"><div className="flex justify-between text-xs"><strong>{item.authorName}</strong><span className="text-muted-foreground">{new Date(item.createdAt).toLocaleString("pt-BR")}</span></div><p className="mt-1 whitespace-pre-wrap text-sm">{item.content}</p></div>)}{activity.comments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum comentário.</p>}</div>{canEdit && <div className="flex gap-2"><Textarea value={comment} onChange={event => setComment(event.target.value)} placeholder="Comente ou mencione com @Nome" className="min-h-20" /><Button disabled={!comment.trim()} onClick={() => addComment.mutate({ activityId: activity.id, content: comment })}>Enviar</Button></div>}</section>

      <section className="space-y-3 rounded-xl border p-4"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 font-semibold"><Paperclip className="h-4 w-4" />Anexos</h3>{canEdit && <Label className="cursor-pointer"><Input className="hidden" type="file" onChange={event => void handleFile(event.target.files?.[0])} /><span className="inline-flex items-center rounded-md border px-3 py-2 text-sm"><FileUp className="mr-2 h-4 w-4" />Anexar</span></Label>}</div><div className="space-y-1">{activity.attachments.map(item => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded p-2 text-sm hover:bg-muted"><Paperclip className="h-4 w-4" />{item.fileName}</a>)}{activity.attachments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum anexo.</p>}</div></section>

      <section className="space-y-2 rounded-xl border p-4"><h3 className="font-semibold">Histórico</h3>{activity.history.slice(0, 20).map(event => <div key={event.id} className="flex items-start gap-2 text-xs"><span className="mt-1">{event.action.includes("COMPLETED") ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}</span><span><strong>{event.actorName}</strong> · {event.action.replaceAll("_", " ").toLowerCase()} · {new Date(event.createdAt).toLocaleString("pt-BR")}</span></div>)}</section>
    </div>
  </DialogContent></Dialog>;
}
