import { useState, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ProjectLogo, ProjectName } from "@/components/ProjectLogo";
import { Plus, Pencil, Trash2, Search, Layers, Upload, Download, X, ArrowUpDown, ArrowUp, ArrowDown, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { Project, ProjectStatus, Phase, ProjectPhase, ResourceFront } from "../../../shared/types";
import * as XLSX from "xlsx";

const STATUSES_FALLBACK: ProjectStatus[] = ['Planejado', 'Em andamento', 'Em risco', 'Concluído', 'Cancelado'];
const PHASES: ProjectPhase[] = ['Prepare', 'Explore', 'Realize', 'Deploy', 'Run'];
const ALL_FRONTS_FALLBACK: ResourceFront[] = ['FI', 'CO', 'MM', 'SD', 'PP', 'QM', 'EWM', 'BTP', 'Integrações', 'Dados', 'Testes', 'PMO'];

type PhaseGridRow = {
  id?: string;
  phase: string;
  startDate: string;
  endDate: string;
  responsible: string;
  completionPercent: number;
  status: string;
  notes: string;
};

const statusColor: Record<string, string> = {
  'Planejado': 'bg-blue-100 text-blue-800 border border-blue-300',
  'Em andamento': 'bg-emerald-100 text-emerald-800 border border-emerald-300',
  'Em risco': 'bg-red-100 text-red-800 border border-red-300',
  'Concluído': 'bg-gray-100 text-gray-600 border border-gray-300',
  'Cancelado': 'bg-gray-200 text-gray-500 border border-gray-300 line-through',
  'Suspenso': 'bg-amber-100 text-amber-800 border border-amber-300',
};

const statusDot: Record<string, string> = {
  'Planejado': 'bg-blue-500',
  'Em andamento': 'bg-emerald-500',
  'Em risco': 'bg-red-500',
  'Concluído': 'bg-gray-400',
  'Cancelado': 'bg-gray-400',
  'Suspenso': 'bg-amber-500',
};

function resizeLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Imagem inválida"));
      image.onload = () => {
        const maxSize = 480;
        const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("Não foi possível processar a imagem"));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

export default function Projects() {
  const utils = trpc.useUtils();
  const { data: projects = [] } = trpc.projects.list.useQuery();
  const { data: allPhases = [] } = trpc.phases.list.useQuery();
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const { data: lookups } = trpc.settings.getLookups.useQuery();
  const STATUSES = (lookups?.projectStatuses?.filter(i => i.active).map(i => i.value) || STATUSES_FALLBACK) as ProjectStatus[];
  const ALL_FRONTS = (lookups?.fronts?.filter(i => i.active).map(i => i.value) || ALL_FRONTS_FALLBACK) as ResourceFront[];
  const createMutation = trpc.projects.create.useMutation({ onSuccess: () => utils.projects.list.invalidate() });
  const updateMutation = trpc.projects.update.useMutation({ onSuccess: () => utils.projects.list.invalidate() });
  const deleteMutation = trpc.projects.delete.useMutation({ onSuccess: () => utils.projects.list.invalidate() });
  const bulkImportMutation = trpc.projects.bulkImport.useMutation({ onSuccess: () => utils.projects.list.invalidate() });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const createPhaseMutation = trpc.phases.create.useMutation({ onSuccess: () => utils.phases.list.invalidate() });
  const updatePhaseMutation = trpc.phases.update.useMutation({ onSuccess: () => utils.phases.list.invalidate() });
  const deletePhaseMutation = trpc.phases.delete.useMutation({ onSuccess: () => utils.phases.list.invalidate() });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterFront, setFilterFront] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [form, setForm] = useState({
    name: '', logoUrl: '', client: '', manager: '', status: 'Planejado' as string,
    startDate: '', endDate: '', fronts: [] as string[], notes: ''
  });

  // Phases dialog
  const [phasesDialogOpen, setPhasesDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [phaseRows, setPhaseRows] = useState<PhaseGridRow[]>([]);

  const [sortField, setSortField] = useState<'name'|'client'|'fronts'|'startDate'|'endDate'|'status'>('name');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };
  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const filtered = useMemo(() => {
    let result = projects.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.client.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
      const matchesFront = filterFront === 'all' || (p.fronts || []).includes(filterFront);
      const matchesStart = !filterStartDate || p.startDate >= filterStartDate;
      const matchesEnd = !filterEndDate || p.endDate <= filterEndDate;
      return matchesSearch && matchesStatus && matchesFront && matchesStart && matchesEnd;
    });
    result.sort((a, b) => {
      let aVal: string, bVal: string;
      switch (sortField) {
        case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
        case 'client': aVal = a.client.toLowerCase(); bVal = b.client.toLowerCase(); break;
        case 'fronts': aVal = (a.fronts||[]).join(','); bVal = (b.fronts||[]).join(','); break;
        case 'startDate': aVal = a.startDate; bVal = b.startDate; break;
        case 'endDate': aVal = a.endDate; bVal = b.endDate; break;
        case 'status': aVal = a.status.toLowerCase(); bVal = b.status.toLowerCase(); break;
        default: aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase();
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [projects, search, filterStatus, filterFront, filterStartDate, filterEndDate, sortField, sortDir]);

  const activeFiltersCount = [filterStatus !== 'all', filterFront !== 'all', !!filterStartDate, !!filterEndDate].filter(Boolean).length;

  const clearFilters = () => {
    setFilterStatus('all');
    setFilterFront('all');
    setFilterStartDate('');
    setFilterEndDate('');
    setSearch('');
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', logoUrl: '', client: '', manager: '', status: 'Planejado', startDate: format(new Date(), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd'), fronts: [], notes: '' });
    setDialogOpen(true);
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    setForm({ name: p.name, logoUrl: p.logoUrl || '', client: p.client, manager: p.manager, status: p.status, startDate: p.startDate, endDate: p.endDate, fronts: p.fronts || [], notes: p.notes });
    setDialogOpen(true);
  };

  const handleLogoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Selecione um arquivo de imagem");
    if (file.size > 6 * 1024 * 1024) return toast.error("Use uma imagem de até 6 MB");
    try {
      const logoUrl = await resizeLogo(file);
      setForm(current => ({ ...current, logoUrl }));
      toast.success("Logotipo carregado");
    } catch (error: any) {
      toast.error(error?.message || "Erro ao carregar logotipo");
    } finally {
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!form.client.trim()) { toast.error("Cliente é obrigatório"); return; }
    if (!form.startDate || !form.endDate) { toast.error("Informe início e fim do projeto"); return; }
    if (form.startDate > form.endDate) { toast.error("Data início não pode ser posterior à data fim"); return; }
    if (!editing) {
      const today = format(new Date(), 'yyyy-MM-dd');
      if (form.startDate < today) {
        toast.error(`Projeto novo não pode iniciar antes de hoje (${today})`);
        return;
      }
    }
    if (form.fronts.length === 0) { toast.error("Selecione pelo menos uma frente do projeto"); return; }
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...form });
        toast.success("Projeto atualizado");
      } else {
        await createMutation.mutateAsync(form);
        toast.success("Projeto criado");
      }
      setDialogOpen(false);
    } catch (error: any) {
      toast.error(error?.message || "Erro ao salvar projeto");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Confirma exclusão?")) return;
    await deleteMutation.mutateAsync({ id });
    toast.success("Projeto excluído");
  };

  const downloadTemplate = () => {
    const exportData = projects.length > 0
      ? projects.map((p: any) => ({
          'ID': p.id,
          'Nome': p.name,
          'Cliente': p.client || '',
          'Gerente': p.manager || '',
          'Status': p.status,
          'Data Início': p.startDate || '',
          'Data Fim': p.endDate || '',
          'Frentes': (p.fronts || []).join(','),
          'Observações': p.notes || '',
        }))
      : [{ 'ID': '', 'Nome': 'Projeto Exemplo', 'Cliente': 'Cliente X', 'Gerente': 'João Silva', 'Status': 'Planejado', 'Data Início': '2025-01-01', 'Data Fim': '2025-06-30', 'Frentes': 'FI,CO,MM', 'Observações': '' }];
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Projetos');
    XLSX.writeFile(wb, 'projetos.xlsx');
    toast.success("Dados exportados");
  };

  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);
      const items = rows.map(row => ({
        id: String(row['ID'] || row['id'] || ''),
        name: String(row['Nome'] || row['name'] || ''),
        client: String(row['Cliente'] || row['client'] || ''),
        manager: String(row['Gerente'] || row['manager'] || ''),
        status: String(row['Status'] || row['status'] || 'Planejado'),
        startDate: String(row['Data Início'] || row['startDate'] || ''),
        endDate: String(row['Data Fim'] || row['endDate'] || ''),
        fronts: String(row['Frentes'] || row['fronts'] || '').split(',').map((f: string) => f.trim()).filter(Boolean),
        notes: String(row['Observações'] || row['notes'] || ''),
      })).filter(item => item.name.trim() !== '');
      if (items.length === 0) { toast.error("Nenhum registro válido encontrado"); return; }
      const result = await bulkImportMutation.mutateAsync(items);
      const msg = (result as any).updated > 0
        ? `${(result as any).created} criados, ${(result as any).updated} atualizados`
        : `${items.length} projetos importados`;
      toast.success(msg);
    } catch { toast.error("Erro ao importar arquivo. Verifique o formato."); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleFront = (front: string) => {
    setForm(prev => ({
      ...prev,
      fronts: prev.fronts.includes(front)
        ? prev.fronts.filter(f => f !== front)
        : [...prev.fronts, front]
    }));
  };

  // Phases management
  const buildSuggestedPhaseRows = (project: Project): PhaseGridRow[] => {
    const start = parseISO(project.startDate);
    const end = parseISO(project.endDate);
    const totalDays = Math.max(1, differenceInCalendarDays(end, start) + 1);
    const baseDays = Math.max(1, Math.floor(totalDays / PHASES.length));
    let cursor = start;

    return PHASES.map((phase, index) => {
      const isLast = index === PHASES.length - 1;
      const rowStart = cursor;
      const rowEnd = isLast ? end : addDays(rowStart, baseDays - 1);
      cursor = addDays(rowEnd, 1);
      return {
        phase,
        startDate: format(rowStart, 'yyyy-MM-dd'),
        endDate: format(rowEnd > end ? end : rowEnd, 'yyyy-MM-dd'),
        responsible: project.manager || '',
        completionPercent: 0,
        status: project.status || 'Planejado',
        notes: '',
      };
    });
  };

  const phaseToGridRow = (phase: Phase): PhaseGridRow => ({
    id: phase.id,
    phase: phase.phase,
    startDate: phase.startDate,
    endDate: phase.endDate,
    responsible: phase.responsible,
    completionPercent: phase.completionPercent,
    status: phase.status,
    notes: phase.notes,
  });

  const openPhases = (p: Project) => {
    setSelectedProject(p);
    const existingRows = allPhases
      .filter(ph => ph.projectId === p.id)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map(phaseToGridRow);
    setPhaseRows(existingRows.length > 0 ? existingRows : buildSuggestedPhaseRows(p));
    setPhasesDialogOpen(true);
  };

  const projectPhases = selectedProject ? allPhases.filter(ph => ph.projectId === selectedProject.id) : [];

  const updatePhaseRow = (index: number, patch: Partial<PhaseGridRow>) => {
    setPhaseRows(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const addPhaseRow = () => {
    setPhaseRows(rows => [
      ...rows,
      {
        phase: PHASES[0],
        startDate: selectedProject?.startDate || format(new Date(), 'yyyy-MM-dd'),
        endDate: selectedProject?.endDate || format(new Date(), 'yyyy-MM-dd'),
        responsible: selectedProject?.manager || '',
        completionPercent: 0,
        status: 'Planejado',
        notes: '',
      },
    ]);
  };

  const removePhaseRow = (index: number) => {
    setPhaseRows(rows => rows.filter((_, rowIndex) => rowIndex !== index));
  };

  const applyProjectManagerToPhases = () => {
    if (!selectedProject) return;
    setPhaseRows(rows => rows.map(row => ({ ...row, responsible: selectedProject.manager || '' })));
  };

  const regeneratePhaseRows = () => {
    if (!selectedProject) return;
    setPhaseRows(buildSuggestedPhaseRows(selectedProject));
  };

  const getPhaseRowLabel = (row: PhaseGridRow) => row.notes?.trim()
    ? `${row.phase} (${row.notes.trim()})`
    : row.phase;

  const handleSavePhases = async () => {
    if (!selectedProject) return;
    const validRows = phaseRows.filter(row => row.phase.trim());
    if (validRows.length === 0) {
      toast.error("Inclua pelo menos uma fase");
      return;
    }
    for (const row of validRows) {
      const rowLabel = getPhaseRowLabel(row);
      if (!row.startDate || !row.endDate) {
        toast.error("Todos os marcos precisam de início e fim");
        return;
      }
      if (row.startDate > row.endDate) {
        toast.error(`${rowLabel} está com início posterior ao fim`);
        return;
      }
      if (row.startDate < selectedProject.startDate || row.endDate > selectedProject.endDate) {
        toast.error(`${rowLabel} precisa ficar dentro do período do projeto (${selectedProject.startDate} a ${selectedProject.endDate})`);
        return;
      }
      if (row.completionPercent < 0 || row.completionPercent > 100) {
        toast.error(`A conclusão de ${rowLabel} deve ficar entre 0% e 100%`);
        return;
      }
    }
    const sortedRows = [...validRows].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
    for (let index = 1; index < sortedRows.length; index += 1) {
      const previous = sortedRows[index - 1];
      const current = sortedRows[index];
      if (current.startDate <= previous.endDate) {
        toast.error(`${getPhaseRowLabel(current)} sobrepõe ${getPhaseRowLabel(previous)}. Ajuste as datas ou deixe um intervalo entre os marcos.`);
        return;
      }
    }

    try {
      const keptIds = new Set(sortedRows.map(row => row.id).filter(Boolean));
      const removedPhases = projectPhases.filter(phase => !keptIds.has(phase.id));
      for (const phase of removedPhases) {
        await deletePhaseMutation.mutateAsync({ id: phase.id });
      }

      for (const row of sortedRows) {
        const payload = {
          projectId: selectedProject.id,
          phase: row.phase,
          startDate: row.startDate,
          endDate: row.endDate,
          responsible: row.responsible,
          completionPercent: Number(row.completionPercent) || 0,
          status: row.status || 'Planejado',
          notes: row.notes || '',
        };
        if (row.id) await updatePhaseMutation.mutateAsync({ id: row.id, ...payload });
        else await createPhaseMutation.mutateAsync(payload);
      }
      await utils.phases.list.invalidate();
      toast.success("Cronograma de marcos salvo");
      setPhasesDialogOpen(false);
    } catch (error: any) {
      toast.error(error?.message || "Erro ao salvar marcos");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projetos</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerenciamento de projetos, clientes e fases</p>
        </div>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:justify-end">
          <Button variant="outline" onClick={downloadTemplate} className="w-full gap-2 sm:w-auto">
            <Download className="h-4 w-4" /> Modelo Excel
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full gap-2 sm:w-auto">
            <Upload className="h-4 w-4" /> Importar Excel
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleBulkImport} />
          <Button onClick={openCreate} className="w-full gap-2 min-[420px]:col-span-2 sm:w-auto">
            <Plus className="h-4 w-4" /> Novo Projeto
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                {STATUSES.map(s => (
                  <SelectItem key={s} value={s}>
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${statusDot[s] || 'bg-gray-400'}`} />
                      {s}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterFront} onValueChange={setFilterFront}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="Frente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Frentes</SelectItem>
                {ALL_FRONTS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:w-auto">
              <Input type="date" className="h-9 min-w-0 sm:w-[140px]" placeholder="Início de" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} />
              <span className="text-muted-foreground text-xs">até</span>
              <Input type="date" className="h-9 min-w-0 sm:w-[140px]" placeholder="Fim até" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} />
            </div>
            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground gap-1">
                <X className="h-3 w-3" /> Limpar ({activeFiltersCount})
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{filtered.length} projeto(s) encontrado(s)</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('name')}><span className="flex items-center">Projeto<SortIcon field="name" /></span></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('client')}><span className="flex items-center">Cliente<SortIcon field="client" /></span></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('fronts')}><span className="flex items-center">Frentes<SortIcon field="fronts" /></span></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('startDate')}><span className="flex items-center">Início<SortIcon field="startDate" /></span></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('endDate')}><span className="flex items-center">Fim<SortIcon field="endDate" /></span></TableHead>
                <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort('status')}><span className="flex items-center justify-center">Status<SortIcon field="status" /></span></TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium"><ProjectName project={p} /></TableCell>
                  <TableCell>{p.client}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(p.fronts || []).slice(0, 3).map((f: string) => (
                        <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
                      ))}
                      {(p.fronts || []).length > 3 && (
                        <Badge variant="outline" className="text-xs">+{(p.fronts || []).length - 3}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{p.startDate}</TableCell>
                  <TableCell className="text-sm">{p.endDate}</TableCell>
                  <TableCell className="text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusColor[p.status] || 'bg-gray-100 text-gray-800 border border-gray-300'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusDot[p.status] || 'bg-gray-400'}`} />
                      {p.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openPhases(p)} title="Gerenciar Fases">
                      <Layers className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum projeto encontrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Project Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)]">
          <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 sm:px-6">
            <DialogTitle>{editing ? 'Editar Projeto' : 'Novo Projeto'}</DialogTitle>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 min-[420px]:flex-row min-[420px]:items-center">
              <ProjectLogo project={{ name: form.name || "projeto", logoUrl: form.logoUrl }} className="h-16 w-16 rounded-lg" />
              <div className="min-w-0 flex-1 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />Subir logotipo</Button>
                {form.logoUrl && <Button type="button" variant="ghost" size="sm" onClick={() => setForm(current => ({ ...current, logoUrl: "" }))}><X className="mr-2 h-4 w-4" />Remover</Button>}
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                <p className="w-full text-xs text-muted-foreground">PNG, JPG, WebP ou SVG, até 6 MB.</p>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Nome do Projeto</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Cliente</Label>
                <Input value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Gerente</Label>
                <Select value={form.manager || "__none__"} onValueChange={v => setForm({ ...form, manager: v === "__none__" ? "" : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o gerente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {resources.filter((r: any) => r.status === 'Ativo').sort((a: any, b: any) => a.name.localeCompare(b.name)).map((r: any) => (
                      <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>Data Início</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Data Fim</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Frentes do Projeto</Label>
              <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/30">
                {ALL_FRONTS.map(front => (
                  <button
                    key={front}
                    type="button"
                    onClick={() => toggleFront(front)}
                    className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      form.fronts.includes(front)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {front}
                    {form.fronts.includes(front) && <X className="h-3 w-3 ml-1" />}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{form.fronts.length} frente(s) selecionada(s)</p>
            </div>
            <div className="grid gap-2">
              <Label>Observações</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-background px-4 py-4 sm:px-6">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editing ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phases Management Dialog */}
      <Dialog open={phasesDialogOpen} onOpenChange={setPhasesDialogOpen}>
        <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-[1500px] flex-col overflow-hidden sm:max-w-[1500px]">
          <DialogHeader>
            <DialogTitle>Cronograma de Marcos - {selectedProject?.name}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2 pr-1">
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Edite todos os marcos de uma vez</p>
                <p className="text-xs text-muted-foreground">
                  Agrupe por fase e detalhe marcos como Sprint 1, Teste Integrado ou Congelamento. Os períodos não podem sobrepor.
                </p>
                {selectedProject && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Período do projeto: {selectedProject.startDate} a {selectedProject.endDate}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={regeneratePhaseRows}>
                  Gerar marcos
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={applyProjectManagerToPhases}>
                  Aplicar gestor
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addPhaseRow}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Linha
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[150px]">Fase/Grupo</TableHead>
                    <TableHead className="min-w-[140px]">Início</TableHead>
                    <TableHead className="min-w-[140px]">Fim</TableHead>
                    <TableHead className="min-w-[170px]">Responsável</TableHead>
                    <TableHead className="min-w-[130px]">Conclusão</TableHead>
                    <TableHead className="min-w-[150px]">Status</TableHead>
                    <TableHead className="min-w-[260px]">Marco/Descrição</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {phaseRows.map((row, index) => (
                    <TableRow key={row.id || index}>
                      <TableCell>
                        <Select value={row.phase} onValueChange={value => updatePhaseRow(index, { phase: value })}>
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PHASES.map(phase => <SelectItem key={phase} value={phase}>{phase}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input type="date" className="h-8" value={row.startDate} onChange={event => updatePhaseRow(index, { startDate: event.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input type="date" className="h-8" value={row.endDate} onChange={event => updatePhaseRow(index, { endDate: event.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input className="h-8" value={row.responsible} onChange={event => updatePhaseRow(index, { responsible: event.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-8"
                          min={0}
                          max={100}
                          value={row.completionPercent}
                          onChange={event => updatePhaseRow(index, { completionPercent: Number(event.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <Select value={row.status || 'Planejado'} onValueChange={value => updatePhaseRow(index, { status: value })}>
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input className="h-8" value={row.notes} onChange={event => updatePhaseRow(index, { notes: event.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removePhaseRow(index)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {phaseRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                        Nenhum marco cadastrado. Use “Gerar marcos” ou “Linha”.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhasesDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSavePhases}>Salvar Cronograma</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
