import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Trash2, Search, Settings2, BrainCircuit, RotateCcw, Pencil, Sparkles, ClipboardCheck, BookTemplate } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

import { useWorkflowProject } from "./useWorkflowProject";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";

export default function ConfigurationsPage() {
  const { projectId: PROJECT_ID } = useWorkflowProject();
  const { user } = useAuth();
  const isAdmin = (user as any)?.appRole === "admin" || user?.role === "admin";
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ description: "", module: "", category: "Configuração", responsible: "", scopeItemIds: [] as string[] });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkResponsible, setBulkResponsible] = useState("");
  const [editingPrompt, setEditingPrompt] = useState<any>(null);
  const [sourceDcdId, setSourceDcdId] = useState("");
  const [configurationToDelete, setConfigurationToDelete] = useState<any>(null);

  const { data: configs = [], refetch } = trpc.workflow.configurations.list.useQuery({ projectId: PROJECT_ID });
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const { data: dcds = [] } = trpc.workflow.dcd.list.useQuery({ projectId: PROJECT_ID });
  const { data: scopeItems = [] } = trpc.workflow.scopeItems.list.useQuery({ projectId: PROJECT_ID });
  const { data: lookups } = trpc.settings.getLookups.useQuery();
  const modules = (lookups?.fronts || []).filter((item: any) => item.active).map((item: any) => item.value);
  const { data: prompts = [], refetch: refetchPrompts } = trpc.workflow.prompts.list.useQuery();
  const { data: llmModels = [] } = trpc.workflow.prompts.models.useQuery(undefined, { enabled: isAdmin });
  const createMut = trpc.workflow.configurations.create.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); toast.success("Configuração criada"); } });
  const deleteMut = trpc.workflow.configurations.delete.useMutation({ onSuccess: () => { refetch(); setConfigurationToDelete(null); toast.success("Configuração removida"); }, onError: error => toast.error(error.message) });
  const updateMut = trpc.workflow.configurations.update.useMutation({ onSuccess: () => { refetch(); } });
  const bulkUpdate = trpc.workflow.configurations.bulkUpdate.useMutation({ onSuccess: data => { refetch(); setSelectedIds([]); toast.success(`${data.updated} configurações atualizadas`); }, onError: error => toast.error(error.message) });
  const updatePrompt = trpc.workflow.prompts.update.useMutation({ onSuccess: () => { refetchPrompts(); setEditingPrompt(null); toast.success("Prompt atualizado"); }, onError: error => toast.error(error.message) });
  const resetPrompt = trpc.workflow.prompts.reset.useMutation({ onSuccess: () => { refetchPrompts(); setEditingPrompt(null); toast.success("Prompt padrão restaurado"); }, onError: error => toast.error(error.message) });
  const generateFromDcd = trpc.workflow.configurations.generateFromDcd.useMutation({ onSuccess: data => { refetch(); toast.success(`${data.added} configurações extraídas${data.ignored ? ` · ${data.ignored} já existentes` : ""}`); }, onError: error => toast.error(error.message) });
  const generateFromBdcq = trpc.workflow.configurations.generateFromBdcq.useMutation({ onSuccess: data => { refetch(); toast.success(`${data.added} configurações geradas do BDCQ${data.ignored ? ` · ${data.ignored} já existentes` : ""}`); }, onError: error => toast.error(error.message) });
  const applyTemplates = trpc.workflow.configurations.templates.applyToProject.useMutation({ onSuccess: data => { refetch(); toast.success(`${data.added} modelos aplicados${data.ignored ? ` · ${data.ignored} não aplicáveis ou existentes` : ""}`); }, onError: error => toast.error(error.message) });

  const filtered = configs.filter((c: any) => c.description?.toLowerCase().includes(search.toLowerCase()) || c.category?.toLowerCase().includes(search.toLowerCase()) || c.module?.toLowerCase().includes(search.toLowerCase()));
  const doneCount = configs.filter((c: any) => c.status === "Concluído").length;
  const applyBulk = () => {
    const data: { status?: string; responsible?: string } = {};
    if (bulkStatus) data.status = bulkStatus;
    if (bulkResponsible) data.responsible = bulkResponsible === "unassigned" ? "" : bulkResponsible;
    if (!Object.keys(data).length) { toast.error("Escolha uma alteração para aplicar"); return; }
    bulkUpdate.mutate({ projectId: PROJECT_ID, ids: selectedIds, data });
  };

  return (
    <div className="space-y-4 p-3 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-muted-foreground text-sm">Checklist de configurações a executar no sistema</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={() => generateFromBdcq.mutate({ projectId: PROJECT_ID })} disabled={generateFromBdcq.isPending}><ClipboardCheck className="mr-2 h-4 w-4" />{generateFromBdcq.isPending ? "Gerando..." : "Gerar do BDCQ"}</Button>
          <Button variant="outline" onClick={() => applyTemplates.mutate({ projectId: PROJECT_ID })} disabled={applyTemplates.isPending}><BookTemplate className="mr-2 h-4 w-4" />{applyTemplates.isPending ? "Aplicando..." : "Aplicar modelos"}</Button>
          <Select value={sourceDcdId} onValueChange={setSourceDcdId}><SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Selecione um DCD" /></SelectTrigger><SelectContent>{dcds.map((dcd: any) => <SelectItem key={dcd.id} value={dcd.id}>{dcd.title}</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" onClick={() => generateFromDcd.mutate({ projectId: PROJECT_ID, dcdId: sourceDcdId })} disabled={!sourceDcdId || generateFromDcd.isPending}><Sparkles className="mr-2 h-4 w-4" />{generateFromDcd.isPending ? "Extraindo..." : "Gerar do DCD"}</Button>
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />Nova Configuração</Button>
        </div>
      </div>

      {selectedIds.length > 0 && <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3"><Badge>{selectedIds.length} selecionadas</Badge><div><Label className="text-xs">Novo status</Label><Select value={bulkStatus || "keep"} onValueChange={value => setBulkStatus(value === "keep" ? "" : value)}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="keep">Manter status</SelectItem><SelectItem value="Pendente">Pendente</SelectItem><SelectItem value="Em Progresso">Em Progresso</SelectItem><SelectItem value="Concluído">Concluído</SelectItem><SelectItem value="Bloqueado">Bloqueado</SelectItem></SelectContent></Select></div><div><Label className="text-xs">Responsável</Label><Select value={bulkResponsible || "keep"} onValueChange={value => setBulkResponsible(value === "keep" ? "" : value)}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="keep">Manter responsável</SelectItem><SelectItem value="unassigned">Sem responsável</SelectItem>{resources.map((resource: any) => <SelectItem key={resource.id} value={resource.name}>{resource.name}</SelectItem>)}</SelectContent></Select></div><Button onClick={applyBulk} disabled={bulkUpdate.isPending}>Aplicar em lote</Button></div>}

      <div className="flex flex-wrap items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar configurações..." value={search} onChange={e => setSearch(e.target.value)} className="min-w-0 flex-1 basis-full sm:max-w-sm sm:basis-auto" />
        <Badge variant="secondary">{filtered.length} itens</Badge>
        <Badge variant="outline" className="bg-green-50 text-green-700">{doneCount}/{configs.length} concluídos</Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><BrainCircuit className="h-5 w-5" />Prompts de IA</CardTitle>
          <p className="text-sm text-muted-foreground">Instruções usadas na agenda, atas, DCDs, refinamento e extrações estruturadas.</p>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {prompts.map((prompt: any) => (
            <div key={prompt.key} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-medium">{prompt.name}</p><p className="mt-1 text-xs text-muted-foreground">{prompt.description}</p></div>
                <Badge variant={prompt.isCustomized ? "default" : "outline"}>{prompt.isCustomized ? "Personalizado" : "Padrão"}</Badge>
              </div>
              <p className="mt-3 line-clamp-3 text-xs text-muted-foreground">{prompt.systemPrompt}</p>
              {isAdmin && <Button className="mt-3" size="sm" variant="outline" onClick={() => setEditingPrompt({ ...prompt })}><Pencil className="mr-2 h-3.5 w-3.5" />Editar</Button>}
            </div>
          ))}
          {!isAdmin && <p className="col-span-full text-xs text-muted-foreground">Somente administradores podem alterar os prompts.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"><Checkbox checked={filtered.length > 0 && selectedIds.length === filtered.length} onCheckedChange={checked => setSelectedIds(checked ? filtered.map((item: any) => item.id) : [])} /></TableHead>
                <TableHead className="w-[40px]">Feita</TableHead>
                <TableHead>Configuração</TableHead>
                <TableHead>Módulo/Tipo</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma configuração cadastrada.</TableCell></TableRow>
              ) : filtered.map((c: any) => (
                <TableRow key={c.id} className={c.status === "Concluído" ? "opacity-60" : ""}>
                  <TableCell><Checkbox checked={selectedIds.includes(c.id)} onCheckedChange={() => setSelectedIds(current => current.includes(c.id) ? current.filter(id => id !== c.id) : [...current, c.id])} /></TableCell>
                  <TableCell>
                    <Checkbox checked={c.status === "Concluído"} onCheckedChange={(checked) => updateMut.mutate({ id: c.id, data: { status: checked ? "Concluído" : "Pendente" } })} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-teal-500" />{c.description}</div>
                    <div className="mt-1 flex flex-wrap gap-1"><Badge variant="outline" className="text-[10px]">{c.source === "bdcq" ? "Origem: BDCQ" : c.source === "template" ? "Origem: modelo admin" : c.source === "dcd" ? "Origem: DCD" : "Origem: manual"}</Badge>{(c.scopeItemIds || []).map((id: string) => { const scope = scopeItems.find((item: any) => item.id === id); return scope ? <Badge key={id} variant="secondary" className="text-[10px]">Scope: {scope.code || scope.name}</Badge> : null; })}</div>
                  </TableCell>
                  <TableCell><div className="flex gap-1">{c.module && <Badge variant="secondary">{c.module}</Badge>}<Badge variant="outline">{c.category || "Configuração"}</Badge></div></TableCell>
                  <TableCell><Select value={c.responsible || "unassigned"} onValueChange={responsible => updateMut.mutate({ id: c.id, data: { responsible: responsible === "unassigned" ? "" : responsible } })}><SelectTrigger className="h-7 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Sem responsável</SelectItem>{resources.map((resource: any) => <SelectItem key={resource.id} value={resource.name}>{resource.name}</SelectItem>)}</SelectContent></Select></TableCell>
                  <TableCell>
                    <Select value={c.status || "Pendente"} onValueChange={(v: string) => updateMut.mutate({ id: c.id, data: { status: v } })}>
                      <SelectTrigger className="h-7 w-[120px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pendente">Pendente</SelectItem>
                        <SelectItem value="Em Progresso">Em Progresso</SelectItem>
                        <SelectItem value="Concluído">Concluído</SelectItem>
                        <SelectItem value="Bloqueado">Bloqueado</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => setConfigurationToDelete(c)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Configuração</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Descrição *</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v: string) => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Configuração">Configuração</SelectItem>
                    <SelectItem value="Customizing">Customizing</SelectItem>
                    <SelectItem value="Extensão">Extensão</SelectItem>
                    <SelectItem value="Migração">Migração</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Frente/Módulo</Label><Select value={form.module || "unassigned"} onValueChange={module => setForm(current => ({ ...current, module: module === "unassigned" ? "" : module }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Sem frente definida</SelectItem>{modules.map((module: string) => <SelectItem key={module} value={module}>{module}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div><Label>Responsável</Label><Select value={form.responsible || "unassigned"} onValueChange={responsible => setForm(current => ({ ...current, responsible: responsible === "unassigned" ? "" : responsible }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Sem responsável</SelectItem>{resources.map((resource: any) => <SelectItem key={resource.id} value={resource.name}>{resource.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Scope items relacionados</Label><div className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">{scopeItems.filter((item: any) => !form.module || item.module === form.module).map((item: any) => <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-muted"><Checkbox checked={form.scopeItemIds.includes(item.id)} onCheckedChange={() => setForm(current => ({ ...current, scopeItemIds: current.scopeItemIds.includes(item.id) ? current.scopeItemIds.filter(id => id !== item.id) : [...current.scopeItemIds, item.id] }))} /><span>{item.code ? `${item.code} - ` : ""}{item.name}</span><Badge variant="outline" className="ml-auto">{item.module}</Badge></label>)}</div></div>
          </div>
          <DialogFooter><Button onClick={() => createMut.mutate({ projectId: PROJECT_ID, ...form })} disabled={!form.description}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingPrompt} onOpenChange={open => { if (!open) setEditingPrompt(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar prompt: {editingPrompt?.name}</DialogTitle></DialogHeader>
          <div className="grid gap-2">
            <Label>System prompt</Label>
            <Textarea className="min-h-64 font-mono text-sm" value={editingPrompt?.systemPrompt || ""} onChange={event => setEditingPrompt((current: any) => ({ ...current, systemPrompt: event.target.value }))} />
            <Label>Modelo para esta tarefa</Label>
            {llmModels.length > 0 ? (
              <Select value={editingPrompt?.model || "default"} onValueChange={model => setEditingPrompt((current: any) => ({ ...current, model: model === "default" ? "" : model }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="default">Modelo padrão do ambiente</SelectItem>{llmModels.map((model: any) => <SelectItem key={model.id} value={model.id}>{model.id}</SelectItem>)}</SelectContent>
              </Select>
            ) : <Input value={editingPrompt?.model || ""} onChange={event => setEditingPrompt((current: any) => ({ ...current, model: event.target.value }))} placeholder="Vazio usa o modelo padrão do ambiente" />}
            <p className="text-xs text-muted-foreground">A alteração passa a valer nas próximas chamadas de IA.</p>
          </div>
          <DialogFooter className="justify-between sm:justify-between">
            <Button variant="outline" onClick={() => resetPrompt.mutate({ key: editingPrompt.key })} disabled={!editingPrompt?.isCustomized || resetPrompt.isPending}><RotateCcw className="mr-2 h-4 w-4" />Restaurar padrão</Button>
            <Button onClick={() => updatePrompt.mutate({ key: editingPrompt.key, systemPrompt: editingPrompt.systemPrompt, model: editingPrompt.model || undefined })} disabled={(editingPrompt?.systemPrompt?.trim().length || 0) < 40 || updatePrompt.isPending}>Salvar prompt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DeleteConfirmationDialog open={Boolean(configurationToDelete)} onOpenChange={open => !open && setConfigurationToDelete(null)} title="Excluir esta configuração?" description={`A configuração “${configurationToDelete?.description || ""}” será removida do checklist e deixará de aparecer no trabalho relacionado. Esta ação não pode ser desfeita.`} pending={deleteMut.isPending} onConfirm={() => configurationToDelete && deleteMut.mutate({ id: configurationToDelete.id })} />
    </div>
  );
}
