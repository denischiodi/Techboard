import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Sparkles, FileText, Eye, Pencil, Save, GitCompare, Download } from "lucide-react";

import { useWorkflowProject } from "./useWorkflowProject";

type DiffLine = { type: "same" | "added" | "removed"; text: string };

function buildLineDiff(previous = "", current = ""): DiffLine[] {
  const before = previous.split("\n");
  const after = current.split("\n");
  if (before.length * after.length > 160_000) {
    return [...before.map(text => ({ type: "removed" as const, text })), ...after.map(text => ({ type: "added" as const, text }))];
  }
  const matrix = Array.from({ length: before.length + 1 }, () => new Uint16Array(after.length + 1));
  for (let i = before.length - 1; i >= 0; i--) for (let j = after.length - 1; j >= 0; j--) {
    matrix[i][j] = before[i] === after[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
  }
  const result: DiffLine[] = [];
  let i = 0; let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) { result.push({ type: "same", text: before[i] }); i++; j++; }
    else if (j < after.length && (i === before.length || matrix[i][j + 1] >= matrix[i + 1][j])) { result.push({ type: "added", text: after[j++] }); }
    else { result.push({ type: "removed", text: before[i++] }); }
  }
  return result;
}

export default function DCDPage() {
  const { projectId: PROJECT_ID } = useWorkflowProject();
  const utils = trpc.useUtils();
  const [showGenerate, setShowGenerate] = useState(false);
  const [showView, setShowView] = useState<any>(null);
  const [front, setFront] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [comparison, setComparison] = useState<{ previous: any; current: any } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [refineDoc, setRefineDoc] = useState<any>(null);
  const [refinementFeedback, setRefinementFeedback] = useState("");
  const [streamContent, setStreamContent] = useState("");
  const [streamStatus, setStreamStatus] = useState<"idle" | "connecting" | "streaming" | "complete" | "error">("idle");
  const [streamMessage, setStreamMessage] = useState("");
  const streamRef = useRef<EventSource | null>(null);

  const { data: documents = [], refetch } = trpc.workflow.dcd.list.useQuery({ projectId: PROJECT_ID });
  const { data: generationStatus, isFetching: checkingCache } = trpc.workflow.dcd.generationStatus.useQuery(
    { projectId: PROJECT_ID, module: front || undefined },
    { enabled: showGenerate && Boolean(PROJECT_ID) },
  );
  useEffect(() => () => streamRef.current?.close(), []);
  const deleteMut = trpc.workflow.dcd.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Removido"); } });
  const updateMut = trpc.workflow.dcd.update.useMutation({
    onSuccess: () => { refetch(); setEditing(null); toast.success("DCD atualizado"); },
    onError: (error) => toast.error(error.message || "Erro ao salvar DCD"),
  });
  const bulkUpdateMut = trpc.workflow.dcd.bulkUpdate.useMutation({
    onSuccess: data => { refetch(); setSelectedIds([]); toast.success(`${data.updated} DCDs aprovados`); },
    onError: error => toast.error(error.message || "Erro ao aprovar DCDs"),
  });
  const exportPdfMut = trpc.workflow.dcd.exportPdf.useMutation({
    onSuccess: data => {
      const bytes = Uint8Array.from(window.atob(data.base64), character => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: data.contentType }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = data.filename; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("PDF exportado com sucesso");
    },
    onError: error => toast.error(error.message || "Erro ao exportar PDF"),
  });
  const refineMut = trpc.workflow.dcd.refine.useMutation({
    onSuccess: data => {
      refetch(); setRefineDoc(null); setRefinementFeedback("");
      toast.success(`DCD refinado como versão v${data.version}`);
    },
    onError: error => toast.error(error.message || "Erro ao refinar DCD"),
  });

  const wrapSelection = (before: string, after = before) => {
    const textarea = document.getElementById("dcd-editor") as HTMLTextAreaElement | null;
    if (!textarea || !editing) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const content = editing.content || "";
    setEditing({ ...editing, content: content.slice(0, start) + before + content.slice(start, end) + after + content.slice(end) });
  };

  const previousVersion = (doc: any) => documents
    .filter((candidate: any) => candidate.id !== doc.id && candidate.version < doc.version && ((doc.seriesId && candidate.seriesId === doc.seriesId) || (!doc.seriesId && candidate.module === doc.module)))
    .sort((a: any, b: any) => b.version - a.version)[0];

  const loadDocument = async (doc: any) => {
    try {
      return await utils.workflow.dcd.get.fetch({ id: doc.id });
    } catch (error: any) {
      toast.error(error?.message || "Erro ao carregar DCD");
      return null;
    }
  };

  const openDocument = async (doc: any, mode: "view" | "edit") => {
    const fullDocument = await loadDocument(doc);
    if (!fullDocument) return;
    if (mode === "view") setShowView(fullDocument);
    else setEditing({ ...fullDocument });
  };

  const compareVersions = async (doc: any) => {
    const previous = previousVersion(doc);
    if (!previous) return;
    const [fullPrevious, fullCurrent] = await Promise.all([loadDocument(previous), loadDocument(doc)]);
    if (fullPrevious && fullCurrent) setComparison({ previous: fullPrevious, current: fullCurrent });
  };

  const startStreamingGeneration = (forceRegenerate: boolean) => {
    streamRef.current?.close();
    setStreamContent(""); setStreamStatus("connecting"); setStreamMessage("Conectando ao gerador...");
    const params = new URLSearchParams({ projectId: PROJECT_ID });
    if (front.trim()) params.set("module", front.trim());
    if (forceRegenerate) params.set("forceRegenerate", "true");
    const source = new EventSource(`/api/workflow/dcd/stream?${params.toString()}`, { withCredentials: true });
    streamRef.current = source;
    source.addEventListener("status", event => {
      const data = JSON.parse((event as MessageEvent).data);
      setStreamStatus("streaming"); setStreamMessage(data.message || "Gerando DCD...");
    });
    source.addEventListener("delta", event => {
      const data = JSON.parse((event as MessageEvent).data);
      setStreamStatus("streaming"); setStreamMessage("Recebendo conteúdo da IA..."); setStreamContent(current => current + (data.text || ""));
    });
    source.addEventListener("complete", event => {
      const data = JSON.parse((event as MessageEvent).data);
      source.close(); streamRef.current = null;
      if (data.cached && data.content) setStreamContent(data.content);
      setStreamStatus("complete"); setStreamMessage(data.cached ? "Versão em cache reutilizada." : `DCD v${data.version} gerado e salvo.`);
      refetch(); toast.success(data.cached ? "Versão em cache reutilizada" : `DCD v${data.version} gerado com sucesso`);
    });
    source.addEventListener("generation_error", event => {
      const data = JSON.parse((event as MessageEvent).data);
      source.close(); streamRef.current = null; setStreamStatus("error"); setStreamMessage(data.message || "Erro ao gerar DCD"); toast.error(data.message || "Erro ao gerar DCD");
    });
    source.onerror = () => {
      if (streamRef.current !== source) return;
      source.close(); streamRef.current = null; setStreamStatus("error"); setStreamMessage("A conexão com a geração foi interrompida.");
    };
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">DCD - Design de Configuração Detalhada</h1>
          <p className="text-muted-foreground text-sm">Documentos gerados por IA a partir dos scope items, BDCQ e atas</p>
        </div>
        <Button onClick={() => setShowGenerate(true)}><Sparkles className="h-4 w-4 mr-2" />Gerar DCD (IA)</Button>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
          <Badge>{selectedIds.length} DCDs selecionados</Badge>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSelectedIds([])}>Limpar seleção</Button>
            <Button onClick={() => bulkUpdateMut.mutate({ projectId: PROJECT_ID, ids: selectedIds, data: { status: "Aprovado" } })} disabled={bulkUpdateMut.isPending}>
              Aprovar selecionados
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {documents.length === 0 ? (
          <Card className="col-span-full"><CardContent className="py-8 text-center text-muted-foreground">Nenhum DCD gerado. Clique em "Gerar DCD (IA)" para criar.</CardContent></Card>
        ) : documents.map((doc: any) => (
          <Card key={doc.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <Checkbox
                    aria-label={`Selecionar ${doc.title}`}
                    checked={selectedIds.includes(doc.id)}
                    onCheckedChange={() => setSelectedIds(current => current.includes(doc.id) ? current.filter(id => id !== doc.id) : [...current, doc.id])}
                  />
                  <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />{doc.title}</CardTitle>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => void openDocument(doc, "view")}><Eye className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => void openDocument(doc, "edit")}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" title="Refinar com IA" onClick={() => { setRefineDoc(doc); setRefinementFeedback(""); }}><Sparkles className="h-4 w-4" /></Button>
                  {doc.status === "Aprovado" && <Button variant="ghost" size="icon" title="Exportar PDF" onClick={() => exportPdfMut.mutate({ id: doc.id })}><Download className="h-4 w-4" /></Button>}
                  <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate({ id: doc.id })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {doc.module && <Badge variant="outline">{doc.module}</Badge>}
                <Badge variant="outline">v{doc.version || 1}</Badge>
                <Badge variant="secondary">{doc.status || "Rascunho"}</Badge>
              </div>
              {doc.createdAt && <p className="text-xs text-muted-foreground mt-2">Gerado em: {new Date(doc.createdAt).toLocaleString("pt-BR")}</p>}
              {previousVersion(doc) && <Button className="mt-3" size="sm" variant="outline" onClick={() => void compareVersions(doc)}><GitCompare className="mr-2 h-4 w-4" />Comparar com v{previousVersion(doc).version}</Button>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showGenerate} onOpenChange={open => { setShowGenerate(open); if (!open) { streamRef.current?.close(); streamRef.current = null; setStreamStatus("idle"); setStreamContent(""); } }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Gerar DCD via IA</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">A IA irá consolidar scope items, respostas do BDCQ e atas de workshop para gerar o documento.</p>
          <div><Label>Frente/Módulo (opcional)</Label><Input value={front} onChange={e => setFront(e.target.value)} placeholder="Ex: SD, MM, FI..." /></div>
          {checkingCache && <p className="text-sm text-muted-foreground">Verificando versões existentes...</p>}
          {generationStatus?.cached && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Os dados não mudaram.</strong> A versão v{generationStatus.cached.version} pode ser reutilizada sem custo de IA.</div>}
          {!generationStatus?.cached && generationStatus && <p className="text-sm text-muted-foreground">A próxima geração criará a versão v{generationStatus.nextVersion}.</p>}
          {streamStatus !== "idle" && <div className="grid gap-2"><div className={`rounded-md border p-3 text-sm ${streamStatus === "error" ? "border-red-200 bg-red-50 text-red-800" : streamStatus === "complete" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-muted/40"}`}>{streamMessage}</div>{streamContent && <div className="max-h-[45vh] overflow-auto rounded-md border bg-background p-4 font-mono text-xs whitespace-pre-wrap">{streamContent}</div>}</div>}
          <DialogFooter>
            {streamStatus === "complete" ? <Button onClick={() => { setShowGenerate(false); setStreamStatus("idle"); setStreamContent(""); }}>Fechar</Button> : <>
              {generationStatus?.cached && <Button variant="outline" onClick={() => startStreamingGeneration(false)} disabled={["connecting", "streaming"].includes(streamStatus)}>Usar versão em cache</Button>}
              <Button onClick={() => startStreamingGeneration(Boolean(generationStatus?.cached))} disabled={["connecting", "streaming"].includes(streamStatus) || checkingCache}>
                <Sparkles className="h-4 w-4 mr-2" />{["connecting", "streaming"].includes(streamStatus) ? "Gerando..." : generationStatus?.cached ? "Gerar nova versão" : "Gerar com acompanhamento"}
              </Button>
            </>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!comparison} onOpenChange={() => setComparison(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden">
          <DialogHeader><DialogTitle>Alterações: v{comparison?.previous.version} → v{comparison?.current.version}</DialogTitle></DialogHeader>
          <div className="max-h-[68vh] overflow-auto rounded-md border font-mono text-xs">
            {comparison && buildLineDiff(comparison.previous.content, comparison.current.content).map((line, index) => (
              <div key={index} className={`flex px-3 py-0.5 ${line.type === "added" ? "bg-emerald-100 text-emerald-950" : line.type === "removed" ? "bg-red-100 text-red-950" : "bg-background"}`}>
                <span className="mr-3 w-4 select-none text-muted-foreground">{line.type === "added" ? "+" : line.type === "removed" ? "−" : " "}</span>
                <span className="whitespace-pre-wrap">{line.text || " "}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!refineDoc} onOpenChange={open => { if (!open) { setRefineDoc(null); setRefinementFeedback(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Refinar {refineDoc?.title}</DialogTitle></DialogHeader>
          <div className="grid gap-2">
            <Label>O que deve ser ajustado?</Label>
            <Textarea rows={6} value={refinementFeedback} onChange={event => setRefinementFeedback(event.target.value)} placeholder="Ex: detalhe a seção de integrações e adicione cenários de teste para aprovação por alçada." />
            <p className="text-xs text-muted-foreground">O documento atual será preservado e o resultado será criado como uma nova versão em rascunho.</p>
          </div>
          <DialogFooter><Button onClick={() => refineMut.mutate({ id: refineDoc.id, feedback: refinementFeedback })} disabled={refinementFeedback.trim().length < 10 || refineMut.isPending}><Sparkles className="mr-2 h-4 w-4" />{refineMut.isPending ? "Refinando..." : "Criar nova versão"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showView} onOpenChange={() => setShowView(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{showView?.title}</DialogTitle></DialogHeader>
          <div className="prose prose-sm dark:prose-invert whitespace-pre-wrap">{showView?.content}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Editar DCD</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Input value={editing?.title || ""} onChange={e => setEditing({ ...editing, title: e.target.value })} />
            <div className="flex flex-wrap gap-1 rounded-md border bg-muted/30 p-2">
              <Button type="button" size="sm" variant="outline" onClick={() => wrapSelection("**")}>Negrito</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => wrapSelection("_")}>Itálico</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => wrapSelection("\n## ", "")}>Título</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => wrapSelection("\n- ", "")}>Lista</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => wrapSelection("\n| Coluna | Valor |\n| --- | --- |\n| ", " |\n")}>Tabela</Button>
            </div>
            <Textarea id="dcd-editor" className="min-h-[45vh] font-mono text-sm" value={editing?.content || ""} onChange={e => setEditing({ ...editing, content: e.target.value })} />
            <Select value={editing?.status || "Rascunho"} onValueChange={status => setEditing({ ...editing, status })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Rascunho">Rascunho</SelectItem><SelectItem value="Em revisão">Em revisão</SelectItem><SelectItem value="Aprovado">Aprovado</SelectItem></SelectContent>
            </Select>
          </div>
          <DialogFooter><Button onClick={() => updateMut.mutate({ id: editing.id, data: { title: editing.title, content: editing.content, status: editing.status } })} disabled={updateMut.isPending}><Save className="mr-2 h-4 w-4" />Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
