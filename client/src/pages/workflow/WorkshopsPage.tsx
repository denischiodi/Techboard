import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Trash2, FileText, Sparkles, Upload, Calendar, Lightbulb, ClipboardList, CheckCircle2, GanttChart, LayoutGrid, Users, UserCheck, AudioLines, Library, Paperclip, ExternalLink, Pencil } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

import { useWorkflowProject } from "./useWorkflowProject";

type SupportedAudioType = "audio/mpeg" | "audio/mp3" | "audio/wav" | "audio/wave" | "audio/webm" | "audio/ogg" | "audio/mp4" | "audio/m4a";

function normalizeAudioType(file: File): SupportedAudioType | null {
  const byExtension: Record<string, SupportedAudioType> = { mp3: "audio/mpeg", wav: "audio/wav", webm: "audio/webm", ogg: "audio/ogg", m4a: "audio/m4a", mp4: "audio/mp4" };
  if (["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/webm", "audio/ogg", "audio/mp4", "audio/m4a"].includes(file.type)) return file.type as SupportedAudioType;
  return byExtension[file.name.split(".").pop()?.toLowerCase() || ""] || null;
}

const lines = (value: string) => value.split("\n").map(item => item.trim()).filter(Boolean);
const joinLines = (value: string[] | undefined) => (value || []).join("\n");
const emptyWorkshopForm = { title: "", objective: "", content: "", modules: [] as string[], scopeItemIds: [] as string[], date: "", startTime: "", endTime: "", duration: "", notes: "", participants: [] as string[], agenda: "", expectedOutcomes: "", prerequisites: "", requiredRoles: "", presentationFiles: [] as Array<{ name: string; url: string; contentType: string }> };
const emptyTemplateForm = { id: "", title: "", objective: "", content: "", duration: "", modules: [] as string[], projectIds: [] as string[], scopeItemKeys: [] as string[], agenda: "", expectedOutcomes: "", prerequisites: "", requiredRoles: "", presentationFiles: [] as Array<{ name: string; url: string; contentType: string }>, active: true };

export default function WorkshopsPage() {
  const { projectId: PROJECT_ID } = useWorkflowProject();
  const { user } = useAuth();
  const isAdmin = (user as any)?.appRole === "admin" || user?.role === "admin";
  const [showAdd, setShowAdd] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [selectedWs, setSelectedWs] = useState<any>(null);
  const [showAgenda, setShowAgenda] = useState(false);
  const [agendaSuggestion, setAgendaSuggestion] = useState("");
  const [view, setView] = useState<"cards" | "timeline">("timeline");
  const [form, setForm] = useState(emptyWorkshopForm);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);

  const { data: workshops = [], refetch } = trpc.workflow.workshops.list.useQuery({ projectId: PROJECT_ID });
  const { data: scopeItems = [] } = trpc.workflow.scopeItems.list.useQuery({ projectId: PROJECT_ID });
  const { data: keyUsers = [] } = trpc.workflow.bdcq.keyUsers.list.useQuery({ projectId: PROJECT_ID });
  const { data: templates = [], refetch: refetchTemplates } = trpc.workflow.workshops.templates.list.useQuery({ projectId: PROJECT_ID });
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const { data: allocations = [] } = trpc.allocations.list.useQuery();
  const { data: absences = [] } = trpc.absences.list.useQuery();
  const { data: lookups } = trpc.settings.getLookups.useQuery();
  const modules = (lookups?.fronts || []).filter((item: any) => item.active).map((item: any) => item.value);
  const createWs = trpc.workflow.workshops.create.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); setForm(emptyWorkshopForm); toast.success("Workshop criado"); }, onError: error => toast.error(error.message) });
  const deleteWs = trpc.workflow.workshops.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Removido"); } });
  const suggestAgenda = trpc.workflow.workshops.suggestAgenda.useMutation({
    onSuccess: (data: any) => { setAgendaSuggestion(data.suggestion); setShowAgenda(true); },
    onError: () => toast.error("Erro ao gerar sugestão"),
  });
  const uploadPresentation = trpc.workflow.workshops.uploadPresentation.useMutation({ onError: error => toast.error(error.message) });
  const createTemplate = trpc.workflow.workshops.templates.create.useMutation({ onSuccess: () => { refetchTemplates(); setTemplateForm(emptyTemplateForm); toast.success("Workshop padrão criado"); }, onError: error => toast.error(error.message) });
  const updateTemplate = trpc.workflow.workshops.templates.update.useMutation({ onSuccess: () => { refetchTemplates(); setTemplateForm(emptyTemplateForm); toast.success("Workshop padrão atualizado"); }, onError: error => toast.error(error.message) });
  const deleteTemplate = trpc.workflow.workshops.templates.delete.useMutation({ onSuccess: () => { refetchTemplates(); toast.success("Workshop padrão removido"); }, onError: error => toast.error(error.message) });
  const applyTemplates = trpc.workflow.workshops.templates.applyToProject.useMutation({ onSuccess: data => { refetch(); setSelectedTemplateIds([]); toast.success(`${data.added} workshop(s) padrão aplicado(s)`); }, onError: error => toast.error(error.message) });
  const sortedWorkshops = [...workshops].sort((a: any, b: any) => (a.scheduledDate || "9999").localeCompare(b.scheduledDate || "9999"));
  const availableResources = resources.filter((resource: any) => allocations.some((allocation: any) =>
    allocation.projectId === PROJECT_ID && allocation.resourceId === resource.id &&
    (form.modules.length === 0 || form.modules.includes(allocation.front)) &&
    (!form.date || (allocation.startDate <= form.date && allocation.endDate >= form.date))
  ) && !absences.some((absence: any) => absence.resourceId === resource.id && form.date && absence.startDate <= form.date && absence.endDate >= form.date));
  const toggleParticipant = (name: string) => setForm(current => ({ ...current, participants: current.participants.includes(name) ? current.participants.filter(item => item !== name) : [...current.participants, name] }));
  const toggle = (items: string[], value: string) => items.includes(value) ? items.filter(item => item !== value) : [...items, value];
  const uploadFile = async (file: File | undefined, target: "workshop" | "template") => {
    if (!file) return;
    const fileData = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
    const uploaded = await uploadPresentation.mutateAsync({ projectId: PROJECT_ID, fileName: file.name, contentType: file.type || "application/octet-stream", fileData });
    if (target === "workshop") setForm(current => ({ ...current, presentationFiles: [...current.presentationFiles, uploaded] }));
    else setTemplateForm(current => ({ ...current, presentationFiles: [...current.presentationFiles, uploaded] }));
  };

  return (
    <div className="space-y-4 p-3 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workshops</h1>
          <p className="text-muted-foreground text-sm">Gestão de workshops de levantamento</p>
        </div>
        <div className="flex flex-col gap-2 min-[420px]:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="outline" onClick={() => setShowLibrary(true)}><Library className="mr-2 h-4 w-4" />Workshops padrão</Button>
          <Button variant="outline" onClick={() => suggestAgenda.mutate({ projectId: PROJECT_ID })} disabled={suggestAgenda.isPending}>
            <Lightbulb className="h-4 w-4 mr-2" />{suggestAgenda.isPending ? "Gerando..." : "Sugerir Agenda (IA)"}
          </Button>
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />Novo Workshop</Button>
        </div>
      </div>

      <div className="flex justify-end"><div className="flex rounded-md border p-1"><Button size="sm" variant={view === "timeline" ? "secondary" : "ghost"} onClick={() => setView("timeline")}><GanttChart className="mr-2 h-4 w-4" />Timeline</Button><Button size="sm" variant={view === "cards" ? "secondary" : "ghost"} onClick={() => setView("cards")}><LayoutGrid className="mr-2 h-4 w-4" />Cards</Button></div></div>

      {view === "timeline" ? <Card><CardContent className="py-5">
        {sortedWorkshops.length === 0 ? <p className="py-4 text-center text-muted-foreground">Nenhum workshop agendado.</p> : <div className="relative ml-4 border-l-2 border-primary/20 pl-6">
          {sortedWorkshops.map((ws: any) => <button key={ws.id} className="relative mb-5 block w-full rounded-lg border bg-background p-4 text-left transition-shadow hover:shadow-md" onClick={() => setSelectedWs(ws)}>
            <span className="absolute -left-[2.05rem] top-5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{ws.scheduledDate ? new Date(`${ws.scheduledDate}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "Data não definida"}</p><h3 className="mt-1 font-semibold">{ws.title}</h3>{ws.objective && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{ws.objective}</p>}</div><div className="flex flex-wrap gap-2">{(ws.modules?.length ? ws.modules : ws.module ? [ws.module] : []).map((module: string) => <Badge key={module} variant="secondary">{module}</Badge>)}{ws.source === "template" && <Badge>Modelo padrão</Badge>}<Badge variant="outline">{ws.status || "Planejado"}</Badge></div></div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">{ws.duration && <span>{ws.duration}</span>}<span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{ws.participants?.length || 0} participantes</span></div>
          </button>)}
        </div>}
      </CardContent></Card> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {workshops.length === 0 ? (
          <Card className="col-span-full"><CardContent className="py-8 text-center text-muted-foreground">Nenhum workshop agendado.</CardContent></Card>
        ) : workshops.map((ws: any) => (
          <Card key={ws.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedWs(ws)}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{ws.title}</CardTitle>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteWs.mutate({ id: ws.id }); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              {ws.scheduledDate && <p className="text-sm text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />{ws.scheduledDate}</p>}
              <Badge variant="outline" className="mt-2">{ws.status || "Planejado"}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>}

      {selectedWs && <WorkshopDetail ws={selectedWs} onClose={() => setSelectedWs(null)} onUpdated={(data) => { setSelectedWs((current: any) => ({ ...current, ...data })); refetch(); }} />}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Workshop</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Título *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>Objetivo</Label><Textarea value={form.objective} onChange={e => setForm(current => ({ ...current, objective: e.target.value }))} placeholder="Qual decisão ou entendimento o workshop deve produzir?" /></div>
            <div><Label>O que será apresentado</Label><Textarea value={form.content} onChange={e => setForm(current => ({ ...current, content: e.target.value }))} rows={4} placeholder="Descreva processos, demonstrações, cenários e tópicos que serão apresentados." /></div>
            <div className="grid gap-2"><Label>Frentes/Módulos</Label><div className="flex flex-wrap gap-2">{modules.map((module: string) => <Button key={module} type="button" size="sm" variant={form.modules.includes(module) ? "default" : "outline"} onClick={() => setForm(current => ({ ...current, modules: toggle(current.modules, module), participants: [] }))}>{module}</Button>)}</div><span className="text-xs text-muted-foreground">Sem seleção significa workshop geral.</span></div>
            <div className="grid gap-2"><Label>Scope items relacionados</Label><div className="max-h-44 space-y-1 overflow-auto rounded-md border p-2">{scopeItems.filter((item: any) => form.modules.length === 0 || form.modules.includes(item.module)).map((item: any) => <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-muted"><Checkbox checked={form.scopeItemIds.includes(item.id)} onCheckedChange={() => setForm(current => ({ ...current, scopeItemIds: toggle(current.scopeItemIds, item.id) }))} /><span>{item.code ? `${item.code} - ` : ""}{item.name}</span><Badge variant="outline" className="ml-auto">{item.module}</Badge></label>)}</div></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div><Label>Data</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value, participants: [] }))} /></div>
              <div><Label>Início</Label><Input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} /></div>
              <div><Label>Fim</Label><Input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2"><div><Label>Agenda (um item por linha)</Label><Textarea value={form.agenda} onChange={e => setForm(current => ({ ...current, agenda: e.target.value }))} rows={5} /></div><div><Label>Funções necessárias (uma por linha)</Label><Textarea value={form.requiredRoles} onChange={e => setForm(current => ({ ...current, requiredRoles: e.target.value }))} rows={5} placeholder="Dono do processo\nKey user de Compras\nConsultor funcional" /></div></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><Label>Resultados esperados</Label><Textarea value={form.expectedOutcomes} onChange={e => setForm(current => ({ ...current, expectedOutcomes: e.target.value }))} rows={4} /></div><div><Label>Pré-requisitos</Label><Textarea value={form.prerequisites} onChange={e => setForm(current => ({ ...current, prerequisites: e.target.value }))} rows={4} /></div></div>
            <div className="space-y-2"><div className="flex items-center justify-between"><Label>Participantes sugeridos</Label><span className="text-xs text-muted-foreground">Com base nas alocações e ausências</span></div>
              <div className="flex flex-wrap gap-2">{form.date && availableResources.map((resource: any) => <Button key={resource.id} type="button" size="sm" variant={form.participants.includes(resource.name) ? "default" : "outline"} onClick={() => toggleParticipant(resource.name)}><UserCheck className="mr-1.5 h-3.5 w-3.5" />{resource.name}</Button>)}{keyUsers.filter((item: any) => item.active).map((item: any) => <Button key={item.id} type="button" size="sm" variant={form.participants.includes(item.name) ? "default" : "outline"} onClick={() => toggleParticipant(item.name)}><Users className="mr-1.5 h-3.5 w-3.5" />{item.name}{item.role ? ` · ${item.role}` : " · Key user"}</Button>)}</div>
              {!form.date && keyUsers.length === 0 && <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Informe a data para verificar os recursos internos; os key users ativos aparecem independentemente da data.</p>}
            </div>
            <div className="space-y-2"><div className="flex items-center justify-between"><div><Label>Modelo da apresentação</Label><p className="text-xs text-muted-foreground">PPT, PPTX ou PDF, até 15 MB.</p></div><Button variant="outline" size="sm" asChild disabled={uploadPresentation.isPending}><label className="cursor-pointer"><Upload className="mr-2 h-4 w-4" />Anexar<input className="hidden" type="file" accept=".ppt,.pptx,.pdf" onChange={event => { void uploadFile(event.target.files?.[0], "workshop"); event.currentTarget.value = ""; }} /></label></Button></div>{form.presentationFiles.map((file, index) => <div key={`${file.url}-${index}`} className="flex items-center gap-2 rounded border p-2 text-sm"><Paperclip className="h-4 w-4" /><span className="min-w-0 flex-1 truncate">{file.name}</span><Button variant="ghost" size="icon" onClick={() => setForm(current => ({ ...current, presentationFiles: current.presentationFiles.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 className="h-4 w-4" /></Button></div>)}</div>
            <div><Label>Notas</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={() => createWs.mutate({ projectId: PROJECT_ID, title: form.title, objective: form.objective, content: form.content, module: form.modules[0] || "", modules: form.modules, scopeItemIds: form.scopeItemIds, scheduledDate: form.date, duration: form.startTime && form.endTime ? `${form.startTime}–${form.endTime}` : form.duration, participants: form.participants, agenda: lines(form.agenda), expectedOutcomes: lines(form.expectedOutcomes), prerequisites: lines(form.prerequisites), requiredRoles: lines(form.requiredRoles), presentationFiles: form.presentationFiles, notes: form.notes })} disabled={!form.title || createWs.isPending}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLibrary} onOpenChange={setShowLibrary}>
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
          <DialogHeader><DialogTitle>Biblioteca de workshops padrão</DialogTitle></DialogHeader>
          <div className="grid gap-5 lg:grid-cols-[1fr_1.25fr]">
            <div className="space-y-3 rounded-md border p-4">
              <div><h3 className="font-medium">{templateForm.id ? "Editar workshop padrão" : "Novo workshop padrão"}</h3><p className="text-xs text-muted-foreground">Modelos sem projeto, frente ou scope item são gerais.</p></div>
              <div><Label>Título *</Label><Input value={templateForm.title} onChange={e => setTemplateForm(current => ({ ...current, title: e.target.value }))} disabled={!isAdmin} /></div>
              <div><Label>Objetivo</Label><Textarea value={templateForm.objective} onChange={e => setTemplateForm(current => ({ ...current, objective: e.target.value }))} disabled={!isAdmin} /></div>
              <div><Label>O que será apresentado</Label><Textarea value={templateForm.content} onChange={e => setTemplateForm(current => ({ ...current, content: e.target.value }))} rows={4} disabled={!isAdmin} /></div>
              <div><Label>Duração sugerida</Label><Input value={templateForm.duration} onChange={e => setTemplateForm(current => ({ ...current, duration: e.target.value }))} placeholder="Ex: 2h" disabled={!isAdmin} /></div>
              <div className="grid gap-2"><Label>Frentes</Label><div className="flex flex-wrap gap-2">{modules.map((module: string) => <Button key={module} type="button" size="sm" variant={templateForm.modules.includes(module) ? "default" : "outline"} disabled={!isAdmin} onClick={() => setTemplateForm(current => ({ ...current, modules: toggle(current.modules, module) }))}>{module}</Button>)}</div></div>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={templateForm.projectIds.includes(PROJECT_ID)} disabled={!isAdmin} onCheckedChange={() => setTemplateForm(current => ({ ...current, projectIds: toggle(current.projectIds, PROJECT_ID) }))} />Aplicar somente ao projeto atual</label>
              <div className="grid gap-2"><Label>Scope items</Label><div className="max-h-40 space-y-1 overflow-auto rounded border p-2">{scopeItems.filter((item: any) => templateForm.modules.length === 0 || templateForm.modules.includes(item.module)).map((item: any) => { const key = item.code || item.name; return <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded p-1 text-sm hover:bg-muted"><Checkbox checked={templateForm.scopeItemKeys.includes(key)} disabled={!isAdmin} onCheckedChange={() => setTemplateForm(current => ({ ...current, scopeItemKeys: toggle(current.scopeItemKeys, key) }))} />{item.code ? `${item.code} - ` : ""}{item.name}</label>; })}</div></div>
              <div className="grid gap-3 sm:grid-cols-2"><div><Label>Agenda</Label><Textarea rows={4} value={templateForm.agenda} onChange={e => setTemplateForm(current => ({ ...current, agenda: e.target.value }))} disabled={!isAdmin} /></div><div><Label>Funções necessárias</Label><Textarea rows={4} value={templateForm.requiredRoles} onChange={e => setTemplateForm(current => ({ ...current, requiredRoles: e.target.value }))} disabled={!isAdmin} /></div></div>
              <div className="grid gap-3 sm:grid-cols-2"><div><Label>Resultados esperados</Label><Textarea rows={3} value={templateForm.expectedOutcomes} onChange={e => setTemplateForm(current => ({ ...current, expectedOutcomes: e.target.value }))} disabled={!isAdmin} /></div><div><Label>Pré-requisitos</Label><Textarea rows={3} value={templateForm.prerequisites} onChange={e => setTemplateForm(current => ({ ...current, prerequisites: e.target.value }))} disabled={!isAdmin} /></div></div>
              <div className="space-y-2"><Button variant="outline" size="sm" asChild disabled={!isAdmin || uploadPresentation.isPending}><label className="cursor-pointer"><Upload className="mr-2 h-4 w-4" />Anexar apresentação<input className="hidden" type="file" accept=".ppt,.pptx,.pdf" onChange={event => { void uploadFile(event.target.files?.[0], "template"); event.currentTarget.value = ""; }} /></label></Button>{templateForm.presentationFiles.map((file, index) => <div key={file.url} className="flex items-center gap-2 rounded border p-2 text-sm"><Paperclip className="h-4 w-4" /><span className="flex-1 truncate">{file.name}</span><Button variant="ghost" size="icon" onClick={() => setTemplateForm(current => ({ ...current, presentationFiles: current.presentationFiles.filter((_, i) => i !== index) }))}><Trash2 className="h-4 w-4" /></Button></div>)}</div>
              {isAdmin && <div className="flex gap-2"><Button disabled={!templateForm.title.trim()} onClick={() => { const data = { title: templateForm.title, objective: templateForm.objective, content: templateForm.content, duration: templateForm.duration, modules: templateForm.modules, projectIds: templateForm.projectIds, scopeItemKeys: templateForm.scopeItemKeys, agenda: lines(templateForm.agenda), expectedOutcomes: lines(templateForm.expectedOutcomes), prerequisites: lines(templateForm.prerequisites), requiredRoles: lines(templateForm.requiredRoles), presentationFiles: templateForm.presentationFiles, active: templateForm.active }; templateForm.id ? updateTemplate.mutate({ id: templateForm.id, data }) : createTemplate.mutate(data); }}>{templateForm.id ? "Salvar alterações" : "Criar modelo"}</Button>{templateForm.id && <Button variant="outline" onClick={() => setTemplateForm(emptyTemplateForm)}>Cancelar</Button>}</div>}
            </div>
            <div className="space-y-3"><div className="flex items-center justify-between gap-3"><div><h3 className="font-medium">Modelos disponíveis ({templates.length})</h3><p className="text-xs text-muted-foreground">Selecione um ou mais modelos para aplicar ao projeto.</p></div><Button disabled={selectedTemplateIds.length === 0 || applyTemplates.isPending} onClick={() => applyTemplates.mutate({ projectId: PROJECT_ID, templateIds: selectedTemplateIds })}><Sparkles className="mr-2 h-4 w-4" />Aplicar selecionados</Button></div>
              {templates.map((template: any) => <div key={template.id} className="rounded-md border p-3"><div className="flex items-start gap-3"><Checkbox checked={selectedTemplateIds.includes(template.id)} onCheckedChange={() => setSelectedTemplateIds(current => toggle(current, template.id))} /><div className="min-w-0 flex-1"><p className="font-medium">{template.title}</p><p className="mt-1 text-sm text-muted-foreground line-clamp-2">{template.objective || template.content}</p><div className="mt-2 flex flex-wrap gap-1">{template.projectIds?.length === 0 && template.modules?.length === 0 && template.scopeItemKeys?.length === 0 && <Badge>Geral</Badge>}{template.projectIds?.includes(PROJECT_ID) && <Badge variant="secondary">Projeto atual</Badge>}{template.modules?.map((item: string) => <Badge key={item} variant="outline">{item}</Badge>)}{template.scopeItemKeys?.map((item: string) => <Badge key={item} className="bg-blue-50 text-blue-800">Scope: {item}</Badge>)}</div></div>{isAdmin && <div className="flex"><Button variant="ghost" size="icon" onClick={() => setTemplateForm({ ...emptyTemplateForm, ...template, agenda: joinLines(template.agenda), expectedOutcomes: joinLines(template.expectedOutcomes), prerequisites: joinLines(template.prerequisites), requiredRoles: joinLines(template.requiredRoles) })}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => deleteTemplate.mutate({ id: template.id })}><Trash2 className="h-4 w-4" /></Button></div>}</div></div>)}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAgenda} onOpenChange={setShowAgenda}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Sugestão de Agenda (IA)</DialogTitle></DialogHeader>
          <div className="prose prose-sm dark:prose-invert whitespace-pre-wrap">{agendaSuggestion}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WorkshopDetail({ ws, onClose, onUpdated }: { ws: any; onClose: () => void; onUpdated: (data: any) => void }) {
  const { projectId } = useWorkflowProject();
  const [transcriptContent, setTranscriptContent] = useState("");
  const [transcriptTitle, setTranscriptTitle] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [requirementForm, setRequirementForm] = useState<{
    title: string; description: string; module: string;
    category: "Funcional" | "Não funcional" | "Integração" | "Relatório" | "Migração";
    priority: "Alta" | "Média" | "Baixa"; acceptanceCriteria: string; responsible: string;
  }>({ title: "", description: "", module: ws.module || "", category: "Funcional", priority: "Média", acceptanceCriteria: "", responsible: "" });
  const { data: transcripts = [], refetch: refetchT } = trpc.workflow.workshops.transcripts.list.useQuery({ workshopId: ws.id });
  const { data: minutes, refetch: refetchMinutes } = trpc.workflow.workshops.minutes.get.useQuery({ workshopId: ws.id });
  const createT = trpc.workflow.workshops.transcripts.create.useMutation({ onSuccess: () => { refetchT(); setTranscriptContent(""); setTranscriptTitle(""); toast.success("Transcrição adicionada"); } });
  const transcribeAudio = trpc.workflow.workshops.transcripts.transcribe.useMutation({
    onSuccess: data => { refetchT(); setAudioFile(null); toast.success(`Áudio transcrito${data.duration ? ` (${Math.round(data.duration / 60)} min)` : ""}`); },
    onError: error => toast.error(error.message || "Erro ao transcrever áudio"),
  });
  const generateMinutes = trpc.workflow.workshops.minutes.generate.useMutation({ onSuccess: () => { refetchMinutes(); toast.success("Ata gerada com sucesso!"); } });
  const updateWorkshop = trpc.workflow.workshops.update.useMutation({ onSuccess: (_result, variables) => { onUpdated(variables.data); toast.success("Workshop atualizado"); }, onError: error => toast.error(error.message) });
  const { data: requirements = [], refetch: refetchRequirements } = trpc.workflow.requirements.list.useQuery({ projectId, workshopId: ws.id });
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const { data: lookups } = trpc.settings.getLookups.useQuery();
  const modules = (lookups?.fronts || []).filter((item: any) => item.active).map((item: any) => item.value);
  const createRequirement = trpc.workflow.requirements.create.useMutation({
    onSuccess: () => {
      refetchRequirements();
      setRequirementForm({ title: "", description: "", module: ws.module || "", category: "Funcional", priority: "Média", acceptanceCriteria: "", responsible: "" });
      toast.success("Requisito do cliente adicionado");
    },
    onError: error => toast.error(error.message || "Erro ao adicionar requisito"),
  });
  const updateRequirement = trpc.workflow.requirements.update.useMutation({ onSuccess: () => refetchRequirements(), onError: error => toast.error(error.message) });
  const deleteRequirement = trpc.workflow.requirements.delete.useMutation({ onSuccess: () => { refetchRequirements(); toast.success("Requisito removido"); } });
  const submitAudio = async () => {
    if (!audioFile) return;
    if (audioFile.size > 16 * 1024 * 1024) { toast.error("O áudio deve ter no máximo 16 MB"); return; }
    const contentType = normalizeAudioType(audioFile);
    if (!contentType) { toast.error("Formato de áudio não suportado"); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(audioFile); });
    transcribeAudio.mutate({ workshopId: ws.id, fileName: audioFile.name, contentType, base64: dataUrl.split(",")[1] || "", language: "pt" });
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><CardTitle>{ws.title}</CardTitle>{ws.participants?.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Participantes: {ws.participants.join(", ")}</p>}</div>
          <div className="flex items-center gap-2"><Select value={ws.status || "Planejado"} onValueChange={status => updateWorkshop.mutate({ id: ws.id, data: { status: status as "Planejado" | "Agendado" | "Realizado" | "Concluído" | "Cancelado" } })}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Planejado">Planejado</SelectItem><SelectItem value="Agendado">Agendado</SelectItem><SelectItem value="Realizado">Realizado</SelectItem><SelectItem value="Concluído">Concluído</SelectItem><SelectItem value="Cancelado">Cancelado</SelectItem></SelectContent></Select><Button variant="ghost" onClick={onClose}>Fechar</Button></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
          <div><p className="text-xs font-medium uppercase text-muted-foreground">Objetivo</p><p className="mt-1 whitespace-pre-wrap text-sm">{ws.objective || "Não informado"}</p></div>
          <div><p className="text-xs font-medium uppercase text-muted-foreground">O que será apresentado</p><p className="mt-1 whitespace-pre-wrap text-sm">{ws.content || "Não informado"}</p></div>
          {ws.agenda?.length > 0 && <div><p className="text-xs font-medium uppercase text-muted-foreground">Agenda</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{ws.agenda.map((item: string) => <li key={item}>{item}</li>)}</ul></div>}
          {ws.requiredRoles?.length > 0 && <div><p className="text-xs font-medium uppercase text-muted-foreground">Funções necessárias</p><div className="mt-2 flex flex-wrap gap-1">{ws.requiredRoles.map((item: string) => <Badge key={item} variant="secondary">{item}</Badge>)}</div></div>}
          {ws.expectedOutcomes?.length > 0 && <div><p className="text-xs font-medium uppercase text-muted-foreground">Resultados esperados</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{ws.expectedOutcomes.map((item: string) => <li key={item}>{item}</li>)}</ul></div>}
          {ws.prerequisites?.length > 0 && <div><p className="text-xs font-medium uppercase text-muted-foreground">Pré-requisitos</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{ws.prerequisites.map((item: string) => <li key={item}>{item}</li>)}</ul></div>}
          {ws.presentationFiles?.length > 0 && <div className="md:col-span-2"><p className="text-xs font-medium uppercase text-muted-foreground">Modelo da apresentação</p><div className="mt-2 flex flex-wrap gap-2">{ws.presentationFiles.map((file: any) => <Button key={file.url} variant="outline" size="sm" asChild><a href={file.url} target="_blank" rel="noreferrer"><Paperclip className="mr-2 h-4 w-4" />{file.name}<ExternalLink className="ml-2 h-3 w-3" /></a></Button>)}</div></div>}
        </div>
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2"><ClipboardList className="h-4 w-4" />Requisitos do Cliente ({requirements.length})</h3>
            <Badge variant="secondary">Usados na geração do DCD</Badge>
          </div>
          {requirements.length > 0 && (
            <div className="grid gap-2">
              {requirements.map((requirement: any) => (
                <div key={requirement.id} className="rounded-md border bg-muted/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{requirement.title}</p>
                        <Badge variant={requirement.priority === "Alta" ? "destructive" : "outline"}>{requirement.priority}</Badge>
                        {requirement.module && <Badge variant="secondary">{requirement.module}</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{requirement.description}</p>
                      {requirement.acceptanceCriteria && <p className="mt-2 text-xs"><strong>Critérios de aceite:</strong> {requirement.acceptanceCriteria}</p>}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteRequirement.mutate({ id: requirement.id })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Select value={requirement.status} onValueChange={status => updateRequirement.mutate({ id: requirement.id, data: { status: status as "Identificado" | "Em análise" | "Validado" | "Descartado" } })}>
                      <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Identificado">Identificado</SelectItem><SelectItem value="Em análise">Em análise</SelectItem><SelectItem value="Validado">Validado</SelectItem><SelectItem value="Descartado">Descartado</SelectItem></SelectContent>
                    </Select>
                    {requirement.responsible && <span className="text-xs text-muted-foreground">Responsável: {requirement.responsible}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-3 border-t pt-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Título do requisito *</Label><Input value={requirementForm.title} onChange={e => setRequirementForm(form => ({ ...form, title: e.target.value }))} placeholder="Ex: Aprovação de pedidos por alçada" /></div>
              <div><Label>Frente/Módulo</Label><Select value={requirementForm.module || "unassigned"} onValueChange={module => setRequirementForm(form => ({ ...form, module: module === "unassigned" ? "" : module }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Sem frente definida</SelectItem>{modules.map((module: string) => <SelectItem key={module} value={module}>{module}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div><Label>Descrição *</Label><Textarea value={requirementForm.description} onChange={e => setRequirementForm(form => ({ ...form, description: e.target.value }))} placeholder="Descreva o que o cliente precisa e o contexto de negócio" /></div>
            <div><Label>Critérios de aceite</Label><Textarea value={requirementForm.acceptanceCriteria} onChange={e => setRequirementForm(form => ({ ...form, acceptanceCriteria: e.target.value }))} placeholder="Como saberemos que o requisito foi atendido?" rows={2} /></div>
            <div className="grid gap-3 md:grid-cols-3">
              <div><Label>Categoria</Label><Select value={requirementForm.category} onValueChange={category => setRequirementForm(form => ({ ...form, category: category as typeof form.category }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Funcional">Funcional</SelectItem><SelectItem value="Não funcional">Não funcional</SelectItem><SelectItem value="Integração">Integração</SelectItem><SelectItem value="Relatório">Relatório</SelectItem><SelectItem value="Migração">Migração</SelectItem></SelectContent></Select></div>
              <div><Label>Prioridade</Label><Select value={requirementForm.priority} onValueChange={priority => setRequirementForm(form => ({ ...form, priority: priority as typeof form.priority }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Alta">Alta</SelectItem><SelectItem value="Média">Média</SelectItem><SelectItem value="Baixa">Baixa</SelectItem></SelectContent></Select></div>
              <div><Label>Responsável</Label><Select value={requirementForm.responsible || "unassigned"} onValueChange={responsible => setRequirementForm(form => ({ ...form, responsible: responsible === "unassigned" ? "" : responsible }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Não atribuído</SelectItem>{resources.map((resource: any) => <SelectItem key={resource.id} value={resource.name}>{resource.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <Button className="w-fit" onClick={() => createRequirement.mutate({ projectId, workshopId: ws.id, ...requirementForm })} disabled={!requirementForm.title.trim() || !requirementForm.description.trim() || createRequirement.isPending}>
              <CheckCircle2 className="mr-2 h-4 w-4" />Adicionar requisito
            </Button>
          </div>
        </div>
        <div>
          <h3 className="font-semibold mb-2 flex items-center gap-2"><FileText className="h-4 w-4" />Transcrições ({transcripts.length})</h3>
          {transcripts.map((t: any) => (
            <div key={t.id} className="border rounded p-2 mb-2 text-sm">
              <p className="font-medium">{t.title || "Transcrição"}</p>
              <p className="text-muted-foreground line-clamp-2">{t.content?.slice(0, 200)}</p>
            </div>
          ))}
          <div className="grid gap-2 mt-2">
            <Input placeholder="Título da transcrição" value={transcriptTitle} onChange={e => setTranscriptTitle(e.target.value)} />
            <Textarea placeholder="Cole a transcrição aqui..." value={transcriptContent} onChange={e => setTranscriptContent(e.target.value)} rows={4} />
            <Button variant="outline" onClick={() => createT.mutate({ workshopId: ws.id, content: transcriptContent || transcriptTitle })} disabled={!transcriptContent}>
              <Upload className="h-4 w-4 mr-2" />Adicionar Transcrição
            </Button>
            <div className="grid gap-2 rounded-md border border-dashed p-3">
              <div><Label>Transcrição automática de áudio</Label><p className="text-xs text-muted-foreground">MP3, WAV, WebM, OGG ou M4A, até 16 MB.</p></div>
              <Input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/webm,audio/ogg,audio/mp4,audio/m4a" onChange={event => setAudioFile(event.target.files?.[0] || null)} />
              <Button variant="outline" onClick={() => void submitAudio()} disabled={!audioFile || transcribeAudio.isPending}><AudioLines className="mr-2 h-4 w-4" />{transcribeAudio.isPending ? "Enviando e transcrevendo..." : "Transcrever áudio"}</Button>
            </div>
          </div>
        </div>
        <div>
          <h3 className="font-semibold mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4" />Ata de Reunião</h3>
          {minutes ? (
            <div className="border rounded p-3 text-sm whitespace-pre-wrap">{(minutes as any).content}</div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma ata gerada ainda.</p>
          )}
          <Button className="mt-2" onClick={() => generateMinutes.mutate({ workshopId: ws.id })} disabled={generateMinutes.isPending || transcripts.length === 0}>
            <Sparkles className="h-4 w-4 mr-2" />{generateMinutes.isPending ? "Gerando..." : "Gerar Ata (IA)"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
