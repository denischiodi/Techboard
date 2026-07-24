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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Trash2, Search, MessageSquare, Sparkles, Upload, Download, FileSpreadsheet, History, Check, LoaderCircle, Library, Pencil, Paperclip, ExternalLink, Users, ShieldCheck, RotateCcw } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";

import { useWorkflowProject } from "./useWorkflowProject";
import { GeneratedModelItems } from "@/components/GeneratedModelItems";

export default function BDCQPage() {
  const [, setLocation] = useLocation();
  const PAGE_SIZE = 50;
  const { projectId: PROJECT_ID } = useWorkflowProject();
  const { user } = useAuth();
  const isAdmin = (user as any)?.appRole === "admin" || user?.role === "admin";
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showAnswer, setShowAnswer] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [form, setForm] = useState({ question: "", module: "", category: "", scopeItemIds: [] as string[], consultantResourceId: "", keyUserId: "" });
  const [showLibrary, setShowLibrary] = useState(false);
  const emptyTemplate = { id: "", question: "", category: "", modules: [] as string[], scopeItemKeys: [] as string[], active: 1 };
  const [templateForm, setTemplateForm] = useState(emptyTemplate);
  const [answerForm, setAnswerForm] = useState({ answer: "", answeredBy: "", attachments: [] as string[], status: "Respondido" });
  const [ownerForm, setOwnerForm] = useState({ consultantResourceId: "", keyUserId: "" });
  const [showKeyUsers, setShowKeyUsers] = useState(false);
  const [keyUserForm, setKeyUserForm] = useState({ name: "", email: "", role: "" });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAnswerId, setSavedAnswerId] = useState("");
  const [showHistory, setShowHistory] = useState<any>(null);
  const [approvalComment, setApprovalComment] = useState("");
  const [openedDeepLink, setOpenedDeepLink] = useState(false);
  const lastSaved = useRef("");

  const { data: questionPage = [], refetch: refetchQ } = trpc.workflow.bdcq.questions.list.useQuery({ projectId: PROJECT_ID, offset: page * PAGE_SIZE, limit: PAGE_SIZE + 1 });
  const hasNextPage = questionPage.length > PAGE_SIZE;
  const questions = questionPage.slice(0, PAGE_SIZE);
  const questionIds = questions.map((question: any) => question.id);
  const { data: answers = [], refetch: refetchA } = trpc.workflow.bdcq.answers.list.useQuery({ projectId: PROJECT_ID, questionIds }, { enabled: questionIds.length > 0 });
  const { data: scopeItems = [] } = trpc.workflow.scopeItems.list.useQuery({ projectId: PROJECT_ID });
  const { data: projectMembers = [] } = trpc.approvals.members.useQuery({ projectId: PROJECT_ID });
  const myMembership: any = projectMembers.find((item: any) => item.user?.email?.toLowerCase() === user?.email?.toLowerCase());
  const canManageBdcq = isAdmin || !myMembership || myMembership.profile === "gp_internal" || myMembership.profile === "internal_team";
  const { data: resources = [] } = trpc.resources.list.useQuery(undefined, { enabled: canManageBdcq });
  const { data: allocations = [] } = trpc.allocations.list.useQuery(undefined, { enabled: canManageBdcq });
  const exportQuestions = trpc.workflow.bdcq.questions.list.useQuery(
    { projectId: PROJECT_ID, offset: 0, limit: 500 },
    { enabled: false }
  );
  const { data: keyUsers = [], refetch: refetchKeyUsers } = trpc.workflow.bdcq.keyUsers.list.useQuery({ projectId: PROJECT_ID });
  const { data: templates = [], refetch: refetchTemplates } = trpc.workflow.bdcq.templates.list.useQuery();
  const { data: approvalPolicies = [] } = trpc.approvals.policies.useQuery({ projectId: PROJECT_ID });
  const { data: approvalRounds = [], refetch: refetchApprovals } = trpc.approvals.history.useQuery({ projectId: PROJECT_ID, entityType: "bdcq_answer", entityId: savedAnswerId }, { enabled: Boolean(savedAnswerId) });
  const { data: lookups } = trpc.settings.getLookups.useQuery(undefined, { enabled: canManageBdcq });
  const createQ = trpc.workflow.bdcq.questions.create.useMutation({ onSuccess: () => { refetchQ(); setShowAdd(false); toast.success("Pergunta criada"); } });
  const deleteQ = trpc.workflow.bdcq.questions.delete.useMutation({ onSuccess: () => { refetchQ(); toast.success("Removida"); } });
  const updateQ = trpc.workflow.bdcq.questions.update.useMutation({ onSuccess: async () => { await refetchQ(); setShowAnswer((current: any) => current ? { ...current, ...ownerForm } : current); toast.success("Responsáveis atualizados"); }, onError: error => toast.error(error.message) });
  const createKeyUser = trpc.workflow.bdcq.keyUsers.create.useMutation({ onSuccess: () => { refetchKeyUsers(); setKeyUserForm({ name: "", email: "", role: "" }); toast.success("Key user cadastrado"); }, onError: error => toast.error(error.message) });
  const updateKeyUser = trpc.workflow.bdcq.keyUsers.update.useMutation({ onSuccess: () => { refetchKeyUsers(); toast.success("Key user atualizado"); }, onError: error => toast.error(error.message) });
  const deleteKeyUser = trpc.workflow.bdcq.keyUsers.delete.useMutation({ onSuccess: () => { refetchKeyUsers(); refetchQ(); toast.success("Key user removido"); }, onError: error => toast.error(error.message) });
  const createA = trpc.workflow.bdcq.answers.create.useMutation();
  const updateA = trpc.workflow.bdcq.answers.update.useMutation();
  const uploadAttachment = trpc.workflow.upload.useMutation();
  const { data: answerHistory = [] } = trpc.workflow.bdcq.answers.history.useQuery({ answerId: showHistory?.id || "" }, { enabled: Boolean(showHistory?.id) });
  const seedMut = trpc.workflow.bdcq.questions.seedDefaults.useMutation({ onSuccess: (data: any) => { refetchQ(); toast.success(`${data.added} perguntas padrão adicionadas`); } });
  const bulkCreate = trpc.workflow.bdcq.questions.bulkCreate.useMutation({ onSuccess: data => { refetchQ(); toast.success(`${data.added} criadas e ${data.updated} atualizadas`); }, onError: error => toast.error(error.message || "Erro ao importar perguntas") });
  const createTemplate = trpc.workflow.bdcq.templates.create.useMutation({ onSuccess: () => { refetchTemplates(); setTemplateForm(emptyTemplate); toast.success("Pergunta padrão criada"); }, onError: error => toast.error(error.message) });
  const updateTemplate = trpc.workflow.bdcq.templates.update.useMutation({ onSuccess: () => { refetchTemplates(); setTemplateForm(emptyTemplate); toast.success("Pergunta padrão atualizada"); }, onError: error => toast.error(error.message) });
  const deleteTemplate = trpc.workflow.bdcq.templates.delete.useMutation({ onSuccess: () => { refetchTemplates(); toast.success("Pergunta padrão removida"); }, onError: error => toast.error(error.message) });
  const applyTemplates = trpc.workflow.bdcq.templates.applyToProject.useMutation({ onSuccess: data => { refetchQ(); toast.success(`${data.added} perguntas padrão adicionadas ao projeto`); }, onError: error => toast.error(error.message) });
  const submitApproval = trpc.approvals.submit.useMutation({ onSuccess: async () => { await refetchApprovals(); toast.success("Resposta enviada para aprovação"); }, onError: error => toast.error(error.message) });
  const decideApproval = trpc.approvals.decide.useMutation({ onSuccess: async () => { setApprovalComment(""); await Promise.all([refetchApprovals(), refetchA()]); toast.success("Decisão registrada"); }, onError: error => toast.error(error.message) });
  const reopenApproval = trpc.approvals.reopen.useMutation({ onSuccess: async () => { setApprovalComment(""); await refetchApprovals(); toast.success("Nova versão liberada para edição"); }, onError: error => toast.error(error.message) });

  const answerMap = new Map(answers.map((a: any) => [a.questionId, a]));
  const resourceMap = new Map(resources.map(resource => [resource.id, resource]));
  const keyUserMap = new Map(keyUsers.map((keyUser: any) => [keyUser.id, keyUser]));
  const filtered = questions.filter((q: any) =>
    q.question?.toLowerCase().includes(search.toLowerCase()) ||
    q.module?.toLowerCase().includes(search.toLowerCase()) ||
    q.category?.toLowerCase().includes(search.toLowerCase())
  );
  const answeredCount = new Set(answers.filter((answer: any) => String(answer.answer || "").trim()).map((answer: any) => answer.questionId)).size;
  const moduleOptions = [...new Set([...(lookups?.fronts || []).filter((item: any) => item.active).map((item: any) => item.value), ...scopeItems.map((item: any) => item.module).filter(Boolean)])].sort();
  const projectAllocationMap = new Map(
    allocations
      .filter((allocation: any) => allocation.projectId === PROJECT_ID)
      .map((allocation: any) => [allocation.resourceId, allocation])
  );
  const consultantOptions = (module: string) => resources
    .filter((resource: any) => projectAllocationMap.has(resource.id))
    .sort((left: any, right: any) => {
      const leftAllocation: any = projectAllocationMap.get(left.id);
      const rightAllocation: any = projectAllocationMap.get(right.id);
      const matches = (resource: any, allocation: any) => [resource.front, ...(resource.fronts || []), allocation?.front].filter(Boolean).includes(module);
      return Number(matches(right, rightAllocation)) - Number(matches(left, leftAllocation)) || left.name.localeCompare(right.name, "pt-BR");
    });
  const bdcqPolicy = approvalPolicies.find((policy: any) => policy.entityType === "bdcq_answer");
  const latestApproval: any = approvalRounds[0];
  const answerLocked = latestApproval?.status === "approved";
  const toggleValue = (values: string[], value: string) => values.includes(value) ? values.filter(item => item !== value) : [...values, value];

  const persistAnswer = (closeAfter = false) => {
    if (!showAnswer || (!answerForm.answer.trim() && answerForm.attachments.length === 0)) return;
    const snapshot = JSON.stringify({ answer: answerForm.answer, answeredBy: answerForm.answeredBy, attachments: answerForm.attachments });
    if (snapshot === lastSaved.current) { if (closeAfter) setShowAnswer(null); return; }
    setSaveStatus("saving");
    const onSuccess = (saved: any) => {
      lastSaved.current = snapshot;
      if (saved?.id) setSavedAnswerId(saved.id);
      setSaveStatus("saved"); refetchA();
      if (closeAfter) { setShowAnswer(null); toast.success("Resposta salva"); }
    };
    const onError = (error: any) => { setSaveStatus("error"); toast.error(error.message || "Erro ao salvar resposta"); };
    if (savedAnswerId) updateA.mutate({ id: savedAnswerId, data: { answer: answerForm.answer || undefined, answeredBy: answerForm.answeredBy, attachments: answerForm.attachments } }, { onSuccess, onError });
    else createA.mutate({ questionId: showAnswer.id, projectId: PROJECT_ID, answer: answerForm.answer, answeredBy: answerForm.answeredBy, attachments: answerForm.attachments }, { onSuccess, onError });
  };

  useEffect(() => {
    if (!showAnswer || answerLocked || (!answerForm.answer.trim() && answerForm.attachments.length === 0)) return;
    const snapshot = JSON.stringify({ answer: answerForm.answer, answeredBy: answerForm.answeredBy, attachments: answerForm.attachments });
    if (snapshot === lastSaved.current) return;
    setSaveStatus("saving");
    const timeout = window.setTimeout(() => persistAnswer(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [answerForm.answer, answerForm.answeredBy, answerForm.attachments, showAnswer, savedAnswerId, answerLocked]);

  useEffect(() => {
    if (openedDeepLink || questions.length === 0) return;
    const questionId = new URLSearchParams(window.location.search).get("questionId");
    if (!questionId) return;
    const question = questions.find((item: any) => item.id === questionId);
    if (question) { openAnswer(question, answerMap.get(questionId)); setOpenedDeepLink(true); }
  }, [questions, answers, openedDeepLink]);

  const openAnswer = (question: any, existing: any) => {
    const next = { answer: existing?.answer || "", answeredBy: existing?.answeredBy || "", attachments: Array.isArray(existing?.attachments) ? existing.attachments : [], status: "Respondido" };
    setShowAnswer(question); setAnswerForm(next); setSavedAnswerId(existing?.id || "");
    setOwnerForm({ consultantResourceId: question.consultantResourceId || "", keyUserId: question.keyUserId || "" });
    lastSaved.current = JSON.stringify({ answer: next.answer, answeredBy: next.answeredBy, attachments: next.attachments });
    setSaveStatus(existing ? "saved" : "idle");
  };

  const handleAnswerAttachment = async (file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("O anexo deve ter no máximo 10 MB"); return; }
    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
        reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
        reader.readAsDataURL(file);
      });
      const uploaded = await uploadAttachment.mutateAsync({ projectId: PROJECT_ID, fileName: file.name, fileData, contentType: file.type || "application/octet-stream" });
      setAnswerForm(current => ({ ...current, attachments: [...current.attachments, uploaded.url] }));
      toast.success("Anexo adicionado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível anexar o arquivo");
    }
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
        id: valueFrom(row, ["id", "identificador", "codigo"]),
        question: valueFrom(row, ["pergunta", "question", "questao", "texto"]),
        module: valueFrom(row, ["modulo", "module", "frente", "lob"]) || "Geral",
        category: valueFrom(row, ["categoria", "category", "tema", "processo"]),
        consultantResourceId: valueFrom(row, ["id consultor", "consultor id", "consultant id"]),
        keyUserId: valueFrom(row, ["id key user", "key user id"]),
        scopeItemIds: valueFrom(row, ["ids scope items", "scope item ids"]).split(/[;,]/).map(value => value.trim()).filter(Boolean),
      })).filter(row => row.question);
      if (!parsed.length) { toast.error("Nenhuma pergunta encontrada. Use colunas Pergunta, Módulo e Categoria."); return; }
      bulkCreate.mutate({ projectId: PROJECT_ID, questions: parsed });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler a planilha");
    }
  };

  const downloadExcelModel = async () => {
    try {
      const result = await exportQuestions.refetch();
      const registered = result.data || [];
      const rows = registered.length ? registered.map((question: any) => ({
        ID: question.id,
        Pergunta: question.question,
        Módulo: question.module,
        Categoria: question.category || "",
        "ID consultor": question.consultantResourceId || "",
        "Consultor responsável": resourceMap.get(question.consultantResourceId)?.name || "",
        "ID key user": question.keyUserId || "",
        "Key user responsável": keyUserMap.get(question.keyUserId)?.name || "",
        "IDs scope items": (question.scopeItemIds || []).join(";"),
      })) : [{ ID: "", Pergunta: "", Módulo: "", Categoria: "", "ID consultor": "", "Consultor responsável": "", "ID key user": "", "Key user responsável": "", "IDs scope items": "" }];
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet["!cols"] = [{ wch: 24 }, { wch: 60 }, { wch: 16 }, { wch: 24 }, { wch: 24 }, { wch: 30 }, { wch: 24 }, { wch: 30 }, { wch: 36 }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "BDCQ");
      XLSX.writeFile(workbook, `modelo-bdcq-${PROJECT_ID}.xlsx`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o modelo");
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">BDCQ</h1>
          <p className="text-muted-foreground text-sm">Business Driven Configuration Questionnaire</p>
        </div>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:justify-end">
          {canManageBdcq && <><Button variant="outline" onClick={() => setLocation("/admin/users")}><Users className="mr-2 h-4 w-4" />Gerenciar Key Users em Acessos</Button>
          <Button variant="outline" onClick={downloadExcelModel}><Download className="h-4 w-4 mr-2" />Baixar modelo</Button>
          <Button variant="outline" asChild><label className="cursor-pointer"><Upload className="h-4 w-4 mr-2" />Importar Excel<input className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelImport} /></label></Button>
          <Button variant="outline" onClick={() => seedMut.mutate({ projectId: PROJECT_ID })} disabled={seedMut.isPending}>
            <Sparkles className="h-4 w-4 mr-2" />Carregar Padrão SAP
          </Button>
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />Nova Pergunta</Button></>}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0" /><p>Ao cadastrar scope items, o sistema adiciona automaticamente perguntas padrão dos módulos correspondentes. Na importação, perguntas duplicadas são ignoradas.</p></div>

      <div className="flex flex-wrap items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar perguntas nesta página..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="min-w-0 flex-1 basis-full sm:max-w-sm sm:basis-auto" />
        <Badge variant="secondary">{filtered.length} perguntas nesta página</Badge>
        <Badge variant="outline">{answeredCount} respondidas nesta página</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Módulo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Pergunta</TableHead>
                <TableHead>Consultor responsável</TableHead>
                <TableHead>Key user responsável</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma pergunta. Use "Carregar Padrão SAP" ou adicione manualmente.</TableCell></TableRow>
              ) : filtered.map((q: any) => {
                const ans = answerMap.get(q.id);
                return (
                  <TableRow key={q.id} className="cursor-pointer transition-colors hover:bg-muted/70" tabIndex={0} onClick={() => openAnswer(q, ans)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openAnswer(q, ans); } }}>
                    <TableCell><Badge variant="outline">{q.module || "-"}</Badge></TableCell>
                    <TableCell className="text-sm">{q.category || "-"}</TableCell>
                    <TableCell className="max-w-[300px]">
                      <p className="truncate">{q.question}</p>
                      {q.scopeItemIds?.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{q.scopeItemIds.map((id: string) => { const item = scopeItems.find((scope: any) => scope.id === id); return item ? <Badge key={id} variant="secondary" className="text-[10px]">{item.code || item.name}</Badge> : null; })}</div>}
                      {String((ans as any)?.answer || "").trim() ? <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><MessageSquare className="h-3 w-3" />{String((ans as any).answer || "").slice(0, 50)}...</p> : null}
                      {Array.isArray((ans as any)?.attachments) && (ans as any).attachments.length > 0 && <p className="mt-1 flex items-center gap-1 text-xs text-blue-600"><Paperclip className="h-3 w-3" />{(ans as any).attachments.length} anexo(s)</p>}
                    </TableCell>
                    <TableCell className="text-sm">{resourceMap.get(q.consultantResourceId)?.name || <span className="text-muted-foreground">Não definido</span>}</TableCell>
                    <TableCell className="text-sm">{keyUserMap.get(q.keyUserId)?.name || <span className="text-muted-foreground">Não definido</span>}</TableCell>
                    <TableCell>
                      {String((ans as any)?.answer || "").trim() ? <Badge className="bg-green-100 text-green-800">Respondida</Badge> : <Badge variant="outline">Pendente</Badge>}
                    </TableCell>
                    <TableCell className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={event => { event.stopPropagation(); openAnswer(q, ans); }} title="Visualizar e responder">
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                      {ans && <Button variant="ghost" size="icon" onClick={event => { event.stopPropagation(); setShowHistory(ans); }} title="Histórico da resposta"><History className="h-4 w-4" /></Button>}
                      {canManageBdcq && <Button variant="ghost" size="icon" onClick={event => { event.stopPropagation(); deleteQ.mutate({ id: q.id }); }}><Trash2 className="h-4 w-4" /></Button>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Página {page + 1}</p>
        <div className="flex gap-2"><Button variant="outline" onClick={() => setPage(current => Math.max(0, current - 1))} disabled={page === 0}>Anterior</Button><Button variant="outline" onClick={() => setPage(current => current + 1)} disabled={!hasNextPage}>Próxima</Button></div>
      </div>

      {/* Add Question Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Pergunta BDCQ</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Pergunta *</Label><Textarea value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><Label>Frente/Módulo</Label><Select value={form.module} onValueChange={v => setForm(f => ({ ...f, module: v }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{moduleOptions.map(module => <SelectItem key={module} value={module}>{module}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Categoria</Label><Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Pricing, Purchasing..." /></div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><Label>Consultor responsável</Label><Select value={form.consultantResourceId || "none"} onValueChange={value => setForm(current => ({ ...current, consultantResourceId: value === "none" ? "" : value }))}><SelectTrigger><SelectValue placeholder="Selecione um recurso alocado" /></SelectTrigger><SelectContent><SelectItem value="none">Não definido</SelectItem>{consultantOptions(form.module).map(resource => <SelectItem key={resource.id} value={resource.id}>{resource.name}{projectAllocationMap.get(resource.id)?.front ? ` · ${(projectAllocationMap.get(resource.id) as any).front}` : ""}</SelectItem>)}</SelectContent></Select><p className="mt-1 text-xs text-muted-foreground">Somente consultores alocados no projeto; o módulo selecionado aparece primeiro.</p></div><div><Label>Key user responsável</Label><Select value={form.keyUserId || "none"} onValueChange={value => setForm(current => ({ ...current, keyUserId: value === "none" ? "" : value }))}><SelectTrigger><SelectValue placeholder="Selecione um key user" /></SelectTrigger><SelectContent><SelectItem value="none">Não definido</SelectItem>{keyUsers.filter((keyUser: any) => keyUser.active).map((keyUser: any) => <SelectItem key={keyUser.id} value={keyUser.id}>{keyUser.name}{keyUser.role ? ` · ${keyUser.role}` : ""}</SelectItem>)}</SelectContent></Select></div></div>
            <div className="grid gap-2"><Label>Scope items relacionados (opcional)</Label><div className="max-h-40 space-y-1 overflow-auto rounded-md border p-2">{scopeItems.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum scope item cadastrado.</p> : scopeItems.map((item: any) => <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-muted"><Checkbox checked={form.scopeItemIds.includes(item.id)} onCheckedChange={() => setForm(current => ({ ...current, scopeItemIds: toggleValue(current.scopeItemIds, item.id) }))} /><span>{item.code ? `${item.code} - ` : ""}{item.name}</span><Badge variant="outline" className="ml-auto">{item.module}</Badge></label>)}</div></div>
          </div>
          <DialogFooter><Button onClick={() => createQ.mutate({ projectId: PROJECT_ID, module: form.module || "Geral", question: form.question, category: form.category, scopeItemIds: form.scopeItemIds, consultantResourceId: form.consultantResourceId, keyUserId: form.keyUserId })} disabled={!form.question}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLibrary} onOpenChange={setShowLibrary}>
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
          <DialogHeader><DialogTitle>Lista padrão de perguntas BDCQ</DialogTitle></DialogHeader>
          <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr]">
            <div className="grid content-start gap-3 rounded-md border p-4">
              <div><h3 className="font-medium">{templateForm.id ? "Editar pergunta padrão" : "Nova pergunta padrão"}</h3><p className="text-xs text-muted-foreground">Associe a um ou mais módulos, scope items, ou ambos.</p></div>
              <div><Label>Pergunta *</Label><Textarea rows={4} value={templateForm.question} onChange={event => setTemplateForm(current => ({ ...current, question: event.target.value }))} disabled={!isAdmin} /></div>
              <div><Label>Categoria</Label><Input value={templateForm.category} onChange={event => setTemplateForm(current => ({ ...current, category: event.target.value }))} disabled={!isAdmin} placeholder="Ex: Pricing, Compras, Integração" /></div>
              <div className="grid gap-2"><Label>Módulos relacionados</Label><div className="flex flex-wrap gap-2">{moduleOptions.map(module => <Button key={module} type="button" size="sm" variant={templateForm.modules.includes(module) ? "default" : "outline"} onClick={() => setTemplateForm(current => ({ ...current, modules: toggleValue(current.modules, module) }))} disabled={!isAdmin}>{module}</Button>)}</div></div>
              <div className="grid gap-2"><Label>Scope items relacionados</Label><div className="max-h-52 space-y-1 overflow-auto rounded-md border p-2">{scopeItems.length === 0 ? <p className="text-xs text-muted-foreground">Cadastre scope items no projeto para criar vínculos reutilizáveis.</p> : scopeItems.map((item: any) => { const key = item.code || item.name; return <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-muted"><Checkbox checked={templateForm.scopeItemKeys.includes(key)} onCheckedChange={() => setTemplateForm(current => ({ ...current, scopeItemKeys: toggleValue(current.scopeItemKeys, key) }))} disabled={!isAdmin} /><span>{item.code ? `${item.code} - ` : ""}{item.name}</span><Badge variant="outline" className="ml-auto">{item.module}</Badge></label>; })}</div><p className="text-xs text-muted-foreground">O vínculo usa o código; se não houver, usa o nome do scope item.</p></div>
              {isAdmin ? <div className="flex flex-wrap gap-2"><Button onClick={() => templateForm.id ? updateTemplate.mutate({ id: templateForm.id, data: { question: templateForm.question, category: templateForm.category, modules: templateForm.modules, scopeItemKeys: templateForm.scopeItemKeys, active: templateForm.active } }) : createTemplate.mutate({ question: templateForm.question, category: templateForm.category, modules: templateForm.modules, scopeItemKeys: templateForm.scopeItemKeys, active: templateForm.active })} disabled={!templateForm.question.trim() || createTemplate.isPending || updateTemplate.isPending}>{templateForm.id ? "Salvar alterações" : "Adicionar à lista padrão"}</Button>{templateForm.id && <Button variant="outline" onClick={() => setTemplateForm(emptyTemplate)}>Cancelar edição</Button>}</div> : <p className="text-xs text-muted-foreground">Somente administradores podem alterar a lista padrão.</p>}
            </div>
            <div className="grid content-start gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-medium">Perguntas cadastradas ({templates.length})</h3><p className="text-xs text-muted-foreground">Ao aplicar, vínculos são resolvidos para o projeto atual.</p></div><Button onClick={() => applyTemplates.mutate({ projectId: PROJECT_ID })} disabled={applyTemplates.isPending}><Sparkles className="mr-2 h-4 w-4" />Aplicar ao projeto</Button></div>
              {templates.length === 0 ? <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma pergunta na lista padrão.</p> : <div className="space-y-2">{templates.map((template: any) => <div key={template.id} className="rounded-md border p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{template.question}</p><div className="mt-2 flex flex-wrap gap-1">{template.builtIn && <Badge>Padrão SAP</Badge>}{template.category && <Badge variant="secondary">{template.category}</Badge>}{template.modules?.map((module: string) => <Badge key={module} variant="outline">{module}</Badge>)}{template.scopeItemKeys?.map((key: string) => <Badge key={key} className="bg-blue-50 text-blue-800">Scope: {key}</Badge>)}</div></div>{isAdmin && !template.builtIn && <div className="flex shrink-0"><Button variant="ghost" size="icon" onClick={() => setTemplateForm({ id: template.id, question: template.question, category: template.category || "", modules: template.modules || [], scopeItemKeys: template.scopeItemKeys || [], active: template.active ?? 1 })}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => deleteTemplate.mutate({ id: template.id })}><Trash2 className="h-4 w-4" /></Button></div>}</div></div>)}</div>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showKeyUsers} onOpenChange={setShowKeyUsers}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Key users do projeto</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-3"><div><Label>Nome *</Label><Input value={keyUserForm.name} onChange={event => setKeyUserForm(current => ({ ...current, name: event.target.value }))} placeholder="Nome do key user" /></div><div><Label>E-mail *</Label><Input type="email" value={keyUserForm.email} onChange={event => setKeyUserForm(current => ({ ...current, email: event.target.value }))} placeholder="email@cliente.com" /></div><div><Label>Função</Label><Input value={keyUserForm.role} onChange={event => setKeyUserForm(current => ({ ...current, role: event.target.value }))} placeholder="Ex: Fiscal, Compras" /></div></div>
          <Button disabled={!keyUserForm.name.trim() || !keyUserForm.email.trim() || createKeyUser.isPending} onClick={() => createKeyUser.mutate({ projectId: PROJECT_ID, ...keyUserForm })}><Plus className="mr-2 h-4 w-4" />Cadastrar key user</Button>
          <div className="space-y-2">{keyUsers.length === 0 ? <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum key user cadastrado neste projeto.</p> : keyUsers.map((keyUser: any) => <div key={keyUser.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{keyUser.name}</p><Badge variant={keyUser.active ? "secondary" : "outline"}>{keyUser.active ? "Ativo" : "Inativo"}</Badge></div><p className="truncate text-sm text-muted-foreground">{keyUser.email}{keyUser.role ? ` · ${keyUser.role}` : ""}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => updateKeyUser.mutate({ id: keyUser.id, data: { active: keyUser.active ? 0 : 1 } })}>{keyUser.active ? "Inativar" : "Ativar"}</Button><Button variant="ghost" size="icon" onClick={() => deleteKeyUser.mutate({ id: keyUser.id })} title="Excluir key user"><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div>)}</div>
        </DialogContent>
      </Dialog>

      {/* Answer Dialog */}
      <Dialog open={!!showAnswer} onOpenChange={open => { if (!open) setShowAnswer(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Detalhes da pergunta BDCQ</DialogTitle></DialogHeader>
          {showAnswer && <div className="space-y-3 rounded-lg border bg-muted/30 p-4"><div className="flex flex-wrap gap-2"><Badge variant="outline">{showAnswer.module || "Sem módulo"}</Badge>{showAnswer.category && <Badge variant="secondary">{showAnswer.category}</Badge>}</div><p className="whitespace-pre-wrap text-base font-medium leading-relaxed">{showAnswer.question}</p>{showAnswer.scopeItemIds?.length > 0 && <div className="flex flex-wrap gap-1">{showAnswer.scopeItemIds.map((id: string) => { const item = scopeItems.find((scope: any) => scope.id === id); return item ? <Badge key={id} className="bg-blue-50 text-blue-800">{item.code ? `${item.code} - ` : ""}{item.name}</Badge> : null; })}</div>}</div>}
          <div className="grid gap-3">
            {canManageBdcq && <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"><div><Label>Consultor responsável</Label><Select value={ownerForm.consultantResourceId || "none"} onValueChange={value => setOwnerForm(current => ({ ...current, consultantResourceId: value === "none" ? "" : value }))}><SelectTrigger><SelectValue placeholder="Selecione um recurso alocado" /></SelectTrigger><SelectContent><SelectItem value="none">Não definido</SelectItem>{consultantOptions(showAnswer?.module || "").map(resource => <SelectItem key={resource.id} value={resource.id}>{resource.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Key user responsável</Label><Select value={ownerForm.keyUserId || "none"} onValueChange={value => setOwnerForm(current => ({ ...current, keyUserId: value === "none" ? "" : value }))}><SelectTrigger><SelectValue placeholder="Selecione um key user" /></SelectTrigger><SelectContent><SelectItem value="none">Não definido</SelectItem>{keyUsers.filter((keyUser: any) => keyUser.active).map((keyUser: any) => <SelectItem key={keyUser.id} value={keyUser.id}>{keyUser.name}{keyUser.role ? ` · ${keyUser.role}` : ""}</SelectItem>)}</SelectContent></Select></div><Button variant="outline" className="sm:col-span-2" disabled={updateQ.isPending || (ownerForm.consultantResourceId === (showAnswer?.consultantResourceId || "") && ownerForm.keyUserId === (showAnswer?.keyUserId || ""))} onClick={() => updateQ.mutate({ id: showAnswer.id, data: ownerForm })}>Salvar responsáveis</Button></div>}
            <div><Label>Resposta ou complemento</Label><Textarea disabled={answerLocked} value={answerForm.answer} onChange={e => setAnswerForm(f => ({ ...f, answer: e.target.value }))} rows={7} placeholder="Registre a resposta, decisão ou informação complementar..." /></div>
            <div><Label>Respondido por</Label><Input disabled={answerLocked} value={answerForm.answeredBy} onChange={e => setAnswerForm(f => ({ ...f, answeredBy: e.target.value }))} /></div>
            <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><div><Label>Anexos complementares</Label><p className="text-xs text-muted-foreground">PDF, imagens, planilhas ou documentos de até 10 MB.</p></div><Button variant="outline" size="sm" asChild disabled={answerLocked || uploadAttachment.isPending}><label className="cursor-pointer"><Upload className="mr-2 h-4 w-4" />{uploadAttachment.isPending ? "Enviando..." : "Adicionar anexo"}<input disabled={answerLocked} type="file" className="hidden" onChange={event => { void handleAnswerAttachment(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></Button></div>{answerForm.attachments.length === 0 ? <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhum anexo adicionado.</p> : <div className="space-y-2">{answerForm.attachments.map((url, index) => <div key={`${url}-${index}`} className="flex items-center gap-2 rounded-md border p-2"><Paperclip className="h-4 w-4 shrink-0 text-blue-600" /><a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-blue-700 hover:underline">{decodeURIComponent(url.split("/").pop()?.split("?")[0] || `Anexo ${index + 1}`)}</a><Button variant="ghost" size="icon" asChild><a href={url} target="_blank" rel="noreferrer" title="Abrir anexo"><ExternalLink className="h-4 w-4" /></a></Button>{!answerLocked && <Button variant="ghost" size="icon" onClick={() => setAnswerForm(current => ({ ...current, attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index) }))} title="Remover anexo"><Trash2 className="h-4 w-4 text-destructive" /></Button>}</div>)}</div>}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">{answerLocked ? <><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />Conteúdo aprovado e bloqueado</> : <>{saveStatus === "saving" && <><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Salvando...</>}{saveStatus === "saved" && <><Check className="h-3.5 w-3.5 text-emerald-600" />Salvo automaticamente</>}{saveStatus === "error" && <span className="text-red-600">Não foi possível salvar</span>}{saveStatus === "idle" && <span>O salvamento ocorre 1,5 segundo após parar de digitar.</span>}</>}</div>
            {savedAnswerId && bdcqPolicy?.enabled && <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">Aprovação da resposta</p><p className="text-xs text-muted-foreground">{latestApproval ? `Versão ${latestApproval.version} · ${latestApproval.status}` : "Ainda não enviada"}</p></div>{latestApproval?.status && <Badge variant={latestApproval.status === "approved" ? "default" : latestApproval.status === "rejected" ? "destructive" : "secondary"}>{latestApproval.status === "approved" ? "Aprovada" : latestApproval.status === "rejected" ? "Reprovada" : latestApproval.status === "pending" ? "Em aprovação" : "Reaberta"}</Badge>}</div>
              {latestApproval?.decisions?.length > 0 && <div className="space-y-1">{latestApproval.decisions.map((decision: any) => <div key={decision.id} className="flex items-center justify-between text-xs"><span>{decision.approverName || "Aprovador"}</span><Badge variant="outline">{decision.decision}</Badge></div>)}</div>}
              {latestApproval?.status === "pending" && <><Textarea value={approvalComment} onChange={event => setApprovalComment(event.target.value)} placeholder="Comentário da decisão; obrigatório para reprovar" rows={2} /><div className="flex gap-2"><Button size="sm" onClick={() => decideApproval.mutate({ roundId: latestApproval.id, decision: "approved", comment: approvalComment })}>Aprovar</Button><Button size="sm" variant="destructive" disabled={!approvalComment.trim()} onClick={() => decideApproval.mutate({ roundId: latestApproval.id, decision: "rejected", comment: approvalComment })}>Reprovar</Button></div></>}
              {latestApproval?.status === "approved" && <><Textarea value={approvalComment} onChange={event => setApprovalComment(event.target.value)} placeholder="Justificativa obrigatória para criar nova versão" rows={2} /><Button size="sm" variant="outline" disabled={!approvalComment.trim()} onClick={() => reopenApproval.mutate({ roundId: latestApproval.id, justification: approvalComment })}><RotateCcw className="mr-2 h-4 w-4" />Reabrir nova versão</Button></>}
              {(!latestApproval || latestApproval.status === "rejected" || latestApproval.status === "superseded") && <Button size="sm" disabled={submitApproval.isPending} onClick={() => submitApproval.mutate({ projectId: PROJECT_ID, entityType: "bdcq_answer", entityId: savedAnswerId })}><ShieldCheck className="mr-2 h-4 w-4" />Enviar para aprovação</Button>}
            </div>}
          </div>
          <DialogFooter>
            <Button onClick={() => persistAnswer(true)} disabled={answerLocked || (!answerForm.answer.trim() && answerForm.attachments.length === 0) || createA.isPending || updateA.isPending || uploadAttachment.isPending}>
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
