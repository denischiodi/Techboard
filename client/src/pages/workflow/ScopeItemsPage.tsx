import { useState } from "react";
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
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  History,
  Plus,
  Upload,
  Trash2,
  Search,
} from "lucide-react";
import { useWorkflowProject } from "./useWorkflowProject";
import { useAuth } from "@/_core/hooks/useAuth";
import { parseDdaWorkbook } from "../../../../shared/ddaImport";

export default function ScopeItemsPage() {
  const PAGE_SIZE = 50;
  const { projectId: PROJECT_ID } = useWorkflowProject();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [page, setPage] = useState(0);
  const [form, setForm] = useState({
    name: "",
    module: "",
    code: "",
    processArea: "",
    description: "",
  });
  const { data: pageItems = [], refetch } =
    trpc.workflow.scopeItems.list.useQuery({
      projectId: PROJECT_ID,
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE + 1,
    });
  const { data: importHistory = [], refetch: refetchImportHistory } =
    trpc.workflow.scopeItems.importHistory.useQuery({ projectId: PROJECT_ID });
  const hasNextPage = pageItems.length > PAGE_SIZE;
  const items = pageItems.slice(0, PAGE_SIZE);
  const { data: lookups } = trpc.settings.getLookups.useQuery();
  const { data: appUser } = trpc.access.getByEmail.useQuery(
    { email: user?.email || "" },
    { enabled: Boolean(user?.email) }
  );
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const modules = [
    ...new Set([
      ...(lookups?.fronts || [])
        .filter((item: any) => item.active)
        .map((item: any) => item.value),
      "Geral",
    ]),
  ];
  const createMut = trpc.workflow.scopeItems.create.useMutation({
    onSuccess: () => {
      refetch();
      setShowAdd(false);
      toast.success("Scope item criado");
    },
  });
  const deleteMut = trpc.workflow.scopeItems.delete.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Removido");
    },
  });
  const bulkMut = trpc.workflow.scopeItems.bulkCreate.useMutation({
    onSuccess: result => {
      void Promise.all([refetch(), refetchImportHistory()]);
      const processed = result.created + result.updated;
      if (result.pending) {
        toast.warning(
          `${processed} processado(s) e ${result.pending} pendente(s) para reprocessamento`
        );
      } else {
        toast.success(`${processed} scope item(s) processado(s)`);
      }
    },
  });

  const linkedResource = resources.find(
    (resource: any) =>
      resource.id === appUser?.resourceId ||
      resource.email?.toLowerCase() === user?.email?.toLowerCase()
  );
  const scopedFronts =
    appUser?.role === "technical_lead"
      ? appUser.teamFronts || []
      : appUser?.role === "consultant"
        ? linkedResource?.fronts || [linkedResource?.front].filter(Boolean)
        : [];
  const visibleItems = scopedFronts.length
    ? items.filter((item: any) => scopedFronts.includes(item.module))
    : items;
  const filtered = visibleItems.filter(
    (i: any) =>
      i.name?.toLowerCase().includes(search.toLowerCase()) ||
      i.code?.toLowerCase().includes(search.toLowerCase()) ||
      i.module?.toLowerCase().includes(search.toLowerCase())
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseDdaWorkbook(await file.arrayBuffer(), file.name);
      if (!parsed.length)
        throw new Error(
          "Nenhum scope item foi encontrado. Verifique os cabeçalhos da planilha."
        );
      await bulkMut.mutateAsync({
        projectId: PROJECT_ID,
        fileName: file.name,
        items: parsed.map(item => ({
          name: item.name,
          module: item.module || "Geral",
          code: item.code,
          processArea: item.processArea,
          description: item.description,
          active: item.active ? 1 : 0,
        })),
      });
      setPage(0);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Erro ao processar o arquivo DDA"
      );
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">DDA / Scope Items</h1>
          <p className="text-muted-foreground text-sm">
            Scope items do projeto SAP S/4HANA
          </p>
        </div>
        <div className="flex flex-col gap-2 min-[420px]:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="outline" asChild disabled={bulkMut.isPending}>
            <label className="cursor-pointer">
              <Upload className="h-4 w-4 mr-2" />
              {bulkMut.isPending ? "Importando..." : "Importar DDA"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.txt,.tsv"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Item
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar scope items nesta página..."
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="max-w-sm"
        />
        <Badge variant="secondary">{filtered.length} itens nesta página</Badge>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Área de Processo</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    Nenhum scope item. Importe uma planilha DDA ou adicione
                    manualmente.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">
                      {item.code}
                    </TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.module || "-"}</Badge>
                    </TableCell>
                    <TableCell>{item.processArea || "-"}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMut.mutate({ id: item.id })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Histórico de importações do DDA</h2>
          </div>
          {(importHistory as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma importação registrada.
            </p>
          ) : (
            (importHistory as any[]).map(batch => (
              <details key={batch.id} className="rounded-md border p-3">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center gap-2">
                    {Number(batch.pending) > 0 ? (
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    )}
                    <span className="font-medium">{batch.fileName}</span>
                    <Badge variant="outline">{batch.total} linha(s)</Badge>
                    <Badge className="bg-emerald-100 text-emerald-900">
                      {batch.created} criado(s)
                    </Badge>
                    <Badge className="bg-blue-100 text-blue-900">
                      {batch.updated} atualizado(s)
                    </Badge>
                    {Number(batch.pending) > 0 && (
                      <Badge className="bg-amber-100 text-amber-900">
                        {batch.pending} pendente(s)
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {batch.createdAt
                        ? new Date(batch.createdAt).toLocaleString("pt-BR")
                        : ""}
                    </span>
                  </div>
                </summary>
                <div className="mt-3 space-y-2 border-t pt-3">
                  {(batch.items || []).map((item: any) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-1 rounded-md bg-muted/40 p-2 text-sm sm:flex-row sm:items-center"
                    >
                      <span className="font-mono font-medium">
                        {item.code || "Sem código"}
                      </span>
                      <Badge variant="outline">
                        {item.status === "pending"
                          ? "Pendente"
                          : item.status === "discarded"
                            ? "Descartado"
                            : item.result === "created"
                              ? "Criado"
                              : "Atualizado"}
                      </Badge>
                      {item.errorMessage && (
                        <span className="text-amber-800">
                          {item.errorMessage}
                        </span>
                      )}
                      {item.resolvedAt && item.attempts > 1 && (
                        <span className="text-xs text-emerald-700">
                          Resolvido automaticamente em{" "}
                          {new Date(item.resolvedAt).toLocaleString("pt-BR")}
                        </span>
                      )}
                      <span className="sm:ml-auto text-xs text-muted-foreground">
                        {item.attempts} tentativa(s)
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            ))
          )}
        </CardContent>
      </Card>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Página {page + 1}</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setPage(current => Math.max(0, current - 1))}
            disabled={page === 0}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            onClick={() => setPage(current => current + 1)}
            disabled={!hasNextPage}
          >
            Próxima
          </Button>
        </div>
      </div>
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Scope Item</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O cadastro administrativo não exige anexo.
          </p>
          <div className="grid gap-3">
            <div>
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Código</Label>
                <Input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                />
              </div>
              <div>
                <Label>Frente/Módulo</Label>
                <Select
                  value={form.module}
                  onValueChange={v => setForm(f => ({ ...f, module: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {modules.map(module => (
                      <SelectItem key={module} value={module}>
                        {module}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Área de Processo</Label>
              <Input
                value={form.processArea}
                onChange={e =>
                  setForm(f => ({ ...f, processArea: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={e =>
                  setForm(f => ({ ...f, description: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                createMut.mutate({
                  projectId: PROJECT_ID,
                  module: form.module || "Geral",
                  name: form.name,
                  code: form.code,
                  processArea: form.processArea,
                  description: form.description,
                })
              }
              disabled={!form.name}
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
