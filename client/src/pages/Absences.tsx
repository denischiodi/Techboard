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
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Search, Upload, Download, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { eachDayOfInterval, format, parseISO } from "date-fns";
import type { Absence, AbsenceType } from "../../../shared/types";
import * as XLSX from "xlsx";

const ABSENCE_TYPES_FALLBACK: AbsenceType[] = ['Férias', 'Dias vendidos', 'Banco de Horas', 'Atestado', 'Treinamento', 'Folga', 'Licença', 'Feriado'];

const typeColor: Record<string, string> = {
  'Férias': 'bg-blue-100 text-blue-800',
  'Dias vendidos': 'bg-emerald-100 text-emerald-800',
  'Banco de Horas': 'bg-purple-100 text-purple-800',
  'Atestado': 'bg-red-100 text-red-800',
  'Treinamento': 'bg-amber-100 text-amber-800',
  'Folga': 'bg-green-100 text-green-800',
  'Licença': 'bg-orange-100 text-orange-800',
  'Feriado': 'bg-sky-100 text-sky-800',
};

export default function Absences() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: absences = [] } = trpc.absences.list.useQuery();
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const { data: lookups } = trpc.settings.getLookups.useQuery();
  const { data: appUser } = trpc.access.getByEmail.useQuery(
    { email: user?.email || '' },
    { enabled: !!user?.email }
  );
  const canEdit = appUser?.role === 'admin' || appUser?.role === 'manager' || appUser?.role === 'technical_lead' || user?.role === 'admin';
  const ABSENCE_TYPES = (lookups?.absenceTypes?.filter(i => i.active).map(i => i.value) || ABSENCE_TYPES_FALLBACK) as AbsenceType[];
  const createMutation = trpc.absences.create.useMutation({
    onSuccess: () => { utils.absences.list.invalidate(); utils.resources.list.invalidate(); }
  });
  const updateMutation = trpc.absences.update.useMutation({
    onSuccess: () => { utils.absences.list.invalidate(); utils.resources.list.invalidate(); }
  });
  const deleteMutation = trpc.absences.delete.useMutation({
    onSuccess: () => { utils.absences.list.invalidate(); utils.resources.list.invalidate(); }
  });
  const bulkImportMutation = trpc.absences.bulkImport.useMutation({
    onSuccess: () => { utils.absences.list.invalidate(); utils.resources.list.invalidate(); }
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Absence | null>(null);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    resourceId: '', type: 'Férias' as string, startDate: '', endDate: '', daysCount: 0, approved: true, notes: ''
  });

  const getResourceName = (id: string) => resources.find((r: any) => r.id === id)?.name || id;
  const getResourceBalance = (id: string) => {
    const r = resources.find((r: any) => r.id === id) as any;
    return r ? {
      entitled: r.vacationDaysAvailableEntitled ?? r.vacationDaysEntitled,
      balance: r.vacationBalance ?? r.vacationDaysEntitled,
      contractType: r.contractType || 'CLT',
      periodStart: r.vacationPeriodStart,
      periodEnd: r.vacationPeriodEnd,
      nextReleaseDate: r.vacationNextReleaseDate,
    } : null;
  };
  const consumesVacationBalance = (type: string) => {
    const normalized = type.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    return normalized === 'ferias' || normalized === 'dias vendidos';
  };
  const isSoldVacationDays = (type: string) => {
    const normalized = type.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    return normalized === 'dias vendidos';
  };
  const countVacationDays = (startDate: string, endDate: string, contractType: string) => {
    const days = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) });
    if (contractType === 'PJ') return days.filter(day => day.getDay() !== 0 && day.getDay() !== 6).length;
    return days.length;
  };
  const getVacationBalanceWarning = () => {
    if (!form.resourceId || !consumesVacationBalance(form.type)) return "";
    const balance = getResourceBalance(form.resourceId);
    if (balance?.nextReleaseDate) {
      return `Férias ainda não liberadas: o consultor completa 1 ano em ${balance.nextReleaseDate}. Será salvo como exceção operacional.`;
    }
    if (!balance?.periodStart || !balance?.periodEnd) return "";
    if (form.startDate < balance.periodStart || form.endDate > balance.periodEnd) {
      return `Férias fora do período liberado (${balance.periodStart} a ${balance.periodEnd}). Dias não usados no período expiram e não acumulam. Será salvo como exceção operacional.`;
    }
    const requestedDays = isSoldVacationDays(form.type)
      ? Number(form.daysCount || 0)
      : countVacationDays(form.startDate, form.endDate, balance.contractType);
    if (requestedDays <= balance.balance) return "";
    return `Saldo insuficiente: disponível ${balance.balance} dias, solicitado ${requestedDays} dias. Será salvo como exceção e o saldo ficará negativo.`;
  };

  const [sortField, setSortField] = useState<'resource'|'type'|'startDate'|'endDate'|'approved'>('resource');
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
    let result = absences.filter(a => {
      const rName = getResourceName(a.resourceId);
      return rName.toLowerCase().includes(search.toLowerCase()) || a.type.toLowerCase().includes(search.toLowerCase());
    });
    result.sort((a, b) => {
      let aVal: string, bVal: string;
      switch (sortField) {
        case 'resource': aVal = getResourceName(a.resourceId).toLowerCase(); bVal = getResourceName(b.resourceId).toLowerCase(); break;
        case 'type': aVal = a.type.toLowerCase(); bVal = b.type.toLowerCase(); break;
        case 'startDate': aVal = a.startDate; bVal = b.startDate; break;
        case 'endDate': aVal = a.endDate; bVal = b.endDate; break;
        case 'approved': aVal = a.approved ? '1' : '0'; bVal = b.approved ? '1' : '0'; break;
        default: aVal = getResourceName(a.resourceId).toLowerCase(); bVal = getResourceName(b.resourceId).toLowerCase();
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [absences, search, sortField, sortDir, resources]);

  const openCreate = () => {
    setEditing(null);
    setForm({ resourceId: resources[0]?.id || '', type: 'Férias', startDate: format(new Date(), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd'), daysCount: 0, approved: true, notes: '' });
    setDialogOpen(true);
  };

  const openEdit = (a: Absence) => {
    setEditing(a);
    setForm({ resourceId: a.resourceId, type: a.type, startDate: a.startDate, endDate: a.endDate, daysCount: (a as any).daysCount ?? 0, approved: a.approved, notes: a.notes });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.resourceId) { toast.error("Recurso é obrigatório"); return; }
    if (isSoldVacationDays(form.type) && (!form.daysCount || form.daysCount <= 0)) {
      toast.error("Informe a quantidade de dias vendidos");
      return;
    }
    try {
      const payload = isSoldVacationDays(form.type) ? { ...form, endDate: form.startDate } : form;
      const balanceWarning = getVacationBalanceWarning();
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload });
        toast.success("Ausência atualizada");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("Ausência registrada");
      }
      if (balanceWarning) toast.warning(balanceWarning);
      setDialogOpen(false);
    } catch (err: any) {
      const msg = err?.message || "Erro ao salvar";
      if (msg.includes("Saldo insuficiente") || msg.includes("Ferias") || msg.includes("Quantidade")) {
        toast.error(msg);
      } else {
        toast.error("Erro ao salvar ausência");
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Confirma exclusão?")) return;
    await deleteMutation.mutateAsync({ id });
    toast.success("Ausência excluída");
  };

  const downloadTemplate = () => {
    const exportData = absences.length > 0
      ? absences.map((a: any) => {
          const res = resources.find((r: any) => r.id === a.resourceId);
          return {
            'ID': a.id,
            'Recurso ID': a.resourceId,
            'Recurso': res?.name || '',
            'Tipo': a.type,
            'Data Início': a.startDate,
            'Data Fim': a.endDate,
            'Quantidade Dias': a.daysCount ?? '',
            'Aprovado': a.approved ? 'Sim' : 'Não',
            'Observações': a.notes || '',
          };
        })
      : [{ 'ID': '', 'Recurso ID': 'r1', 'Recurso': 'Nome Exemplo', 'Tipo': 'Férias', 'Data Início': '2025-07-01', 'Data Fim': '2025-07-15', 'Quantidade Dias': '', 'Aprovado': 'Sim', 'Observações': '' }];
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ausências');
    XLSX.writeFile(wb, 'ausencias.xlsx');
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
      const normalized = (value: unknown) => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
      const normalizeImportDate = (value: unknown) => {
        if (value instanceof Date && !Number.isNaN(value.getTime())) return format(value, 'yyyy-MM-dd');
        if (typeof value === 'number') {
          const parsed = XLSX.SSF.parse_date_code(value);
          if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
        }
        const text = String(value || '').trim();
        const brDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (brDate) return `${brDate[3]}-${brDate[2]}-${brDate[1]}`;
        return text;
      };
      const isValidImportDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('1900-01-00');
      const findResourceId = (row: any) => {
        const resourceId = String(row['Recurso ID'] || row['resourceId'] || '').trim();
        if (resourceId && resources.some((resource: any) => resource.id === resourceId)) return resourceId;
        const resourceName = normalized(row['Recurso'] || row['resource'] || row['Consultor'] || row['consultant']);
        return resources.find((resource: any) => normalized(resource.name) === resourceName)?.id || '';
      };

      let skipped = 0;
      const items = rows.flatMap(row => {
        const resourceId = findResourceId(row);
        const type = String(row['Tipo'] || row['type'] || 'Férias').trim();
        const startDate = normalizeImportDate(row['Data Início'] || row['startDate']);
        const endDate = normalizeImportDate(row['Data Fim'] || row['endDate'] || (isSoldVacationDays(type) ? startDate : ''));
        if (!resourceId || !isValidImportDate(startDate) || !isValidImportDate(endDate)) {
          skipped += 1;
          return [];
        }
        return [{
          id: String(row['ID'] || row['id'] || '').trim(),
          resourceId,
          resourceName: String(row['Recurso'] || row['resource'] || row['Consultor'] || row['consultant'] || '').trim(),
          type,
          startDate,
          endDate,
          daysCount: row['Quantidade Dias'] === undefined || row['Quantidade Dias'] === '' ? undefined : Number(row['Quantidade Dias']),
          approved: row['Aprovado'] === true || row['Aprovado'] === 'Sim' || row['approved'] === true,
          notes: String(row['Observações'] || row['notes'] || '').trim(),
        }];
      });

      if (items.length === 0) {
        toast.error("Nenhum registro válido encontrado. Confira se os recursos já estão cadastrados.");
        return;
      }
      const result = await bulkImportMutation.mutateAsync(items);
      const savedCount = ((result as any).created || 0) + ((result as any).updated || 0);
      if (savedCount === 0) {
        toast.error("Nenhuma ausência foi gravada. Confira se os consultores da planilha estão cadastrados em Recursos.");
        return;
      }
      const msg = (result as any).updated > 0
        ? `${(result as any).created} criadas, ${(result as any).updated} atualizadas`
        : `${savedCount} ausências importadas`;
      toast.success(msg);
      const serverSkipped = (result as any).skipped || 0;
      const totalSkipped = skipped + serverSkipped;
      if (totalSkipped > 0) toast.warning(`${totalSkipped} linhas ignoradas por recurso inexistente ou data inválida`);
    } catch (error: any) {
      toast.error(error?.message || "Erro ao importar arquivo. Verifique o formato.");
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Show vacation balance when the record consumes the vacation balance.
  const selectedResourceBalance = consumesVacationBalance(form.type) && form.resourceId ? getResourceBalance(form.resourceId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Férias e Ausências</h1>
          <p className="text-muted-foreground text-sm mt-1">Controle de férias, folgas e ausências</p>
        </div>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:justify-end">
          <Button variant="outline" onClick={downloadTemplate} className="w-full gap-2 sm:w-auto">
            <Download className="h-4 w-4" /> Modelo Excel
          </Button>
          {canEdit && <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full gap-2 sm:w-auto">
            <Upload className="h-4 w-4" /> Importar Excel
          </Button>}
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleBulkImport} />
          {canEdit && <Button onClick={openCreate} className="w-full gap-2 min-[420px]:col-span-2 sm:w-auto">
            <Plus className="h-4 w-4" /> Nova Ausência
          </Button>}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por recurso ou tipo..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('resource')}><span className="flex items-center">Recurso<SortIcon field="resource" /></span></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('type')}><span className="flex items-center">Tipo<SortIcon field="type" /></span></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('startDate')}><span className="flex items-center">Início<SortIcon field="startDate" /></span></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('endDate')}><span className="flex items-center">Fim<SortIcon field="endDate" /></span></TableHead>
                <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort('approved')}><span className="flex items-center justify-center">Aprovado<SortIcon field="approved" /></span></TableHead>
                <TableHead className="text-center">Saldo Férias</TableHead>
                <TableHead>Observações</TableHead>
                {canEdit && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(a => {
                const balance = getResourceBalance(a.resourceId);
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{getResourceName(a.resourceId)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeColor[a.type] || ''}`}>
                        {a.type}
                      </span>
                      {isSoldVacationDays(a.type) && (a as any).daysCount ? (
                        <span className="ml-2 text-xs text-muted-foreground">{(a as any).daysCount}d</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{a.startDate}</TableCell>
                    <TableCell>{isSoldVacationDays(a.type) ? '-' : a.endDate}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={a.approved ? 'default' : 'outline'}>{a.approved ? 'Sim' : 'Não'}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {balance ? (
                        <span className={`text-sm font-medium ${balance.balance <= 5 ? 'text-red-600' : 'text-green-600'}`}>
                          {balance.balance}d / {balance.entitled}d
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">{a.notes}</TableCell>
                    {canEdit && <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>}
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={canEdit ? 8 : 7} className="text-center py-8 text-muted-foreground">Nenhuma ausência encontrada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Ausência' : 'Nova Ausência'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Recurso</Label>
              <Select value={form.resourceId} onValueChange={v => setForm({ ...form, resourceId: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{resources.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Tipo de Ausência</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v, endDate: isSoldVacationDays(v) ? form.startDate : form.endDate })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ABSENCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {selectedResourceBalance && (
              <div className={`p-3 rounded-lg flex items-center gap-2 ${selectedResourceBalance.balance <= 5 ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'}`}>
                {selectedResourceBalance.balance <= 5 && <AlertTriangle className="h-4 w-4 text-red-600" />}
                <span className="text-sm">
                  Saldo de férias disponível: <strong className={selectedResourceBalance.balance <= 5 ? 'text-red-600' : 'text-blue-700'}>{selectedResourceBalance.balance} dias</strong> de {selectedResourceBalance.entitled} dias ({selectedResourceBalance.contractType === 'CLT' ? 'dias corridos' : 'dias úteis'})
                  {selectedResourceBalance.periodStart && selectedResourceBalance.periodEnd ? ` - período ${selectedResourceBalance.periodStart} a ${selectedResourceBalance.periodEnd}` : selectedResourceBalance.nextReleaseDate ? ` - libera em ${selectedResourceBalance.nextReleaseDate}` : ''}
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{isSoldVacationDays(form.type) ? 'Data da Venda' : 'Data Início'}</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value, endDate: isSoldVacationDays(form.type) ? e.target.value : form.endDate })} />
              </div>
              {isSoldVacationDays(form.type) ? (
                <div className="grid gap-2">
                  <Label>Quantidade de Dias</Label>
                  <Input type="number" min={1} max={365} value={form.daysCount || ''} onChange={e => setForm({ ...form, daysCount: Number(e.target.value) })} />
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label>Data Fim</Label>
                  <Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.approved} onCheckedChange={v => setForm({ ...form, approved: v })} />
              <Label>Aprovado</Label>
            </div>
            <div className="grid gap-2">
              <Label>Observações</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editing ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
