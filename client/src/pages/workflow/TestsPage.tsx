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
  FileImage,
  FlaskConical,
  Paperclip,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkflowProject } from "./useWorkflowProject";

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
  type: "Integrado" as const,
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
    onSuccess: () => {
      refetch();
      setShowAdd(false);
      setStepForm(emptyStep);
      toast.success("Etapa adicionada");
    },
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
              disabled={!stepForm.title.trim()}
              onClick={() =>
                create.mutate({
                  testCaseId: scenario.id,
                  position: steps.length + 1,
                  ...stepForm,
                })
              }
            >
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
  const [selected, setSelected] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyScenario);
  const { data: tests = [], refetch } = trpc.workflow.tests.list.useQuery({
    projectId,
  });
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const { data: lookups } = trpc.settings.getLookups.useQuery();
  const modules = (lookups?.fronts || [])
    .filter((item: any) => item.active)
    .map((item: any) => item.value);
  const create = trpc.workflow.tests.create.useMutation({
    onSuccess: (scenario: any) => {
      refetch();
      setShowAdd(false);
      setForm(emptyScenario);
      setSelected(scenario);
      toast.success("Cenário E2E criado. Agora adicione as etapas.");
    },
    onError: error => toast.error(error.message),
  });
  const scenarios = useMemo(
    () => tests.filter((test: any) => test.type === "Integrado"),
    [tests]
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FlaskConical className="h-6 w-6" />
            Cenários de teste E2E
          </h1>
          <p className="text-sm text-muted-foreground">
            Distribua cada etapa aos Key Users e acompanhe execução, aprovação e
            evidências.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo cenário E2E
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {scenarios.length === 0 ? (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-medium">Nenhum cenário E2E criado</p>
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
            <DialogTitle>Novo cenário de teste E2E</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código</Label>
                <Input
                  value={form.code}
                  onChange={e => setForm(v => ({ ...v, code: e.target.value }))}
                  placeholder="E2E-001"
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
