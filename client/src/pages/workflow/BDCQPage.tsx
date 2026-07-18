import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Search, MessageSquare, Sparkles, Upload, FileSpreadsheet, History, Check, LoaderCircle } from "lucide-react";

import { useWorkflowProject } from "./useWorkflowProject";

export default function BDCQPage() {
  const { projectId: PROJECT_ID } = useWorkflowProject();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showAnswer, setShowAnswer] = useState<any>(null);
  const [form, setForm] = useState({ question: "", module: "", category: "" });
  const [answerForm, setAnswerForm] = useState({ answer: "", answeredBy: "", status: "Respondido" });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAnswerId, setSavedAnswerId] = useState("");
  const [showHistory, setShowHistory] = useState<any>(null);
  const lastSaved = useRef("");

  const { data: questions = [], refetch: refetchQ } = trpc.workflow.bdcq.questions.list.useQuery({ projectId: PROJECT_ID });
  const { data: answers = [], refetch: refetchA } = trpc.workflow.bdcq.answers.list.useQuery({ projectId: PROJECT_ID });
  const createQ = trpc.workflow.bdcq.questions.create.useMutation({ onSuccess: () => { refetchQ(); setShowAdd(false); toast.success("Pergunta criada"); } });
  const deleteQ = trpc.workflow.bdcq.questions.delete.useMutation({ onSuccess: () => { refetchQ(); toast.success("Removida"); } });
  const createA = trpc.workflow.bdcq.answers.create.useMutation();
  const updateA = trpc.workflow.bdcq.answers.update.useMutation();
  const { data: answerHistory = [] } = trpc.workflow.bdcq.answers.history.useQuery({ answerId: showHistory?.id || "" }, { enabled: Boolean(showHistory?.id) });
  const seedMut = trpc.workflow.bdcq.questions.seedDefaults.useMutation({ onSuccess: (data: any) => { refetchQ(); toast.success(`${data.added} perguntas padrão adicionadas`); } });
  const bulkCreate = trpc.workflow.bdcq.questions.bulkCreate.useMutation({ onSuccess: data => { refetchQ(); toast.success(`${data.added} perguntas importadas${data.ignored ? `; ${data.ignored} duplicadas ignoradas` : ""}`); }, onError: error => toast.error(error.message || "Erro ao importar perguntas") });

  const answerMap = new Map(answers.map((a: any) => [a.questionId, a]));
  const filtered = questions.filter((q: any) =>
    q.question?.toLowerCase().includes(search.toLowerCase()) ||
    q.module?.toLowerCase().includes(search.toLowerCase()) ||
    q.category?.toLowerCase().includes(search.toLowerCase())
  );
  const answeredCount = new Set(answers.map((answer: any) => answer.questionId)).size;

  const persistAnswer = (closeAfter = false) => {
    if (!showAnswer || !answerForm.answer.trim()) return;
    const snapshot = JSON.stringify({ answer: answerForm.answer, answeredBy: answerForm.answeredBy });
    if (snapshot === lastSaved.current) { if (closeAfter) setShowAnswer(null); return; }
    setSaveStatus("saving");
    const onSuccess = (saved: any) => {
      lastSaved.current = snapshot;
      if (saved?.id) setSavedAnswerId(saved.id);
      setSaveStatus("saved"); refetchA();
      if (closeAfter) { setShowAnswer(null); toast.success("Resposta salva"); }
    };
    const onError = (error: any) => { setSaveStatus("error"); toast.error(error.message || "Erro ao salvar resposta"); };
    if (savedAnswerId) updateA.mutate({ id: savedAnswerId, data: { answer: answerForm.answer, answeredBy: answerForm.answeredBy } }, { onSuccess, onError });
    else createA.mutate({ questionId: showAnswer.id, projectId: PROJECT_ID, answer: answerForm.answer, answeredBy: answerForm.answeredBy }, { onSuccess, onError });
  };

  useEffect(() => {
    if (!showAnswer || !answerForm.answer.trim()) return;
    const snapshot = JSON.stringify({ answer: answerForm.answer, answeredBy: answerForm.answeredBy });
    if (snapshot === lastSaved.current) return;
    setSaveStatus("saving");
    const timeout = window.setTimeout(() => persistAnswer(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [answerForm.answer, answerForm.answeredBy, showAnswer, savedAnswerId]);

  const openAnswer = (question: any, existing: any) => {
    const next = { answer: existing?.answer || "", answeredBy: existing?.answeredBy || "", status: "Respondido" };
    setShowAnswer(question); setAnswerForm(next); setSavedAnswerId(existing?.id || "");
    lastSaved.current = JSON.stringify({ answer: next.answer, answeredBy: next.answeredBy });
    setSaveStatus(existing ? "saved" : "idle");
  };

  const handleExcelImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const valueFrom = (row: Record<string, unknown>, names: string[]) => {
        const entry = Object.entries(row).find(([key]) => names.includes(normalize(key)));
        return String(entry?.[1] || "").trim();
      };
      const parsed = rows.map(row => ({
        question: valueFrom(row, ["pergunta", "question", "questao", "texto"]),
        module: valueFrom(row, ["modulo", "module", "frente", "lob"]) || "Geral",
        category: valueFrom(row, ["categoria", "category", "tema", "processo"]),
      })).filter(row => row.question);
      if (!parsed.length) { toast.error("Nenhuma pergunta encontrada. Use colunas Pergunta, Módulo e Categoria."); return; }
      bulkCreate.mutate({ projectId: PROJECT_ID, questions: parsed });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler a planilha");
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">BDCQ</h1>
          <p className="text-muted-foreground text-sm">Business Driven Configuration Questionnaire</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><label className="cursor-pointer"><Upload className="h-4 w-4 mr-2" />Importar Excel<input className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelImport} /></label></Button>
          <Button variant="outline" onClick={() => seedMut.mutate({ projectId: PROJECT_ID })} disabled={seedMut.isPending}>
            <Sparkles className="h-4 w-4 mr-2" />Carregar Padrão SAP
          </Button>
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />Nova Pergunta</Button>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0" /><p>Ao cadastrar scope items, o sistema adiciona automaticamente perguntas padrão dos módulos correspondentes. Na importação, perguntas duplicadas são ignoradas.</p></div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar perguntas..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
        <Badge variant="secondary">{filtered.length} perguntas</Badge>
        <Badge variant="outline">{answeredCount} respondidas</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Módulo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Pergunta</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma pergunta. Use "Carregar Padrão SAP" ou adicione manualmente.</TableCell></TableRow>
              ) : filtered.map((q: any) => {
                const ans = answerMap.get(q.id);
                return (
                  <TableRow key={q.id}>
                    <TableCell><Badge variant="outline">{q.module || "-"}</Badge></TableCell>
                    <TableCell className="text-sm">{q.category || "-"}</TableCell>
                    <TableCell className="max-w-[300px]">
                      <p className="truncate">{q.question}</p>
                      {ans ? <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><MessageSquare className="h-3 w-3" />{String((ans as any).answer || "").slice(0, 50)}...</p> : null}
                    </TableCell>
                    <TableCell>
                      {ans ? <Badge className="bg-green-100 text-green-800">Respondida</Badge> : <Badge variant="outline">Pendente</Badge>}
                    </TableCell>
                    <TableCell className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openAnswer(q, ans)}>
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                      {ans && <Button variant="ghost" size="icon" onClick={() => setShowHistory(ans)} title="Histórico da resposta"><History className="h-4 w-4" /></Button>}
                      <Button variant="ghost" size="icon" onClick={() => deleteQ.mutate({ id: q.id })}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Question Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Pergunta BDCQ</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Pergunta *</Label><Textarea value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Módulo</Label><Select value={form.module} onValueChange={v => setForm(f => ({ ...f, module: v }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="SD">SD</SelectItem><SelectItem value="MM">MM</SelectItem><SelectItem value="FI">FI</SelectItem><SelectItem value="CO">CO</SelectItem><SelectItem value="PP">PP</SelectItem><SelectItem value="WM">WM</SelectItem></SelectContent></Select></div>
              <div><Label>Categoria</Label><Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Pricing, Purchasing..." /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={() => createQ.mutate({ projectId: PROJECT_ID, module: form.module || "Geral", question: form.question, category: form.category })} disabled={!form.question}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Answer Dialog */}
      <Dialog open={!!showAnswer} onOpenChange={open => { if (!open) setShowAnswer(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Responder Pergunta</DialogTitle></DialogHeader>
          {showAnswer && <p className="text-sm text-muted-foreground border-l-2 pl-3">{showAnswer.question}</p>}
          <div className="grid gap-3">
            <div><Label>Resposta</Label><Textarea value={answerForm.answer} onChange={e => setAnswerForm(f => ({ ...f, answer: e.target.value }))} rows={4} /></div>
            <div><Label>Respondido por</Label><Input value={answerForm.answeredBy} onChange={e => setAnswerForm(f => ({ ...f, answeredBy: e.target.value }))} /></div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">{saveStatus === "saving" && <><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Salvando...</>}{saveStatus === "saved" && <><Check className="h-3.5 w-3.5 text-emerald-600" />Salvo automaticamente</>}{saveStatus === "error" && <span className="text-red-600">Não foi possível salvar</span>}{saveStatus === "idle" && <span>O salvamento ocorre 1,5 segundo após parar de digitar.</span>}</div>
          </div>
          <DialogFooter>
            <Button onClick={() => persistAnswer(true)} disabled={!answerForm.answer || createA.isPending || updateA.isPending}>
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showHistory} onOpenChange={() => setShowHistory(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Histórico da resposta</DialogTitle></DialogHeader>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-medium text-emerald-800">Versão atual</p><p className="mt-1 whitespace-pre-wrap text-sm">{showHistory?.answer}</p><p className="mt-2 text-xs text-muted-foreground">Respondido por {showHistory?.answeredBy || "Não informado"}</p></div>
          {answerHistory.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não existem versões anteriores.</p> : <div className="space-y-3">{answerHistory.map((version: any) => <div key={version.id} className="rounded-md border p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-medium">Versão anterior</p><span className="text-xs text-muted-foreground">{new Date(version.createdAt).toLocaleString("pt-BR")}</span></div><p className="mt-2 whitespace-pre-wrap text-sm">{version.answer}</p><p className="mt-2 text-xs text-muted-foreground">Respondido por {version.answeredBy || "Não informado"} · Alterado por {version.changedBy || "Não informado"}</p></div>)}</div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
