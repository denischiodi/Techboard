import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, FileText, Sparkles, Upload, Calendar, Lightbulb } from "lucide-react";

const PROJECT_ID = "default-project";

export default function WorkshopsPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedWs, setSelectedWs] = useState<any>(null);
  const [showAgenda, setShowAgenda] = useState(false);
  const [agendaSuggestion, setAgendaSuggestion] = useState("");
  const [form, setForm] = useState({ title: "", date: "", startTime: "", endTime: "", notes: "" });

  const { data: workshops = [], refetch } = trpc.workflow.workshops.list.useQuery({ projectId: PROJECT_ID });
  const createWs = trpc.workflow.workshops.create.useMutation({ onSuccess: () => { refetch(); setShowAdd(false); toast.success("Workshop criado"); } });
  const deleteWs = trpc.workflow.workshops.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Removido"); } });
  const suggestAgenda = trpc.workflow.workshops.suggestAgenda.useMutation({
    onSuccess: (data: any) => { setAgendaSuggestion(data.suggestion); setShowAgenda(true); },
    onError: () => toast.error("Erro ao gerar sugestão"),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workshops</h1>
          <p className="text-muted-foreground text-sm">Gestão de workshops de levantamento</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => suggestAgenda.mutate({ projectId: PROJECT_ID })} disabled={suggestAgenda.isPending}>
            <Lightbulb className="h-4 w-4 mr-2" />{suggestAgenda.isPending ? "Gerando..." : "Sugerir Agenda (IA)"}
          </Button>
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />Novo Workshop</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {workshops.length === 0 ? (
          <Card className="col-span-full"><CardContent className="py-8 text-center text-muted-foreground">Nenhum workshop agendado.</CardContent></Card>
        ) : workshops.map((ws: any) => (
          <Card key={ws.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedWs(ws)}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{ws.title}</CardTitle>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteWs.mutate({ id: ws.id }); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              {ws.date && <p className="text-sm text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />{ws.date}</p>}
              <Badge variant="outline" className="mt-2">{ws.status || "Planejado"}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedWs && <WorkshopDetail ws={selectedWs} onClose={() => setSelectedWs(null)} />}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Workshop</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Título *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Data</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div><Label>Início</Label><Input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} /></div>
              <div><Label>Fim</Label><Input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} /></div>
            </div>
            <div><Label>Notas</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={() => createWs.mutate({ projectId: PROJECT_ID, ...form })} disabled={!form.title}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAgenda} onOpenChange={setShowAgenda}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Sugestão de Agenda (IA)</DialogTitle></DialogHeader>
          <div className="prose prose-sm dark:prose-invert whitespace-pre-wrap">{agendaSuggestion}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WorkshopDetail({ ws, onClose }: { ws: any; onClose: () => void }) {
  const [transcriptContent, setTranscriptContent] = useState("");
  const [transcriptTitle, setTranscriptTitle] = useState("");
  const { data: transcripts = [], refetch: refetchT } = trpc.workflow.workshops.transcripts.list.useQuery({ workshopId: ws.id });
  const { data: minutes } = trpc.workflow.workshops.minutes.get.useQuery({ workshopId: ws.id });
  const createT = trpc.workflow.workshops.transcripts.create.useMutation({ onSuccess: () => { refetchT(); setTranscriptContent(""); setTranscriptTitle(""); toast.success("Transcrição adicionada"); } });
  const generateMinutes = trpc.workflow.workshops.minutes.generate.useMutation({ onSuccess: () => { toast.success("Ata gerada com sucesso!"); } });

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{ws.title}</CardTitle>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="font-semibold mb-2 flex items-center gap-2"><FileText className="h-4 w-4" />Transcrições ({transcripts.length})</h3>
          {transcripts.map((t: any) => (
            <div key={t.id} className="border rounded p-2 mb-2 text-sm">
              <p className="font-medium">{t.title || "Transcrição"}</p>
              <p className="text-muted-foreground line-clamp-2">{t.content?.slice(0, 200)}</p>
            </div>
          ))}
          <div className="grid gap-2 mt-2">
            <Input placeholder="Título da transcrição" value={transcriptTitle} onChange={e => setTranscriptTitle(e.target.value)} />
            <Textarea placeholder="Cole a transcrição aqui..." value={transcriptContent} onChange={e => setTranscriptContent(e.target.value)} rows={4} />
            <Button variant="outline" onClick={() => createT.mutate({ workshopId: ws.id, content: transcriptContent || transcriptTitle })} disabled={!transcriptContent}>
              <Upload className="h-4 w-4 mr-2" />Adicionar Transcrição
            </Button>
          </div>
        </div>
        <div>
          <h3 className="font-semibold mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4" />Ata de Reunião</h3>
          {minutes ? (
            <div className="border rounded p-3 text-sm whitespace-pre-wrap">{(minutes as any).content}</div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma ata gerada ainda.</p>
          )}
          <Button className="mt-2" onClick={() => generateMinutes.mutate({ workshopId: ws.id })} disabled={generateMinutes.isPending || transcripts.length === 0}>
            <Sparkles className="h-4 w-4 mr-2" />{generateMinutes.isPending ? "Gerando..." : "Gerar Ata (IA)"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
