import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  ChevronRight,
  Download,
  FileImage,
  FlaskConical,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkflowProject } from "./useWorkflowProject";
import { GeneratedModelItems } from "@/components/GeneratedModelItems";

type TestStatus =
  | "Não iniciado"
  | "Em execução"
  | "Aprovado"
  | "Reprovado"
  | "Bloqueado";
const statuses: TestStatus[] = [
  "Não iniciado",
  "Em execução",
  "Aprovado",
  "Reprovado",
  "Bloqueado",
];
const emptyScenario = {
  type: "Ciclo 1" as "Ciclo 1" | "Ciclo 2" | "Unitário",
  code: "",
  title: "",
  description: "",
  module: "",
  preconditions: "",
  expectedResult: "",
  responsible: "",
};
const emptyStep = {
  title: "",
  instruction: "",
  expectedResult: "",
  responsible: "",
};
const badgeVariant = (status: string) =>
  status === "Aprovado"
    ? "default"
    : status === "Reprovado"
      ? "destructive"
      : "secondary";
const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

function ScenarioSteps({
  scenario,
  resources,
  onBack,
}: {
  scenario: any;
  resources: any[];
  onBack: () => void;
}) {
  const { projectId } = useWorkflowProject();
  const [showAdd, setShowAdd] = useState(false);
  const [stepForm, setStepForm] = useState(emptyStep);
  const [executing, setExecuting] = useState<any>(null);
  const [execution, setExecution] = useState({
    status: "Em execução" as TestStatus,
    actualResult: "",
    evidences: [] as Array<{ name: string; url: string; contentType: string }>,
    executedAt: new Date().toISOString().slice(0, 10),
  });
  const { data: steps = [], refetch } = trpc.workflow.tests.steps.list.useQuery(
    { testCaseId: scenario.id }
  );
  const create = trpc.workflow.tests.steps.create.useMutation({
    onSuccess: async () => {
      await refetch();
      setShowAdd(false);
      setStepForm(emptyStep);
      toast.success("Etapa adicionada");
    },
    onError: error =>
      toast.error(error.message || "Não foi possível adicionar a etapa"),
  });
  const update = trpc.workflow.tests.steps.update.useMutation({
    onSuccess: () => {
      refetch();
      setExecuting(null);
      toast.success("Execução da etapa salva");
    },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.workflow.tests.steps.delete.useMutation({
    onSuccess: () => refetch(),
  });
  const upload = trpc.workflow.upload.useMutation();
  const completed = steps.filter((step: any) =>
    ["Aprovado", "Reprovado"].includes(step.status)
  ).length;
  const approved = steps.filter(
    (step: any) => step.status === "Aprovado"
  ).length;
  const completion = steps.length
    ? Math.round((completed * 100) / steps.length)
    : 0;
  const approval = steps.length
    ? Math.round((approved * 100) / steps.length)
    : 0;
  const openExecution = (step: any) => {
    setExecuting(step);
    setExecution({
      status: step.status || "Em execução",
      actualResult: step.actualResult || "",
      evidences: step.evidences || [],
      executedAt: step.executedAt || new Date().toISOString().slice(0, 10),
    });
  };
  const attach = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const uploaded: Array<{
        name: string;
        url: string;
        contentType: string;
      }> = [];
      for (const file of Array.from(files)) {
        const result = await upload.mutateAsync({
          projectId,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          fileData: await fileToBase64(file),
        });
        uploaded.push({
          name: file.name,
          url: result.url,
          contentType: file.type || "application/octet-stream",
        });
      }
      setExecution(current => ({
        ...current,
        evidences: [...current.evidences, ...uploaded],
      }));
    } catch (error: any) {
      toast.error(error.message || "Não foi possível enviar a evidência");
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack}>
        ← Todos os cenários
      </Button>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>E2E</Badge>
          <span className="font-mono text-sm">{scenario.code}</span>
        </div>
        <h2 className="mt-1 text-2xl font-bold">{scenario.title}</h2>
        <p className="text-sm text-muted-foreground">
          {scenario.description ||
            "Execute cada etapa, registre o resultado e anexe a evidência."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Etapas concluídas</p>
            <p className="text-2xl font-bold">
              {completed}/{steps.length}
            </p>
            <Progress className="mt-2" value={completion} />
            <p className="mt-1 text-xs">{completion}% executado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Etapas aprovadas</p>
            <p className="text-2xl font-bold text-emerald-600">
              {approved}/{steps.length}
            </p>
            <Progress className="mt-2" value={approval} />
            <p className="mt-1 text-xs">{approval}% aprovado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Pendentes</p>
            <p className="text-2xl font-bold">{steps.length - completed}</p>
            <Button
              className="mt-2 w-full"
              size="sm"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar etapa
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="space-y-3">
        {steps.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Crie a primeira etapa do fluxo E2E.
            </CardContent>
          </Card>
        ) : (
          steps.map((step: any) => (
            <Card key={step.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted font-bold">
                  {step.position}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{step.title}</p>
                    <Badge variant={badgeVariant(step.status)}>
                      {step.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {step.instruction ||
                      step.expectedResult ||
                      "Sem instruções"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <UserRound className="h-3.5 w-3.5" />
                      {step.responsible || "Key User não alocado"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Paperclip className="h-3.5 w-3.5" />
                      {(step.evidences || []).length} evidência(s)
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => openExecution(step)}>
                    {step.status === "Não iniciado"
                      ? "Testar etapa"
                      : "Ver execução"}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => remove.mutate({ id: step.id })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova etapa E2E</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Nome da etapa *</Label>
              <Input
                value={stepForm.title}
                onChange={e =>
                  setStepForm(v => ({ ...v, title: e.target.value }))
                }
                placeholder="Ex.: Criar pedido de venda"
              />
            </div>
            <div>
              <Label>O que deve ser feito</Label>
              <Textarea
                value={stepForm.instruction}
                onChange={e =>
                  setStepForm(v => ({ ...v, instruction: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Resultado esperado</Label>
              <Textarea
                value={stepForm.expectedResult}
                onChange={e =>
                  setStepForm(v => ({ ...v, expectedResult: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Key User responsável</Label>
              <Select
                value={stepForm.responsible || "none"}
                onValueChange={responsible =>
                  setStepForm(v => ({
                    ...v,
                    responsible: responsible === "none" ? "" : responsible,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não alocado</SelectItem>
                  {resources.map(resource => (
                    <SelectItem key={resource.id} value={resource.name}>
                      {resource.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!stepForm.title.trim() || create.isPending}
              onClick={() =>
                create.mutate({
                  testCaseId: scenario.id,
                  position: steps.length + 1,
                  ...stepForm,
                  title: stepForm.title.trim(),
                })
              }
            >
              {create.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Adicionar etapa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!executing}
        onOpenChange={open => {
          if (!open) setExecuting(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Executar etapa {executing?.position} — {executing?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="rounded-lg bg-muted p-3 text-sm">
              <strong>Esperado:</strong>{" "}
              {executing?.expectedResult || "Não informado"}
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={execution.status}
                onValueChange={status =>
                  setExecution(v => ({ ...v, status: status as TestStatus }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map(status => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Resultado encontrado</Label>
              <Textarea
                rows={4}
                value={execution.actualResult}
                onChange={e =>
                  setExecution(v => ({ ...v, actualResult: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Anexos e prints</Label>
              <Input
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                onChange={e => attach(e.target.files)}
                disabled={upload.isPending}
              />
              <div className="mt-2 space-y-2">
                {execution.evidences.map((file, index) => (
                  <div
                    key={`${file.url}-${index}`}
                    className="flex items-center gap-2 rounded border p-2 text-sm"
                  >
                    <FileImage className="h-4 w-4" />
                    <a
                      className="flex-1 truncate text-primary underline"
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {file.name}
                    </a>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setExecution(v => ({
                          ...v,
                          evidences: v.evidences.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label>Data da execução</Label>
              <Input
                type="date"
                value={execution.executedAt}
                onChange={e =>
                  setExecution(v => ({ ...v, executedAt: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                update.mutate({ id: executing.id, data: execution })
              }
            >
              Salvar etapa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TestsPage() {
  const { projectId } = useWorkflowProject();
  const requestedType = new URLSearchParams(window.location.search).get("testType");
  const selectedType = requestedType === "unit_test" ? "Unitário" : requestedType === "cycle_2" ? "Ciclo 2" : requestedType === "cycle_1" ? "Ciclo 1" : "";
  const [selected, setSelected] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyScenario);
  const { data: tests = [], refetch } = trpc.workflow.tests.list.useQuery({
    projectId,
  });
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const { data: lookups } = trpc.settings.getLookups.useQuery();
  const exportQuery = trpc.workflow.tests.exportData.useQuery(
    { projectId },
    { enabled: false }
  );
  const modules = (lookups?.fronts || [])
    .filter((item: any) => item.active)
    .map((item: any) => item.value);
  const create = trpc.workflow.tests.create.useMutation({
    onSuccess: (scenario: any) => {
      refetch();
      setShowAdd(false);
      setForm(emptyScenario);
      setSelected(scenario);
      toast.success("Cenário criado. Agora adicione as etapas e evidências.");
    },
    onError: error => toast.error(error.message),
  });
  const importData = trpc.workflow.tests.importData.useMutation({
    onSuccess: result => {
      refetch();
      toast.success(
        `Carga concluída: ${result.scenariosCreated} cenário(s) e ${result.stepsCreated} etapa(s).`
      );
    },
    onError: error => toast.error(error.message),
  });
  const writeWorkbook = async (
    rows: Record<string, unknown>[],
    name: string
  ) => {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [
      12, 28, 35, 16, 30, 20, 10, 30, 40, 35, 22, 16, 35, 14,
    ].map(width => ({ wch: width }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Carga E2E");
    XLSX.writeFile(workbook, name);
  };
  const downloadTemplate = () =>
    writeWorkbook(
      [
        {
          "Tipo de teste": "Ciclo 1",
          "Código cenário": "TST-001",
          "Nome cenário": "Order to Cash completo",
          "Descrição cenário": "Validar o processo ponta a ponta",
          Módulo: "SD",
          "Pré-condições": "Cliente e materiais cadastrados",
          "Líder cenário": "Key User Líder",
          "Ordem etapa": 1,
          "Nome etapa": "Criar pedido de venda",
          "Instrução etapa": "Criar o pedido com o cliente de teste",
          "Resultado esperado": "Pedido criado sem erros",
          "Key User etapa": "Key User SD",
          Status: "Não iniciado",
          "Resultado encontrado": "",
          "Data execução": "",
        },
        {
          "Tipo de teste": "Ciclo 1",
          "Código cenário": "TST-001",
          "Nome cenário": "Order to Cash completo",
          "Descrição cenário": "Validar o processo ponta a ponta",
          Módulo: "FI",
          "Pré-condições": "Cliente e materiais cadastrados",
          "Líder cenário": "Key User Líder",
          "Ordem etapa": 2,
          "Nome etapa": "Contabilizar faturamento",
          "Instrução etapa": "Faturar e validar o documento contábil",
          "Resultado esperado": "Documento contábil gerado",
          "Key User etapa": "Key User FI",
          Status: "Não iniciado",
          "Resultado encontrado": "",
          "Data execução": "",
        },
      ],
      "modelo-carga-testes-e2e.xlsx"
    );
  const exportExisting = async () => {
    const result = await exportQuery.refetch();
    if (!result.data)
      return toast.error("Não foi possível carregar os testes.");
    const scenariosById = new Map(
      result.data.scenarios.map((scenario: any) => [scenario.id, scenario])
    );
    const rows = result.data.steps.map((step: any) => {
      const scenario: any = scenariosById.get(step.testCaseId);
      return {
        "Tipo de teste": scenario?.type === "Integrado" ? "Ciclo 1" : scenario?.type || "Ciclo 1",
        "Código cenário": scenario?.code || "",
        "Nome cenário": scenario?.title || "",
        "Descrição cenário": scenario?.description || "",
        Módulo: scenario?.module || "",
        "Pré-condições": scenario?.preconditions || "",
        "Líder cenário": scenario?.responsible || "",
        "Ordem etapa": step.position,
        "Nome etapa": step.title,
        "Instrução etapa": step.instruction || "",
        "Resultado esperado": step.expectedResult || "",
        "Key User etapa": step.responsible || "",
        Status: step.status,
        "Resultado encontrado": step.actualResult || "",
        "Data execução": step.executedAt || "",
      };
    });
    if (!rows.length)
      return toast.info("Ainda não existem etapas para exportar.");
    await writeWorkbook(rows, "testes-e2e-cadastrados.xlsx");
  };
  const handleImport = async (file?: File) => {
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });
      const rows = raw.map((row, index) => {
        const status = String(row["Status"] || "Não iniciado") as TestStatus;
        if (!statuses.includes(status))
          throw new Error(`Linha ${index + 2}: status inválido.`);
        const scenarioTitle = String(row["Nome cenário"] || "").trim();
        const stepTitle = String(row["Nome etapa"] || "").trim();
        if (!scenarioTitle || !stepTitle)
          throw new Error(
            `Linha ${index + 2}: nome do cenário e nome da etapa são obrigatórios.`
          );
        return {
          scenarioType: (["Unitário", "Ciclo 1", "Ciclo 2"].includes(String(row["Tipo de teste"])) ? String(row["Tipo de teste"]) : "Ciclo 1") as "Unitário" | "Ciclo 1" | "Ciclo 2",
          scenarioCode: String(row["Código cenário"] || "").trim(),
          scenarioTitle,
          scenarioDescription: String(row["Descrição cenário"] || ""),
          module: String(row["Módulo"] || ""),
          preconditions: String(row["Pré-condições"] || ""),
          scenarioLeader: String(row["Líder cenário"] || ""),
          stepPosition: Number(row["Ordem etapa"] || 1),
          stepTitle,
          instruction: String(row["Instrução etapa"] || ""),
          expectedResult: String(row["Resultado esperado"] || ""),
          keyUser: String(row["Key User etapa"] || ""),
          status,
          actualResult: String(row["Resultado encontrado"] || ""),
          executedAt: String(row["Data execução"] || ""),
        };
      });
      if (!rows.length)
        throw new Error("O arquivo não possui linhas para importar.");
      await importData.mutateAsync({ projectId, rows });
    } catch (error: any) {
      toast.error(error.message || "Arquivo de carga inválido.");
    }
  };
  const scenarios = useMemo(
    () => tests.filter((test: any) => ["Unitário", "Ciclo 1", "Ciclo 2", "Integrado"].includes(test.type) && (!selectedType || test.type === selectedType || (selectedType === "Ciclo 1" && test.type === "Integrado"))),
    [tests, selectedType]
  );
  if (selected)
    return (
      <div className="space-y-4 p-3 sm:p-6">
        <ScenarioSteps
          scenario={selected}
          resources={resources}
          onBack={() => setSelected(null)}
        />
      </div>
    );
  return (
    <div className="space-y-4 p-3 sm:p-6">
      <GeneratedModelItems projectId={projectId} types={selectedType === "Unitário" ? ["unit_test"] : selectedType === "Ciclo 1" ? ["cycle_1"] : selectedType === "Ciclo 2" ? ["cycle_2"] : ["unit_test", "cycle_1", "cycle_2"]} title="Testes padrão aplicados" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FlaskConical className="h-6 w-6" />
            {selectedType ? `Testes · ${selectedType}` : "Cenários de teste"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Distribua cada etapa aos Key Users e acompanhe execução, aprovação e
            evidências.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Baixar modelo
          </Button>
          <Button variant="outline" onClick={exportExisting}>
            <Download className="mr-2 h-4 w-4" />
            Baixar cadastrados
          </Button>
          <Button variant="outline" asChild disabled={importData.isPending}>
            <label className="cursor-pointer">
              <Upload className="mr-2 h-4 w-4" />
              Dar carga
              <input
                className="hidden"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={event => {
                  handleImport(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo cenário
          </Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {scenarios.length === 0 ? (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-medium">Nenhum cenário de teste criado</p>
              <p className="text-sm text-muted-foreground">
                Crie um fluxo e depois distribua suas etapas aos Key Users.
              </p>
            </CardContent>
          </Card>
        ) : (
          scenarios.map((scenario: any) => (
            <Card
              key={scenario.id}
              className="cursor-pointer transition hover:border-primary"
              onClick={() => setSelected(scenario)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{scenario.code || "E2E"}</Badge>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardTitle className="text-lg">{scenario.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {scenario.description ||
                    scenario.expectedResult ||
                    "Abra para configurar e executar as etapas."}
                </p>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span>{scenario.module || "Multimódulo"}</span>
                  <span>{scenario.responsible || "Sem líder"}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo cenário de teste</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Tipo de teste *</Label>
                <Select value={form.type} onValueChange={(type: "Unitário" | "Ciclo 1" | "Ciclo 2") => setForm(value => ({ ...value, type }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Unitário">Teste unitário</SelectItem>
                    <SelectItem value="Ciclo 1">Ciclo 1</SelectItem>
                    <SelectItem value="Ciclo 2">Ciclo 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Código</Label>
                <Input
                  value={form.code}
                  onChange={e => setForm(v => ({ ...v, code: e.target.value }))}
                  placeholder="TST-001"
                />
              </div>
              <div>
                <Label>Módulo principal</Label>
                <Select
                  value={form.module || "none"}
                  onValueChange={module =>
                    setForm(v => ({
                      ...v,
                      module: module === "none" ? "" : module,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Multimódulo</SelectItem>
                    {modules.map((module: string) => (
                      <SelectItem key={module} value={module}>
                        {module}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Nome do cenário *</Label>
              <Input
                value={form.title}
                onChange={e => setForm(v => ({ ...v, title: e.target.value }))}
                placeholder="Ex.: Order to Cash completo"
              />
            </div>
            <div>
              <Label>Objetivo do teste</Label>
              <Textarea
                value={form.description}
                onChange={e =>
                  setForm(v => ({ ...v, description: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Pré-condições</Label>
              <Textarea
                value={form.preconditions}
                onChange={e =>
                  setForm(v => ({ ...v, preconditions: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Líder do cenário</Label>
              <Select
                value={form.responsible || "none"}
                onValueChange={responsible =>
                  setForm(v => ({
                    ...v,
                    responsible: responsible === "none" ? "" : responsible,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não atribuído</SelectItem>
                  {resources.map((resource: any) => (
                    <SelectItem key={resource.id} value={resource.name}>
                      {resource.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!form.title.trim() || create.isPending}
              onClick={() => create.mutate({ projectId, ...form })}
            >
              Criar e adicionar etapas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
