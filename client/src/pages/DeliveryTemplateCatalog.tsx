import { useMemo, useState } from "react";
import {
  Archive,
  CheckCircle2,
  Filter,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const deliveryTypes = [
  "activity",
  "bdcq",
  "workshop",
  "dcd",
  "gap",
  "configuration",
  "unit_test",
  "cycle_1",
  "cycle_2",
  "risk",
  "issue",
  "cutover",
  "go_live",
  "closure",
] as const;
type DeliveryType = (typeof deliveryTypes)[number];

const typeLabels: Record<DeliveryType, string> = {
  activity: "Atividade do GP",
  bdcq: "BDCQ",
  workshop: "Workshop",
  dcd: "DCD",
  gap: "Gap",
  configuration: "Configuração do consultor",
  unit_test: "Teste unitário",
  cycle_1: "Ciclo 1",
  cycle_2: "Ciclo 2",
  risk: "Risco",
  issue: "Issue",
  cutover: "Cutover",
  go_live: "Go-live",
  closure: "Encerramento",
};
const phases = ["Discover", "Prepare", "Explore", "Realize", "Deploy", "Run"];
const ownerRoles = [
  { value: "manager", label: "GP do projeto" },
  { value: "technical_lead", label: "Líder técnico" },
  { value: "consultant", label: "Consultor" },
  { value: "key_user", label: "Key User" },
  { value: "approver", label: "Aprovador" },
];
const approvalModes = [
  { value: "none", label: "Sem aprovação" },
  { value: "any", label: "Qualquer aprovador" },
  { value: "all", label: "Todos os aprovadores" },
  { value: "minimum", label: "Quórum mínimo" },
] as const;
const defaultStages: Record<DeliveryType, string> = {
  activity: "preparation",
  bdcq: "bdcq",
  workshop: "workshops",
  dcd: "dcd",
  gap: "gaps",
  configuration: "configuration",
  unit_test: "unit_tests",
  cycle_1: "cycle_1",
  cycle_2: "cycle_2",
  risk: "raid",
  issue: "raid",
  cutover: "cutover",
  go_live: "go_live",
  closure: "closure",
};

type TemplateForm = {
  id: string;
  type: DeliveryType;
  title: string;
  description: string;
  instructions: string;
  phase: string;
  stage: string;
  modules: string[];
  scopeItemKeys: string[];
  projectIds: string[];
  required: boolean;
  sortOrder: number;
  dependencyTemplateIds: string[];
  ownerRole: string;
  dueOffsetDays: number;
  evidenceText: string;
  approvalMode: "none" | "any" | "all" | "minimum";
  minimumApprovals: number;
  completionCriteria: string;
  effectiveFrom: string;
  active: boolean;
  workshopObjective: string;
  workshopContent: string;
  workshopDuration: string;
  workshopAgenda: string;
  workshopExpectedOutcomes: string;
  workshopPrerequisites: string;
  workshopRequiredRoles: string;
  source: "delivery" | "workshop";
};

const emptyForm = (): TemplateForm => ({
  id: "",
  type: "bdcq",
  title: "",
  description: "",
  instructions: "",
  phase: "Explore",
  stage: defaultStages.bdcq,
  modules: [],
  scopeItemKeys: [],
  projectIds: [],
  required: true,
  sortOrder: 0,
  dependencyTemplateIds: [],
  ownerRole: "consultant",
  dueOffsetDays: 0,
  evidenceText: "",
  approvalMode: "none",
  minimumApprovals: 1,
  completionCriteria: "",
  effectiveFrom: "",
  active: true,
  workshopObjective: "",
  workshopContent: "",
  workshopDuration: "",
  workshopAgenda: "",
  workshopExpectedOutcomes: "",
  workshopPrerequisites: "",
  workshopRequiredRoles: "",
  source: "delivery",
});

type CatalogProps = {
  moduleOptions?: string[];
  scopeOptions?: Array<{
    key: string;
    code?: string;
    name: string;
    module: string;
  }>;
  projectOptions?: Array<{ id: string; name: string }>;
};

export default function DeliveryTemplateCatalog({
  moduleOptions = [],
  scopeOptions = [],
  projectOptions = [],
}: CatalogProps) {
  const { user } = useAuth();
  const { data: appUser } = trpc.access.getByEmail.useQuery(
    { email: user?.email || "" },
    { enabled: Boolean(user?.email) },
  );
  const isTechnicalLead = appUser?.role === "technical_lead";
  const managedModules = isTechnicalLead
    ? moduleOptions.filter(module =>
        (appUser.teamFronts || []).some(front =>
          String(front).toLocaleUpperCase("pt-BR") === module.toLocaleUpperCase("pt-BR")))
    : moduleOptions;
  const visibleScopeOptions = isTechnicalLead
    ? scopeOptions.filter(item => managedModules.some(module =>
        module.toLocaleUpperCase("pt-BR") === item.module.toLocaleUpperCase("pt-BR")))
    : scopeOptions;
  const utils = trpc.useUtils();
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data: templates = [], isLoading } =
    trpc.workflow.delivery.templates.list.useQuery({ includeArchived });
  const { data: workshopTemplates = [], isLoading: workshopsLoading } =
    trpc.workflow.workshops.templates.listAll.useQuery();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<any>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm);

  const refresh = async () => {
    await utils.workflow.delivery.templates.invalidate();
  };
  const createTemplate = trpc.workflow.delivery.templates.create.useMutation({
    onSuccess: async () => {
      await refresh();
      setEditorOpen(false);
      toast.success("Modelo incluído na Trilha Mestre");
    },
    onError: error => toast.error(error.message),
  });
  const updateTemplate = trpc.workflow.delivery.templates.update.useMutation({
    onSuccess: async () => {
      await refresh();
      setEditorOpen(false);
      toast.success("Modelo atualizado e versionado");
    },
    onError: error => toast.error(error.message),
  });
  const archiveTemplate = trpc.workflow.delivery.templates.archive.useMutation({
    onSuccess: async () => {
      await refresh();
      setArchiveTarget(null);
      toast.success("Modelo arquivado; projetos existentes foram preservados");
    },
    onError: error => toast.error(error.message),
  });
  const createWorkshopTemplate =
    trpc.workflow.workshops.templates.create.useMutation({
      onSuccess: async () => {
        await utils.workflow.workshops.templates.listAll.invalidate();
        setEditorOpen(false);
        toast.success("Workshop padrão incluído na Trilha Mestre");
      },
      onError: error => toast.error(error.message),
    });
  const updateWorkshopTemplate =
    trpc.workflow.workshops.templates.update.useMutation({
      onSuccess: async () => {
        await utils.workflow.workshops.templates.listAll.invalidate();
        setEditorOpen(false);
        toast.success("Workshop padrão atualizado");
      },
      onError: error => toast.error(error.message),
    });
  const deleteWorkshopTemplate =
    trpc.workflow.workshops.templates.delete.useMutation({
      onSuccess: async () => {
        await utils.workflow.workshops.templates.listAll.invalidate();
        setArchiveTarget(null);
        toast.success("Workshop padrão removido");
      },
      onError: error => toast.error(error.message),
    });

  const catalogTemplates = useMemo(
    () => [
      ...(templates as any[]).map(template => ({
        ...template,
        _source: "delivery" as const,
      })),
      ...(workshopTemplates as any[]).map(template => ({
        ...template,
        _source: "workshop" as const,
        type: "workshop",
        description: template.objective || template.content || "",
        instructions: template.content || "",
        phase: "Explore",
        stage: "workshops",
        required: true,
        ownerRole: "consultant",
        dueOffsetDays: 0,
        version: 1,
      })),
    ],
    [templates, workshopTemplates]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return catalogTemplates.filter(template => {
      if (typeFilter !== "all" && template.type !== typeFilter) return false;
      if (phaseFilter !== "all" && template.phase !== phaseFilter) return false;
      if (!term) return true;
      return [
        template.title,
        template.description,
        template.instructions,
        template.stage,
        ...(template.modules || []),
        ...(template.scopeItemKeys || []),
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term);
    });
  }, [catalogTemplates, search, typeFilter, phaseFilter]);

  const groupedCount = useMemo(() => {
    const result = new Map<string, number>();
    catalogTemplates
      .filter(item => !item.archivedAt)
      .forEach(item => result.set(item.type, (result.get(item.type) || 0) + 1));
    return result;
  }, [catalogTemplates]);

  const toggle = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter(item => item !== value)
      : [...values, value];

  const openNew = (type: DeliveryType = "bdcq") => {
    const next = emptyForm();
    next.type = type;
    next.stage = defaultStages[type];
    next.phase = ["cutover", "go_live", "closure"].includes(type)
      ? "Deploy"
      : ["configuration", "unit_test", "cycle_1", "cycle_2"].includes(type)
        ? "Realize"
        : "Explore";
    setForm(next);
    setEditorOpen(true);
  };

  const openEdit = (template: any) => {
    setForm({
      id: template.id,
      type: template.type,
      title: template.title || "",
      description: template.description || "",
      instructions: template.instructions || "",
      phase: template.phase || "Prepare",
      stage: template.stage || defaultStages[template.type as DeliveryType],
      modules: template.modules || [],
      scopeItemKeys: template.scopeItemKeys || [],
      projectIds: template.projectIds || [],
      required: template.required !== false,
      sortOrder: Number(template.sortOrder || 0),
      dependencyTemplateIds: template.dependencyTemplateIds || [],
      ownerRole: template.ownerRole || "consultant",
      dueOffsetDays: Number(template.dueOffsetDays || 0),
      evidenceText: (template.evidenceRequirements || []).join("\n"),
      approvalMode: template.approvalPolicy?.mode || "none",
      minimumApprovals: Number(template.approvalPolicy?.minimumApprovals || 1),
      completionCriteria: template.completionCriteria || "",
      effectiveFrom: template.effectiveFrom || "",
      active: template.active !== false,
      workshopObjective: template.objective || template.payload?.objective || "",
      workshopContent: template.content || template.payload?.content || "",
      workshopDuration: template.duration || template.payload?.duration || "",
      workshopAgenda: (template.agenda || template.payload?.agenda || []).join("\n"),
      workshopExpectedOutcomes: (template.expectedOutcomes || template.payload?.expectedOutcomes || []).join("\n"),
      workshopPrerequisites: (template.prerequisites || template.payload?.prerequisites || []).join("\n"),
      workshopRequiredRoles: (template.requiredRoles || template.payload?.requiredRoles || []).join("\n"),
      source: template._source || "delivery",
    });
    setEditorOpen(true);
  };

  const save = () => {
    if (form.type === "workshop" && form.id && form.source === "workshop") {
      const lines = (value: string) =>
        value
          .split("\n")
          .map(item => item.trim())
          .filter(Boolean);
      const data = {
        title: form.title.trim(),
        objective: form.workshopObjective,
        content: form.workshopContent,
        duration: form.workshopDuration,
        modules: form.modules,
        projectIds: form.projectIds,
        scopeItemKeys: form.scopeItemKeys,
        agenda: lines(form.workshopAgenda),
        expectedOutcomes: lines(form.workshopExpectedOutcomes),
        prerequisites: lines(form.workshopPrerequisites),
        requiredRoles: lines(form.workshopRequiredRoles),
        presentationFiles: [],
        active: form.active,
      };
      updateWorkshopTemplate.mutate({ id: form.id, data });
      return;
    }
    const data = {
      type: form.type,
      title: form.title.trim(),
      description: form.description,
      instructions: form.instructions,
      phase: form.phase,
      stage: form.stage.trim(),
      modules: form.modules,
      scopeItemKeys: form.scopeItemKeys,
      projectIds: form.projectIds,
      required: form.required,
      sortOrder: form.sortOrder,
      dependencyTemplateIds: form.dependencyTemplateIds,
      ownerRole: form.ownerRole,
      dueOffsetDays: form.dueOffsetDays,
      evidenceRequirements: form.evidenceText
        .split("\n")
        .map(item => item.trim())
        .filter(Boolean),
      approvalPolicy: {
        mode: form.approvalMode,
        minimumApprovals: form.minimumApprovals,
      },
      completionCriteria: form.completionCriteria,
      payload: form.type === "workshop" ? {
        objective: form.workshopObjective,
        content: form.workshopContent,
        duration: form.workshopDuration,
        agenda: form.workshopAgenda.split("\n").map(item => item.trim()).filter(Boolean),
        expectedOutcomes: form.workshopExpectedOutcomes.split("\n").map(item => item.trim()).filter(Boolean),
        prerequisites: form.workshopPrerequisites.split("\n").map(item => item.trim()).filter(Boolean),
        requiredRoles: form.workshopRequiredRoles.split("\n").map(item => item.trim()).filter(Boolean),
      } : {},
      effectiveFrom: form.effectiveFrom,
      active: form.active,
    };
    if (form.id) updateTemplate.mutate({ id: form.id, data });
    else createTemplate.mutate(data);
  };

  const applicability = (template: any) => {
    if (template.projectIds?.length)
      return `${template.projectIds.length} projeto(s) específico(s)`;
    if (template.modules?.length && template.scopeItemKeys?.length)
      return "Módulo + scope item";
    if (template.scopeItemKeys?.length) return "Por scope item";
    if (template.modules?.length) return "Por módulo";
    return "Geral";
  };
  const canManage = (template: any) => {
    if (!isTechnicalLead) return true;
    if (template.type === "activity" || template._source === "workshop" || !template.modules?.length) return false;
    return template.modules.every((module: string) =>
      managedModules.some(owned => owned.toLocaleUpperCase("pt-BR") === module.toLocaleUpperCase("pt-BR")));
  };

  return (
    <div className="space-y-5">
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex items-center gap-2 font-semibold text-blue-950">
              <ShieldCheck className="h-5 w-5" />
              Trilha Mestre de Delivery
            </div>
            <p className="mt-1 text-sm text-blue-900/75">
              Defina uma vez o que deve ser executado. A trilha combina itens
              gerais, módulos e scope items sem sobrescrever personalizações dos
              projetos.
            </p>
          </div>
          <Button onClick={() => openNew()}>
            <Plus className="mr-2 h-4 w-4" />
            Novo item da trilha
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {(
          ["bdcq", "workshop", "configuration", "unit_test"] as DeliveryType[]
        ).map(type => (
          <button
            key={type}
            type="button"
            onClick={() => setTypeFilter(type)}
            className="rounded-lg border bg-card p-3 text-left transition hover:border-primary"
          >
            <span className="text-xs text-muted-foreground">
              {typeLabels[type]}
            </span>
            <span className="mt-1 block text-2xl font-semibold">
              {groupedCount.get(type) || 0}
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_220px_180px_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar título, etapa, módulo ou scope item"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger>
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {deliveryTypes.map(type => (
              <SelectItem key={type} value={type}>
                {typeLabels[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={phaseFilter} onValueChange={setPhaseFilter}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as fases</SelectItem>
            {phases.map(phase => (
              <SelectItem key={phase} value={phase}>
                {phase}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 rounded-md border px-3 text-sm">
          <Checkbox
            checked={includeArchived}
            onCheckedChange={value => setIncludeArchived(value === true)}
          />
          Arquivados
        </label>
      </div>

      <div className="space-y-2">
        {filtered.map((template: any) => (
          <Card
            key={`${template._source}-${template.id}`}
            className={
              template.archivedAt || !template.active ? "opacity-60" : ""
            }
          >
            <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>
                    {typeLabels[template.type as DeliveryType] || template.type}
                  </Badge>
                  <h3 className="font-semibold">{template.title}</h3>
                  <Badge variant={template.required ? "default" : "outline"}>
                    {template.required ? "Obrigatório" : "Opcional"}
                  </Badge>
                  {template.archivedAt && (
                    <Badge variant="destructive">Arquivado</Badge>
                  )}
                  {!template.archivedAt && !template.active && (
                    <Badge variant="secondary">Inativo</Badge>
                  )}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {template.description || "Sem descrição"}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant="secondary">
                    {template.phase} · {template.stage}
                  </Badge>
                  <Badge variant="outline">{applicability(template)}</Badge>
                  <Badge variant="outline">
                    {ownerRoles.find(role => role.value === template.ownerRole)
                      ?.label || template.ownerRole}
                  </Badge>
                  <Badge variant="outline">
                    Prazo D{Number(template.dueOffsetDays || 0) >= 0 ? "+" : ""}
                    {template.dueOffsetDays || 0}
                  </Badge>
                  <Badge variant="outline">v{template.version || 1}</Badge>
                  {template.approvalPolicy?.mode !== "none" && (
                    <Badge className="bg-amber-100 text-amber-900">
                      Aprovação:{" "}
                      {
                        approvalModes.find(
                          mode => mode.value === template.approvalPolicy.mode
                        )?.label
                      }
                    </Badge>
                  )}
                  {template.evidenceRequirements?.length > 0 && (
                    <Badge className="bg-emerald-100 text-emerald-900">
                      {template.evidenceRequirements.length} evidência(s)
                    </Badge>
                  )}
                </div>
              </div>
              {!template.archivedAt && (
                <div className="flex shrink-0 gap-2">
                  <Switch
                    aria-label="Ativar modelo"
                    checked={template.active !== false}
                    disabled={!canManage(template)}
                    onCheckedChange={active =>
                      template._source === "workshop"
                        ? updateWorkshopTemplate.mutate({
                            id: template.id,
                            data: { active },
                          })
                        : updateTemplate.mutate({
                            id: template.id,
                            data: { active },
                          })
                    }
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canManage(template)}
                    onClick={() => openEdit(template)}
                  >
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Arquivar"
                    disabled={!canManage(template)}
                    onClick={() => setArchiveTarget(template)}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {!isLoading && !workshopsLoading && filtered.length === 0 && (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            Nenhum modelo corresponde aos filtros.
          </div>
        )}
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {form.id
                ? "Editar item da Trilha Mestre"
                : "Novo item da Trilha Mestre"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-5">
            <section className="grid gap-3 sm:grid-cols-2">
              <FieldSelect
                label="Tipo *"
                value={form.type}
                values={deliveryTypes.filter(value => !isTechnicalLead || value !== "activity").map(value => ({
                  value,
                  label: typeLabels[value],
                }))}
                onChange={value =>
                  setForm(current => ({
                    ...current,
                    type: value as DeliveryType,
                    stage: current.id
                      ? current.stage
                      : defaultStages[value as DeliveryType],
                  }))
                }
              />
              <div>
                <Label>Título *</Label>
                <Input
                  value={form.title}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Descrição</Label>
                <Textarea
                  rows={2}
                  value={form.description}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Instruções para execução</Label>
                <Textarea
                  rows={3}
                  value={form.instructions}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      instructions: event.target.value,
                    }))
                  }
                  placeholder="Explique como executar, quais fontes consultar e o resultado esperado."
                />
              </div>
            </section>

            {form.type === "workshop" && (
              <section className="grid gap-4 rounded-lg border border-blue-200 bg-blue-50/40 p-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Objetivo do workshop</Label>
                  <Textarea
                    rows={2}
                    value={form.workshopObjective}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        workshopObjective: event.target.value,
                      }))
                    }
                    placeholder="Qual decisão ou entendimento o workshop deve produzir?"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>O que será apresentado</Label>
                  <Textarea
                    rows={3}
                    value={form.workshopContent}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        workshopContent: event.target.value,
                      }))
                    }
                    placeholder="Processos, demonstrações, cenários e tópicos."
                  />
                </div>
                <div>
                  <Label>Duração sugerida</Label>
                  <Input
                    value={form.workshopDuration}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        workshopDuration: event.target.value,
                      }))
                    }
                    placeholder="Ex.: 2h"
                  />
                </div>
                <div>
                  <Label>Agenda (um item por linha)</Label>
                  <Textarea
                    rows={4}
                    value={form.workshopAgenda}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        workshopAgenda: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Funções necessárias (uma por linha)</Label>
                  <Textarea
                    rows={4}
                    value={form.workshopRequiredRoles}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        workshopRequiredRoles: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Resultados esperados (um por linha)</Label>
                  <Textarea
                    rows={4}
                    value={form.workshopExpectedOutcomes}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        workshopExpectedOutcomes: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>Pré-requisitos (um por linha)</Label>
                  <Textarea
                    rows={4}
                    value={form.workshopPrerequisites}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        workshopPrerequisites: event.target.value,
                      }))
                    }
                  />
                </div>
              </section>
            )}

            <section className="grid gap-3 rounded-lg border p-4 sm:grid-cols-4">
              <FieldSelect
                label="Fase"
                value={form.phase}
                values={phases.map(value => ({ value, label: value }))}
                onChange={phase => setForm(current => ({ ...current, phase }))}
              />
              <div>
                <Label>Etapa *</Label>
                <Input
                  value={form.stage}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      stage: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Ordem</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      sortOrder: Number(event.target.value),
                    }))
                  }
                />
              </div>
              <div>
                <Label>Prazo relativo (dias)</Label>
                <Input
                  type="number"
                  min={-365}
                  max={3650}
                  value={form.dueOffsetDays}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      dueOffsetDays: Number(event.target.value),
                    }))
                  }
                />
              </div>
              <FieldSelect
                label="Papel responsável"
                value={form.ownerRole}
                values={ownerRoles}
                onChange={ownerRole =>
                  setForm(current => ({ ...current, ownerRole }))
                }
              />
              <div>
                <Label>Vigência</Label>
                <Input
                  type="date"
                  value={form.effectiveFrom}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      effectiveFrom: event.target.value,
                    }))
                  }
                />
              </div>
              <label className="flex items-end gap-2 pb-2">
                <Switch
                  checked={form.required}
                  onCheckedChange={required =>
                    setForm(current => ({ ...current, required }))
                  }
                />
                <span className="text-sm font-medium">
                  {form.required ? "Obrigatório" : "Opcional"}
                </span>
              </label>
              <label className="flex items-end gap-2 pb-2">
                <Switch
                  checked={form.active}
                  onCheckedChange={active =>
                    setForm(current => ({ ...current, active }))
                  }
                />
                <span className="text-sm font-medium">Modelo ativo</span>
              </label>
            </section>

            <section className="space-y-4">
              <div>
                <Label>Aplicar aos módulos</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {managedModules.map(module => (
                    <Button
                      type="button"
                      size="sm"
                      key={module}
                      variant={
                        form.modules.includes(module) ? "default" : "outline"
                      }
                      onClick={() =>
                        setForm(current => ({
                          ...current,
                          modules: toggle(current.modules, module),
                        }))
                      }
                    >
                      {module}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Aplicar aos scope items</Label>
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                  {visibleScopeOptions.map(item => (
                    <label
                      key={`${item.module}:${item.key}`}
                      className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        checked={form.scopeItemKeys.includes(item.key)}
                        onCheckedChange={() =>
                          setForm(current => ({
                            ...current,
                            scopeItemKeys: toggle(
                              current.scopeItemKeys,
                              item.key
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
                  ))}
                </div>
              </div>
              {projectOptions.length > 0 && (
                <div>
                  <Label>Restringir a projetos específicos</Label>
                  <div className="mt-2 grid max-h-44 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                    {projectOptions.map(project => (
                      <label
                        key={project.id}
                        className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-muted"
                      >
                        <Checkbox
                          checked={form.projectIds.includes(project.id)}
                          onCheckedChange={() =>
                            setForm(current => ({
                              ...current,
                              projectIds: toggle(
                                current.projectIds,
                                project.id
                              ),
                            }))
                          }
                        />
                        {project.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Sem seleção, o{" "}
                {form.type === "workshop" ? "workshop padrão" : "modelo"} é
                geral. Selecione módulo, scope item ou ambos para direcionar a
                aplicação.
              </p>
              {isTechnicalLead && (
                <p className="text-xs font-medium text-blue-700">
                  Você publica diretamente padrões dos seus módulos: {managedModules.join(", ") || "nenhum módulo atribuído"}.
                  Padrões gerais e da Trilha do GP são mantidos pelo administrador.
                </p>
              )}
            </section>

            <section className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
              <div>
                <Label>Evidências obrigatórias (uma por linha)</Label>
                <Textarea
                  rows={4}
                  value={form.evidenceText}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      evidenceText: event.target.value,
                    }))
                  }
                  placeholder={
                    "Captura de tela\nDocumento aprovado\nLog de execução"
                  }
                />
              </div>
              <div>
                <Label>Critério de conclusão</Label>
                <Textarea
                  rows={4}
                  value={form.completionCriteria}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      completionCriteria: event.target.value,
                    }))
                  }
                />
              </div>
              <FieldSelect
                label="Política de aprovação"
                value={form.approvalMode}
                values={[...approvalModes]}
                onChange={approvalMode =>
                  setForm(current => ({
                    ...current,
                    approvalMode: approvalMode as TemplateForm["approvalMode"],
                  }))
                }
              />
              {form.approvalMode === "minimum" && (
                <div>
                  <Label>Quantidade mínima</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.minimumApprovals}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        minimumApprovals: Math.max(
                          1,
                          Number(event.target.value)
                        ),
                      }))
                    }
                  />
                </div>
              )}
            </section>

            <section>
              <Label>Dependências de outros modelos</Label>
              <div className="mt-2 grid max-h-48 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                {(templates as any[])
                  .filter(item => item.id !== form.id && !item.archivedAt)
                  .map(item => (
                    <label
                      key={item.id}
                      className="flex cursor-pointer items-start gap-2 rounded p-1.5 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={form.dependencyTemplateIds.includes(item.id)}
                        onCheckedChange={() =>
                          setForm(current => ({
                            ...current,
                            dependencyTemplateIds: toggle(
                              current.dependencyTemplateIds,
                              item.id
                            ),
                          }))
                        }
                      />
                      <span>
                        <strong>{typeLabels[item.type as DeliveryType]}</strong>
                        <br />
                        {item.title}
                      </span>
                    </label>
                  ))}
              </div>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={save}
              disabled={
                !form.title.trim() ||
                !form.stage.trim() ||
                (isTechnicalLead && (!form.modules.length || form.type === "activity")) ||
                createTemplate.isPending ||
                updateTemplate.isPending ||
                createWorkshopTemplate.isPending ||
                updateWorkshopTemplate.isPending
              }
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Salvar modelo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(archiveTarget)}
        onOpenChange={open => !open && setArchiveTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Arquivar modelo?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            “{archiveTarget?.title}” deixará de gerar novos itens. As execuções
            já existentes nos projetos serão preservadas.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={
                archiveTemplate.isPending || deleteWorkshopTemplate.isPending
              }
              onClick={() =>
                archiveTarget._source === "workshop"
                  ? deleteWorkshopTemplate.mutate({ id: archiveTarget.id })
                  : archiveTemplate.mutate({ id: archiveTarget.id })
              }
            >
              <Archive className="mr-2 h-4 w-4" />
              Arquivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map(item => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
