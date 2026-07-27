import { useEffect, useRef, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Search,
  MessageSquare,
  Sparkles,
  Upload,
  Download,
  FileSpreadsheet,
  History,
  Check,
  LoaderCircle,
  Library,
  Pencil,
  Paperclip,
  ExternalLink,
  Users,
  ShieldCheck,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";

import { useWorkflowProject } from "./useWorkflowProject";
import { GeneratedModelItems } from "@/components/GeneratedModelItems";

type BdcqQuestionForm = {
  id: string;
  question: string;
  questionOriginal: string;
  module: string;
  category: string;
  sapId: string;
  level: string;
  process: string;
  sscuiReference: string;
  area: string;
  topic: string;
  topicDefinition: string;
  solution: string;
  source: string;
  sourceFile: string;
  sourceRelease: string;
  required: boolean;
  active: number;
  scopeItemIds: string[];
  consultantResourceId: string;
  keyUserId: string;
};

const emptyQuestionForm = (): BdcqQuestionForm => ({
  id: "",
  question: "",
  questionOriginal: "",
  module: "",
  category: "",
  sapId: "",
  level: "L3",
  process: "",
  sscuiReference: "",
  area: "",
  topic: "",
  topicDefinition: "",
  solution: "",
  source: "manual",
  sourceFile: "",
  sourceRelease: "",
  required: false,
  active: 1,
  scopeItemIds: [],
  consultantResourceId: "",
  keyUserId: "",
});

type FilterState = {
  modules: string[];
  scopeItemIds: string[];
  levels: string[];
  areas: string[];
  topics: string[];
  sources: string[];
  statuses: Array<"pending" | "answered" | "inactive">;
  consultantResourceIds: string[];
  keyUserIds: string[];
};

const emptyFilters = (): FilterState => ({
  modules: [],
  scopeItemIds: [],
  levels: [],
  areas: [],
  topics: [],
  sources: [],
  statuses: [],
  consultantResourceIds: [],
  keyUserIds: [],
});

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
  const [form, setForm] = useState<BdcqQuestionForm>(emptyQuestionForm);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [showLibrary, setShowLibrary] = useState(false);
  const emptyTemplate = {
    id: "",
    question: "",
    category: "",
    modules: [] as string[],
    scopeItemKeys: [] as string[],
    active: 1,
  };
  const [templateForm, setTemplateForm] = useState(emptyTemplate);
  const [answerForm, setAnswerForm] = useState({
    answer: "",
    answeredBy: "",
    attachments: [] as string[],
    status: "Respondido",
  });
  const [ownerForm, setOwnerForm] = useState({
    consultantResourceId: "",
    keyUserId: "",
  });
  const [showKeyUsers, setShowKeyUsers] = useState(false);
  const [keyUserForm, setKeyUserForm] = useState({
    name: "",
    email: "",
    role: "",
  });
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [savedAnswerId, setSavedAnswerId] = useState("");
  const [showHistory, setShowHistory] = useState<any>(null);
  const [approvalComment, setApprovalComment] = useState("");
  const [openedDeepLink, setOpenedDeepLink] = useState(false);
  const lastSaved = useRef("");

  const { data: questionResult, refetch: refetchQ } =
    trpc.workflow.bdcq.questions.search.useQuery({
      projectId: PROJECT_ID,
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
      search: search || undefined,
      ...filters,
    });
  const questions = questionResult?.items || [];
  const hasNextPage = (page + 1) * PAGE_SIZE < (questionResult?.total || 0);
  const questionIds = questions.map((question: any) => question.id);
  const { data: answers = [], refetch: refetchA } =
    trpc.workflow.bdcq.answers.list.useQuery(
      { projectId: PROJECT_ID, questionIds },
      { enabled: questionIds.length > 0 }
    );
  const { data: scopeItems = [] } = trpc.workflow.scopeItems.list.useQuery({
    projectId: PROJECT_ID,
  });
  const { data: projectMembers = [] } = trpc.approvals.members.useQuery({
    projectId: PROJECT_ID,
  });
  const myMembership: any = projectMembers.find(
    (item: any) =>
      item.user?.email?.toLowerCase() === user?.email?.toLowerCase()
  );
  const canManageBdcq =
    isAdmin ||
    !myMembership ||
    myMembership.profile === "gp_internal" ||
    myMembership.profile === "internal_team";
  const { data: resources = [] } = trpc.resources.list.useQuery(undefined, {
    enabled: canManageBdcq,
  });
  const { data: allocations = [] } = trpc.allocations.list.useQuery(undefined, {
    enabled: canManageBdcq,
  });
  const exportQuestions = trpc.workflow.bdcq.questions.list.useQuery(
    { projectId: PROJECT_ID, offset: 0, limit: 500 },
    { enabled: false }
  );
  const { data: keyUsers = [], refetch: refetchKeyUsers } =
    trpc.workflow.bdcq.keyUsers.list.useQuery({ projectId: PROJECT_ID });
  const { data: templates = [], refetch: refetchTemplates } =
    trpc.workflow.bdcq.templates.list.useQuery();
  const { data: approvalPolicies = [] } = trpc.approvals.policies.useQuery({
    projectId: PROJECT_ID,
  });
  const { data: approvalRounds = [], refetch: refetchApprovals } =
    trpc.approvals.history.useQuery(
      {
        projectId: PROJECT_ID,
        entityType: "bdcq_answer",
        entityId: savedAnswerId,
      },
      { enabled: Boolean(savedAnswerId) }
    );
  const { data: lookups } = trpc.settings.getLookups.useQuery(undefined, {
    enabled: canManageBdcq,
  });
  const createQ = trpc.workflow.bdcq.questions.create.useMutation({
    onSuccess: () => {
      refetchQ();
      setShowAdd(false);
      toast.success("Pergunta criada");
    },
  });
  const deleteQ = trpc.workflow.bdcq.questions.delete.useMutation({
    onSuccess: () => {
      refetchQ();
      toast.success("Removida");
    },
  });
  const updateQ = trpc.workflow.bdcq.questions.update.useMutation({
    onError: error => toast.error(error.message),
  });
  const createKeyUser = trpc.workflow.bdcq.keyUsers.create.useMutation({
    onSuccess: () => {
      refetchKeyUsers();
      setKeyUserForm({ name: "", email: "", role: "" });
      toast.success("Key user cadastrado");
    },
    onError: error => toast.error(error.message),
  });
  const updateKeyUser = trpc.workflow.bdcq.keyUsers.update.useMutation({
    onSuccess: () => {
      refetchKeyUsers();
      toast.success("Key user atualizado");
    },
    onError: error => toast.error(error.message),
  });
  const deleteKeyUser = trpc.workflow.bdcq.keyUsers.delete.useMutation({
    onSuccess: () => {
      refetchKeyUsers();
      refetchQ();
      toast.success("Key user removido");
    },
    onError: error => toast.error(error.message),
  });
  const createA = trpc.workflow.bdcq.answers.create.useMutation();
  const updateA = trpc.workflow.bdcq.answers.update.useMutation();
  const uploadAttachment = trpc.workflow.upload.useMutation();
  const { data: answerHistory = [] } =
    trpc.workflow.bdcq.answers.history.useQuery(
      { answerId: showHistory?.id || "" },
      { enabled: Boolean(showHistory?.id) }
    );
  const seedMut = trpc.workflow.bdcq.questions.seedDefaults.useMutation({
    onSuccess: (data: any) => {
      refetchQ();
      toast.success(`${data.added} perguntas padrão adicionadas`);
    },
  });
  const bulkCreate = trpc.workflow.bdcq.questions.bulkCreate.useMutation({
    onSuccess: data => {
      refetchQ();
      toast.success(`${data.added} criadas e ${data.updated} atualizadas`);
    },
    onError: error =>
      toast.error(error.message || "Erro ao importar perguntas"),
  });
  const createTemplate = trpc.workflow.bdcq.templates.create.useMutation({
    onSuccess: () => {
      refetchTemplates();
      setTemplateForm(emptyTemplate);
      toast.success("Pergunta padrão criada");
    },
    onError: error => toast.error(error.message),
  });
  const updateTemplate = trpc.workflow.bdcq.templates.update.useMutation({
    onSuccess: () => {
      refetchTemplates();
      setTemplateForm(emptyTemplate);
      toast.success("Pergunta padrão atualizada");
    },
    onError: error => toast.error(error.message),
  });
  const deleteTemplate = trpc.workflow.bdcq.templates.delete.useMutation({
    onSuccess: () => {
      refetchTemplates();
      toast.success("Pergunta padrão removida");
    },
    onError: error => toast.error(error.message),
  });
  const applyTemplates =
    trpc.workflow.bdcq.templates.applyToProject.useMutation({
      onSuccess: data => {
        refetchQ();
        toast.success(`${data.added} perguntas padrão adicionadas ao projeto`);
      },
      onError: error => toast.error(error.message),
    });
  const submitApproval = trpc.approvals.submit.useMutation({
    onSuccess: async () => {
      await refetchApprovals();
      toast.success("Resposta enviada para aprovação");
    },
    onError: error => toast.error(error.message),
  });
  const decideApproval = trpc.approvals.decide.useMutation({
    onSuccess: async () => {
      setApprovalComment("");
      await Promise.all([refetchApprovals(), refetchA()]);
      toast.success("Decisão registrada");
    },
    onError: error => toast.error(error.message),
  });
  const reopenApproval = trpc.approvals.reopen.useMutation({
    onSuccess: async () => {
      setApprovalComment("");
      await refetchApprovals();
      toast.success("Nova versão liberada para edição");
    },
    onError: error => toast.error(error.message),
  });

  const answerMap = new Map(answers.map((a: any) => [a.questionId, a]));
  const resourceMap = new Map(
    resources.map(resource => [resource.id, resource])
  );
  const keyUserMap = new Map(
    keyUsers.map((keyUser: any) => [keyUser.id, keyUser])
  );
  const filtered = questions;
  const answeredCount = questionResult?.answered || 0;
  const moduleOptions = [
    ...new Set([
      ...(lookups?.fronts || [])
        .filter((item: any) => item.active)
        .map((item: any) => item.value),
      ...scopeItems.map((item: any) => item.module).filter(Boolean),
    ]),
  ].sort();
  const projectAllocationMap = new Map(
    allocations
      .filter((allocation: any) => allocation.projectId === PROJECT_ID)
      .map((allocation: any) => [allocation.resourceId, allocation])
  );
  const consultantOptions = (module: string) =>
    resources
      .filter((resource: any) => projectAllocationMap.has(resource.id))
      .sort((left: any, right: any) => {
        const leftAllocation: any = projectAllocationMap.get(left.id);
        const rightAllocation: any = projectAllocationMap.get(right.id);
        const matches = (resource: any, allocation: any) =>
          [resource.front, ...(resource.fronts || []), allocation?.front]
            .filter(Boolean)
            .includes(module);
        return (
          Number(matches(right, rightAllocation)) -
            Number(matches(left, leftAllocation)) ||
          left.name.localeCompare(right.name, "pt-BR")
        );
      });
  const bdcqPolicy = approvalPolicies.find(
    (policy: any) => policy.entityType === "bdcq_answer"
  );
  const latestApproval: any = approvalRounds[0];
  const answerLocked = latestApproval?.status === "approved";
  const toggleValue = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter(item => item !== value)
      : [...values, value];
  const activeFilterCount = Object.values(filters).reduce(
    (total, values) => total + values.length,
    0
  );

  const openQuestionForm = (question?: any) => {
    setForm(
      question
        ? {
            ...emptyQuestionForm(),
            ...question,
            id: question.id,
            scopeItemIds: question.scopeItemIds || [],
            required: Boolean(question.required),
            active: question.active === 0 ? 0 : 1,
          }
        : emptyQuestionForm()
    );
    setShowAdd(true);
  };

  const saveQuestion = () => {
    const { id, ...data } = form;
    if (id) {
      updateQ.mutate(
        { id, data },
        {
          onSuccess: async () => {
            await refetchQ();
            setShowAdd(false);
            toast.success("Pergunta atualizada");
          },
        }
      );
      return;
    }
    createQ.mutate({
      projectId: PROJECT_ID,
      ...data,
      module: data.module || "Geral",
    });
  };

  const persistAnswer = (closeAfter = false) => {
    if (
      !showAnswer ||
      (!answerForm.answer.trim() && answerForm.attachments.length === 0)
    )
      return;
    const snapshot = JSON.stringify({
      answer: answerForm.answer,
      answeredBy: answerForm.answeredBy,
      attachments: answerForm.attachments,
    });
    if (snapshot === lastSaved.current) {
      if (closeAfter) setShowAnswer(null);
      return;
    }
    setSaveStatus("saving");
    const onSuccess = (saved: any) => {
      lastSaved.current = snapshot;
      if (saved?.id) setSavedAnswerId(saved.id);
      setSaveStatus("saved");
      refetchA();
      if (closeAfter) {
        setShowAnswer(null);
        toast.success("Resposta salva");
      }
    };
    const onError = (error: any) => {
      setSaveStatus("error");
      toast.error(error.message || "Erro ao salvar resposta");
    };
    if (savedAnswerId)
      updateA.mutate(
        {
          id: savedAnswerId,
          data: {
            answer: answerForm.answer || undefined,
            answeredBy: answerForm.answeredBy,
            attachments: answerForm.attachments,
          },
        },
        { onSuccess, onError }
      );
    else
      createA.mutate(
        {
          questionId: showAnswer.id,
          projectId: PROJECT_ID,
          answer: answerForm.answer,
          answeredBy: answerForm.answeredBy,
          attachments: answerForm.attachments,
        },
        { onSuccess, onError }
      );
  };

  useEffect(() => {
    if (
      !showAnswer ||
      answerLocked ||
      (!answerForm.answer.trim() && answerForm.attachments.length === 0)
    )
      return;
    const snapshot = JSON.stringify({
      answer: answerForm.answer,
      answeredBy: answerForm.answeredBy,
      attachments: answerForm.attachments,
    });
    if (snapshot === lastSaved.current) return;
    setSaveStatus("saving");
    const timeout = window.setTimeout(() => persistAnswer(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [
    answerForm.answer,
    answerForm.answeredBy,
    answerForm.attachments,
    showAnswer,
    savedAnswerId,
    answerLocked,
  ]);

  useEffect(() => {
    if (openedDeepLink || questions.length === 0) return;
    const questionId = new URLSearchParams(window.location.search).get(
      "questionId"
    );
    if (!questionId) return;
    const question = questions.find((item: any) => item.id === questionId);
    if (question) {
      openAnswer(question, answerMap.get(questionId));
      setOpenedDeepLink(true);
    }
  }, [questions, answers, openedDeepLink]);

  const openAnswer = (question: any, existing: any) => {
    const next = {
      answer: existing?.answer || "",
      answeredBy: existing?.answeredBy || "",
      attachments: Array.isArray(existing?.attachments)
        ? existing.attachments
        : [],
      status: "Respondido",
    };
    setShowAnswer(question);
    setAnswerForm(next);
    setSavedAnswerId(existing?.id || "");
    setOwnerForm({
      consultantResourceId: question.consultantResourceId || "",
      keyUserId: question.keyUserId || "",
    });
    lastSaved.current = JSON.stringify({
      answer: next.answer,
      answeredBy: next.answeredBy,
      attachments: next.attachments,
    });
    setSaveStatus(existing ? "saved" : "idle");
  };

  const handleAnswerAttachment = async (file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("O anexo deve ter no máximo 10 MB");
      return;
    }
    try {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(String(reader.result || "").split(",")[1] || "");
        reader.onerror = () =>
          reject(new Error("Não foi possível ler o arquivo"));
        reader.readAsDataURL(file);
      });
      const uploaded = await uploadAttachment.mutateAsync({
        projectId: PROJECT_ID,
        fileName: file.name,
        fileData,
        contentType: file.type || "application/octet-stream",
      });
      setAnswerForm(current => ({
        ...current,
        attachments: [...current.attachments, uploaded.url],
      }));
      toast.success("Anexo adicionado");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível anexar o arquivo"
      );
    }
  };

  const handleExcelImport = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });
      const normalize = (value: string) =>
        value
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();
      const valueFrom = (row: Record<string, unknown>, names: string[]) => {
        const entry = Object.entries(row).find(([key]) =>
          names.includes(normalize(key))
        );
        return String(entry?.[1] || "").trim();
      };
      const parsed = rows
        .map(row => ({
          id: valueFrom(row, ["id", "identificador", "codigo"]),
          question: valueFrom(row, [
            "pergunta",
            "question",
            "questao",
            "texto",
          ]),
          questionOriginal: valueFrom(row, [
            "pergunta original",
            "question original",
          ]),
          module:
            valueFrom(row, ["modulo", "module", "frente", "lob"]) || "Geral",
          category: valueFrom(row, [
            "categoria",
            "category",
            "tema",
            "processo",
          ]),
          sapId: valueFrom(row, ["sap id", "id sap"]),
          level: valueFrom(row, ["level", "nivel"]) || "L3",
          process: valueFrom(row, ["processo", "process"]),
          sscuiReference: valueFrom(row, ["referencia sscui", "sscui"]),
          area: valueFrom(row, ["area"]),
          topic: valueFrom(row, ["topico", "topic"]),
          topicDefinition: valueFrom(row, [
            "definicao do topico",
            "topic definition",
          ]),
          solution: valueFrom(row, ["solucao", "solution"]),
          source: valueFrom(row, ["origem", "fonte", "source"]) || "manual",
          sourceFile: valueFrom(row, [
            "arquivo de origem",
            "arquivo fonte",
            "source file",
          ]),
          sourceRelease: valueFrom(row, [
            "release da fonte",
            "release fonte",
            "source release",
          ]),
          required: ["sim", "yes", "true", "1"].includes(
            normalize(valueFrom(row, ["obrigatoria", "required"]))
          ),
          active: ["nao", "no", "false", "0"].includes(
            normalize(valueFrom(row, ["ativa", "active"]))
          )
            ? 0
            : 1,
          consultantResourceId: valueFrom(row, [
            "id consultor",
            "consultor id",
            "consultant id",
          ]),
          keyUserId: valueFrom(row, ["id key user", "key user id"]),
          scopeItemIds: valueFrom(row, ["ids scope items", "scope item ids"])
            .split(/[;,]/)
            .map(value => value.trim())
            .filter(Boolean),
        }))
        .filter(row => row.question);
      if (!parsed.length) {
        toast.error(
          "Nenhuma pergunta encontrada. Use colunas Pergunta, Módulo e Categoria."
        );
        return;
      }
      bulkCreate.mutate({ projectId: PROJECT_ID, questions: parsed });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível ler a planilha"
      );
    }
  };

  const downloadExcelModel = async () => {
    try {
      const result = await exportQuestions.refetch();
      const registered = result.data || [];
      const rows = registered.length
        ? registered.map((question: any) => ({
            ID: question.id,
            Pergunta: question.question,
            "Pergunta original": question.questionOriginal || "",
            Módulo: question.module,
            Categoria: question.category || "",
            "SAP ID": question.sapId || "",
            Level: question.level || "L3",
            Processo: question.process || "",
            "Referência SSCUI": question.sscuiReference || "",
            Área: question.area || "",
            Tópico: question.topic || "",
            "Definição do tópico": question.topicDefinition || "",
            Solução: question.solution || "",
            Origem: question.source || "",
            "Arquivo de origem": question.sourceFile || "",
            "Release da fonte": question.sourceRelease || "",
            Obrigatória: question.required ? "Sim" : "Não",
            Ativa: question.active === 0 ? "Não" : "Sim",
            "ID consultor": question.consultantResourceId || "",
            "Consultor responsável":
              resourceMap.get(question.consultantResourceId)?.name || "",
            "ID key user": question.keyUserId || "",
            "Key user responsável":
              keyUserMap.get(question.keyUserId)?.name || "",
            "IDs scope items": (question.scopeItemIds || []).join(";"),
          }))
        : [
            {
              ID: "",
              Pergunta: "",
              "Pergunta original": "",
              Módulo: "",
              Categoria: "",
              "SAP ID": "",
              Level: "L3",
              Processo: "",
              "Referência SSCUI": "",
              Área: "",
              Tópico: "",
              "Definição do tópico": "",
              Solução: "",
              Origem: "manual",
              "Arquivo de origem": "",
              "Release da fonte": "",
              Obrigatória: "Não",
              Ativa: "Sim",
              "ID consultor": "",
              "Consultor responsável": "",
              "ID key user": "",
              "Key user responsável": "",
              "IDs scope items": "",
            },
          ];
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet["!cols"] = [
        24, 60, 60, 16, 24, 14, 10, 24, 36, 24, 24, 60, 40, 18, 42, 16, 12, 10,
        24, 30, 24, 30, 36,
      ].map(wch => ({ wch }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "BDCQ");
      XLSX.writeFile(workbook, `modelo-bdcq-${PROJECT_ID}.xlsx`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o modelo"
      );
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-6">
      <GeneratedModelItems
        projectId={PROJECT_ID}
        types={["bdcq"]}
        title="Perguntas padrão aplicadas"
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">BDCQ</h1>
          <p className="text-muted-foreground text-sm">
            Business Driven Configuration Questionnaire
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:justify-end">
          {canManageBdcq && (
            <>
              <Button
                variant="outline"
                onClick={() => setLocation("/admin/users")}
              >
                <Users className="mr-2 h-4 w-4" />
                Gerenciar Key Users em Acessos
              </Button>
              <Button variant="outline" onClick={downloadExcelModel}>
                <Download className="h-4 w-4 mr-2" />
                Baixar modelo
              </Button>
              <Button variant="outline" asChild>
                <label className="cursor-pointer">
                  <Upload className="h-4 w-4 mr-2" />
                  Importar Excel
                  <input
                    className="hidden"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleExcelImport}
                  />
                </label>
              </Button>
              <Button
                variant="outline"
                onClick={() => seedMut.mutate({ projectId: PROJECT_ID })}
                disabled={seedMut.isPending}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Carregar Padrão SAP
              </Button>
              <Button onClick={() => openQuestionForm()}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Pergunta
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Ao cadastrar scope items, o sistema adiciona automaticamente perguntas
          padrão dos módulos correspondentes. Na importação, perguntas
          duplicadas são ignoradas.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar pergunta, SAP ID, processo, área ou tópico..."
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="min-w-0 flex-1 basis-full sm:max-w-md sm:basis-auto"
        />
        <FilterMenu
          label="Módulo"
          values={questionResult?.facets.modules || []}
          selected={filters.modules}
          onChange={modules => {
            setFilters(current => ({ ...current, modules }));
            setPage(0);
          }}
        />
        <FilterMenu
          label="Scope item"
          values={scopeItems.map((item: any) => item.id)}
          selected={filters.scopeItemIds}
          labelFor={id => {
            const item = scopeItems.find((scope: any) => scope.id === id);
            return item ? `${item.code || item.name} · ${item.module}` : id;
          }}
          onChange={scopeItemIds => {
            setFilters(current => ({ ...current, scopeItemIds }));
            setPage(0);
          }}
        />
        <FilterMenu
          label="Level"
          values={questionResult?.facets.levels || []}
          selected={filters.levels}
          onChange={levels => {
            setFilters(current => ({ ...current, levels }));
            setPage(0);
          }}
        />
        <FilterMenu
          label="Área"
          values={questionResult?.facets.areas || []}
          selected={filters.areas}
          onChange={areas => {
            setFilters(current => ({ ...current, areas }));
            setPage(0);
          }}
        />
        <FilterMenu
          label="Tópico"
          values={questionResult?.facets.topics || []}
          selected={filters.topics}
          onChange={topics => {
            setFilters(current => ({ ...current, topics }));
            setPage(0);
          }}
        />
        <FilterMenu
          label="Origem"
          values={questionResult?.facets.sources || []}
          selected={filters.sources}
          onChange={sources => {
            setFilters(current => ({ ...current, sources }));
            setPage(0);
          }}
        />
        <FilterMenu
          label="Status"
          values={["pending", "answered", "inactive"]}
          selected={filters.statuses}
          labelFor={value =>
            value === "pending"
              ? "Pendente"
              : value === "answered"
                ? "Respondida"
                : "Inativa"
          }
          onChange={statuses => {
            setFilters(current => ({
              ...current,
              statuses: statuses as FilterState["statuses"],
            }));
            setPage(0);
          }}
        />
        <FilterMenu
          label="Consultor"
          values={resources.map((resource: any) => resource.id)}
          selected={filters.consultantResourceIds}
          labelFor={id => resourceMap.get(id)?.name || id}
          onChange={consultantResourceIds => {
            setFilters(current => ({ ...current, consultantResourceIds }));
            setPage(0);
          }}
        />
        <FilterMenu
          label="Key user"
          values={keyUsers.map((item: any) => item.id)}
          selected={filters.keyUserIds}
          labelFor={id => keyUserMap.get(id)?.name || id}
          onChange={keyUserIds => {
            setFilters(current => ({ ...current, keyUserIds }));
            setPage(0);
          }}
        />
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters(emptyFilters());
              setPage(0);
            }}
          >
            <X className="mr-1 h-4 w-4" />
            Limpar ({activeFilterCount})
          </Button>
        )}
        <Badge variant="secondary">
          {questionResult?.total || 0} pergunta(s)
        </Badge>
        <Badge variant="outline">{answeredCount} respondida(s)</Badge>
      </div>

      <Card className="min-w-0 max-w-full overflow-hidden">
        <CardContent className="min-w-0 p-0">
          <div className="w-full overflow-x-auto">
            <Table className="min-w-[1720px] table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[440px]">Pergunta</TableHead>
                  <TableHead className="w-[100px]">Módulo</TableHead>
                  <TableHead className="w-[110px]">SAP ID</TableHead>
                  <TableHead className="w-[80px]">Level</TableHead>
                  <TableHead className="w-[220px]">Área / tópico</TableHead>
                  <TableHead className="w-[190px]">Scope items</TableHead>
                  <TableHead className="w-[130px]">Origem</TableHead>
                  <TableHead className="w-[170px]">Consultor</TableHead>
                  <TableHead className="w-[170px]">Key user</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[150px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="text-center text-muted-foreground py-8"
                    >
                      Nenhuma pergunta encontrada para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((q: any) => {
                    const ans = answerMap.get(q.id);
                    return (
                      <TableRow
                        key={q.id}
                        className="cursor-pointer transition-colors hover:bg-muted/70"
                        tabIndex={0}
                        onClick={() => openAnswer(q, ans)}
                        onKeyDown={event => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openAnswer(q, ans);
                          }
                        }}
                      >
                        <TableCell className="whitespace-normal align-top">
                          <p className="line-clamp-3 break-words font-medium">
                            {q.question}
                          </p>
                          {q.category && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {q.category}
                            </p>
                          )}
                          {String((ans as any)?.answer || "").trim() ? (
                            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {String((ans as any).answer || "").slice(0, 50)}
                              ...
                            </p>
                          ) : null}
                          {Array.isArray((ans as any)?.attachments) &&
                            (ans as any).attachments.length > 0 && (
                              <p className="mt-1 flex items-center gap-1 text-xs text-blue-600">
                                <Paperclip className="h-3 w-3" />
                                {(ans as any).attachments.length} anexo(s)
                              </p>
                            )}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant="outline">{q.module || "-"}</Badge>
                        </TableCell>
                        <TableCell className="break-words align-top font-mono text-xs">
                          {q.sapId || "—"}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge
                            variant={q.level === "L2" ? "default" : "secondary"}
                          >
                            {q.level || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-normal align-top text-sm">
                          <p>{q.area || "—"}</p>
                          {q.topic && (
                            <p className="text-xs text-muted-foreground">
                              {q.topic}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-normal align-top text-xs">
                          {q.scopeItemIds?.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {q.scopeItemIds.map((id: string) => {
                                const item = scopeItems.find(
                                  (scope: any) => scope.id === id
                                );
                                return item ? (
                                  <Badge
                                    key={id}
                                    variant="secondary"
                                    className="text-[10px]"
                                  >
                                    {item.code || item.name}
                                  </Badge>
                                ) : null;
                              })}
                            </div>
                          ) : (
                            "Geral do módulo"
                          )}
                        </TableCell>
                        <TableCell className="whitespace-normal align-top text-xs">
                          <Badge variant="outline">
                            {q.source ||
                              (q.isDefault ? "Standard SAP" : "manual")}
                          </Badge>
                          {q.sourceRelease && (
                            <p className="mt-1 text-muted-foreground">
                              {q.sourceRelease}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-normal align-top text-sm">
                          {resourceMap.get(q.consultantResourceId)?.name || (
                            <span className="text-muted-foreground">
                              Não definido
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-normal align-top text-sm">
                          {keyUserMap.get(q.keyUserId)?.name || (
                            <span className="text-muted-foreground">
                              Não definido
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          {q.active === 0 ? (
                            <Badge variant="secondary">Inativa</Badge>
                          ) : String((ans as any)?.answer || "").trim() ? (
                            <Badge className="bg-green-100 text-green-800">
                              Respondida
                            </Badge>
                          ) : (
                            <Badge variant="outline">Pendente</Badge>
                          )}
                        </TableCell>
                        <TableCell className="flex gap-1 align-top">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={event => {
                              event.stopPropagation();
                              openAnswer(q, ans);
                            }}
                            title="Visualizar e responder"
                          >
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                          {canManageBdcq && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={event => {
                                event.stopPropagation();
                                openQuestionForm(q);
                              }}
                              title="Editar pergunta"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {ans && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={event => {
                                event.stopPropagation();
                                setShowHistory(ans);
                              }}
                              title="Histórico da resposta"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                          )}
                          {canManageBdcq && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={event => {
                                event.stopPropagation();
                                deleteQ.mutate({ id: q.id });
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Página {page + 1} de{" "}
          {Math.max(1, Math.ceil((questionResult?.total || 0) / PAGE_SIZE))}
        </p>
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

      {/* Add Question Dialog */}
      <Dialog
        open={showAdd}
        onOpenChange={open => {
          setShowAdd(open);
          if (!open) setForm(emptyQuestionForm());
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "Editar pergunta BDCQ" : "Nova pergunta BDCQ"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Pergunta em português *</Label>
              <Textarea
                rows={4}
                value={form.question}
                onChange={e =>
                  setForm(f => ({ ...f, question: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Pergunta original</Label>
              <Textarea
                rows={3}
                value={form.questionOriginal}
                onChange={e =>
                  setForm(f => ({ ...f, questionOriginal: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label>Frente/Módulo</Label>
                <Select
                  value={form.module || "none"}
                  onValueChange={v =>
                    setForm(f => ({ ...f, module: v === "none" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem módulo</SelectItem>
                    {moduleOptions.map(module => (
                      <SelectItem key={module} value={module}>
                        {module}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>SAP ID</Label>
                <Input
                  value={form.sapId}
                  onChange={e =>
                    setForm(f => ({ ...f, sapId: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Level</Label>
                <Select
                  value={form.level || "L3"}
                  onValueChange={level => setForm(f => ({ ...f, level }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L2">L2</SelectItem>
                    <SelectItem value="L3">L3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Categoria</Label>
                <Input
                  value={form.category}
                  onChange={e =>
                    setForm(f => ({ ...f, category: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Processo</Label>
                <Input
                  value={form.process}
                  onChange={e =>
                    setForm(f => ({ ...f, process: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Área</Label>
                <Input
                  value={form.area}
                  onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
                />
              </div>
              <div>
                <Label>Tópico</Label>
                <Input
                  value={form.topic}
                  onChange={e =>
                    setForm(f => ({ ...f, topic: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Referência SSCUI</Label>
                <Input
                  value={form.sscuiReference}
                  onChange={e =>
                    setForm(f => ({ ...f, sscuiReference: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Origem</Label>
                <Input
                  value={form.source}
                  onChange={e =>
                    setForm(f => ({ ...f, source: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Arquivo de origem</Label>
                <Input
                  value={form.sourceFile}
                  onChange={e =>
                    setForm(f => ({ ...f, sourceFile: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Release da fonte</Label>
                <Input
                  value={form.sourceRelease}
                  onChange={e =>
                    setForm(f => ({ ...f, sourceRelease: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label>Definição do tópico</Label>
              <Textarea
                rows={3}
                value={form.topicDefinition}
                onChange={e =>
                  setForm(f => ({ ...f, topicDefinition: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Solução</Label>
              <Textarea
                rows={3}
                value={form.solution}
                onChange={e =>
                  setForm(f => ({ ...f, solution: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Consultor responsável</Label>
                <Select
                  value={form.consultantResourceId || "none"}
                  onValueChange={value =>
                    setForm(current => ({
                      ...current,
                      consultantResourceId: value === "none" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um recurso alocado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não definido</SelectItem>
                    {consultantOptions(form.module).map(resource => (
                      <SelectItem key={resource.id} value={resource.id}>
                        {resource.name}
                        {projectAllocationMap.get(resource.id)?.front
                          ? ` · ${(projectAllocationMap.get(resource.id) as any).front}`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Somente consultores alocados no projeto; o módulo selecionado
                  aparece primeiro.
                </p>
              </div>
              <div>
                <Label>Key user responsável</Label>
                <Select
                  value={form.keyUserId || "none"}
                  onValueChange={value =>
                    setForm(current => ({
                      ...current,
                      keyUserId: value === "none" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um key user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não definido</SelectItem>
                    {keyUsers
                      .filter((keyUser: any) => keyUser.active)
                      .map((keyUser: any) => (
                        <SelectItem key={keyUser.id} value={keyUser.id}>
                          {keyUser.name}
                          {keyUser.role ? ` · ${keyUser.role}` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Scope items relacionados (opcional)</Label>
              <div className="max-h-40 space-y-1 overflow-auto rounded-md border p-2">
                {scopeItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum scope item cadastrado.
                  </p>
                ) : (
                  scopeItems.map((item: any) => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={form.scopeItemIds.includes(item.id)}
                        onCheckedChange={() =>
                          setForm(current => ({
                            ...current,
                            scopeItemIds: toggleValue(
                              current.scopeItemIds,
                              item.id
                            ),
                          }))
                        }
                      />
                      <span>
                        {item.code ? `${item.code} - ` : ""}
                        {item.name}
                      </span>
                      <Badge variant="outline" className="ml-auto">
                        {item.module}
                      </Badge>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-6 rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.required}
                  onCheckedChange={required =>
                    setForm(current => ({ ...current, required }))
                  }
                />
                Obrigatória
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.active === 1}
                  onCheckedChange={active =>
                    setForm(current => ({ ...current, active: active ? 1 : 0 }))
                  }
                />
                Ativa
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancelar
            </Button>
            <Button
              onClick={saveQuestion}
              disabled={
                !form.question.trim() || createQ.isPending || updateQ.isPending
              }
            >
              {form.id ? "Salvar alterações" : "Criar pergunta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLibrary} onOpenChange={setShowLibrary}>
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lista padrão de perguntas BDCQ</DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr]">
            <div className="grid content-start gap-3 rounded-md border p-4">
              <div>
                <h3 className="font-medium">
                  {templateForm.id
                    ? "Editar pergunta padrão"
                    : "Nova pergunta padrão"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Associe a um ou mais módulos, scope items, ou ambos.
                </p>
              </div>
              <div>
                <Label>Pergunta *</Label>
                <Textarea
                  rows={4}
                  value={templateForm.question}
                  onChange={event =>
                    setTemplateForm(current => ({
                      ...current,
                      question: event.target.value,
                    }))
                  }
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <Label>Categoria</Label>
                <Input
                  value={templateForm.category}
                  onChange={event =>
                    setTemplateForm(current => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  disabled={!isAdmin}
                  placeholder="Ex: Pricing, Compras, Integração"
                />
              </div>
              <div className="grid gap-2">
                <Label>Módulos relacionados</Label>
                <div className="flex flex-wrap gap-2">
                  {moduleOptions.map(module => (
                    <Button
                      key={module}
                      type="button"
                      size="sm"
                      variant={
                        templateForm.modules.includes(module)
                          ? "default"
                          : "outline"
                      }
                      onClick={() =>
                        setTemplateForm(current => ({
                          ...current,
                          modules: toggleValue(current.modules, module),
                        }))
                      }
                      disabled={!isAdmin}
                    >
                      {module}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Scope items relacionados</Label>
                <div className="max-h-52 space-y-1 overflow-auto rounded-md border p-2">
                  {scopeItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Cadastre scope items no projeto para criar vínculos
                      reutilizáveis.
                    </p>
                  ) : (
                    scopeItems.map((item: any) => {
                      const key = item.code || item.name;
                      return (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-muted"
                        >
                          <Checkbox
                            checked={templateForm.scopeItemKeys.includes(key)}
                            onCheckedChange={() =>
                              setTemplateForm(current => ({
                                ...current,
                                scopeItemKeys: toggleValue(
                                  current.scopeItemKeys,
                                  key
                                ),
                              }))
                            }
                            disabled={!isAdmin}
                          />
                          <span>
                            {item.code ? `${item.code} - ` : ""}
                            {item.name}
                          </span>
                          <Badge variant="outline" className="ml-auto">
                            {item.module}
                          </Badge>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  O vínculo usa o código; se não houver, usa o nome do scope
                  item.
                </p>
              </div>
              {isAdmin ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      templateForm.id
                        ? updateTemplate.mutate({
                            id: templateForm.id,
                            data: {
                              question: templateForm.question,
                              category: templateForm.category,
                              modules: templateForm.modules,
                              scopeItemKeys: templateForm.scopeItemKeys,
                              active: templateForm.active,
                            },
                          })
                        : createTemplate.mutate({
                            question: templateForm.question,
                            category: templateForm.category,
                            modules: templateForm.modules,
                            scopeItemKeys: templateForm.scopeItemKeys,
                            active: templateForm.active,
                          })
                    }
                    disabled={
                      !templateForm.question.trim() ||
                      createTemplate.isPending ||
                      updateTemplate.isPending
                    }
                  >
                    {templateForm.id
                      ? "Salvar alterações"
                      : "Adicionar à lista padrão"}
                  </Button>
                  {templateForm.id && (
                    <Button
                      variant="outline"
                      onClick={() => setTemplateForm(emptyTemplate)}
                    >
                      Cancelar edição
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Somente administradores podem alterar a lista padrão.
                </p>
              )}
            </div>
            <div className="grid content-start gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-medium">
                    Perguntas cadastradas ({templates.length})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Ao aplicar, vínculos são resolvidos para o projeto atual.
                  </p>
                </div>
                <Button
                  onClick={() =>
                    applyTemplates.mutate({ projectId: PROJECT_ID })
                  }
                  disabled={applyTemplates.isPending}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Aplicar ao projeto
                </Button>
              </div>
              {templates.length === 0 ? (
                <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhuma pergunta na lista padrão.
                </p>
              ) : (
                <div className="space-y-2">
                  {templates.map((template: any) => (
                    <div key={template.id} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{template.question}</p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {template.builtIn && <Badge>Padrão SAP</Badge>}
                            {template.category && (
                              <Badge variant="secondary">
                                {template.category}
                              </Badge>
                            )}
                            {template.modules?.map((module: string) => (
                              <Badge key={module} variant="outline">
                                {module}
                              </Badge>
                            ))}
                            {template.scopeItemKeys?.map((key: string) => (
                              <Badge
                                key={key}
                                className="bg-blue-50 text-blue-800"
                              >
                                Scope: {key}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {isAdmin && !template.builtIn && (
                          <div className="flex shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setTemplateForm({
                                  id: template.id,
                                  question: template.question,
                                  category: template.category || "",
                                  modules: template.modules || [],
                                  scopeItemKeys: template.scopeItemKeys || [],
                                  active: template.active ?? 1,
                                })
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                deleteTemplate.mutate({ id: template.id })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showKeyUsers} onOpenChange={setShowKeyUsers}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Key users do projeto</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Nome *</Label>
              <Input
                value={keyUserForm.name}
                onChange={event =>
                  setKeyUserForm(current => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Nome do key user"
              />
            </div>
            <div>
              <Label>E-mail *</Label>
              <Input
                type="email"
                value={keyUserForm.email}
                onChange={event =>
                  setKeyUserForm(current => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                placeholder="email@cliente.com"
              />
            </div>
            <div>
              <Label>Função</Label>
              <Input
                value={keyUserForm.role}
                onChange={event =>
                  setKeyUserForm(current => ({
                    ...current,
                    role: event.target.value,
                  }))
                }
                placeholder="Ex: Fiscal, Compras"
              />
            </div>
          </div>
          <Button
            disabled={
              !keyUserForm.name.trim() ||
              !keyUserForm.email.trim() ||
              createKeyUser.isPending
            }
            onClick={() =>
              createKeyUser.mutate({ projectId: PROJECT_ID, ...keyUserForm })
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Cadastrar key user
          </Button>
          <div className="space-y-2">
            {keyUsers.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhum key user cadastrado neste projeto.
              </p>
            ) : (
              keyUsers.map((keyUser: any) => (
                <div
                  key={keyUser.id}
                  className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{keyUser.name}</p>
                      <Badge variant={keyUser.active ? "secondary" : "outline"}>
                        {keyUser.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {keyUser.email}
                      {keyUser.role ? ` · ${keyUser.role}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        updateKeyUser.mutate({
                          id: keyUser.id,
                          data: { active: keyUser.active ? 0 : 1 },
                        })
                      }
                    >
                      {keyUser.active ? "Inativar" : "Ativar"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteKeyUser.mutate({ id: keyUser.id })}
                      title="Excluir key user"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Answer Dialog */}
      <Dialog
        open={!!showAnswer}
        onOpenChange={open => {
          if (!open) setShowAnswer(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da pergunta BDCQ</DialogTitle>
          </DialogHeader>
          {showAnswer && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {showAnswer.module || "Sem módulo"}
                </Badge>
                {showAnswer.category && (
                  <Badge variant="secondary">{showAnswer.category}</Badge>
                )}
                {showAnswer.sapId && (
                  <Badge variant="outline">SAP ID: {showAnswer.sapId}</Badge>
                )}
                {showAnswer.level && <Badge>{showAnswer.level}</Badge>}
                <Badge variant="outline">
                  {showAnswer.source ||
                    (showAnswer.isDefault ? "Standard SAP" : "manual")}
                </Badge>
                {showAnswer.active === 0 && (
                  <Badge variant="secondary">Inativa</Badge>
                )}
              </div>
              <p className="whitespace-pre-wrap text-base font-medium leading-relaxed">
                {showAnswer.question}
              </p>
              {showAnswer.questionOriginal && (
                <details className="rounded-md border bg-background p-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Ver pergunta original
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                    {showAnswer.questionOriginal}
                  </p>
                </details>
              )}
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                {showAnswer.process && (
                  <p>
                    <span className="font-medium">Processo:</span>{" "}
                    {showAnswer.process}
                  </p>
                )}
                {showAnswer.sscuiReference && (
                  <p>
                    <span className="font-medium">SSCUI:</span>{" "}
                    {showAnswer.sscuiReference}
                  </p>
                )}
                {showAnswer.area && (
                  <p>
                    <span className="font-medium">Área:</span> {showAnswer.area}
                  </p>
                )}
                {showAnswer.topic && (
                  <p>
                    <span className="font-medium">Tópico:</span>{" "}
                    {showAnswer.topic}
                  </p>
                )}
                {showAnswer.sourceFile && (
                  <p>
                    <span className="font-medium">Arquivo:</span>{" "}
                    {showAnswer.sourceFile}
                  </p>
                )}
                {showAnswer.sourceRelease && (
                  <p>
                    <span className="font-medium">Release:</span>{" "}
                    {showAnswer.sourceRelease}
                  </p>
                )}
              </div>
              {showAnswer.topicDefinition && (
                <div className="text-sm">
                  <p className="font-medium">Definição do tópico</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {showAnswer.topicDefinition}
                  </p>
                </div>
              )}
              {showAnswer.solution && (
                <div className="text-sm">
                  <p className="font-medium">Solução</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {showAnswer.solution}
                  </p>
                </div>
              )}
              {showAnswer.scopeItemIds?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {showAnswer.scopeItemIds.map((id: string) => {
                    const item = scopeItems.find(
                      (scope: any) => scope.id === id
                    );
                    return item ? (
                      <Badge key={id} className="bg-blue-50 text-blue-800">
                        {item.code ? `${item.code} - ` : ""}
                        {item.name}
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}
          <div className="grid gap-3">
            {canManageBdcq && (
              <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                <div>
                  <Label>Consultor responsável</Label>
                  <Select
                    value={ownerForm.consultantResourceId || "none"}
                    onValueChange={value =>
                      setOwnerForm(current => ({
                        ...current,
                        consultantResourceId: value === "none" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um recurso alocado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não definido</SelectItem>
                      {consultantOptions(showAnswer?.module || "").map(
                        resource => (
                          <SelectItem key={resource.id} value={resource.id}>
                            {resource.name}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Key user responsável</Label>
                  <Select
                    value={ownerForm.keyUserId || "none"}
                    onValueChange={value =>
                      setOwnerForm(current => ({
                        ...current,
                        keyUserId: value === "none" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um key user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não definido</SelectItem>
                      {keyUsers
                        .filter((keyUser: any) => keyUser.active)
                        .map((keyUser: any) => (
                          <SelectItem key={keyUser.id} value={keyUser.id}>
                            {keyUser.name}
                            {keyUser.role ? ` · ${keyUser.role}` : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  className="sm:col-span-2"
                  disabled={
                    updateQ.isPending ||
                    (ownerForm.consultantResourceId ===
                      (showAnswer?.consultantResourceId || "") &&
                      ownerForm.keyUserId === (showAnswer?.keyUserId || ""))
                  }
                  onClick={() =>
                    updateQ.mutate(
                      { id: showAnswer.id, data: ownerForm },
                      {
                        onSuccess: async () => {
                          await refetchQ();
                          setShowAnswer((current: any) =>
                            current ? { ...current, ...ownerForm } : current
                          );
                          toast.success("Responsáveis atualizados");
                        },
                      }
                    )
                  }
                >
                  Salvar responsáveis
                </Button>
              </div>
            )}
            <div>
              <Label>Resposta ou complemento</Label>
              <Textarea
                disabled={answerLocked}
                value={answerForm.answer}
                onChange={e =>
                  setAnswerForm(f => ({ ...f, answer: e.target.value }))
                }
                rows={7}
                placeholder="Registre a resposta, decisão ou informação complementar..."
              />
            </div>
            <div>
              <Label>Respondido por</Label>
              <Input
                disabled={answerLocked}
                value={answerForm.answeredBy}
                onChange={e =>
                  setAnswerForm(f => ({ ...f, answeredBy: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>Anexos complementares</Label>
                  <p className="text-xs text-muted-foreground">
                    PDF, imagens, planilhas ou documentos de até 10 MB.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  disabled={answerLocked || uploadAttachment.isPending}
                >
                  <label className="cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" />
                    {uploadAttachment.isPending
                      ? "Enviando..."
                      : "Adicionar anexo"}
                    <input
                      disabled={answerLocked}
                      type="file"
                      className="hidden"
                      onChange={event => {
                        void handleAnswerAttachment(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </Button>
              </div>
              {answerForm.attachments.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Nenhum anexo adicionado.
                </p>
              ) : (
                <div className="space-y-2">
                  {answerForm.attachments.map((url, index) => (
                    <div
                      key={`${url}-${index}`}
                      className="flex items-center gap-2 rounded-md border p-2"
                    >
                      <Paperclip className="h-4 w-4 shrink-0 text-blue-600" />
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 truncate text-sm text-blue-700 hover:underline"
                      >
                        {decodeURIComponent(
                          url.split("/").pop()?.split("?")[0] ||
                            `Anexo ${index + 1}`
                        )}
                      </a>
                      <Button variant="ghost" size="icon" asChild>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          title="Abrir anexo"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                      {!answerLocked && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setAnswerForm(current => ({
                              ...current,
                              attachments: current.attachments.filter(
                                (_, itemIndex) => itemIndex !== index
                              ),
                            }))
                          }
                          title="Remover anexo"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {answerLocked ? (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Conteúdo aprovado e bloqueado
                </>
              ) : (
                <>
                  {saveStatus === "saving" && (
                    <>
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      Salvando...
                    </>
                  )}
                  {saveStatus === "saved" && (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      Salvo automaticamente
                    </>
                  )}
                  {saveStatus === "error" && (
                    <span className="text-red-600">
                      Não foi possível salvar
                    </span>
                  )}
                  {saveStatus === "idle" && (
                    <span>
                      O salvamento ocorre 1,5 segundo após parar de digitar.
                    </span>
                  )}
                </>
              )}
            </div>
            {savedAnswerId && bdcqPolicy?.enabled && (
              <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">Aprovação da resposta</p>
                    <p className="text-xs text-muted-foreground">
                      {latestApproval
                        ? `Versão ${latestApproval.version} · ${latestApproval.status}`
                        : "Ainda não enviada"}
                    </p>
                  </div>
                  {latestApproval?.status && (
                    <Badge
                      variant={
                        latestApproval.status === "approved"
                          ? "default"
                          : latestApproval.status === "rejected"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {latestApproval.status === "approved"
                        ? "Aprovada"
                        : latestApproval.status === "rejected"
                          ? "Reprovada"
                          : latestApproval.status === "pending"
                            ? "Em aprovação"
                            : "Reaberta"}
                    </Badge>
                  )}
                </div>
                {latestApproval?.decisions?.length > 0 && (
                  <div className="space-y-1">
                    {latestApproval.decisions.map((decision: any) => (
                      <div
                        key={decision.id}
                        className="flex items-center justify-between text-xs"
                      >
                        <span>{decision.approverName || "Aprovador"}</span>
                        <Badge variant="outline">{decision.decision}</Badge>
                      </div>
                    ))}
                  </div>
                )}
                {latestApproval?.status === "pending" && (
                  <>
                    <Textarea
                      value={approvalComment}
                      onChange={event => setApprovalComment(event.target.value)}
                      placeholder="Comentário da decisão; obrigatório para reprovar"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          decideApproval.mutate({
                            roundId: latestApproval.id,
                            decision: "approved",
                            comment: approvalComment,
                          })
                        }
                      >
                        Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!approvalComment.trim()}
                        onClick={() =>
                          decideApproval.mutate({
                            roundId: latestApproval.id,
                            decision: "rejected",
                            comment: approvalComment,
                          })
                        }
                      >
                        Reprovar
                      </Button>
                    </div>
                  </>
                )}
                {latestApproval?.status === "approved" && (
                  <>
                    <Textarea
                      value={approvalComment}
                      onChange={event => setApprovalComment(event.target.value)}
                      placeholder="Justificativa obrigatória para criar nova versão"
                      rows={2}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!approvalComment.trim()}
                      onClick={() =>
                        reopenApproval.mutate({
                          roundId: latestApproval.id,
                          justification: approvalComment,
                        })
                      }
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reabrir nova versão
                    </Button>
                  </>
                )}
                {(!latestApproval ||
                  latestApproval.status === "rejected" ||
                  latestApproval.status === "superseded") && (
                  <Button
                    size="sm"
                    disabled={submitApproval.isPending}
                    onClick={() =>
                      submitApproval.mutate({
                        projectId: PROJECT_ID,
                        entityType: "bdcq_answer",
                        entityId: savedAnswerId,
                      })
                    }
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Enviar para aprovação
                  </Button>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => persistAnswer(true)}
              disabled={
                answerLocked ||
                (!answerForm.answer.trim() &&
                  answerForm.attachments.length === 0) ||
                createA.isPending ||
                updateA.isPending ||
                uploadAttachment.isPending
              }
            >
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showHistory} onOpenChange={() => setShowHistory(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico da resposta</DialogTitle>
          </DialogHeader>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-medium text-emerald-800">Versão atual</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">
              {showHistory?.answer}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Respondido por {showHistory?.answeredBy || "Não informado"}
            </p>
          </div>
          {answerHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ainda não existem versões anteriores.
            </p>
          ) : (
            <div className="space-y-3">
              {answerHistory.map((version: any) => (
                <div key={version.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">Versão anterior</p>
                    <span className="text-xs text-muted-foreground">
                      {new Date(version.createdAt).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    {version.answer}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Respondido por {version.answeredBy || "Não informado"} ·
                    Alterado por {version.changedBy || "Não informado"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterMenu({
  label,
  values,
  selected,
  onChange,
  labelFor = value => value,
}: {
  label: string;
  values: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  labelFor?: (value: string) => string;
}) {
  const options = [...new Set(values.filter(Boolean))].sort((left, right) =>
    labelFor(left).localeCompare(labelFor(right), "pt-BR")
  );
  return (
    <details className="group relative">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        {label}
        {selected.length > 0 && (
          <Badge className="ml-1 h-5 min-w-5 justify-center px-1">
            {selected.length}
          </Badge>
        )}
      </summary>
      <div className="absolute right-0 z-50 mt-1 max-h-72 min-w-56 overflow-y-auto rounded-md border bg-popover p-2 text-popover-foreground shadow-lg">
        {options.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">
            Sem opções disponíveis.
          </p>
        ) : (
          options.map(value => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox
                checked={selected.includes(value)}
                onCheckedChange={() =>
                  onChange(
                    selected.includes(value)
                      ? selected.filter(item => item !== value)
                      : [...selected, value]
                  )
                }
              />
              <span className="max-w-72 whitespace-normal">
                {labelFor(value)}
              </span>
            </label>
          ))
        )}
      </div>
    </details>
  );
}
