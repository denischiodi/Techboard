import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ProjectName } from "@/components/ProjectLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, ExternalLink, Filter, Flag, Loader2, Plus, Search, Settings2, X } from "lucide-react";
import { toast } from "sonner";

const PHASES = ["Discover", "Prepare", "Explore", "Realize", "Deploy", "Run"] as const;
const STATUSES = ["Pendente", "Em andamento", "Concluído", "Bloqueado", "Não aplicável"] as const;

type EditForm = {
  status: typeof STATUSES[number];
  responsible: string;
  dueDate: string;
  evidenceUrl: string;
  notes: string;
  blockingReason: string;
};

const EMPTY_EDIT_FORM: EditForm = {
  status: "Pendente",
  responsible: "",
  dueDate: "",
  evidenceUrl: "",
  notes: "",
  blockingReason: "",
};

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

export default function GpChecklist() {
  const [, setLocation] = useLocation();
  const [selectedProjectId, setSelectedProjectId] = useState(() => new URLSearchParams(window.location.search).get("projectId") || "");
  const [phase, setPhase] = useState<(typeof PHASES)[number]>("Discover");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [workstreamFilter, setWorkstreamFilter] = useState("all");
  const [editTarget, setEditTarget] = useState<{ kind: "item" | "step"; id: string; title: string } | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT_FORM);
  const [cycleDialogOpen, setCycleDialogOpen] = useState(false);
  const [cycleForm, setCycleForm] = useState({ name: "", module: "" });

  const utils = trpc.useUtils();
  const { data: projects = [], isLoading: projectsLoading } = trpc.projects.list.useQuery();
  const { data, isLoading } = trpc.gpChecklist.list.useQuery(
    { projectId: selectedProjectId },
    { enabled: Boolean(selectedProjectId) },
  );

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
      setLocation(`/gp-checklist?projectId=${encodeURIComponent(projects[0].id)}`, { replace: true });
    }
  }, [projects, selectedProjectId, setLocation]);

  const selectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setLocation(`/gp-checklist?projectId=${encodeURIComponent(projectId)}`);
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

  const workstreams = useMemo(() => Array.from(new Set(
    (data?.items || []).filter(item => item.phase === phase).map(item => item.workstream),
  )).sort(), [data?.items, phase]);

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
    setEditTarget({ kind, id: current.id, title: current.title });
    setEditForm({
      status: current.status || "Pendente",
      responsible: current.responsible || "",
      dueDate: current.dueDate || "",
      evidenceUrl: current.evidenceUrl || "",
      notes: current.notes || "",
      blockingReason: current.blockingReason || "",
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Flag className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Trilha do GP</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">SAP Activate · S/4HANA Cloud Public Edition · 3-system landscape</p>
        </div>
        <Select value={selectedProjectId} onValueChange={selectProject}>
          <SelectTrigger className="w-full lg:w-80"><SelectValue placeholder="Selecione o projeto" /></SelectTrigger>
          <SelectContent>{projects.map(project => <SelectItem key={project.id} value={project.id}><ProjectName project={project} /></SelectItem>)}</SelectContent>
        </Select>
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

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_260px]">
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
                            {safeEvidenceUrl(item.evidenceUrl) && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={safeEvidenceUrl(item.evidenceUrl)} target="_blank" rel="noreferrer">Evidência <ExternalLink className="h-3 w-3" /></a>}
                          </div>
                          {item.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{item.notes}</p>}
                          {item.status === "Bloqueado" && item.blockingReason && <p className="mt-2 flex items-center gap-1 text-xs text-red-700"><AlertTriangle className="h-3 w-3" />{item.blockingReason}</p>}
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => openEditor("item", item)} aria-label={`Editar ${item.title}`}><Settings2 className="h-4 w-4" /></Button>
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
                                {safeEvidenceUrl(step.evidenceUrl) && <a className="inline-flex items-center gap-1 text-xs text-primary hover:underline" href={safeEvidenceUrl(step.evidenceUrl)} target="_blank" rel="noreferrer">Evidência <ExternalLink className="h-3 w-3" /></a>}
                              </div>
                              {step.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{step.notes}</p>}
                              {step.status === "Bloqueado" && step.blockingReason && <p className="mt-2 flex items-start gap-1 text-xs text-red-700"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{step.blockingReason}</p>}
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => openEditor("step", step)} aria-label={`Editar etapa ${step.stepNumber}: ${step.title}`}><Settings2 className="h-4 w-4" /></Button>
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
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editTarget?.title}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div><Label htmlFor="gp-edit-status">Status</Label><Select value={editForm.status} onValueChange={value => setEditForm(current => ({ ...current, status: value as EditForm["status"] }))}><SelectTrigger id="gp-edit-status"><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div>
              <div><Label htmlFor="gp-edit-due-date">Prazo</Label><Input id="gp-edit-due-date" type="date" value={editForm.dueDate} onChange={event => setEditForm(current => ({ ...current, dueDate: event.target.value }))} /></div>
            </div>
            <div><Label htmlFor="gp-edit-responsible">Responsável</Label><Input id="gp-edit-responsible" value={editForm.responsible} onChange={event => setEditForm(current => ({ ...current, responsible: event.target.value }))} placeholder="Nome do responsável" /></div>
            <div><Label htmlFor="gp-edit-evidence">Evidência ou link</Label><Input id="gp-edit-evidence" type="url" value={editForm.evidenceUrl} onChange={event => setEditForm(current => ({ ...current, evidenceUrl: event.target.value }))} placeholder="https://..." /></div>
            {editForm.status === "Bloqueado" && <div><Label htmlFor="gp-edit-blocking-reason">Motivo do bloqueio *</Label><Textarea id="gp-edit-blocking-reason" value={editForm.blockingReason} onChange={event => setEditForm(current => ({ ...current, blockingReason: event.target.value }))} /></div>}
            <div><Label htmlFor="gp-edit-notes">Observações</Label><Textarea id="gp-edit-notes" value={editForm.notes} onChange={event => setEditForm(current => ({ ...current, notes: event.target.value }))} rows={4} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button><Button onClick={saveEditor} disabled={updateItem.isPending || updateStep.isPending}>Salvar</Button></DialogFooter>
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
