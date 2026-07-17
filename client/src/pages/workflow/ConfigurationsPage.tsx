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
import { Plus, Trash2, Search, Settings2 } from "lucide-react";

const PROJECT_ID = "default-project";

export default function ConfigurationsPage() {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", type: "Configuração", responsible: "" });

  const { data: configs = [], refetch } = trpc.workflow.configurations.list.useQuery({ projectId: PROJECT_ID });
  const createMut = trpc.workflow.configurations.create.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); toast.success("Configuração criada"); } });
  const deleteMut = trpc.workflow.configurations.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Removida"); } });
  const updateMut = trpc.workflow.configurations.update.useMutation({ onSuccess: () => { refetch(); } });

  const filtered = configs.filter((c: any) => c.title?.toLowerCase().includes(search.toLowerCase()) || c.type?.toLowerCase().includes(search.toLowerCase()));
  const doneCount = configs.filter((c: any) => c.status === "Concluído").length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-muted-foreground text-sm">Checklist de configurações a executar no sistema</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />Nova Configuração</Button>
      </div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar configurações..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
        <Badge variant="secondary">{filtered.length} itens</Badge>
        <Badge variant="outline" className="bg-green-50 text-green-700">{doneCount}/{configs.length} concluídos</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Configuração</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma configuração cadastrada.</TableCell></TableRow>
              ) : filtered.map((c: any) => (
                <TableRow key={c.id} className={c.status === "Concluído" ? "opacity-60" : ""}>
                  <TableCell>
                    <Checkbox checked={c.status === "Concluído"} onCheckedChange={(checked) => updateMut.mutate({ id: c.id, data: { status: checked ? "Concluído" : "Pendente" } })} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-teal-500" />{c.title}</div>
                    {c.description && <p className="text-xs text-muted-foreground mt-1">{c.description}</p>}
                  </TableCell>
                  <TableCell><Badge variant="outline">{c.type}</Badge></TableCell>
                  <TableCell className="text-sm">{c.responsible || "-"}</TableCell>
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
                  <TableCell><Button variant="ghost" size="icon" onClick={() => deleteMut.mutate({ id: c.id })}><Trash2 className="h-4 w-4" /></Button></TableCell>
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
            <div><Label>Título *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>Descrição</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v: string) => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Configuração">Configuração</SelectItem>
                    <SelectItem value="Customizing">Customizing</SelectItem>
                    <SelectItem value="Extensão">Extensão</SelectItem>
                    <SelectItem value="Migração">Migração</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Responsável</Label><Input value={form.responsible} onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={() => createMut.mutate({ projectId: PROJECT_ID, ...form })} disabled={!form.title}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
