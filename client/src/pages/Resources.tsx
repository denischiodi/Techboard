import { useState, useRef, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Pencil, Trash2, Search, Upload, Download, ArrowUpDown, ArrowUp, ArrowDown, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import type { Resource, ResourceProfile, ResourceFront } from "../../../shared/types";
import * as XLSX from "xlsx";

const PROFILES_FALLBACK: ResourceProfile[] = ['Funcional', 'Técnico', 'Arquiteto', 'Gerente de Projeto', 'Líder de Frente', 'AMS'];
const FRONTS_FALLBACK: ResourceFront[] = ['FI', 'CO', 'MM', 'SD', 'PP', 'QM', 'EWM', 'BTP', 'Integrações', 'Dados', 'Testes', 'PMO'];

type SortField = 'name' | 'email' | 'group' | 'profile' | 'fronts' | 'contractType' | 'birthDate' | 'startDate' | 'endDate' | 'vacationBalance' | 'status';
type SortDir = 'asc' | 'desc';
type VacationFilter = 'all' | 'positive' | 'low' | 'zero' | 'negative';
type EndDateFilter = 'all' | 'none' | 'next30' | 'expired';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?';
}

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagem invalida"));
      img.onload = () => {
        const maxSize = 360;
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Nao foi possivel processar a imagem"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

export default function Resources() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const { data: lookups } = trpc.settings.getLookups.useQuery();
  const { data: appUser } = trpc.access.getByEmail.useQuery(
    { email: user?.email || '' },
    { enabled: !!user?.email }
  );
  const canEdit = appUser?.role === 'admin' || appUser?.role === 'manager' || user?.role === 'admin';

  const PROFILES = (lookups?.profiles?.filter(i => i.active).map(i => i.value) || PROFILES_FALLBACK) as ResourceProfile[];
  const FRONTS = (lookups?.fronts?.filter(i => i.active).map(i => i.value) || FRONTS_FALLBACK) as ResourceFront[];
  const STATUSES = lookups?.resourceStatuses?.filter(i => i.active).map(i => i.value) || ['Ativo', 'Inativo'];
  const CONTRACT_TYPES = lookups?.contractTypes?.filter(i => i.active).map(i => i.value) || ['CLT', 'PJ'];
  const GROUPS = useMemo(() => {
    return Array.from(new Set((resources as any[])
      .map(resource => String(resource.group || "").trim())
      .filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [resources]);
  const createMutation = trpc.resources.create.useMutation({ onSuccess: () => utils.resources.list.invalidate() });
  const updateMutation = trpc.resources.update.useMutation({ onSuccess: () => utils.resources.list.invalidate() });
  const deleteMutation = trpc.resources.delete.useMutation({ onSuccess: () => utils.resources.list.invalidate() });
  const bulkImportMutation = trpc.resources.bulkImport.useMutation({ onSuccess: () => utils.resources.list.invalidate() });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<(Resource & { vacationDaysUsed?: number; vacationBalance?: number }) | null>(null);
  const [search, setSearch] = useState("");
  const [filterProfile, setFilterProfile] = useState("all");
  const [filterGroup, setFilterGroup] = useState("all");
  const [filterFront, setFilterFront] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterContractType, setFilterContractType] = useState("all");
  const [filterVacation, setFilterVacation] = useState<VacationFilter>("all");
  const [filterEndDate, setFilterEndDate] = useState<EndDateFilter>("all");
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: '', email: '', photoUrl: '', group: '', profile: 'Funcional' as string, fronts: ['FI'] as string[],
    dailyCapacity: 8, status: 'Ativo' as string, contractType: 'CLT' as string,
    birthDate: '', startDate: '', endDate: '', vacationDaysEntitled: 30, skipAllocationCheck: false, notes: ''
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next30 = new Date(today);
    next30.setDate(next30.getDate() + 30);

    let result = resources.filter((r: any) => {
      const fronts = r.fronts && r.fronts.length > 0 ? r.fronts : (r.front ? [r.front] : []);
      const balance = r.vacationBalance ?? r.vacationDaysEntitled ?? 0;
      const endDate = r.endDate ? new Date(`${r.endDate}T00:00:00`) : null;
      const matchesSearch =
        r.name.toLowerCase().includes(searchLower) ||
        (r.email || '').toLowerCase().includes(searchLower) ||
        (r.group || '').toLowerCase().includes(searchLower) ||
        fronts.join(' ').toLowerCase().includes(searchLower) ||
        (r.front || '').toLowerCase().includes(searchLower) ||
        r.profile.toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;
      if (filterProfile !== 'all' && r.profile !== filterProfile) return false;
      if (filterGroup !== 'all' && (r.group || '') !== filterGroup) return false;
      if (filterFront !== 'all' && !fronts.includes(filterFront)) return false;
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (filterContractType !== 'all' && (r.contractType || 'CLT') !== filterContractType) return false;
      if (filterVacation === 'positive' && balance <= 5) return false;
      if (filterVacation === 'low' && (balance < 1 || balance > 5)) return false;
      if (filterVacation === 'zero' && balance !== 0) return false;
      if (filterVacation === 'negative' && balance >= 0) return false;
      if (filterEndDate === 'none' && r.endDate) return false;
      if (filterEndDate === 'next30' && (!endDate || endDate < today || endDate > next30)) return false;
      if (filterEndDate === 'expired' && (!endDate || endDate >= today)) return false;
      return true;
    });
    result.sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (sortField) {
        case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
        case 'email': aVal = (a.email || '').toLowerCase(); bVal = (b.email || '').toLowerCase(); break;
        case 'group': aVal = (a.group || '').toLowerCase(); bVal = (b.group || '').toLowerCase(); break;
        case 'profile': aVal = a.profile.toLowerCase(); bVal = b.profile.toLowerCase(); break;
        case 'fronts': aVal = (a.fronts || []).join(',').toLowerCase(); bVal = (b.fronts || []).join(',').toLowerCase(); break;
        case 'contractType': aVal = (a.contractType || 'CLT').toLowerCase(); bVal = (b.contractType || 'CLT').toLowerCase(); break;
        case 'birthDate': aVal = a.birthDate || ''; bVal = b.birthDate || ''; break;
        case 'startDate': aVal = a.startDate || ''; bVal = b.startDate || ''; break;
        case 'endDate': aVal = a.endDate || ''; bVal = b.endDate || ''; break;
        case 'vacationBalance': aVal = a.vacationBalance ?? 0; bVal = b.vacationBalance ?? 0; break;
        case 'status': aVal = a.status.toLowerCase(); bVal = b.status.toLowerCase(); break;
        default: aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase();
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [resources, search, filterProfile, filterGroup, filterFront, filterStatus, filterContractType, filterVacation, filterEndDate, sortField, sortDir]);

  const hasActiveFilters = Boolean(
    search ||
    filterProfile !== 'all' ||
    filterGroup !== 'all' ||
    filterFront !== 'all' ||
    filterStatus !== 'all' ||
    filterContractType !== 'all' ||
    filterVacation !== 'all' ||
    filterEndDate !== 'all'
  );

  const clearFilters = () => {
    setSearch("");
    setFilterProfile("all");
    setFilterGroup("all");
    setFilterFront("all");
    setFilterStatus("all");
    setFilterContractType("all");
    setFilterVacation("all");
    setFilterEndDate("all");
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', email: '', photoUrl: '', group: '', profile: 'Funcional', fronts: ['FI'], dailyCapacity: 8, status: 'Ativo', contractType: 'CLT', birthDate: '', startDate: '', endDate: '', vacationDaysEntitled: 30, skipAllocationCheck: false, notes: '' });
    setDialogOpen(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    const fronts = (r.fronts && r.fronts.length > 0) ? r.fronts : (r.front ? [r.front] : []);
    setForm({
      name: r.name, email: r.email || '', photoUrl: r.photoUrl || '', group: r.group || '', profile: r.profile, fronts,
      dailyCapacity: r.dailyCapacity, status: r.status, contractType: r.contractType || 'CLT',
      birthDate: r.birthDate || '', startDate: r.startDate || '', endDate: r.endDate || '',
      vacationDaysEntitled: r.vacationDaysEntitled ?? 30, skipAllocationCheck: Boolean(r.skipAllocationCheck), notes: r.notes || ''
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    try {
      const payload = { ...form, front: form.fronts[0] || '' };
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload });
        toast.success("Recurso atualizado");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("Recurso criado");
      }
      setDialogOpen(false);
    } catch (error: any) {
      toast.error(error?.message || "Erro ao salvar");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Confirma exclusão?")) return;
    await deleteMutation.mutateAsync({ id });
    toast.success("Recurso excluído");
  };

  const toggleFront = (front: string) => {
    setForm(prev => {
      const current = prev.fronts;
      if (current.includes(front)) {
        if (current.length === 1) return prev; // must have at least one
        return { ...prev, fronts: current.filter(f => f !== front) };
      }
      return { ...prev, fronts: [...current, front] };
    });
  };

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      toast.error("Use uma imagem de ate 6 MB");
      return;
    }
    try {
      const photoUrl = await resizeImage(file);
      setForm(prev => ({ ...prev, photoUrl }));
      toast.success("Foto carregada");
    } catch (error: any) {
      toast.error(error?.message || "Erro ao carregar foto");
    } finally {
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const downloadTemplate = () => {
    const exportData = resources.length > 0
      ? resources.map((r: any) => ({
          'ID': r.id,
          'Nome': r.name,
          'E-mail': r.email || '',
          'Foto': r.photoUrl || '',
          'Grupo': r.group || '',
          'Perfil': r.profile,
          'Frente Principal': r.front || (r.fronts || [])[0] || '',
          'Frentes': (r.fronts || []).join(', '),
          'Capacidade Diária': r.dailyCapacity,
          'Status': r.status,
          'Tipo Contratação': r.contractType || 'CLT',
          'Data Nascimento': r.birthDate || '',
          'Data Início': r.startDate || '',
          'Data Fim': r.endDate || '',
          'Dias Férias/Ano': r.vacationDaysEntitled,
          'Dias Férias Liberados': r.vacationDaysAvailableEntitled ?? r.vacationDaysEntitled,
          'Dias Férias Usados': r.vacationDaysUsed ?? 0,
          'Saldo Férias': r.vacationBalance ?? r.vacationDaysEntitled,
          'Período Férias Início': r.vacationPeriodStart || '',
          'Período Férias Fim': r.vacationPeriodEnd || '',
          'Próxima Liberação Férias': r.vacationNextReleaseDate || '',
          'Não Checar Alocação': r.skipAllocationCheck ? 'Sim' : 'Não',
          'Observações': r.notes || '',
        }))
      : [{
          'ID': '',
          'Nome': 'Exemplo Silva',
          'E-mail': 'exemplo@empresa.com',
          'Foto': '',
          'Grupo': 'Supply Chain',
          'Perfil': 'Funcional',
          'Frente Principal': 'FI',
          'Frentes': 'FI, MM',
          'Capacidade Diária': 8,
          'Status': 'Ativo',
          'Tipo Contratação': 'CLT',
          'Data Nascimento': '1990-01-15',
          'Data Início': '2020-03-01',
          'Data Fim': '',
          'Dias Férias/Ano': 30,
          'Dias Férias Liberados': 30,
          'Dias Férias Usados': 0,
          'Saldo Férias': 30,
          'Período Férias Início': '',
          'Período Férias Fim': '',
          'Próxima Liberação Férias': '',
          'Não Checar Alocação': 'Não',
          'Observações': '',
        }];
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recursos');
    XLSX.writeFile(wb, 'recursos.xlsx');
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
      const normalizeImportDate = (value: unknown) => {
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
          return value.toISOString().slice(0, 10);
        }
        if (typeof value === 'number') {
          const parsed = XLSX.SSF.parse_date_code(value);
          if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
        }
        const text = String(value || '').trim();
        const brDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (brDate) return `${brDate[3]}-${brDate[2]}-${brDate[1]}`;
        return text;
      };

      const items = rows.map(row => {
        const frontStr = String(row['Frentes'] || row['Frente'] || row['fronts'] || row['front'] || 'FI');
        const fronts = frontStr.includes(',') ? frontStr.split(',').map((f: string) => f.trim()).filter(Boolean) : [frontStr.trim()];
        const rawVacationDays = row['Dias Férias/Ano'] ?? row['Dias Férias'] ?? row['vacationDaysEntitled'];
        return {
          id: String(row['ID'] || row['id'] || '').trim(),
          name: String(row['Nome'] || row['name'] || ''),
          email: String(row['E-mail'] || row['email'] || ''),
          photoUrl: String(row['Foto'] || row['photoUrl'] || ''),
          group: String(row['Grupo'] || row['group'] || ''),
          profile: String(row['Perfil'] || row['profile'] || 'Funcional'),
          front: fronts[0] || '',
          fronts,
          dailyCapacity: Number(row['Capacidade Diária'] || row['dailyCapacity'] || 8),
          status: String(row['Status'] || row['status'] || 'Ativo'),
          contractType: String(row['Tipo Contratação'] || row['Tipo Contratacao'] || row['contractType'] || 'CLT'),
          birthDate: normalizeImportDate(row['Data Nascimento'] || row['birthDate']),
          startDate: normalizeImportDate(row['Data Início'] || row['startDate']),
          endDate: normalizeImportDate(row['Data Fim'] || row['endDate']),
          vacationDaysEntitled: rawVacationDays === undefined || rawVacationDays === '' ? 30 : Number(rawVacationDays),
          skipAllocationCheck: ['sim', 'true', '1', 'yes'].includes(String(row['Não Checar Alocação'] ?? row['skipAllocationCheck'] ?? '').trim().toLowerCase()),
          notes: String(row['Observações'] || row['notes'] || ''),
        };
      }).filter(item => item.name.trim() !== '');

      if (items.length === 0) { toast.error("Nenhum registro válido encontrado"); return; }
      const result = await bulkImportMutation.mutateAsync(items);
      const msg = (result as any).updated > 0
        ? `${(result as any).created} criados, ${(result as any).updated} atualizados`
        : `${items.length} recursos importados`;
      toast.success(msg);
    } catch (err) {
      toast.error("Erro ao importar arquivo. Verifique o formato.");
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-full max-w-full space-y-4 overflow-hidden sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold sm:text-2xl">Recursos</h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">Gerenciamento de consultores e profissionais</p>
        </div>
        <div className={`grid w-full gap-2 sm:flex sm:w-auto ${canEdit ? 'grid-cols-3' : 'grid-cols-1'}`}>
          <Button variant="outline" onClick={downloadTemplate} className="min-w-0 gap-1 px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm">
            <Download className="h-4 w-4 shrink-0" /> <span className="truncate">Modelo</span>
          </Button>
          {canEdit && <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="min-w-0 gap-1 px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm">
            <Upload className="h-4 w-4 shrink-0" /> <span className="truncate">Importar</span>
          </Button>}
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleBulkImport} />
          {canEdit && <Button onClick={openCreate} className="min-w-0 gap-1 px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm">
            <Plus className="h-4 w-4 shrink-0" /> <span className="truncate">Novo</span>
          </Button>}
        </div>
      </div>

      <Card className="max-w-full overflow-hidden">
        <CardHeader className="px-3 pb-3 sm:px-6">
          <div className="space-y-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative w-full lg:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome, e-mail, frente ou perfil..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <div className="text-xs text-muted-foreground lg:ml-auto">
                {filtered.length} de {resources.length} recurso(s)
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
              <Select value={filterProfile} onValueChange={setFilterProfile}>
                <SelectTrigger className="min-w-0">
                  <SelectValue placeholder="Perfil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos perfis</SelectItem>
                  {PROFILES.map(profile => <SelectItem key={profile} value={profile}>{profile}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filterGroup} onValueChange={setFilterGroup}>
                <SelectTrigger className="min-w-0">
                  <SelectValue placeholder="Grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos grupos</SelectItem>
                  {GROUPS.map(group => <SelectItem key={group} value={group}>{group}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filterFront} onValueChange={setFilterFront}>
                <SelectTrigger className="min-w-0">
                  <SelectValue placeholder="Frente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas frentes</SelectItem>
                  {FRONTS.map(front => <SelectItem key={front} value={front}>{front}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="min-w-0">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  {STATUSES.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filterContractType} onValueChange={setFilterContractType}>
                <SelectTrigger className="min-w-0">
                  <SelectValue placeholder="Contrato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos tipos</SelectItem>
                  {CONTRACT_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filterVacation} onValueChange={value => setFilterVacation(value as VacationFilter)}>
                <SelectTrigger className="min-w-0">
                  <SelectValue placeholder="Férias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos saldos</SelectItem>
                  <SelectItem value="positive">Saldo ok</SelectItem>
                  <SelectItem value="low">Saldo baixo</SelectItem>
                  <SelectItem value="zero">Sem saldo</SelectItem>
                  <SelectItem value="negative">Saldo negativo</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterEndDate} onValueChange={value => setFilterEndDate(value as EndDateFilter)}>
                <SelectTrigger className="min-w-0">
                  <SelectValue placeholder="Saída" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas saídas</SelectItem>
                  <SelectItem value="none">Sem data fim</SelectItem>
                  <SelectItem value="next30">Sai em 30 dias</SelectItem>
                  <SelectItem value="expired">Data fim vencida</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2 text-xs">
                Limpar filtros
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="space-y-2 px-3 pb-3 md:hidden">
            {filtered.map((r: any) => (
              <div key={r.id} className="rounded-lg border bg-background p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-11 w-11 shrink-0 border">
                      <AvatarImage src={r.photoUrl || ""} alt={r.name} className="object-cover" />
                      <AvatarFallback className="text-xs font-semibold">{initials(r.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold leading-tight">{r.name}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{r.email || '-'}</p>
                    </div>
                  </div>
                  <Badge variant={r.status === 'Ativo' ? 'default' : 'outline'} className="shrink-0">{r.status}</Badge>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Perfil</span>
                    <p className="font-medium">{r.profile}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Grupo</span>
                    <p className="font-medium">{r.group || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tipo</span>
                    <p className="font-medium">{r.contractType || 'CLT'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Aniversário</span>
                    <p className="font-medium">{r.birthDate || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Início</span>
                    <p className="font-medium">{r.startDate || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fim</span>
                    <p className="font-medium">{r.endDate || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Saldo de férias</span>
                    <p className={`font-semibold ${(r.vacationBalance ?? 0) <= 5 ? 'text-red-600' : 'text-green-600'}`}>
                      {r.vacationBalance ?? r.vacationDaysEntitled}d <span className="text-muted-foreground">/ {r.vacationDaysEntitled}d</span>
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {(r.fronts && r.fronts.length > 0 ? r.fronts : (r.front ? [r.front] : [])).map((f: string) => (
                    <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
                  ))}
                </div>

                {canEdit && <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(r)} className="gap-2">
                    <Pencil className="h-4 w-4" /> Editar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(r.id)} className="gap-2 text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" /> Excluir
                  </Button>
                </div>}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="rounded-lg border py-8 text-center text-sm text-muted-foreground">Nenhum recurso encontrado</div>
            )}
          </div>

          <div className="hidden max-w-full overflow-x-auto overscroll-x-contain md:block">
          <Table className="min-w-[1240px]">
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('name')}>
                  <span className="flex items-center">Nome<SortIcon field="name" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('email')}>
                  <span className="flex items-center">E-mail<SortIcon field="email" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('profile')}>
                  <span className="flex items-center">Perfil<SortIcon field="profile" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('group')}>
                  <span className="flex items-center">Grupo<SortIcon field="group" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('fronts')}>
                  <span className="flex items-center">Frentes<SortIcon field="fronts" /></span>
                </TableHead>
                <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort('contractType')}>
                  <span className="flex items-center justify-center">Tipo<SortIcon field="contractType" /></span>
                </TableHead>
                <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort('birthDate')}>
                  <span className="flex items-center justify-center">Aniversário<SortIcon field="birthDate" /></span>
                </TableHead>
                <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort('startDate')}>
                  <span className="flex items-center justify-center">Início<SortIcon field="startDate" /></span>
                </TableHead>
                <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort('endDate')}>
                  <span className="flex items-center justify-center">Fim<SortIcon field="endDate" /></span>
                </TableHead>
                <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort('vacationBalance')}>
                  <span className="flex items-center justify-center">Saldo Férias<SortIcon field="vacationBalance" /></span>
                </TableHead>
                <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort('status')}>
                  <span className="flex items-center justify-center">Status<SortIcon field="status" /></span>
                </TableHead>
                {canEdit && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 border">
                        <AvatarImage src={r.photoUrl || ""} alt={r.name} className="object-cover" />
                        <AvatarFallback className="text-xs">{initials(r.name)}</AvatarFallback>
                      </Avatar>
                      <span>{r.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.email || '-'}</TableCell>
                  <TableCell>{r.profile}</TableCell>
                  <TableCell>{r.group || '-'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(r.fronts && r.fronts.length > 0 ? r.fronts : (r.front ? [r.front] : [])).map((f: string) => (
                        <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    <Badge variant="outline" className="text-xs">{r.contractType || 'CLT'}</Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm">{r.birthDate || '-'}</TableCell>
                  <TableCell className="text-center text-sm">{r.startDate || '-'}</TableCell>
                  <TableCell className="text-center text-sm">{r.endDate || '-'}</TableCell>
                  <TableCell className="text-center">
                    <span className={`font-medium ${(r.vacationBalance ?? 0) <= 5 ? 'text-red-600' : 'text-green-600'}`}>
                      {r.vacationBalance ?? r.vacationDaysEntitled}d
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">/ {r.vacationDaysEntitled}d</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={r.status === 'Ativo' ? 'default' : 'outline'}>{r.status}</Badge>
                  </TableCell>
                  {canEdit && <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>}
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={canEdit ? 12 : 11} className="text-center py-8 text-muted-foreground">Nenhum recurso encontrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Recurso' : 'Novo Recurso'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex items-center gap-4 rounded-lg border bg-muted/20 p-3">
              <Avatar className="h-20 w-20 border">
                <AvatarImage src={form.photoUrl} alt={form.name || "Foto do consultor"} className="object-cover" />
                <AvatarFallback className="text-lg font-semibold">{initials(form.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-2">
                <Label>Foto do consultor</Label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()} className="gap-2">
                    <ImagePlus className="h-4 w-4" /> Selecionar foto
                  </Button>
                  {form.photoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setForm(prev => ({ ...prev, photoUrl: "" }))}
                      className="gap-2 text-destructive hover:text-destructive"
                    >
                      <X className="h-4 w-4" /> Remover
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">A imagem sera reduzida automaticamente para uso no organograma.</p>
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Nome</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nome do recurso" />
            </div>
            <div className="grid gap-2">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@empresa.com" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Perfil</Label>
                <Select value={form.profile} onValueChange={v => setForm({ ...form, profile: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PROFILES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Grupo</Label>
              <Input
                value={form.group}
                onChange={e => setForm({ ...form, group: e.target.value })}
                placeholder="Ex.: Supply Chain, Finance, Diretoria..."
                list="resource-groups"
              />
              <datalist id="resource-groups">
                {GROUPS.map(group => <option key={group} value={group} />)}
              </datalist>
              <p className="text-xs text-muted-foreground">Usado para agrupar o consultor no organograma por grupo ou liderança.</p>
            </div>
            <div className="grid gap-2">
              <Label>Frentes (selecione uma ou mais)</Label>
              <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3 sm:flex sm:flex-wrap">
                {FRONTS.map(f => (
                  <label key={f} className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={form.fronts.includes(f)}
                      onCheckedChange={() => toggleFront(f)}
                    />
                    <span className="text-sm">{f}</span>
                  </label>
                ))}
              </div>
              {form.fronts.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {form.fronts.map(f => <Badge key={f} variant="secondary">{f}</Badge>)}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Data de Nascimento</Label>
                <Input type="date" value={form.birthDate} onChange={e => setForm({ ...form, birthDate: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Cap. Diária (h)</Label>
                <Input type="number" value={form.dailyCapacity} onChange={e => setForm({ ...form, dailyCapacity: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Início na Consultoria</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Fim na Consultoria</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>Tipo Contratação</Label>
                <Select value={form.contractType} onValueChange={v => setForm({ ...form, contractType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTRACT_TYPES.map(ct => <SelectItem key={ct} value={ct}>{ct}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Dias Férias/Ano</Label>
                <Input type="number" min={0} max={365} value={form.vacationDaysEntitled} onChange={e => setForm({ ...form, vacationDaysEntitled: Number(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label className="text-xs text-muted-foreground">Cálculo Férias</Label>
                <p className="text-xs text-muted-foreground mt-1">{form.contractType === 'CLT' ? 'Dias corridos' : 'Dias úteis'}</p>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Observações</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Observações" />
            </div>
            <label className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox
                checked={form.skipAllocationCheck}
                onCheckedChange={checked => setForm({ ...form, skipAllocationCheck: checked === true })}
              />
              <span>
                <span className="block text-sm font-medium">Não checar alocação</span>
                <span className="block text-xs text-muted-foreground">Permite alocações sobrepostas deste recurso na mesma frente e projeto.</span>
              </span>
            </label>
            {editing && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">Saldo de Férias</p>
                <div className="mt-1 grid gap-1 text-sm sm:flex sm:gap-4">
                  <span>Direito: <strong>{editing.vacationDaysEntitled}d</strong></span>
                  <span>Usado: <strong>{(editing as any).vacationDaysUsed ?? 0}d</strong></span>
                  <span className={`font-bold ${((editing as any).vacationBalance ?? editing.vacationDaysEntitled) <= 5 ? 'text-red-600' : 'text-green-600'}`}>
                    Disponível: {(editing as any).vacationBalance ?? editing.vacationDaysEntitled}d
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="w-full sm:w-auto" onClick={handleSave}>{editing ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
