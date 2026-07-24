import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  AlertTriangle,
  Clock3,
  Columns3,
  ExternalLink,
  GripVertical,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import { useWorkflowProject } from "./useWorkflowProject";
import { GeneratedModelItems } from "@/components/GeneratedModelItems";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";

const GAP_COLUMNS = [
  {
    status: "Aberto",
    label: "Identificado",
    color: "border-slate-300",
    accent: "bg-slate-500",
  },
  {
    status: "Em Análise",
    label: "Em análise",
    color: "border-amber-300",
    accent: "bg-amber-500",
  },
  {
    status: "Resolvido",
    label: "Resolvido",
    color: "border-emerald-300",
    accent: "bg-emerald-500",
  },
  {
    status: "Aceito",
    label: "Aceito",
    color: "border-blue-300",
    accent: "bg-blue-500",
  },
] as const;

type GapStatus = (typeof GAP_COLUMNS)[number]["status"];
type GapForm = {
  description: string;
  modules: string[];
  impact: "Alto" | "Médio" | "Baixo";
  responsible: string;
  abapHours: number;
  technicalHours: number;
  resolution: string;
  attachments: string[];
  status: GapStatus;
};

const EMPTY_FORM: GapForm = {
  description: "",
  modules: [],
  impact: "Médio",
  responsible: "",
  abapHours: 0,
  technicalHours: 0,
  resolution: "",
  attachments: [],
  status: "Aberto",
};

const gapModules = (gap: any) =>
  Array.isArray(gap.modules) && gap.modules.length
    ? gap.modules
    : gap.module
      ? [gap.module]
      : [];

const attachmentName = (url: string, index: number) =>
  decodeURIComponent(
    url
      .split("/")
      .pop()
      ?.split("?")[0]
      ?.replace(/^[\w-]+-/, "") || `Anexo ${index + 1}`
  );

function Hours({ gap }: { gap: any }) {
  const total = Number(gap.abapHours || 0) + Number(gap.technicalHours || 0);
  if (!total)
    return <span className="text-muted-foreground">Sem estimativa</span>;
  return (
    <span>
      {total}h{" "}
      <span className="text-muted-foreground">
        ({gap.abapHours || 0}h ABAP · {gap.technicalHours || 0}h técnico)
      </span>
    </span>
  );
}

function GapCardContent({ gap }: { gap: any }) {
  const modules = gapModules(gap);
  const totalHours =
    Number(gap.abapHours || 0) + Number(gap.technicalHours || 0);
  return (
    <div className="min-w-0 flex-1">
      <p className="line-clamp-3 text-sm font-semibold leading-snug">
        {gap.description}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {modules.length ? (
          modules.map((module: string) => (
            <Badge key={module} variant="outline" className="bg-background">
              {module}
            </Badge>
          ))
        ) : (
          <Badge variant="outline">Geral</Badge>
        )}
        <Badge
          variant={
            gap.impact === "Alto"
              ? "destructive"
              : gap.impact === "Médio"
                ? "secondary"
                : "outline"
          }
        >
          {gap.impact}
        </Badge>
      </div>
      <div className="mt-3 grid gap-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <UserRound className="h-3.5 w-3.5" />
          {gap.responsible || "Sem responsável"}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5" />
          {totalHours
            ? `${totalHours}h · ${gap.abapHours || 0}h ABAP · ${gap.technicalHours || 0}h técnico`
            : "Esforço não estimado"}
        </span>
        {gap.attachments?.length > 0 && (
          <span className="flex items-center gap-1.5 text-blue-700">
            <Paperclip className="h-3.5 w-3.5" />
            {gap.attachments.length} anexo(s)
          </span>
        )}
      </div>
    </div>
  );
}

function GapKanbanCard({
  gap,
  onOpen,
}: {
  gap: any;
  onOpen: (gap: any) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: gap.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`group rounded-lg border bg-background p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md ${isDragging ? "z-50 opacity-30" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-0.5 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          {...listeners}
          {...attributes}
          aria-label="Arrastar gap"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => onOpen(gap)}
        >
          <GapCardContent gap={gap} />
        </button>
      </div>
    </div>
  );
}

function GapKanbanColumn({
  column,
  gaps,
  onOpen,
}: {
  column: (typeof GAP_COLUMNS)[number];
  gaps: any[];
  onOpen: (gap: any) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[28rem] rounded-xl border border-t-4 bg-muted/30 p-3 transition ${column.color} ${isOver ? "bg-primary/5 ring-2 ring-primary/30" : ""}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${column.accent}`} />
          <h3 className="font-semibold">{column.label}</h3>
        </div>
        <Badge variant="secondary">{gaps.length}</Badge>
      </div>
      <div className="grid gap-2">
        {gaps.map(gap => (
          <GapKanbanCard key={gap.id} gap={gap} onOpen={onOpen} />
        ))}
        {gaps.length === 0 && (
          <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
            Arraste um gap para cá
          </p>
        )}
      </div>
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
  const [editingGap, setEditingGap] = useState<any>(null);
  const [activeGap, setActiveGap] = useState<any>(null);
  const [form, setForm] = useState<GapForm>(EMPTY_FORM);

  const { data: gaps = [], refetch } = trpc.workflow.gaps.list.useQuery({
    projectId: PROJECT_ID,
  });
  const { data: dcds = [] } = trpc.workflow.dcd.list.useQuery({
    projectId: PROJECT_ID,
  });
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const { data: lookups } = trpc.settings.getLookups.useQuery();
  const { data: scopeItems = [] } = trpc.workflow.scopeItems.list.useQuery({
    projectId: PROJECT_ID,
  });
  const moduleOptions = useMemo(
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

  const createMut = trpc.workflow.gaps.create.useMutation({
    onSuccess: () => {
      refetch();
      setShowAdd(false);
      setForm(EMPTY_FORM);
      toast.success("Gap criado");
    },
    onError: error => toast.error(error.message),
  });
  const deleteMut = trpc.workflow.gaps.delete.useMutation({
    onSuccess: () => {
      refetch();
      setGapToDelete(null);
      setEditingGap(null);
      toast.success("Gap removido");
    },
    onError: error => toast.error(error.message),
  });
  const updateMut = trpc.workflow.gaps.update.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Gap atualizado");
    },
    onError: error => toast.error(error.message || "Erro ao atualizar gap"),
  });
  const bulkUpdate = trpc.workflow.gaps.bulkUpdate.useMutation({
    onSuccess: data => {
      refetch();
      setSelectedIds([]);
      toast.success(`${data.updated} gaps atualizados`);
    },
    onError: error => toast.error(error.message),
  });
  const uploadAttachment = trpc.workflow.gaps.uploadAttachment.useMutation();
  const extractMut = trpc.workflow.gaps.extractFromDcd.useMutation({
    onSuccess: (data: any) => {
      refetch();
      setShowExtract(false);
      toast.success(`${data.extracted} gaps extraídos`);
    },
    onError: () => toast.error("Erro ao extrair gaps"),
  });

  const filtered = gaps.filter((gap: any) => {
    const term = search.toLowerCase();
    return (
      gap.description?.toLowerCase().includes(term) ||
      gapModules(gap).some((module: string) =>
        module.toLowerCase().includes(term)
      ) ||
      gap.responsible?.toLowerCase().includes(term)
    );
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const openGap = (gap: any) => {
    setEditingGap(gap);
    setForm({
      description: gap.description || "",
      modules: gapModules(gap),
      impact: gap.impact || "Médio",
      responsible: gap.responsible || "",
      abapHours: Number(gap.abapHours || 0),
      technicalHours: Number(gap.technicalHours || 0),
      resolution: gap.resolution || "",
      attachments: Array.isArray(gap.attachments) ? gap.attachments : [],
      status: gap.status || "Aberto",
    });
  };
  const toggleModule = (module: string) =>
    setForm(current => ({
      ...current,
      modules: current.modules.includes(module)
        ? current.modules.filter(item => item !== module)
        : [...current.modules, module],
    }));
  const saveGap = () => {
    const data = { ...form, module: form.modules[0] || "" };
    if (editingGap)
      updateMut.mutate(
        { id: editingGap.id, data },
        { onSuccess: () => setEditingGap(null) }
      );
    else createMut.mutate({ projectId: PROJECT_ID, ...data });
  };
  const handleAttachment = async (file?: File): Promise<void> => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("O anexo deve ter no máximo 10 MB");
      return;
    }
    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const uploaded = await uploadAttachment.mutateAsync({
        projectId: PROJECT_ID,
        fileName: file.name,
        fileData,
        contentType: file.type || "application/octet-stream",
      });
      setForm(current => ({
        ...current,
        attachments: [...current.attachments, uploaded.url],
      }));
      toast.success("Anexo adicionado");
    } catch {
      toast.error("Não foi possível anexar o arquivo");
    }
  };
  const handleDragStart = ({ active }: DragStartEvent) =>
    setActiveGap(gaps.find((item: any) => item.id === active.id));
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveGap(null);
    if (!over) return;
    const gap = gaps.find((item: any) => item.id === active.id);
    const column = GAP_COLUMNS.find(item => item.status === String(over.id));
    if (!gap || !column || gap.status === column.status) return;
    updateMut.mutate({ id: gap.id, data: { status: column.status } });
  };
  const toggleSelected = (id: string) =>
    setSelectedIds(current =>
      current.includes(id)
        ? current.filter(item => item !== id)
        : [...current, id]
    );
  const applyBulk = () => {
    const data: { status?: GapStatus; responsible?: string } = {};
    if (bulkStatus) data.status = bulkStatus as GapStatus;
    if (bulkResponsible)
      data.responsible =
        bulkResponsible === "unassigned" ? "" : bulkResponsible;
    if (!Object.keys(data).length)
      return toast.error("Escolha uma alteração para aplicar");
    bulkUpdate.mutate({ projectId: PROJECT_ID, ids: selectedIds, data });
  };
  const priorityColor = (impact: string) =>
    impact === "Alto"
      ? ("destructive" as const)
      : impact === "Médio"
        ? ("secondary" as const)
        : ("outline" as const);

  return (
    <div className="space-y-5 p-3 sm:p-6">
      <GeneratedModelItems projectId={PROJECT_ID} types={["gap"]} title="Gaps padrão aplicados" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gaps</h1>
          <p className="text-sm text-muted-foreground">
            Funcionalidades não cobertas pelo padrão SAP
          </p>
        </div>
        <div className="flex flex-col gap-2 min-[420px]:flex-row sm:flex-wrap sm:justify-end">
          {dcds.length > 0 && (
            <Button variant="outline" onClick={() => setShowExtract(true)}>
              <Sparkles className="mr-2 h-4 w-4" />
              Extrair do DCD (IA)
            </Button>
          )}
          <Button
            onClick={() => {
              setForm(EMPTY_FORM);
              setShowAdd(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo Gap
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:max-w-md sm:basis-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição, módulo ou responsável..."
            value={search}
            onChange={event => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Badge variant="secondary">{filtered.length} gaps</Badge>
        <div className="flex w-full rounded-md border p-1 sm:ml-auto sm:w-auto">
          <Button
            size="sm"
            variant={view === "kanban" ? "secondary" : "ghost"}
            onClick={() => setView("kanban")}
          >
            <Columns3 className="mr-2 h-4 w-4" />
            Kanban
          </Button>
          <Button
            size="sm"
            variant={view === "table" ? "secondary" : "ghost"}
            onClick={() => setView("table")}
          >
            <Table2 className="mr-2 h-4 w-4" />
            Tabela
          </Button>
        </div>
      </div>

      {view === "kanban" ? (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveGap(null)}
        >
          <div className="grid min-w-[980px] grid-cols-4 gap-4 overflow-x-auto pb-2">
            {GAP_COLUMNS.map(column => (
              <GapKanbanColumn
                key={column.status}
                column={column}
                gaps={filtered.filter(
                  (gap: any) => (gap.status || "Aberto") === column.status
                )}
                onOpen={openGap}
              />
            ))}
          </div>
          <DragOverlay>
            {activeGap && (
              <div className="w-72 rotate-1 rounded-lg border bg-background p-3 shadow-xl">
                <GapCardContent gap={activeGap} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="space-y-3">
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3">
              <Badge>{selectedIds.length} selecionados</Badge>
              <div>
                <Label className="text-xs">Novo status</Label>
                <Select
                  value={bulkStatus || "keep"}
                  onValueChange={value =>
                    setBulkStatus(value === "keep" ? "" : value)
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Manter status</SelectItem>
                    {GAP_COLUMNS.map(column => (
                      <SelectItem key={column.status} value={column.status}>
                        {column.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Responsável</Label>
                <Select
                  value={bulkResponsible || "keep"}
                  onValueChange={value =>
                    setBulkResponsible(value === "keep" ? "" : value)
                  }
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Manter responsável</SelectItem>
                    <SelectItem value="unassigned">Sem responsável</SelectItem>
                    {resources.map((resource: any) => (
                      <SelectItem key={resource.id} value={resource.name}>
                        {resource.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={applyBulk} disabled={bulkUpdate.isPending}>
                Aplicar em lote
              </Button>
            </div>
          )}
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          filtered.length > 0 &&
                          selectedIds.length === filtered.length
                        }
                        onCheckedChange={checked =>
                          setSelectedIds(
                            checked ? filtered.map((gap: any) => gap.id) : []
                          )
                        }
                      />
                    </TableHead>
                    <TableHead>Gap</TableHead>
                    <TableHead>Módulos</TableHead>
                    <TableHead>Impacto</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Esforço</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Anexos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-8 text-center text-muted-foreground"
                      >
                        Nenhum gap identificado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((gap: any) => (
                      <TableRow
                        key={gap.id}
                        className="cursor-pointer"
                        onClick={() => openGap(gap)}
                      >
                        <TableCell onClick={event => event.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.includes(gap.id)}
                            onCheckedChange={() => toggleSelected(gap.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex min-w-56 items-center gap-2 font-medium">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                            <span className="line-clamp-2">
                              {gap.description}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex max-w-48 flex-wrap gap-1">
                            {gapModules(gap).map((module: string) => (
                              <Badge key={module} variant="outline">
                                {module}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={priorityColor(gap.impact)}>
                            {gap.impact}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {gap.responsible || (
                            <span className="text-muted-foreground">
                              Sem responsável
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          <Hours gap={gap} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {GAP_COLUMNS.find(
                              item => item.status === gap.status
                            )?.label || gap.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{gap.attachments?.length || 0}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      <GapDialog
        open={showAdd || Boolean(editingGap)}
        onOpenChange={open => {
          if (!open) {
            setShowAdd(false);
            setEditingGap(null);
          }
        }}
        title={editingGap ? "Detalhes do Gap" : "Novo Gap"}
        form={form}
        setForm={setForm}
        moduleOptions={moduleOptions}
        resources={resources}
        toggleModule={toggleModule}
        onAttachment={handleAttachment}
        uploadPending={uploadAttachment.isPending}
        onSave={saveGap}
        savePending={createMut.isPending || updateMut.isPending}
        onDelete={editingGap ? () => setGapToDelete(editingGap) : undefined}
      />

      <Dialog open={showExtract} onOpenChange={setShowExtract}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extrair Gaps do DCD (IA)</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Selecione um DCD para a IA extrair automaticamente os gaps.
          </p>
          <div className="grid gap-2">
            {dcds.map((doc: any) => (
              <Button
                key={doc.id}
                variant="outline"
                className="justify-start"
                onClick={() =>
                  extractMut.mutate({ projectId: PROJECT_ID, dcdId: doc.id })
                }
                disabled={extractMut.isPending}
              >
                {doc.title}
              </Button>
            ))}
          </div>
          {extractMut.isPending && (
            <p className="text-sm text-muted-foreground">
              Analisando documento...
            </p>
          )}
        </DialogContent>
      </Dialog>
      <DeleteConfirmationDialog
        open={Boolean(gapToDelete)}
        onOpenChange={open => !open && setGapToDelete(null)}
        title="Excluir este gap?"
        description={`O gap “${gapToDelete?.description || ""}” e sua rastreabilidade operacional serão removidos. Esta ação não pode ser desfeita.`}
        pending={deleteMut.isPending}
        onConfirm={() =>
          gapToDelete && deleteMut.mutate({ id: gapToDelete.id })
        }
      />
    </div>
  );
}

function GapDialog({
  open,
  onOpenChange,
  title,
  form,
  setForm,
  moduleOptions,
  resources,
  toggleModule,
  onAttachment,
  uploadPending,
  onSave,
  savePending,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  form: GapForm;
  setForm: React.Dispatch<React.SetStateAction<GapForm>>;
  moduleOptions: string[];
  resources: any[];
  toggleModule: (module: string) => void;
  onAttachment: (file?: File) => Promise<void>;
  uploadPending: boolean;
  onSave: () => void;
  savePending: boolean;
  onDelete?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label>Descrição do gap *</Label>
            <Textarea
              rows={4}
              value={form.description}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Descreva a necessidade não atendida pelo padrão SAP e o impacto no processo..."
            />
          </div>
          <div className="grid gap-2">
            <Label>Módulos envolvidos</Label>
            <div className="flex flex-wrap gap-2 rounded-lg border p-3">
              {moduleOptions.length ? (
                moduleOptions.map(module => (
                  <Button
                    key={module}
                    type="button"
                    size="sm"
                    variant={
                      form.modules.includes(module) ? "default" : "outline"
                    }
                    onClick={() => toggleModule(module)}
                  >
                    {module}
                  </Button>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  Cadastre frentes/módulos nas configurações para selecioná-los
                  aqui.
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Selecione todos os módulos impactados por este gap.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Impacto</Label>
              <Select
                value={form.impact}
                onValueChange={(impact: GapForm["impact"]) =>
                  setForm(current => ({ ...current, impact }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Alto">Alto</SelectItem>
                  <SelectItem value="Médio">Médio</SelectItem>
                  <SelectItem value="Baixo">Baixo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(status: GapStatus) =>
                  setForm(current => ({ ...current, status }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GAP_COLUMNS.map(column => (
                    <SelectItem key={column.status} value={column.status}>
                      {column.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Responsável</Label>
              <Select
                value={form.responsible || "unassigned"}
                onValueChange={responsible =>
                  setForm(current => ({
                    ...current,
                    responsible:
                      responsible === "unassigned" ? "" : responsible,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Sem responsável</SelectItem>
                  {resources.map((resource: any) => (
                    <SelectItem key={resource.id} value={resource.name}>
                      {resource.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Esforço ABAP (horas)</Label>
              <Input
                type="number"
                min={0}
                value={form.abapHours}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    abapHours: Math.max(0, Number(event.target.value) || 0),
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Esforço técnico (horas)</Label>
              <Input
                type="number"
                min={0}
                value={form.technicalHours}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    technicalHours: Math.max(
                      0,
                      Number(event.target.value) || 0
                    ),
                  }))
                }
              />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Esforço total estimado:{" "}
              <strong className="text-foreground">
                {form.abapHours + form.technicalHours} horas
              </strong>
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Solução / decisão técnica</Label>
            <Textarea
              rows={3}
              value={form.resolution}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  resolution: event.target.value,
                }))
              }
              placeholder="Registre a solução proposta, decisão de aceite ou próximos passos..."
            />
          </div>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Label>Anexos</Label>
                <p className="text-xs text-muted-foreground">
                  PDF, imagem, planilha ou documento de até 10 MB.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                asChild
                disabled={uploadPending}
              >
                <label className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  {uploadPending ? "Enviando..." : "Adicionar anexo"}
                  <input
                    type="file"
                    className="hidden"
                    onChange={event => {
                      void onAttachment(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </Button>
            </div>
            {form.attachments.length === 0 ? (
              <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                Nenhum anexo adicionado.
              </p>
            ) : (
              <div className="grid gap-2">
                {form.attachments.map((url, index) => (
                  <div
                    key={`${url}-${index}`}
                    className="flex items-center gap-2 rounded-lg border p-2"
                  >
                    <Paperclip className="h-4 w-4 shrink-0 text-blue-600" />
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-sm text-blue-700 hover:underline"
                    >
                      {attachmentName(url, index)}
                    </a>
                    <Button variant="ghost" size="icon" asChild>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir anexo"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setForm(current => ({
                          ...current,
                          attachments: current.attachments.filter(
                            (_, itemIndex) => itemIndex !== index
                          ),
                        }))
                      }
                      title="Remover anexo"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {onDelete && (
            <Button variant="destructive" onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={onSave}
              disabled={
                !form.description.trim() || savePending || uploadPending
              }
            >
              {savePending ? "Salvando..." : "Salvar gap"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
