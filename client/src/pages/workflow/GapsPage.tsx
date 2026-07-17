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
import { toast } from "sonner";
import { Plus, Trash2, Search, Sparkles, AlertTriangle } from "lucide-react";

const PROJECT_ID = "default-project";

export default function GapsPage() {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showExtract, setShowExtract] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", type: "Gap", priority: "Medium", responsible: "" });

  const { data: gaps = [], refetch } = trpc.workflow.gaps.list.useQuery({ projectId: PROJECT_ID });
  const { data: dcds = [] } = trpc.workflow.dcd.list.useQuery({ projectId: PROJECT_ID });
  const createMut = trpc.workflow.gaps.create.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); toast.success("Gap criado"); } });
  const deleteMut = trpc.workflow.gaps.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Removido"); } });
  const updateMut = trpc.workflow.gaps.update.useMutation({ onSuccess: () => { refetch(); toast.success("Atualizado"); } });
  const extractMut = trpc.workflow.gaps.extractFromDcd.useMutation({
    onSuccess: (data: any) => { refetch(); setShowExtract(false); toast.success(`${data.extracted} gaps extraídos`); },
    onError: () => toast.error("Erro ao extrair gaps"),
  });

  const filtered = gaps.filter((g: any) => g.title?.toLowerCase().includes(search.toLowerCase()) || g.type?.toLowerCase().includes(search.toLowerCase()));

  const priorityColor = (p: string) => {
    if (p === "Alta" || p === "High") return "destructive" as const;
    if (p === "Média" || p === "Medium") return "secondary" as const;
    return "outline" as const;
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gaps</h1>
          <p className="text-muted-foreground text-sm">Funcionalidades não cobertas pelo padrão SAP</p>
        </div>
        <div className="flex gap-2">
          {dcds.length > 0 && (
            <Button variant="outline" onClick={() => setShowExtract(true)}>
              <Sparkles className="h-4 w-4 mr-2" />Extrair do DCD (IA)
            </Button>
          )}
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />Novo Gap</Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar gaps..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
        <Badge variant="secondary">{filtered.length} gaps</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum gap identificado.</TableCell></TableRow>
              ) : filtered.map((g: any) => (
                <TableRow key={g.id}>
                  <TableCell>
                    <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />{g.title}</div>
                    {g.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{g.description}</p>}
                  </TableCell>
                  <TableCell><Badge variant="outline">{g.type}</Badge></TableCell>
                  <TableCell><Badge variant={priorityColor(g.priority)}>{g.priority}</Badge></TableCell>
                  <TableCell>
                    <Select value={g.status || "Aberto"} onValueChange={(v: string) => updateMut.mutate({ id: g.id, data: { status: v } })}>
                      <SelectTrigger className="h-7 w-[110px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Aberto">Aberto</SelectItem>
                        <SelectItem value="Em Análise">Em Análise</SelectItem>
                        <SelectItem value="Resolvido">Resolvido</SelectItem>
                        <SelectItem value="Descartado">Descartado</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm">{g.responsible || "-"}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => deleteMut.mutate({ id: g.id })}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Gap</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Título *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>Descrição</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Tipo</Label><Select value={form.type} onValueChange={(v: string) => setForm(f => ({ ...f, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Gap">Gap</SelectItem><SelectItem value="Extensão">Extensão</SelectItem><SelectItem value="Integração">Integração</SelectItem></SelectContent></Select></div>
              <div><Label>Prioridade</Label><Select value={form.priority} onValueChange={(v: string) => setForm(f => ({ ...f, priority: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Alta">Alta</SelectItem><SelectItem value="Medium">Média</SelectItem><SelectItem value="Baixa">Baixa</SelectItem></SelectContent></Select></div>
              <div><Label>Responsável</Label><Input value={form.responsible} onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={() => createMut.mutate({ projectId: PROJECT_ID, ...form })} disabled={!form.title}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExtract} onOpenChange={setShowExtract}>
        <DialogContent>
          <DialogHeader><DialogTitle>Extrair Gaps do DCD (IA)</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Selecione um DCD para a IA extrair automaticamente os gaps.</p>
          <div className="grid gap-2">
            {dcds.map((doc: any) => (
              <Button key={doc.id} variant="outline" className="justify-start" onClick={() => extractMut.mutate({ projectId: PROJECT_ID, dcdId: doc.id, dcdContent: doc.content || "" })} disabled={extractMut.isPending}>
                {doc.title}
              </Button>
            ))}
          </div>
          {extractMut.isPending && <p className="text-sm text-muted-foreground">Analisando documento...</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
