import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Trash2, Search, Sparkles, AlertTriangle, Columns3, Table2, GripVertical } from "lucide-react";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import { useWorkflowProject } from "./useWorkflowProject";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";

const GAP_COLUMNS = [
  { status: "Aberto", label: "Identificado", color: "border-slate-300" },
  { status: "Em Análise", label: "Em análise", color: "border-amber-300" },
  { status: "Resolvido", label: "Resolvido", color: "border-emerald-300" },
  { status: "Aceito", label: "Aceito", color: "border-blue-300" },
] as const;

function GapKanbanCard({ gap, onDelete }: { gap: any; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: gap.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }} className={`rounded-md border bg-background p-3 shadow-sm ${isDragging ? "z-50 opacity-60 shadow-lg" : ""}`}>
      <div className="flex items-start gap-2">
        <button className="mt-0.5 cursor-grab touch-none text-muted-foreground active:cursor-grabbing" {...listeners} {...attributes} aria-label="Mover gap"><GripVertical className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{gap.description}</p>
          <div className="mt-2 flex flex-wrap gap-1"><Badge variant="outline">{gap.module || "Geral"}</Badge><Badge variant={gap.impact === "Alto" ? "destructive" : gap.impact === "Médio" ? "secondary" : "outline"}>{gap.impact}</Badge></div>
          <p className="mt-2 text-xs text-muted-foreground">{gap.responsible ? `Responsável: ${gap.responsible}` : "Sem responsável"}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(gap.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

function GapKanbanColumn({ column, gaps, onDelete }: { column: typeof GAP_COLUMNS[number]; gaps: any[]; onDelete: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  return (
    <div ref={setNodeRef} className={`min-h-72 rounded-lg border-t-4 bg-muted/30 p-3 ${column.color} ${isOver ? "ring-2 ring-primary/40" : ""}`}>
      <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{column.label}</h3><Badge variant="secondary">{gaps.length}</Badge></div>
      <div className="grid gap-2">{gaps.map(gap => <GapKanbanCard key={gap.id} gap={gap} onDelete={onDelete} />)}{gaps.length === 0 && <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">Arraste um gap para cá</p>}</div>
    </div>
  );
}

export default function GapsPage() {
  const { projectId: PROJECT_ID } = useWorkflowProject();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showExtract, setShowExtract] = useState(false);
  const [view, setView] = useState<"table" | "kanban">("kanban");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkResponsible, setBulkResponsible] = useState("");
  const [gapToDelete, setGapToDelete] = useState<any>(null);
  const [form, setForm] = useState<{
    description: string;
    module: string;
    impact: "Alto" | "Médio" | "Baixo";
    responsible: string;
  }>({ description: "", module: "", impact: "Médio", responsible: "" });

  const { data: gaps = [], refetch } = trpc.workflow.gaps.list.useQuery({ projectId: PROJECT_ID });
  const { data: dcds = [] } = trpc.workflow.dcd.list.useQuery({ projectId: PROJECT_ID });
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const createMut = trpc.workflow.gaps.create.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); toast.success("Gap criado"); } });
  const deleteMut = trpc.workflow.gaps.delete.useMutation({ onSuccess: () => { refetch(); setGapToDelete(null); toast.success("Gap removido"); }, onError: error => toast.error(error.message) });
  const updateMut = trpc.workflow.gaps.update.useMutation({ onSuccess: () => { refetch(); toast.success("Gap atualizado"); }, onError: error => toast.error(error.message || "Erro ao atualizar gap") });
  const bulkUpdate = trpc.workflow.gaps.bulkUpdate.useMutation({ onSuccess: data => { refetch(); setSelectedIds([]); toast.success(`${data.updated} gaps atualizados`); }, onError: error => toast.error(error.message) });
  const extractMut = trpc.workflow.gaps.extractFromDcd.useMutation({
    onSuccess: (data: any) => { refetch(); setShowExtract(false); toast.success(`${data.extracted} gaps extraídos`); },
    onError: () => toast.error("Erro ao extrair gaps"),
  });

  const filtered = gaps.filter((g: any) => g.description?.toLowerCase().includes(search.toLowerCase()) || g.module?.toLowerCase().includes(search.toLowerCase()));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const gap = gaps.find((item: any) => item.id === active.id);
    const column = GAP_COLUMNS.find(item => item.status === String(over.id));
    if (!gap || !column || gap.status === column.status) return;
    updateMut.mutate({ id: gap.id, data: { status: column.status } });
  };
  const toggleSelected = (id: string) => setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const applyBulk = () => {
    const data: { status?: "Aberto" | "Em Análise" | "Resolvido" | "Aceito"; responsible?: string } = {};
    if (bulkStatus) data.status = bulkStatus as typeof data.status;
    if (bulkResponsible) data.responsible = bulkResponsible === "unassigned" ? "" : bulkResponsible;
    if (!Object.keys(data).length) { toast.error("Escolha uma alteração para aplicar"); return; }
    bulkUpdate.mutate({ projectId: PROJECT_ID, ids: selectedIds, data });
  };

  const priorityColor = (p: string) => {
    if (p === "Alta" || p === "High") return "destructive" as const;
    if (p === "Média" || p === "Medium") return "secondary" as const;
    return "outline" as const;
  };

  return (
    <div className="space-y-4 p-3 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gaps</h1>
          <p className="text-muted-foreground text-sm">Funcionalidades não cobertas pelo padrão SAP</p>
        </div>
        <div className="flex flex-col gap-2 min-[420px]:flex-row sm:flex-wrap sm:justify-end">
          {dcds.length > 0 && (
            <Button variant="outline" onClick={() => setShowExtract(true)}>
              <Sparkles className="h-4 w-4 mr-2" />Extrair do DCD (IA)
            </Button>
          )}
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />Novo Gap</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar gaps..." value={search} onChange={e => setSearch(e.target.value)} className="min-w-0 flex-1 basis-full sm:max-w-sm sm:basis-auto" />
        <Badge variant="secondary">{filtered.length} gaps</Badge>
        <div className="flex w-full rounded-md border p-1 sm:ml-auto sm:w-auto">
          <Button size="sm" variant={view === "kanban" ? "secondary" : "ghost"} onClick={() => setView("kanban")}><Columns3 className="mr-2 h-4 w-4" />Kanban</Button>
          <Button size="sm" variant={view === "table" ? "secondary" : "ghost"} onClick={() => setView("table")}><Table2 className="mr-2 h-4 w-4" />Tabela</Button>
        </div>
      </div>

      {view === "kanban" ? (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid gap-4 overflow-x-auto md:grid-cols-2 xl:grid-cols-4">
            {GAP_COLUMNS.map(column => <GapKanbanColumn key={column.status} column={column} gaps={filtered.filter((gap: any) => (gap.status || "Aberto") === column.status)} onDelete={id => setGapToDelete(gaps.find((gap: any) => gap.id === id))} />)}
          </div>
        </DndContext>
      ) : <div className="space-y-3">{selectedIds.length > 0 && <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3"><Badge>{selectedIds.length} selecionados</Badge><div><Label className="text-xs">Novo status</Label><Select value={bulkStatus || "keep"} onValueChange={value => setBulkStatus(value === "keep" ? "" : value)}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="keep">Manter status</SelectItem>{GAP_COLUMNS.map(column => <SelectItem key={column.status} value={column.status}>{column.label}</SelectItem>)}</SelectContent></Select></div><div><Label className="text-xs">Responsável</Label><Select value={bulkResponsible || "keep"} onValueChange={value => setBulkResponsible(value === "keep" ? "" : value)}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="keep">Manter responsável</SelectItem><SelectItem value="unassigned">Sem responsável</SelectItem>{resources.map((resource: any) => <SelectItem key={resource.id} value={resource.name}>{resource.name}</SelectItem>)}</SelectContent></Select></div><Button onClick={applyBulk} disabled={bulkUpdate.isPending}>Aplicar em lote</Button></div>}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><Checkbox checked={filtered.length > 0 && selectedIds.length === filtered.length} onCheckedChange={checked => setSelectedIds(checked ? filtered.map((gap: any) => gap.id) : [])} /></TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Impacto</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum gap identificado.</TableCell></TableRow>
              ) : filtered.map((g: any) => (
                <TableRow key={g.id}>
                  <TableCell><Checkbox checked={selectedIds.includes(g.id)} onCheckedChange={() => toggleSelected(g.id)} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />{g.description}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{g.module || "Geral"}</Badge></TableCell>
                  <TableCell><Badge variant={priorityColor(g.impact)}>{g.impact}</Badge></TableCell>
                  <TableCell><Select value={g.responsible || "unassigned"} onValueChange={responsible => updateMut.mutate({ id: g.id, data: { responsible: responsible === "unassigned" ? "" : responsible } })}><SelectTrigger className="h-7 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Sem responsável</SelectItem>{resources.map((resource: any) => <SelectItem key={resource.id} value={resource.name}>{resource.name}</SelectItem>)}</SelectContent></Select></TableCell>
                  <TableCell>
                    <Select value={g.status || "Aberto"} onValueChange={(v: string) => updateMut.mutate({ id: g.id, data: { status: v as "Aberto" | "Em Análise" | "Resolvido" | "Aceito" } })}>
                      <SelectTrigger className="h-7 w-[110px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Aberto">Identificado</SelectItem>
                        <SelectItem value="Em Análise">Em Análise</SelectItem>
                        <SelectItem value="Resolvido">Resolvido</SelectItem>
                        <SelectItem value="Aceito">Aceito</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => setGapToDelete(g)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card></div>}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Gap</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Descrição *</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><Label>Módulo</Label><Input value={form.module} onChange={e => setForm(f => ({ ...f, module: e.target.value }))} placeholder="SD, MM, FI..." /></div>
              <div><Label>Impacto</Label><Select value={form.impact} onValueChange={(impact: "Alto" | "Médio" | "Baixo") => setForm(f => ({ ...f, impact }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Alto">Alto</SelectItem><SelectItem value="Médio">Médio</SelectItem><SelectItem value="Baixo">Baixo</SelectItem></SelectContent></Select></div>
            </div>
            <div><Label>Responsável</Label><Select value={form.responsible || "unassigned"} onValueChange={responsible => setForm(current => ({ ...current, responsible: responsible === "unassigned" ? "" : responsible }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Sem responsável</SelectItem>{resources.map((resource: any) => <SelectItem key={resource.id} value={resource.name}>{resource.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter><Button onClick={() => createMut.mutate({ projectId: PROJECT_ID, ...form })} disabled={!form.description}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExtract} onOpenChange={setShowExtract}>
        <DialogContent>
          <DialogHeader><DialogTitle>Extrair Gaps do DCD (IA)</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Selecione um DCD para a IA extrair automaticamente os gaps.</p>
          <div className="grid gap-2">
            {dcds.map((doc: any) => (
              <Button key={doc.id} variant="outline" className="justify-start" onClick={() => extractMut.mutate({ projectId: PROJECT_ID, dcdId: doc.id })} disabled={extractMut.isPending}>
                {doc.title}
              </Button>
            ))}
          </div>
          {extractMut.isPending && <p className="text-sm text-muted-foreground">Analisando documento...</p>}
        </DialogContent>
      </Dialog>
      <DeleteConfirmationDialog open={Boolean(gapToDelete)} onOpenChange={open => !open && setGapToDelete(null)} title="Excluir este gap?" description={`O gap “${gapToDelete?.description || ""}” e sua rastreabilidade operacional serão removidos. Esta ação não pode ser desfeita.`} pending={deleteMut.isPending} onConfirm={() => gapToDelete && deleteMut.mutate({ id: gapToDelete.id })} />
    </div>
  );
}
