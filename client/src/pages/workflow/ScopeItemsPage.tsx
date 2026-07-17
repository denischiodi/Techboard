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
import { toast } from "sonner";
import { Plus, Upload, Trash2, Search } from "lucide-react";

const PROJECT_ID = "default-project";

export default function ScopeItemsPage() {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", module: "", code: "", processArea: "", description: "" });
  const { data: items = [], refetch } = trpc.workflow.scopeItems.list.useQuery({ projectId: PROJECT_ID });
  const createMut = trpc.workflow.scopeItems.create.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); toast.success("Scope item criado"); } });
  const deleteMut = trpc.workflow.scopeItems.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Removido"); } });
  const bulkMut = trpc.workflow.scopeItems.bulkCreate.useMutation({ onSuccess: () => { refetch(); toast.success("Importação concluída"); } });

  const filtered = items.filter((i: any) => i.name?.toLowerCase().includes(search.toLowerCase()) || i.code?.toLowerCase().includes(search.toLowerCase()) || i.module?.toLowerCase().includes(search.toLowerCase()));

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const lines = text.split("\n").filter(Boolean);
        if (lines.length < 2) { toast.error("Arquivo vazio ou inválido"); return; }
        const headers = lines[0].split(/[,;\t]/).map((h: string) => h.trim().toLowerCase());
        const nameIdx = headers.findIndex((h: string) => h.includes("name") || h.includes("nome") || h.includes("description"));
        const moduleIdx = headers.findIndex((h: string) => h.includes("module") || h.includes("módulo") || h.includes("lob") || h.includes("line"));
        const codeIdx = headers.findIndex((h: string) => h.includes("code") || h.includes("código") || h.includes("id"));
        if (nameIdx === -1) { toast.error("Coluna 'name' não encontrada"); return; }
        const parsed = lines.slice(1).map((line: string) => {
          const cols = line.split(/[,;\t]/).map((c: string) => c.trim());
          return { name: cols[nameIdx] || "", module: moduleIdx >= 0 ? cols[moduleIdx] : "Geral", code: codeIdx >= 0 ? cols[codeIdx] : "" };
        }).filter((r: any) => r.name);
        bulkMut.mutate({ projectId: PROJECT_ID, items: parsed });
      } catch { toast.error("Erro ao processar arquivo"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">DDA / Scope Items</h1>
          <p className="text-muted-foreground text-sm">Scope items do projeto SAP S/4HANA</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><label className="cursor-pointer"><Upload className="h-4 w-4 mr-2" />Importar CSV<input type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleFileUpload} /></label></Button>
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />Novo Item</Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar scope items..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
        <Badge variant="secondary">{filtered.length} itens</Badge>
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
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum scope item. Importe um CSV ou adicione manualmente.</TableCell></TableRow>
              ) : filtered.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{item.code}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell><Badge variant="outline">{item.module || "-"}</Badge></TableCell>
                  <TableCell>{item.processArea || "-"}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => deleteMut.mutate({ id: item.id })}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Scope Item</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nome *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Código</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
              <div><Label>Módulo</Label><Select value={form.module} onValueChange={v => setForm(f => ({ ...f, module: v }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="SD">SD</SelectItem><SelectItem value="MM">MM</SelectItem><SelectItem value="FI">FI</SelectItem><SelectItem value="CO">CO</SelectItem><SelectItem value="PP">PP</SelectItem><SelectItem value="WM">WM</SelectItem><SelectItem value="QM">QM</SelectItem><SelectItem value="Geral">Geral</SelectItem></SelectContent></Select></div>
            </div>
            <div><Label>Área de Processo</Label><Input value={form.processArea} onChange={e => setForm(f => ({ ...f, processArea: e.target.value }))} /></div>
            <div><Label>Descrição</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={() => createMut.mutate({ projectId: PROJECT_ID, module: form.module || "Geral", name: form.name, code: form.code, processArea: form.processArea, description: form.description })} disabled={!form.name}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
