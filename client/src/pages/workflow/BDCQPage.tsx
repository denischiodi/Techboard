import { useState } from "react";
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
import { Plus, Trash2, Search, MessageSquare, Sparkles, Paperclip } from "lucide-react";

const PROJECT_ID = "default-project";

export default function BDCQPage() {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showAnswer, setShowAnswer] = useState<any>(null);
  const [form, setForm] = useState({ question: "", module: "", category: "" });
  const [answerForm, setAnswerForm] = useState({ answer: "", answeredBy: "", status: "Respondido" });

  const { data: questions = [], refetch: refetchQ } = trpc.workflow.bdcq.questions.list.useQuery({ projectId: PROJECT_ID });
  const { data: answers = [], refetch: refetchA } = trpc.workflow.bdcq.answers.list.useQuery({ projectId: PROJECT_ID });
  const createQ = trpc.workflow.bdcq.questions.create.useMutation({ onSuccess: () => { refetchQ(); setShowAdd(false); toast.success("Pergunta criada"); } });
  const deleteQ = trpc.workflow.bdcq.questions.delete.useMutation({ onSuccess: () => { refetchQ(); toast.success("Removida"); } });
  const createA = trpc.workflow.bdcq.answers.create.useMutation({ onSuccess: () => { refetchA(); setShowAnswer(null); toast.success("Resposta salva"); } });
  const seedMut = trpc.workflow.bdcq.questions.seedDefaults.useMutation({ onSuccess: (data: any) => { refetchQ(); toast.success(`${data.added} perguntas padrão adicionadas`); } });

  const answerMap = new Map(answers.map((a: any) => [a.questionId, a]));
  const filtered = questions.filter((q: any) =>
    q.question?.toLowerCase().includes(search.toLowerCase()) ||
    q.module?.toLowerCase().includes(search.toLowerCase()) ||
    q.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">BDCQ</h1>
          <p className="text-muted-foreground text-sm">Business Driven Configuration Questionnaire</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => seedMut.mutate({ projectId: PROJECT_ID })} disabled={seedMut.isPending}>
            <Sparkles className="h-4 w-4 mr-2" />Carregar Padrão SAP
          </Button>
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />Nova Pergunta</Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar perguntas..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
        <Badge variant="secondary">{filtered.length} perguntas</Badge>
        <Badge variant="outline">{answers.length} respondidas</Badge>
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
                      <Button variant="ghost" size="icon" onClick={() => { setShowAnswer(q); setAnswerForm({ answer: (ans as any)?.answer || "", answeredBy: (ans as any)?.answeredBy || "", status: "Respondido" }); }}>
                        <MessageSquare className="h-4 w-4" />
                      </Button>
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
      <Dialog open={!!showAnswer} onOpenChange={() => setShowAnswer(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Responder Pergunta</DialogTitle></DialogHeader>
          {showAnswer && <p className="text-sm text-muted-foreground border-l-2 pl-3">{showAnswer.question}</p>}
          <div className="grid gap-3">
            <div><Label>Resposta</Label><Textarea value={answerForm.answer} onChange={e => setAnswerForm(f => ({ ...f, answer: e.target.value }))} rows={4} /></div>
            <div><Label>Respondido por</Label><Input value={answerForm.answeredBy} onChange={e => setAnswerForm(f => ({ ...f, answeredBy: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => { if (showAnswer) createA.mutate({ questionId: showAnswer.id, projectId: PROJECT_ID, answer: answerForm.answer, answeredBy: answerForm.answeredBy }); }} disabled={!answerForm.answer}>
              Salvar Resposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
