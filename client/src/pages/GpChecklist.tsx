import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ProjectName } from "@/components/ProjectLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Check, ChevronsUpDown, Download, ExternalLink, FileText, FileUp, Filter, Flag, Loader2, Plus, Search, Settings2, Trash2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GeneratedModelItems } from "@/components/GeneratedModelItems";

const PHASES = ["Discover", "Prepare", "Explore", "Realize", "Deploy", "Run"] as const;
const STATUSES = ["Pendente", "Em andamento", "Em validação", "Concluído", "Bloqueado", "Não aplicável"] as const;

type EditForm = {
  status: typeof STATUSES[number];
  responsible: string;
  dueDate: string;
  evidenceUrl: string;
  notes: string;
  blockingReason: string;
};

type GpResource = { id: string; name: string; email: string; profile: string; status: string };
type GpDocumentTemplateFile = { fileName: string; contentType: string; url: string };
type DocumentationTemplateType = "execution" | "plan" | "workshop" | "quality-gate";
type NewActivityForm = {
  phase: typeof PHASES[number];
  workstream: string;
  title: string;
  description: string;
  ownerRole: string;
  responsible: string;
  dueDate: string;
  documentationTemplateType: DocumentationTemplateType;
  includeDocumentationTemplate: boolean;
};

const EMPTY_EDIT_FORM: EditForm = {
  status: "Pendente",
  responsible: "",
  dueDate: "",
  evidenceUrl: "",
  notes: "",
  blockingReason: "",
};

const EMPTY_NEW_ACTIVITY: NewActivityForm = {
  phase: "Discover",
  workstream: "Project Management",
  title: "",
  description: "",
  ownerRole: "GP",
  responsible: "",
  dueDate: "",
  documentationTemplateType: "execution",
  includeDocumentationTemplate: true,
};

const DOCUMENTATION_TEMPLATE_LABELS: Record<DocumentationTemplateType, string> = {
  execution: "Registro de execução",
  plan: "Plano de atividade",
  workshop: "Ata de workshop",
  "quality-gate": "Validação / Quality Gate",
};

function ResourcePicker({ value, resources, onChange, id }: { value: string; resources: GpResource[]; onChange: (value: string) => void; id: string }) {
  const [open, setOpen] = useState(false);
  const selected = resources.find(resource => resource.name === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className={cn("truncate", !value && "text-muted-foreground")}>{selected?.name || value || "Selecione nos Recursos"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar por nome, e-mail ou perfil..." />
          <CommandList>
            <CommandEmpty>Nenhum recurso encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="sem responsável" onSelect={() => { onChange(""); setOpen(false); }}>
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                Não atribuído
              </CommandItem>
              {resources.map(resource => (
                <CommandItem key={resource.id} value={`${resource.name} ${resource.email} ${resource.profile}`} onSelect={() => { onChange(resource.name); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === resource.name ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <p className="truncate">{resource.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{resource.profile}{resource.email ? ` · ${resource.email}` : ""}{resource.status !== "Ativo" ? ` · ${resource.status}` : ""}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function statusClass(status: string) {
  if (status === "Concluído") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (status === "Em andamento") return "bg-blue-100 text-blue-800 border-blue-200";
  if (status === "Bloqueado") return "bg-red-100 text-red-800 border-red-200";
  if (status === "Não aplicável") return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-amber-50 text-amber-800 border-amber-200";
}

function progressLabel(completed: number, total: number) {
  return `${completed} de ${total} concluídos`;
}

function safeEvidenceUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : "";
}

function validateWordFile(file: File) {
  if (!/\.(doc|docx)$/i.test(file.name)) {
    toast.error("Selecione um arquivo Word .doc ou .docx");
    return false;
  }
  if (file.size > 10 * 1024 * 1024) {
    toast.error("O modelo Word deve ter no máximo 10 MB");
    return false;
  }
  return true;
}

async function fileToBase64(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Não foi possível ler o arquivo"));
    reader.readAsDataURL(file);
  });
  return dataUrl.split(",", 2)[1] || "";
}

export default function GpChecklist() {
  const [, setLocation] = useLocation();
  const [selectedProjectId, setSelectedProjectId] = useState(() => new URLSearchParams(window.location.search).get("projectId") || "");
  const [phase, setPhase] = useState<(typeof PHASES)[number]>("Discover");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [workstreamFilter, setWorkstreamFilter] = useState("all");
  const [editTarget, setEditTarget] = useState<{ kind: "item" | "step"; id: string; title: string; context: string; documentationTemplate: string; documentTemplateFile: GpDocumentTemplateFile | null } | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT_FORM);
  const [cycleDialogOpen, setCycleDialogOpen] = useState(false);
  const [cycleForm, setCycleForm] = useState({ name: "", module: "" });
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);
  const [activityForm, setActivityForm] = useState<NewActivityForm>(EMPTY_NEW_ACTIVITY);
  const [newActivityWordFile, setNewActivityWordFile] = useState<File | null>(null);

  const utils = trpc.useUtils();
  const { data: projects = [], isLoading: projectsLoading } = trpc.projects.list.useQuery();
  const { data, isLoading } = trpc.gpChecklist.list.useQuery(
    { projectId: selectedProjectId },
    { enabled: Boolean(selectedProjectId) },
  );

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
      setLocation(`/techlead/gp-track?projectId=${encodeURIComponent(projects[0].id)}`, { replace: true });
    }
  }, [projects, selectedProjectId, setLocation]);

  const selectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setLocation(`/techlead/gp-track?projectId=${encodeURIComponent(projectId)}`);
  };

  const refresh = async () => {
    if (selectedProjectId) await utils.gpChecklist.list.invalidate({ projectId: selectedProjectId });
  };
  const updateItem = trpc.gpChecklist.updateItem.useMutation({
    onSuccess: refresh,
    onError: error => toast.error(error.message || "Não foi possível atualizar a atividade"),
  });
  const updateStep = trpc.gpChecklist.updateCycleStep.useMutation({
    onSuccess: refresh,
    onError: error => toast.error(error.message || "Não foi possível atualizar a etapa"),
  });
  const createCycle = trpc.gpChecklist.createFitToStandardCycle.useMutation({
    onSuccess: async () => {
      await refresh();
      setCycleDialogOpen(false);
      setCycleForm({ name: "", module: "" });
      toast.success("Ciclo Fit-to-Standard criado");
    },
    onError: error => toast.error(error.message || "Não foi possível criar o ciclo"),
  });
  const uploadDocumentTemplate = trpc.gpChecklist.uploadDocumentTemplate.useMutation({
    onError: error => toast.error(error.message || "Não foi possível anexar o modelo Word"),
  });
  const removeDocumentTemplate = trpc.gpChecklist.removeDocumentTemplate.useMutation({
    onError: error => toast.error(error.message || "Não foi possível remover o modelo Word"),
  });
  const createItem = trpc.gpChecklist.createItem.useMutation({
    onSuccess: async created => {
      if (newActivityWordFile) {
        try {
          await uploadDocumentTemplate.mutateAsync({
            projectId: selectedProjectId,
            targetKind: "item",
            targetId: created.id,
            fileName: newActivityWordFile.name,
            contentType: newActivityWordFile.type,
            fileData: await fileToBase64(newActivityWordFile),
          });
        } catch {
          toast.warning("A atividade foi criada, mas o modelo Word não pôde ser anexado");
        }
      }
      await refresh();
      setActivityDialogOpen(false);
      setActivityForm({ ...EMPTY_NEW_ACTIVITY, phase });
      setNewActivityWordFile(null);
      toast.success(`Atividade “${created.title}” adicionada`);
    },
    onError: error => toast.error(error.message || "Não foi possível criar a atividade"),
  });

  const workstreams = useMemo(() => Array.from(new Set(
    (data?.items || []).filter(item => item.phase === phase).map(item => item.workstream),
  )).sort(), [data?.items, phase]);
  const allWorkstreams = useMemo(() => Array.from(new Set((data?.items || []).map(item => item.workstream))).sort(), [data?.items]);
  const resources = (data?.resources || []) as GpResource[];

  useEffect(() => {
    if (workstreamFilter !== "all" && !workstreams.includes(workstreamFilter)) {
      setWorkstreamFilter("all");
    }
  }, [workstreamFilter, workstreams]);

  const filteredItems = useMemo(() => (data?.items || []).filter(item => {
    if (item.phase !== phase) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (workstreamFilter !== "all" && item.workstream !== workstreamFilter) return false;
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    if (!normalizedSearch) return true;
    return [item.title, item.description, item.workstream, item.ownerRole, item.responsible]
      .some(value => value?.toLocaleLowerCase("pt-BR").includes(normalizedSearch));
  }), [data?.items, phase, search, statusFilter, workstreamFilter]);

  const groupedItems = useMemo(() => filteredItems.reduce<Record<string, typeof filteredItems>>((groups, current) => {
    (groups[current.workstream] ||= []).push(current);
    return groups;
  }, {}), [filteredItems]);
  const phaseProgress = new Map((data?.progress.byPhase || []).map(current => [current.phase, current]));

  const toggleItem = (item: any, checked: boolean) => updateItem.mutate({
    projectId: selectedProjectId,
    id: item.id,
    data: { status: checked ? "Concluído" : "Pendente" },
  });
  const toggleStep = (step: any, checked: boolean) => updateStep.mutate({
    projectId: selectedProjectId,
    stepId: step.id,
    data: { status: checked ? "Concluído" : "Pendente" },
  });

  const openEditor = (kind: "item" | "step", current: any) => {
    setEditTarget({
      kind,
      id: current.id,
      title: current.title,
      context: kind === "item" ? `${current.phase} · ${current.workstream}` : "Explore · Fit-to-Standard",
      documentationTemplate: current.documentationTemplate || "",
      documentTemplateFile: current.documentTemplateFile || null,
    });
    setEditForm({
      status: current.status || "Pendente",
      responsible: current.responsible || "",
      dueDate: current.dueDate || "",
      evidenceUrl: current.evidenceUrl || "",
      notes: current.notes || "",
      blockingReason: current.blockingReason || "",
    });
  };

  const applyDocumentationTemplate = () => {
    const template = editTarget?.documentationTemplate.trim();
    if (!template) return;
    setEditForm(current => {
      if (current.notes.includes(template)) return current;
      return { ...current, notes: current.notes.trim() ? `${current.notes.trim()}\n\n---\n\n${template}` : template };
    });
    toast.success("Modelo padrão inserido nas observações");
  };

  const openNewActivity = () => {
    setActivityForm({ ...EMPTY_NEW_ACTIVITY, phase });
    setNewActivityWordFile(null);
    setActivityDialogOpen(true);
  };

  const uploadWordForEditTarget = async (file?: File) => {
    if (!file || !editTarget || !validateWordFile(file)) return;
    try {
      uploadDocumentTemplate.mutate({
        projectId: selectedProjectId,
        targetKind: editTarget.kind,
        targetId: editTarget.id,
        fileName: file.name,
        contentType: file.type,
        fileData: await fileToBase64(file),
      }, {
        onSuccess: async updated => {
          setEditTarget(current => current ? { ...current, documentTemplateFile: updated.documentTemplateFile } : current);
          await refresh();
          toast.success("Modelo Word anexado à atividade");
        },
      });
    } catch {
      toast.error("Não foi possível ler o arquivo Word selecionado");
    }
  };

  const removeWordFromEditTarget = () => {
    if (!editTarget) return;
    removeDocumentTemplate.mutate({
      projectId: selectedProjectId,
      targetKind: editTarget.kind,
      targetId: editTarget.id,
    }, {
      onSuccess: async () => {
        setEditTarget(current => current ? { ...current, documentTemplateFile: null } : current);
        await refresh();
        toast.success("Modelo Word removido da atividade");
      },
    });
  };

  const saveEditor = () => {
    if (!editTarget) return;
    if (editForm.status === "Bloqueado" && !editForm.blockingReason.trim()) {
      toast.error("Informe o motivo do bloqueio");
      return;
    }
    if (editForm.evidenceUrl.trim() && !safeEvidenceUrl(editForm.evidenceUrl.trim())) {
      toast.error("Informe um link de evidência iniciado por http:// ou https://");
      return;
    }
    const close = () => {
      setEditTarget(null);
      toast.success("Atividade atualizada");
    };
    const data = {
      ...editForm,
      responsible: editForm.responsible.trim(),
      evidenceUrl: editForm.evidenceUrl.trim(),
      notes: editForm.notes.trim(),
      blockingReason: editForm.blockingReason.trim(),
    };
    if (editTarget.kind === "item") {
      updateItem.mutate({ projectId: selectedProjectId, id: editTarget.id, data }, { onSuccess: close });
    } else {
      updateStep.mutate({ projectId: selectedProjectId, stepId: editTarget.id, data }, { onSuccess: close });
    }
  };

  if (projectsLoading) {
    return <div className="flex min-h-64 items-center justify-center p-6" role="status"><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="sr-only">Carregando projetos</span></div>;
  }

  if (projects.length === 0) {
    return <div className="p-6"><Card><CardContent className="py-12 text-center text-muted-foreground">Cadastre um projeto para iniciar a Trilha do GP.</CardContent></Card></div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <GeneratedModelItems projectId={selectedProjectId} types={["activity"]} title="Atividades corporativas aplicadas" />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Flag className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Trilha do GP</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">SAP Activate · S/4HANA Cloud Public Edition · 3-system landscape</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <Select value={selectedProjectId} onValueChange={selectProject}>
            <SelectTrigger className="w-full sm:w-80"><SelectValue placeholder="Selecione o projeto" /></SelectTrigger>
            <SelectContent>{projects.map(project => <SelectItem key={project.id} value={project.id}><ProjectName project={project} /></SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={openNewActivity} disabled={!selectedProjectId}><Plus className="mr-2 h-4 w-4" />Nova atividade</Button>
        </div>
      </div>

      <Card className="overflow-hidden border-primary/20">
        <CardContent className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Progresso geral</p>
                <p className="text-xs text-muted-foreground">{progressLabel(data?.progress.overall.completed || 0, data?.progress.overall.total || 0)}</p>
              </div>
              <span className="text-2xl font-bold text-primary">{data?.progress.overall.percent || 0}%</span>
            </div>
            <Progress value={data?.progress.overall.percent || 0} className="h-3" />
          </div>
          <Badge variant="outline" className="w-fit">Responsável GP: {data?.project.manager || "não definido"}</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_260px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Label htmlFor="gp-checklist-search" className="sr-only">Buscar atividades</Label>
          <Input id="gp-checklist-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar atividade, papel ou responsável..." className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger><Filter className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os status</SelectItem>{STATUSES.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={workstreamFilter} onValueChange={setWorkstreamFilter}>
          <SelectTrigger><SelectValue placeholder="Todos os workstreams" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os workstreams</SelectItem>{workstreams.map(workstream => <SelectItem key={workstream} value={workstream}>{workstream}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {(search || statusFilter !== "all" || workstreamFilter !== "all") && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); setWorkstreamFilter("all"); }}>
            <X className="mr-2 h-4 w-4" />Limpar filtros
          </Button>
        </div>
      )}

      <Tabs value={phase} onValueChange={value => setPhase(value as typeof phase)}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-muted/60 p-1 sm:grid-cols-3 lg:grid-cols-6">
          {PHASES.map(currentPhase => {
            const current = phaseProgress.get(currentPhase);
            return (
              <TabsTrigger key={currentPhase} value={currentPhase} className="flex-col gap-1 py-2">
                <span>{currentPhase}</span>
                <span className="text-[10px] opacity-70">{current?.percent || 0}%</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {PHASES.map(currentPhase => (
          <TabsContent key={currentPhase} value={currentPhase} className="mt-5 space-y-5">
            {isLoading && (
              <Card><CardContent className="flex items-center justify-center gap-2 py-10 text-muted-foreground" role="status"><Loader2 className="h-5 w-5 animate-spin" />Carregando trilha...</CardContent></Card>
            )}
            {!isLoading && Object.keys(groupedItems).length === 0 && (
              <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma atividade encontrada com os filtros atuais.</CardContent></Card>
            )}
            {Object.entries(groupedItems).map(([workstream, items]) => (
              <Card key={workstream}>
                <CardHeader className="pb-3"><CardTitle className="text-base">{workstream}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {items.map(item => (
                    <div key={item.id} className={`rounded-lg border p-3 transition-colors ${item.itemType === "Quality Gate" ? "border-primary/40 bg-primary/5" : "bg-card"}`}>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          className="mt-1"
                          checked={item.status === "Concluído"}
                          onCheckedChange={checked => toggleItem(item, Boolean(checked))}
                          disabled={updateItem.isPending}
                          aria-label={`Concluir ${item.title}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {item.itemType === "Quality Gate" && <Badge className="gap-1"><Flag className="h-3 w-3" />Quality Gate</Badge>}
                            <p className={`font-medium ${item.status === "Concluído" ? "line-through opacity-60" : ""}`}>{item.title}</p>
                            <Badge variant="outline" className={statusClass(item.status)}>{item.status}</Badge>
                          </div>
                          {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>Papel: {item.ownerRole}</span>
                            <span>Responsável: {item.responsible || "a definir"}</span>
                            <span>Prazo: {item.dueDate || "a definir"}</span>
                            {item.documentTemplateFile && <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={item.documentTemplateFile.url} target="_blank" rel="noreferrer" title={item.documentTemplateFile.fileName}><Download className="h-3 w-3" />Modelo Word</a>}
                            {safeEvidenceUrl(item.evidenceUrl) && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={safeEvidenceUrl(item.evidenceUrl)} target="_blank" rel="noreferrer">Evidência <ExternalLink className="h-3 w-3" /></a>}
                          </div>
                          {item.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{item.notes}</p>}
                          {item.status === "Bloqueado" && item.blockingReason && <p className="mt-2 flex items-center gap-1 text-xs text-red-700"><AlertTriangle className="h-3 w-3" />{item.blockingReason}</p>}
                        </div>
                        <div className="flex shrink-0 items-center">
                          <Button variant="ghost" size="icon" onClick={() => openEditor("item", item)} aria-label={`Documentação de ${item.title}`} title="Documentação e evidências"><FileText className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditor("item", item)} aria-label={`Editar ${item.title}`} title="Editar atividade"><Settings2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}

            {currentPhase === "Explore" && (
              <Card className="border-sky-200 bg-sky-50/40 dark:bg-sky-950/10">
                <CardHeader className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <CardTitle className="text-base">Ciclos Fit-to-Standard por cenário</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">Repita os seis passos para cada processo ou item de escopo.</p>
                  </div>
                  <Button className="w-full sm:w-auto" onClick={() => setCycleDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Adicionar cenário</Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(data?.cycles || []).length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum cenário criado.</p>}
                  {(data?.cycles || []).map(cycle => (
                    <div key={cycle.id} className="rounded-lg border bg-background p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div><p className="font-semibold">{cycle.name}</p><p className="text-xs text-muted-foreground">{cycle.module || "Módulo não informado"}</p></div>
                        <Badge variant="outline" className={statusClass(cycle.status)}>{cycle.status}</Badge>
                      </div>
                      <div className="grid gap-2">
                        {cycle.steps.map(step => (
                          <div key={step.id} className="flex items-start gap-3 rounded-md border p-3">
                            <Checkbox className="mt-1" checked={step.status === "Concluído"} onCheckedChange={checked => toggleStep(step, Boolean(checked))} disabled={updateStep.isPending} aria-label={`Concluir etapa ${step.stepNumber}: ${step.title}`} />
                            <div className="min-w-0 flex-1">
                              <p className={step.status === "Concluído" ? "line-through opacity-60" : ""}><span className="mr-2 font-semibold text-sky-700">{step.stepNumber}</span>{step.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{step.responsible || "Responsável a definir"}{step.dueDate ? ` · ${step.dueDate}` : ""}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className={statusClass(step.status)}>{step.status}</Badge>
                                {step.documentTemplateFile && <a className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" href={step.documentTemplateFile.url} target="_blank" rel="noreferrer" title={step.documentTemplateFile.fileName}><Download className="h-3 w-3" />Modelo Word</a>}
                                {safeEvidenceUrl(step.evidenceUrl) && <a className="inline-flex items-center gap-1 text-xs text-primary hover:underline" href={safeEvidenceUrl(step.evidenceUrl)} target="_blank" rel="noreferrer">Evidência <ExternalLink className="h-3 w-3" /></a>}
                              </div>
                              {step.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{step.notes}</p>}
                              {step.status === "Bloqueado" && step.blockingReason && <p className="mt-2 flex items-start gap-1 text-xs text-red-700"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{step.blockingReason}</p>}
                            </div>
                            <div className="flex shrink-0 items-center">
                              <Button variant="ghost" size="icon" onClick={() => openEditor("step", step)} aria-label={`Documentação da etapa ${step.stepNumber}: ${step.title}`} title="Documentação e evidências"><FileText className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => openEditor("step", step)} aria-label={`Editar etapa ${step.stepNumber}: ${step.title}`} title="Editar etapa"><Settings2 className="h-4 w-4" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={Boolean(editTarget)} onOpenChange={open => !open && setEditTarget(null)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto p-0">
          <DialogHeader className="border-b bg-muted/30 px-6 py-5 pr-12 text-left">
            <DialogTitle className="text-xl">{editTarget?.title}</DialogTitle>
            <p className="text-sm text-muted-foreground">{editTarget?.context}</p>
          </DialogHeader>
          <div className="grid gap-5 px-6 py-5">
            <section className="grid gap-4 rounded-lg border p-4">
              <div className="flex items-center gap-2 font-medium"><UserRound className="h-4 w-4 text-primary" />Execução</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="gp-edit-status">Status</Label><Select value={editForm.status} onValueChange={value => setEditForm(current => ({ ...current, status: value as EditForm["status"] }))}><SelectTrigger id="gp-edit-status"><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label htmlFor="gp-edit-due-date">Prazo</Label><Input id="gp-edit-due-date" type="date" value={editForm.dueDate} onChange={event => setEditForm(current => ({ ...current, dueDate: event.target.value }))} /></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gp-edit-responsible">Responsável</Label>
                <ResourcePicker id="gp-edit-responsible" value={editForm.responsible} resources={resources} onChange={responsible => setEditForm(current => ({ ...current, responsible }))} />
                <p className="text-xs text-muted-foreground">Lista sincronizada com os Recursos cadastrados.</p>
              </div>
              {editForm.status === "Bloqueado" && <div className="space-y-2"><Label htmlFor="gp-edit-blocking-reason">Motivo do bloqueio *</Label><Textarea id="gp-edit-blocking-reason" value={editForm.blockingReason} onChange={event => setEditForm(current => ({ ...current, blockingReason: event.target.value }))} rows={3} /></div>}
            </section>

            <section className="grid gap-4 rounded-lg border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-primary" />Documentação da atividade</div>
                  <p className="mt-1 text-xs text-muted-foreground">Use o modelo para registrar decisões, pendências, evidências e aceite.</p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={applyDocumentationTemplate} disabled={!editTarget?.documentationTemplate}>
                  <FileText className="mr-2 h-4 w-4" />Inserir modelo padrão
                </Button>
              </div>
              <div className="rounded-lg border border-dashed bg-muted/20 p-4">
                <div className="mb-3">
                  <p className="text-sm font-medium">Modelo Word desta atividade</p>
                  <p className="mt-1 text-xs text-muted-foreground">Deixe o documento padrão pronto para o responsável baixar e preencher. Formatos .doc e .docx, até 10 MB.</p>
                </div>
                {editTarget?.documentTemplateFile ? (
                  <div className="flex flex-col gap-3 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
                    <a href={editTarget.documentTemplateFile.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-sm font-medium text-primary hover:underline">
                      <FileText className="h-5 w-5 shrink-0" />
                      <span className="truncate">{editTarget.documentTemplateFile.fileName}</span>
                      <Download className="h-4 w-4 shrink-0" />
                    </a>
                    <div className="flex flex-wrap gap-2">
                      <Label className={cn("inline-flex h-9 cursor-pointer items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent", uploadDocumentTemplate.isPending && "pointer-events-none opacity-50")}>
                        <FileUp className="mr-2 h-4 w-4" />Substituir
                        <Input className="hidden" type="file" accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => { void uploadWordForEditTarget(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                      </Label>
                      <Button type="button" variant="outline" size="sm" onClick={removeWordFromEditTarget} disabled={removeDocumentTemplate.isPending}>
                        {removeDocumentTemplate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}Remover
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Label className={cn("flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-md border bg-background px-4 py-3 text-center hover:bg-accent/50", uploadDocumentTemplate.isPending && "pointer-events-none opacity-50")}>
                    {uploadDocumentTemplate.isPending ? <Loader2 className="mb-2 h-5 w-5 animate-spin text-primary" /> : <FileUp className="mb-2 h-5 w-5 text-primary" />}
                    <span className="text-sm font-medium">Anexar modelo Word</span>
                    <span className="text-xs text-muted-foreground">Clique para selecionar o documento</span>
                    <Input className="hidden" type="file" accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => { void uploadWordForEditTarget(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                  </Label>
                )}
              </div>
              <div className="space-y-2"><Label htmlFor="gp-edit-notes">Registro e observações</Label><Textarea id="gp-edit-notes" value={editForm.notes} onChange={event => setEditForm(current => ({ ...current, notes: event.target.value }))} rows={10} placeholder="Registre aqui decisões, ações, pendências e aceite." /></div>
              <div className="space-y-2"><Label htmlFor="gp-edit-evidence">Evidência ou link</Label><Input id="gp-edit-evidence" type="url" value={editForm.evidenceUrl} onChange={event => setEditForm(current => ({ ...current, evidenceUrl: event.target.value }))} placeholder="https://..." /></div>
            </section>
          </div>
          <DialogFooter className="sticky bottom-0 border-t bg-background px-6 py-4">
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={saveEditor} disabled={updateItem.isPending || updateStep.isPending}>{(updateItem.isPending || updateStep.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar atividade</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={activityDialogOpen} onOpenChange={open => { setActivityDialogOpen(open); if (!open) setNewActivityWordFile(null); }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto p-0">
          <DialogHeader className="border-b px-6 py-5 pr-12 text-left">
            <DialogTitle>Nova atividade da Trilha do GP</DialogTitle>
            <p className="text-sm text-muted-foreground">Adicione somente o que for específico do projeto. A atividade ficará na fase selecionada.</p>
          </DialogHeader>
          <div className="grid gap-4 px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="gp-new-phase">Fase *</Label><Select value={activityForm.phase} onValueChange={value => setActivityForm(current => ({ ...current, phase: value as NewActivityForm["phase"] }))}><SelectTrigger id="gp-new-phase"><SelectValue /></SelectTrigger><SelectContent>{PHASES.map(current => <SelectItem key={current} value={current}>{current}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="gp-new-workstream">Workstream *</Label><Input id="gp-new-workstream" list="gp-workstreams" value={activityForm.workstream} onChange={event => setActivityForm(current => ({ ...current, workstream: event.target.value }))} placeholder="Ex.: Project Management" /><datalist id="gp-workstreams">{allWorkstreams.map(current => <option key={current} value={current} />)}</datalist></div>
            </div>
            <div className="space-y-2"><Label htmlFor="gp-new-title">Nome da atividade *</Label><Input id="gp-new-title" value={activityForm.title} onChange={event => setActivityForm(current => ({ ...current, title: event.target.value }))} placeholder="O que precisa ser concluído?" autoFocus /></div>
            <div className="space-y-2"><Label htmlFor="gp-new-description">Descrição</Label><Textarea id="gp-new-description" value={activityForm.description} onChange={event => setActivityForm(current => ({ ...current, description: event.target.value }))} rows={3} placeholder="Resultado esperado ou orientação rápida." /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="gp-new-role">Papel</Label><Input id="gp-new-role" value={activityForm.ownerRole} onChange={event => setActivityForm(current => ({ ...current, ownerRole: event.target.value }))} placeholder="Ex.: GP" /></div>
              <div className="space-y-2"><Label htmlFor="gp-new-due-date">Prazo</Label><Input id="gp-new-due-date" type="date" value={activityForm.dueDate} onChange={event => setActivityForm(current => ({ ...current, dueDate: event.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="gp-new-responsible">Responsável</Label><ResourcePicker id="gp-new-responsible" value={activityForm.responsible} resources={resources} onChange={responsible => setActivityForm(current => ({ ...current, responsible }))} /></div>
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <Checkbox id="gp-new-use-template" checked={activityForm.includeDocumentationTemplate} onCheckedChange={checked => setActivityForm(current => ({ ...current, includeDocumentationTemplate: Boolean(checked) }))} />
                <div><Label htmlFor="gp-new-use-template" className="cursor-pointer">Já iniciar com documentação padrão</Label><p className="mt-1 text-xs text-muted-foreground">O roteiro será colocado nas observações e poderá ser ajustado pelo GP.</p></div>
              </div>
              {activityForm.includeDocumentationTemplate && <div className="space-y-2"><Label htmlFor="gp-new-template-type">Modelo</Label><Select value={activityForm.documentationTemplateType} onValueChange={value => setActivityForm(current => ({ ...current, documentationTemplateType: value as DocumentationTemplateType }))}><SelectTrigger id="gp-new-template-type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(DOCUMENTATION_TEMPLATE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>}
            </div>
            <div className="grid gap-3 rounded-lg border border-dashed p-4">
              <div><p className="text-sm font-medium">Modelo Word da atividade <span className="font-normal text-muted-foreground">(opcional)</span></p><p className="mt-1 text-xs text-muted-foreground">Anexe o documento padrão que o responsável deverá baixar e preencher.</p></div>
              {newActivityWordFile ? (
                <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 p-3">
                  <div className="flex min-w-0 items-center gap-2 text-sm"><FileText className="h-5 w-5 shrink-0 text-primary" /><span className="truncate">{newActivityWordFile.name}</span></div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setNewActivityWordFile(null)} aria-label="Remover modelo Word selecionado"><X className="h-4 w-4" /></Button>
                </div>
              ) : (
                <Label className="flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-md border bg-muted/10 px-4 text-sm font-medium hover:bg-accent/50">
                  <FileUp className="h-4 w-4 text-primary" />Selecionar arquivo .doc ou .docx
                  <Input className="hidden" type="file" accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => { const file = event.target.files?.[0]; if (file && validateWordFile(file)) setNewActivityWordFile(file); event.currentTarget.value = ""; }} />
                </Label>
              )}
              <p className="text-xs text-muted-foreground">Tamanho máximo: 10 MB.</p>
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 border-t bg-background px-6 py-4">
            <Button variant="outline" onClick={() => setActivityDialogOpen(false)}>Cancelar</Button>
            <Button disabled={!activityForm.title.trim() || !activityForm.workstream.trim() || createItem.isPending || uploadDocumentTemplate.isPending} onClick={() => createItem.mutate({ projectId: selectedProjectId, ...activityForm, title: activityForm.title.trim(), workstream: activityForm.workstream.trim(), description: activityForm.description.trim(), ownerRole: activityForm.ownerRole.trim() })}>{(createItem.isPending || uploadDocumentTemplate.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar atividade</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cycleDialogOpen} onOpenChange={setCycleDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo cenário Fit-to-Standard</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div><Label htmlFor="gp-cycle-name">Cenário ou processo *</Label><Input id="gp-cycle-name" value={cycleForm.name} onChange={event => setCycleForm(current => ({ ...current, name: event.target.value }))} placeholder="Ex.: Order-to-Cash" /></div>
            <div><Label htmlFor="gp-cycle-module">Módulo</Label><Input id="gp-cycle-module" value={cycleForm.module} onChange={event => setCycleForm(current => ({ ...current, module: event.target.value }))} placeholder="Ex.: SD" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCycleDialogOpen(false)}>Cancelar</Button><Button disabled={!cycleForm.name.trim() || createCycle.isPending} onClick={() => createCycle.mutate({ projectId: selectedProjectId, name: cycleForm.name.trim(), module: cycleForm.module.trim() })}>{createCycle.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar ciclo</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
