import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  CalendarClock,
  ClipboardList,
  Database,
  Download,
  FileArchive,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import type {
  ActivityPriority,
  ActivityTemplate,
  ActivityTemplateOwnerRole,
  ActivityTemplateRecurrence,
} from "../../../shared/types";
import DeliveryTemplateCatalog, {
  type DeliveryType,
} from "./DeliveryTemplateCatalog";
import DeliveryArchivePanel from "./DeliveryArchivePanel";
import { useAuth } from "@/_core/hooks/useAuth";

const priorities: ActivityPriority[] = ["Baixa", "Média", "Alta", "Crítica"];
const weekdays = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];
const roleLabels: Record<ActivityTemplateOwnerRole, string> = {
  manager: "GP do projeto",
  technical_lead: "Líder técnico",
  consultant: "Consultor",
};
const gpPhases = [
  "Discover",
  "Prepare",
  "Explore",
  "Realize",
  "Deploy",
  "Run",
] as const;

type ActivityForm = Omit<
  ActivityTemplate,
  "id" | "createdByUserId" | "createdAt" | "updatedAt"
> & { selectedProjectIds: string[] };
const emptyActivity = (): ActivityForm => ({
  title: "",
  description: "",
  priority: "Média",
  recurrence: "none",
  weekday: 5,
  monthDay: 1,
  dueOffsetDays: 0,
  ownerRole: "manager",
  gpPhase: "Prepare",
  required: true,
  appliesToAllProjects: true,
  active: true,
  projects: [],
  selectedProjectIds: [],
});
type BdcqForm = {
  id: string;
  question: string;
  category: string;
  modules: string[];
  scopeItemKeys: string[];
  required: boolean;
  active: number;
};
const emptyBdcq = (): BdcqForm => ({
  id: "",
  question: "",
  category: "",
  modules: [],
  scopeItemKeys: [],
  required: true,
  active: 1,
});
type ConfigurationForm = {
  id: string;
  description: string;
  category: string;
  modules: string[];
  scopeItemKeys: string[];
  active: boolean;
};
const emptyConfiguration = (): ConfigurationForm => ({
  id: "",
  description: "",
  category: "Configuração",
  modules: [],
  scopeItemKeys: [],
  active: true,
});

export default function StandardConfigurations() {
  const { user } = useAuth();
  const { data: appUser } = trpc.access.getByEmail.useQuery(
    { email: user?.email || "" },
    { enabled: Boolean(user?.email) }
  );
  const isAdmin = appUser?.role === "admin";
  const utils = trpc.useUtils();
  const { data: activityTemplates = [] } =
    trpc.activities.templates.list.useQuery(undefined, { enabled: isAdmin });
  const { data: activityOptions = [] } =
    trpc.activities.templates.options.useQuery(undefined, { enabled: isAdmin });
  const { data: bdcqTemplates = [] } =
    trpc.workflow.bdcq.templates.list.useQuery();
  const { data: bdcqOptions = [] } =
    trpc.workflow.bdcq.templates.options.useQuery();
  const { data: configurationTemplates = [] } =
    trpc.workflow.configurations.templates.list.useQuery();
  const { data: lookups } = trpc.settings.getLookups.useQuery();
  const [activityOpen, setActivityOpen] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState("");
  const [activityForm, setActivityForm] = useState<ActivityForm>(emptyActivity);
  const [bdcqOpen, setBdcqOpen] = useState(false);
  const [bdcqForm, setBdcqForm] = useState<BdcqForm>(emptyBdcq);
  const [bdcqSearch, setBdcqSearch] = useState("");
  const [bdcqPage, setBdcqPage] = useState(0);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [configurationForm, setConfigurationForm] =
    useState<ConfigurationForm>(emptyConfiguration);
  const [configurationSearch, setConfigurationSearch] = useState("");

  const refreshActivities = async () => {
    await utils.activities.templates.invalidate();
  };
  const createActivity = trpc.activities.templates.create.useMutation({
    onSuccess: async () => {
      await refreshActivities();
      setActivityOpen(false);
      toast.success("Atividade padrão criada");
    },
    onError: error => toast.error(error.message),
  });
  const updateActivity = trpc.activities.templates.update.useMutation({
    onSuccess: async () => {
      await refreshActivities();
      setActivityOpen(false);
      toast.success("Atividade padrão atualizada");
    },
    onError: error => toast.error(error.message),
  });
  const setActivityActive = trpc.activities.templates.setActive.useMutation({
    onSuccess: refreshActivities,
    onError: error => toast.error(error.message),
  });
  const syncActivities = trpc.activities.templates.sync.useMutation({
    onSuccess: data => {
      toast.success(
        `${data.created} atividades criadas e ${data.updated} atualizadas`
      );
    },
    onError: error => toast.error(error.message),
  });
  const refreshBdcq = async () => {
    await utils.workflow.bdcq.templates.invalidate();
  };
  const createBdcq = trpc.workflow.bdcq.templates.create.useMutation({
    onSuccess: async () => {
      await refreshBdcq();
      setBdcqOpen(false);
      toast.success("Pergunta padrão criada");
    },
    onError: error => toast.error(error.message),
  });
  const updateBdcq = trpc.workflow.bdcq.templates.update.useMutation({
    onSuccess: async () => {
      await refreshBdcq();
      setBdcqOpen(false);
      toast.success("Pergunta padrão atualizada");
    },
    onError: error => toast.error(error.message),
  });
  const importBdcq = trpc.workflow.bdcq.templates.importLayout.useMutation({
    onSuccess: async data => {
      await refreshBdcq();
      toast.success(
        `${data.imported} perguntas importadas; ${data.removed} personalizadas anteriores removidas`
      );
    },
    onError: error => toast.error(error.message),
  });
  const refreshConfigurations = async () => {
    await utils.workflow.configurations.templates.invalidate();
  };
  const createConfiguration =
    trpc.workflow.configurations.templates.create.useMutation({
      onSuccess: async () => {
        await refreshConfigurations();
        setConfigurationOpen(false);
        toast.success("Modelo de configuração criado");
      },
      onError: error => toast.error(error.message),
    });
  const updateConfiguration =
    trpc.workflow.configurations.templates.update.useMutation({
      onSuccess: async () => {
        await refreshConfigurations();
        setConfigurationOpen(false);
        toast.success("Modelo de configuração atualizado");
      },
      onError: error => toast.error(error.message),
    });

  const moduleOptions = [
    ...new Set([
      ...(lookups?.fronts || [])
        .filter(item => item.active)
        .map(item => item.value),
      ...bdcqOptions.map(item => item.module),
    ]),
  ]
    .filter(Boolean)
    .sort();
  const filteredBdcq = useMemo(
    () =>
      bdcqTemplates.filter((template: any) =>
        [
          template.question,
          template.questionOriginal,
          template.category,
          template.sapId,
          template.level,
          template.area,
          template.topic,
          template.source,
          ...(template.modules || []),
          ...(template.scopeItemKeys || []),
        ]
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(bdcqSearch.toLocaleLowerCase("pt-BR"))
      ),
    [bdcqTemplates, bdcqSearch]
  );
  const BDCQ_PAGE_SIZE = 100;
  const pagedBdcq = filteredBdcq.slice(
    bdcqPage * BDCQ_PAGE_SIZE,
    (bdcqPage + 1) * BDCQ_PAGE_SIZE
  );
  const filteredConfigurations = useMemo(
    () =>
      configurationTemplates.filter(template =>
        [
          template.description,
          template.category,
          ...(template.modules || []),
          ...(template.scopeItemKeys || []),
        ]
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(configurationSearch.toLocaleLowerCase("pt-BR"))
      ),
    [configurationTemplates, configurationSearch]
  );
  const toggle = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter(item => item !== value)
      : [...values, value];

  const openNewActivity = () => {
    const form = emptyActivity();
    form.selectedProjectIds = activityOptions.map(option => option.project.id);
    form.projects = activityOptions.map(option => ({
      projectId: option.project.id,
      assigneeUserId: "",
    }));
    setEditingActivityId("");
    setActivityForm(form);
    setActivityOpen(true);
  };
  const openActivity = (template: ActivityTemplate) => {
    setEditingActivityId(template.id);
    setActivityForm({
      ...template,
      projects: template.projects,
      selectedProjectIds: template.appliesToAllProjects
        ? activityOptions.map(option => option.project.id)
        : template.projects.map(item => item.projectId),
    });
    setActivityOpen(true);
  };
  const saveActivity = () => {
    const projectMap = new Map(
      activityForm.projects.map(item => [item.projectId, item.assigneeUserId])
    );
    const projectIds = activityForm.appliesToAllProjects
      ? activityOptions.map(option => option.project.id)
      : activityForm.selectedProjectIds;
    const data = {
      ...activityForm,
      projects: projectIds.map(projectId => ({
        projectId,
        assigneeUserId: projectMap.get(projectId) || "",
      })),
    };
    delete (data as Partial<ActivityForm>).selectedProjectIds;
    if (editingActivityId)
      updateActivity.mutate({ id: editingActivityId, data });
    else createActivity.mutate(data);
  };

  const openBdcq = (template?: any) => {
    setBdcqForm(
      template
        ? {
            id: template.id,
            question: template.question,
            category: template.category || "",
            modules: template.modules || [],
            scopeItemKeys: template.scopeItemKeys || [],
            required: Boolean(template.required),
            active: template.active ?? 1,
          }
        : emptyBdcq()
    );
    setBdcqOpen(true);
  };
  const saveBdcq = () => {
    const data = {
      question: bdcqForm.question,
      category: bdcqForm.category,
      modules: bdcqForm.modules,
      scopeItemKeys: bdcqForm.scopeItemKeys,
      required: bdcqForm.required,
      active: bdcqForm.active,
    };
    if (bdcqForm.id) updateBdcq.mutate({ id: bdcqForm.id, data });
    else createBdcq.mutate(data);
  };
  const exportBdcqLayout = async () => {
    const XLSX = await import("xlsx");
    const rows = bdcqTemplates.map((template: any) => ({
      "Pergunta (PT-BR)": template.question,
      "Pergunta original": template.questionOriginal || "",
      Processo: template.process || "",
      Módulo: (template.modules || []).join(";"),
      "Scope Items": (template.scopeItemKeys || []).join(";"),
      "SAP ID": template.sapId || "",
      "Referência SSCUI": template.sscuiReference || "",
      Área: template.area || "",
      Tópico: template.topic || "",
      "Definição do tópico": template.topicDefinition || "",
      Level: template.level || "L3",
      Solução: template.solution || "",
      Obrigatória: template.required ? "Sim" : "Não",
      Ativa: template.active === 0 ? "Não" : "Sim",
      Fonte:
        template.source ||
        (template.builtIn ? "Standard SAP" : "Personalizado"),
      "Arquivo fonte": template.sourceFile || "",
      "Release fonte": template.sourceRelease || "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [
      60, 60, 24, 14, 34, 14, 38, 24, 24, 60, 10, 28, 12, 10, 18, 42, 16,
    ].map(wch => ({ wch }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "BDCQ");
    XLSX.writeFile(
      workbook,
      `bdcq-catalogo-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };
  const importBdcqLayout = async (file?: File) => {
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      });
      const normalize = (value: string) =>
        value
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();
      const pick = (row: Record<string, unknown>, names: string[]) =>
        String(
          Object.entries(row).find(([key]) =>
            names.includes(normalize(key))
          )?.[1] || ""
        ).trim();
      const list = (value: string) => [
        ...new Set(
          value
            .split(/[;,\n]+/)
            .map(item => item.trim())
            .filter(Boolean)
        ),
      ];
      const items = rows
        .map(row => ({
          question: pick(row, ["pergunta (pt-br)", "pergunta", "question"]),
          questionOriginal: pick(row, [
            "pergunta original",
            "question original",
          ]),
          process: pick(row, ["processo", "process"]),
          modules: list(pick(row, ["modulo", "module", "processo sap"])),
          scopeItemKeys: list(
            pick(row, ["scope items", "scope item", "scope ref", "scope ref."])
          ),
          sapId: pick(row, ["sap id", "expert configuration id"]),
          sscuiReference: pick(row, [
            "referencia sscui",
            "sscui reference",
            "configuration activity",
          ]),
          area: pick(row, ["area", "process area"]),
          topic: pick(row, ["topico", "topic"]),
          topicDefinition: pick(row, [
            "definicao do topico",
            "topic definition",
          ]),
          category: pick(row, ["categoria", "category", "topico", "topic"]),
          level: pick(row, ["level", "nivel"]) || "L3",
          solution: pick(row, ["solucao", "solution", "systems"]),
          required: /^sim|yes|true|1$/i.test(
            pick(row, ["obrigatoria", "required"])
          ),
          active: /^nao|no|false|0$/i.test(pick(row, ["ativa", "active"]))
            ? 0
            : 1,
          source: pick(row, ["fonte", "source"]) || "Importado",
          sourceFile: pick(row, ["arquivo fonte", "source file"]) || file.name,
          sourceRelease: pick(row, ["release fonte", "source release"]),
        }))
        .filter(item => item.question)
        .map(item => ({
          ...item,
          modules: item.modules.length ? item.modules : ["SAP"],
        }));
      if (!items.length)
        throw new Error("Nenhuma pergunta encontrada no layout BDCQ.");
      importBdcq.mutate({ items });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível importar o BDCQ"
      );
    }
  };
  const openConfiguration = (template?: any) => {
    setConfigurationForm(
      template
        ? {
            id: template.id,
            description: template.description,
            category: template.category || "Configuração",
            modules: template.modules || [],
            scopeItemKeys: template.scopeItemKeys || [],
            active: template.active !== false && template.active !== 0,
          }
        : emptyConfiguration()
    );
    setConfigurationOpen(true);
  };
  const saveConfiguration = () => {
    const { id, ...data } = configurationForm;
    if (id) updateConfiguration.mutate({ id, data });
    else createConfiguration.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações do Tech</h1>
        <p className="text-sm text-muted-foreground">
          Modelos globais que orientam a execução completa dos projetos.
        </p>
      </div>
      <Tabs defaultValue="central-bdcq" className="space-y-3">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 md:grid-cols-4">
          <TabsTrigger
            className="h-11 min-w-0 whitespace-normal px-2 text-center leading-tight"
            value="central-scope"
          >
            Itens de escopo
          </TabsTrigger>
          <TabsTrigger
            className="h-11 min-w-0 whitespace-normal px-2 text-center leading-tight"
            value="central-bdcq"
          >
            BDCQ padrões
          </TabsTrigger>
          <TabsTrigger
            className="h-11 min-w-0 whitespace-normal px-2 text-center leading-tight"
            value="central-workshops"
          >
            Workshops padrões
          </TabsTrigger>
          <TabsTrigger
            className="h-11 min-w-0 whitespace-normal px-2 text-center leading-tight"
            value="central-dcd"
          >
            DCD padrões
          </TabsTrigger>
          <TabsTrigger
            className="h-11 min-w-0 whitespace-normal px-2 text-center leading-tight"
            value="central-configurations"
          >
            Configurações padrões
          </TabsTrigger>
          <TabsTrigger
            className="h-11 min-w-0 whitespace-normal px-2 text-center leading-tight"
            value="central-gaps"
          >
            Gaps padrões
          </TabsTrigger>
          <TabsTrigger
            className="h-11 min-w-0 whitespace-normal px-2 text-center leading-tight"
            value="central-tests"
          >
            Testes padrões
          </TabsTrigger>
          <TabsTrigger
            className="h-11 min-w-0 whitespace-normal px-2 text-center leading-tight"
            value="central-governance"
          >
            Governança
          </TabsTrigger>
          <TabsTrigger
            className="h-11 min-w-0 whitespace-normal px-2 text-center leading-tight"
            value="central-gp"
          >
            Trilha do GP
          </TabsTrigger>
          <TabsTrigger
            className="h-11 min-w-0 whitespace-normal px-2 text-center leading-tight"
            value="publication-history"
          >
            Histórico
          </TabsTrigger>
        </TabsList>
        <TabsContent value="central-scope" className="space-y-4">
          <SapScopeLibrary />
        </TabsContent>
        {(
          [
            ["central-bdcq", ["bdcq"], "bdcq"],
            ["central-workshops", ["workshop"], "workshop"],
            ["central-dcd", ["dcd"], "dcd"],
            ["central-configurations", ["configuration"], "configuration"],
            ["central-gaps", ["gap"], "gap"],
            ["central-tests", ["unit_test", "cycle_1", "cycle_2"], "unit_test"],
            [
              "central-governance",
              ["risk", "issue", "cutover", "go_live", "closure"],
              "risk",
            ],
            ["central-gp", ["activity"], "activity"],
          ] as Array<[string, DeliveryType[], DeliveryType]>
        ).map(([value, allowedTypes, defaultType]) => (
          <TabsContent key={value} value={value} className="space-y-4">
            <DeliveryTemplateCatalog
              moduleOptions={moduleOptions}
              scopeOptions={bdcqOptions}
              projectOptions={activityOptions.map(option => option.project)}
              allowedTypes={allowedTypes}
              defaultType={defaultType}
              compactHeader
            />
          </TabsContent>
        ))}
        <TabsContent value="publication-history">
          <PublicationHistory />
        </TabsContent>
        <TabsContent value="activities" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => syncActivities.mutate()}
              disabled={syncActivities.isPending}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Sincronizar
            </Button>
            <Button onClick={openNewActivity}>
              <Plus className="mr-2 h-4 w-4" />
              Nova atividade padrão
            </Button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {activityTemplates.map(template => (
              <Card
                key={template.id}
                className={!template.active ? "opacity-60" : ""}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base">
                      {template.title}
                    </CardTitle>
                    <Switch
                      checked={template.active}
                      onCheckedChange={active =>
                        setActivityActive.mutate({ id: template.id, active })
                      }
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {template.description || "Sem descrição"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge>{template.priority}</Badge>
                    <Badge variant="secondary">
                      Fase {template.gpPhase || "Prepare"}
                    </Badge>
                    <Badge variant={template.required ? "default" : "outline"}>
                      {template.required ? "Obrigatória" : "Opcional"}
                    </Badge>
                    <Badge variant="outline">
                      {template.recurrence === "none"
                        ? `${template.dueOffsetDays} dias após início`
                        : template.recurrence === "weekly"
                          ? `Semanal · ${weekdays.find(day => day.value === template.weekday)?.label}`
                          : `Mensal · dia ${template.monthDay}`}
                    </Badge>
                    <Badge variant="secondary">
                      {roleLabels[template.ownerRole]}
                    </Badge>
                    <Badge variant="outline">
                      {template.appliesToAllProjects
                        ? "Todos os projetos"
                        : `${template.projects.length} projetos`}
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openActivity(template)}
                  >
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Editar
                  </Button>
                </CardContent>
              </Card>
            ))}
            {activityTemplates.length === 0 && (
              <Empty label="Nenhuma atividade padrão cadastrada." />
            )}
          </div>
        </TabsContent>
        <TabsContent value="bdcq" className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
            <span className="font-semibold">Biblioteca Standard SAP.</span> As
            perguntas oficiais preservam SAP ID, Level, módulo, scope item e
            arquivo de origem. L2 é informação preparada pelo cliente; L3 é
            detalhamento conduzido no Fit-to-Standard.
          </div>
          <div className="flex flex-col gap-2 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar pergunta, SAP ID, módulo, scope item, área ou tópico"
                value={bdcqSearch}
                onChange={event => {
                  setBdcqSearch(event.target.value);
                  setBdcqPage(0);
                }}
              />
            </div>
            <Button variant="outline" onClick={() => void exportBdcqLayout()}>
              <Download className="mr-2 h-4 w-4" />
              Exportar BDCQ
            </Button>
            <Button variant="outline" asChild disabled={importBdcq.isPending}>
              <label className="cursor-pointer">
                <Upload className="mr-2 h-4 w-4" />
                {importBdcq.isPending ? "Importando..." : "Importar BDCQ"}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={event => {
                    void importBdcqLayout(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </Button>
            <Button onClick={() => openBdcq()}>
              <Plus className="mr-2 h-4 w-4" />
              Nova pergunta
            </Button>
          </div>
          <div className="overflow-hidden rounded-lg border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[380px]">
                      Pergunta em português
                    </TableHead>
                    <TableHead>Módulo</TableHead>
                    <TableHead>SAP ID</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead className="min-w-[180px]">
                      Área / tópico
                    </TableHead>
                    <TableHead className="min-w-[180px]">Scope items</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedBdcq.map((template: any) => (
                    <TableRow
                      key={template.id}
                      className={template.active === 0 ? "opacity-60" : ""}
                    >
                      <TableCell>
                        <p className="font-medium">{template.question}</p>
                        {template.questionOriginal &&
                          template.questionOriginal !== template.question && (
                            <details className="mt-1 text-xs text-muted-foreground">
                              <summary className="cursor-pointer">
                                Ver texto original
                              </summary>
                              <p className="mt-1">
                                {template.questionOriginal}
                              </p>
                            </details>
                          )}
                      </TableCell>
                      <TableCell>
                        {(template.modules || []).map((module: string) => (
                          <Badge
                            key={module}
                            variant="outline"
                            className="mr-1"
                          >
                            {module}
                          </Badge>
                        ))}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {template.sapId || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            template.level === "L2" ? "default" : "secondary"
                          }
                        >
                          {template.level || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <p>{template.area || "—"}</p>
                        {template.topic && (
                          <p className="text-xs text-muted-foreground">
                            {template.topic}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {(template.scopeItemKeys || []).length
                          ? template.scopeItemKeys.join(", ")
                          : "Geral do módulo"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            template.source === "Standard SAP"
                              ? "bg-blue-100 text-blue-900"
                              : ""
                          }
                          variant="outline"
                        >
                          {template.source ||
                            (template.builtIn
                              ? "Standard SAP"
                              : "Personalizado")}
                        </Badge>
                        {template.sourceRelease && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {template.sourceRelease}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {!template.builtIn && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openBdcq(template)}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!pagedBdcq.length && (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <Empty label="Nenhuma pergunta encontrada." />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {filteredBdcq.length} pergunta(s) · página {bdcqPage + 1} de{" "}
              {Math.max(1, Math.ceil(filteredBdcq.length / BDCQ_PAGE_SIZE))}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={bdcqPage === 0}
                onClick={() => setBdcqPage(page => Math.max(0, page - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  (bdcqPage + 1) * BDCQ_PAGE_SIZE >= filteredBdcq.length
                }
                onClick={() => setBdcqPage(page => page + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="configurations" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar modelo, módulo ou scope item"
                value={configurationSearch}
                onChange={event => setConfigurationSearch(event.target.value)}
              />
            </div>
            <Button onClick={() => openConfiguration()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo modelo
            </Button>
          </div>
          <div className="space-y-2">
            {filteredConfigurations.map((template: any) => (
              <Card
                key={template.id}
                className={
                  template.active === false || template.active === 0
                    ? "opacity-60"
                    : ""
                }
              >
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <Settings2 className="h-4 w-4 text-teal-600" />
                      {template.description}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">
                        {template.category || "Configuração"}
                      </Badge>
                      {!template.modules?.length &&
                        !template.scopeItemKeys?.length && (
                          <Badge variant="outline">Projeto inteiro</Badge>
                        )}
                      {template.modules?.map((module: string) => (
                        <Badge key={module} variant="outline">
                          Módulo: {module}
                        </Badge>
                      ))}
                      {template.scopeItemKeys?.map((key: string) => (
                        <Badge key={key} className="bg-blue-50 text-blue-800">
                          Scope: {key}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openConfiguration(template)}
                  >
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Editar
                  </Button>
                </CardContent>
              </Card>
            ))}
            {filteredConfigurations.length === 0 && (
              <Empty label="Nenhum modelo de configuração encontrado." />
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingActivityId
                ? "Editar atividade padrão"
                : "Nova atividade padrão"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Título *</Label>
              <Input
                value={activityForm.title}
                onChange={event =>
                  setActivityForm(form => ({
                    ...form,
                    title: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={activityForm.description}
                onChange={event =>
                  setActivityForm(form => ({
                    ...form,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <FieldSelect
                label="Prioridade"
                value={activityForm.priority}
                values={priorities.map(value => ({ value, label: value }))}
                onChange={value =>
                  setActivityForm(form => ({
                    ...form,
                    priority: value as ActivityPriority,
                  }))
                }
              />
              <FieldSelect
                label="Fase da Trilha do GP"
                value={activityForm.gpPhase}
                values={gpPhases.map(value => ({ value, label: value }))}
                onChange={value =>
                  setActivityForm(form => ({
                    ...form,
                    gpPhase: value as ActivityForm["gpPhase"],
                  }))
                }
              />
              <FieldSelect
                label="Papel responsável"
                value={activityForm.ownerRole}
                values={Object.entries(roleLabels).map(([value, label]) => ({
                  value,
                  label,
                }))}
                onChange={value =>
                  setActivityForm(form => ({
                    ...form,
                    ownerRole: value as ActivityTemplateOwnerRole,
                  }))
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldSelect
                label="Recorrência"
                value={activityForm.recurrence}
                values={[
                  { value: "none", label: "Não recorrente" },
                  { value: "weekly", label: "Semanal" },
                  { value: "monthly", label: "Mensal" },
                ]}
                onChange={value =>
                  setActivityForm(form => ({
                    ...form,
                    recurrence: value as ActivityTemplateRecurrence,
                  }))
                }
              />
              <label className="flex items-end gap-2 rounded-md border p-3">
                <Switch
                  checked={activityForm.required}
                  onCheckedChange={required =>
                    setActivityForm(form => ({ ...form, required }))
                  }
                />
                <span className="text-sm font-medium">
                  {activityForm.required
                    ? "Atividade obrigatória"
                    : "Atividade opcional"}
                </span>
              </label>
            </div>
            {activityForm.recurrence === "none" && (
              <div>
                <Label>Dias após o início do projeto</Label>
                <Input
                  type="number"
                  min={0}
                  max={3650}
                  value={activityForm.dueOffsetDays}
                  onChange={event =>
                    setActivityForm(form => ({
                      ...form,
                      dueOffsetDays: Number(event.target.value),
                    }))
                  }
                />
              </div>
            )}
            {activityForm.recurrence === "weekly" && (
              <FieldSelect
                label="Dia de vencimento"
                value={String(activityForm.weekday)}
                values={weekdays.map(day => ({
                  value: String(day.value),
                  label: day.label,
                }))}
                onChange={value =>
                  setActivityForm(form => ({ ...form, weekday: Number(value) }))
                }
              />
            )}
            {activityForm.recurrence === "monthly" && (
              <div>
                <Label>Dia do mês</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={activityForm.monthDay}
                  onChange={event =>
                    setActivityForm(form => ({
                      ...form,
                      monthDay: Number(event.target.value),
                    }))
                  }
                />
              </div>
            )}
            <label className="flex items-center gap-2">
              <Switch
                checked={activityForm.appliesToAllProjects}
                onCheckedChange={appliesToAllProjects =>
                  setActivityForm(form => ({ ...form, appliesToAllProjects }))
                }
              />
              <span className="text-sm font-medium">
                Aplicar a todos os projetos
              </span>
            </label>
            <div className="space-y-2">
              <Label>Projetos e responsáveis</Label>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-2">
                {activityOptions.map(option => {
                  const selected =
                    activityForm.appliesToAllProjects ||
                    activityForm.selectedProjectIds.includes(option.project.id);
                  const assignment =
                    activityForm.projects.find(
                      item => item.projectId === option.project.id
                    )?.assigneeUserId || "";
                  const candidates = option.candidates.filter(
                    candidate =>
                      activityForm.ownerRole === "manager" ||
                      candidate.role === activityForm.ownerRole
                  );
                  return (
                    <div
                      key={option.project.id}
                      className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_240px]"
                    >
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          disabled={activityForm.appliesToAllProjects}
                          checked={selected}
                          onCheckedChange={() =>
                            setActivityForm(form => ({
                              ...form,
                              selectedProjectIds: toggle(
                                form.selectedProjectIds,
                                option.project.id
                              ),
                            }))
                          }
                        />
                        {option.project.name}
                      </label>
                      <Select
                        disabled={!selected}
                        value={assignment || "fallback"}
                        onValueChange={value =>
                          setActivityForm(form => ({
                            ...form,
                            projects: [
                              ...form.projects.filter(
                                item => item.projectId !== option.project.id
                              ),
                              {
                                projectId: option.project.id,
                                assigneeUserId:
                                  value === "fallback" ? "" : value,
                              },
                            ],
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fallback">
                            Automático / GP
                          </SelectItem>
                          {candidates.map(candidate => (
                            <SelectItem key={candidate.id} value={candidate.id}>
                              {candidate.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivityOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={saveActivity}
              disabled={
                !activityForm.title.trim() ||
                (!activityForm.appliesToAllProjects &&
                  !activityForm.selectedProjectIds.length) ||
                createActivity.isPending ||
                updateActivity.isPending
              }
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bdcqOpen} onOpenChange={setBdcqOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {bdcqForm.id ? "Editar pergunta padrão" : "Nova pergunta padrão"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Pergunta *</Label>
              <Textarea
                rows={4}
                value={bdcqForm.question}
                onChange={event =>
                  setBdcqForm(form => ({
                    ...form,
                    question: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Label>Categoria</Label>
              <Input
                value={bdcqForm.category}
                onChange={event =>
                  setBdcqForm(form => ({
                    ...form,
                    category: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2">
                <Switch
                  checked={bdcqForm.required}
                  onCheckedChange={required =>
                    setBdcqForm(form => ({ ...form, required }))
                  }
                />
                <span className="text-sm font-medium">Obrigatória</span>
              </label>
              <label className="flex items-center gap-2">
                <Switch
                  checked={bdcqForm.active === 1}
                  onCheckedChange={active =>
                    setBdcqForm(form => ({ ...form, active: active ? 1 : 0 }))
                  }
                />
                <span className="text-sm font-medium">Ativa</span>
              </label>
            </div>
            <div>
              <Label>Módulos relacionados</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {moduleOptions.map(module => (
                  <Button
                    key={module}
                    type="button"
                    size="sm"
                    variant={
                      bdcqForm.modules.includes(module) ? "default" : "outline"
                    }
                    onClick={() =>
                      setBdcqForm(form => ({
                        ...form,
                        modules: toggle(form.modules, module),
                      }))
                    }
                  >
                    {module}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Scope items relacionados</Label>
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                {bdcqOptions.map(item => (
                  <label
                    key={`${item.module}:${item.key}`}
                    className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={bdcqForm.scopeItemKeys.includes(item.key)}
                      onCheckedChange={() =>
                        setBdcqForm(form => ({
                          ...form,
                          scopeItemKeys: toggle(form.scopeItemKeys, item.key),
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
              <p className="mt-1 text-xs text-muted-foreground">
                Sem módulos e scope items, a pergunta será geral. Com ambos, o
                projeto deve corresponder aos dois.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBdcqOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={saveBdcq}
              disabled={
                !bdcqForm.question.trim() ||
                createBdcq.isPending ||
                updateBdcq.isPending
              }
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={configurationOpen} onOpenChange={setConfigurationOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {configurationForm.id
                ? "Editar modelo de configuração"
                : "Novo modelo de configuração"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Passo de configuração *</Label>
              <Textarea
                rows={4}
                value={configurationForm.description}
                onChange={event =>
                  setConfigurationForm(form => ({
                    ...form,
                    description: event.target.value,
                  }))
                }
                placeholder="Descreva o fluxo ou passo padrão a executar"
              />
            </div>
            <div>
              <Label>Categoria</Label>
              <Input
                value={configurationForm.category}
                onChange={event =>
                  setConfigurationForm(form => ({
                    ...form,
                    category: event.target.value,
                  }))
                }
              />
            </div>
            <label className="flex items-center gap-2">
              <Switch
                checked={configurationForm.active}
                onCheckedChange={active =>
                  setConfigurationForm(form => ({ ...form, active }))
                }
              />
              <span className="text-sm font-medium">Modelo ativo</span>
            </label>
            <div>
              <Label>Aplicar aos módulos</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {moduleOptions.map(module => (
                  <Button
                    key={module}
                    type="button"
                    size="sm"
                    variant={
                      configurationForm.modules.includes(module)
                        ? "default"
                        : "outline"
                    }
                    onClick={() =>
                      setConfigurationForm(form => ({
                        ...form,
                        modules: toggle(form.modules, module),
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
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                {bdcqOptions.map(item => (
                  <label
                    key={`${item.module}:${item.key}`}
                    className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={configurationForm.scopeItemKeys.includes(
                        item.key
                      )}
                      onCheckedChange={() =>
                        setConfigurationForm(form => ({
                          ...form,
                          scopeItemKeys: toggle(form.scopeItemKeys, item.key),
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
              <p className="mt-1 text-xs text-muted-foreground">
                Sem módulo ou scope item, o passo será aplicado uma vez ao
                projeto inteiro.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfigurationOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={saveConfiguration}
              disabled={
                !configurationForm.description.trim() ||
                createConfiguration.isPending ||
                updateConfiguration.isPending
              }
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PublicationHistory() {
  const utils = trpc.useUtils();
  const { data: jobs = [], isLoading } =
    trpc.workflow.delivery.publications.history.useQuery({ limit: 100 });
  const retry = trpc.workflow.delivery.publications.retry.useMutation({
    onSuccess: async () => {
      await utils.workflow.delivery.publications.history.invalidate();
      toast.success("Publicação reprocessada");
    },
    onError: error => toast.error(error.message),
  });
  const reconcile = trpc.workflow.delivery.publications.reconcile.useMutation({
    onSuccess: async count => {
      await utils.workflow.delivery.publications.history.invalidate();
      toast.success(`${count} padrão(ões) enviados para reconciliação`);
    },
    onError: error => toast.error(error.message),
  });
  const statusLabel: Record<string, string> = {
    pending: "Aguardando",
    processing: "Processando",
    completed: "Concluído",
    completed_with_warnings: "Concluído com alertas",
    failed: "Falhou",
    cancelled: "Cancelado",
  };
  if (isLoading) return <Empty label="Carregando histórico de publicação..." />;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Publicação automática</h2>
          <p className="text-sm text-muted-foreground">
            Cada alteração é distribuída aos projetos compatíveis. Etapas
            concluídas e personalizações locais são preservadas.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={reconcile.isPending}
          onClick={() => reconcile.mutate()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Reconciliar padrões ativos
        </Button>
      </div>
      {jobs.map((job: any) => {
        const summary = job.summary || {};
        const projects = summary.projects || [];
        return (
          <Card key={job.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {job.title || "Padrão removido"}
                    </span>
                    <Badge variant="outline">{job.type}</Badge>
                    <Badge
                      variant={
                        job.status === "failed" ? "destructive" : "secondary"
                      }
                    >
                      {statusLabel[job.status] || job.status}
                    </Badge>
                    <Badge variant="outline">v{job.templateVersion}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {summary.evaluated || 0} avaliados ·{" "}
                    {summary.applicable || 0} aplicáveis ·{" "}
                    {summary.created || 0} criados · {summary.updated || 0}{" "}
                    atualizados · {summary.preserved || 0} preservados ·{" "}
                    {summary.blocked || 0} bloqueados ·{" "}
                    {summary.outOfScope || 0} fora do escopo ·{" "}
                    {summary.failed || 0} falhas
                  </p>
                  {job.lastError && (
                    <p className="mt-1 text-sm text-destructive">
                      {job.lastError}
                    </p>
                  )}
                </div>
                {["failed", "completed_with_warnings", "completed"].includes(
                  job.status
                ) && (
                  <Button
                    variant="outline"
                    onClick={() => retry.mutate({ id: job.id })}
                    disabled={retry.isPending}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reprocessar
                  </Button>
                )}
              </div>
              {projects.length > 0 && (
                <details className="rounded-md border bg-muted/20 p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Detalhes por projeto ({projects.length})
                  </summary>
                  <div className="mt-3 space-y-2">
                    {projects.map((project: any) => (
                      <div
                        key={`${job.id}-${project.projectId}`}
                        className="rounded border bg-background p-2 text-xs"
                      >
                        <span className="font-medium">
                          {project.projectName || project.projectId}
                        </span>
                        <span className="ml-2">
                          {project.status === "out_of_scope"
                            ? "Fora do escopo"
                            : project.status === "failed"
                              ? "Falhou"
                              : project.status === "created"
                                ? "Criado"
                                : project.status === "updated"
                                  ? "Atualizado"
                                  : project.status === "preserved"
                                    ? "Preservado"
                                    : project.status === "blocked"
                                      ? "Bloqueado"
                                      : "Aplicável"}
                          {project.message ? ` · ${project.message}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        );
      })}
      {!jobs.length && <Empty label="Nenhuma publicação registrada." />}
    </div>
  );
}

function SapScopeLibrary() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [releaseCode, setReleaseCode] = useState("2608_BR");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { data: releases = [] } = trpc.workflow.sapLibrary.releases.useQuery();
  const { data: scopes = [], isLoading } =
    trpc.workflow.sapLibrary.scopes.useQuery({ search, limit: 300 });
  const prepare = trpc.workflow.sapLibrary.prepareUpload.useMutation();
  const uploadChunk = trpc.workflow.sapLibrary.uploadChunk.useMutation();
  const register = trpc.workflow.sapLibrary.registerUpload.useMutation();
  const activate = trpc.workflow.sapLibrary.activate.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.workflow.sapLibrary.releases.invalidate(),
        utils.workflow.sapLibrary.scopes.invalidate(),
      ]);
      toast.success("Release SAP ativada");
    },
    onError: error => toast.error(error.message),
  });
  const retry = trpc.workflow.sapLibrary.retry.useMutation({
    onSuccess: async () => {
      await utils.workflow.sapLibrary.releases.invalidate();
      toast.success("Reprocessamento iniciado");
    },
    onError: error => toast.error(error.message),
  });
  const uploadZip = async (file?: File) => {
    if (!file) return;
    if (!/\.zip$/i.test(file.name))
      return toast.error("Selecione um arquivo ZIP");
    setUploading(true);
    setUploadProgress(0);
    try {
      const target = await prepare.mutateAsync({
        releaseCode,
        fileName: file.name,
      });
      const chunkSize = target.localUpload ? 2 * 1024 * 1024 : 8 * 1024 * 1024;
      const totalParts = Math.ceil(file.size / chunkSize);
      for (let part = 0; part < totalParts; part++) {
        const chunk = file.slice(
          part * chunkSize,
          Math.min(file.size, (part + 1) * chunkSize)
        );
        if (target.localUpload) {
          const bytes = new Uint8Array(await chunk.arrayBuffer());
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 32_768)
            binary += String.fromCharCode(
              ...bytes.subarray(offset, offset + 32_768)
            );
          await uploadChunk.mutateAsync({
            key: target.key,
            expires: target.localUpload.expires,
            signature: target.localUpload.signature,
            part,
            totalParts,
            dataBase64: btoa(binary),
          });
        } else {
          const separator = target.uploadUrl.includes("?") ? "&" : "?";
          const response = await fetch(
            `${target.uploadUrl}${separator}part=${part}&totalParts=${totalParts}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/octet-stream" },
              body: chunk,
            }
          );
          if (!response.ok) {
            const detail = await response.text().catch(() => "");
            throw new Error(
              `Falha no envio da parte ${part + 1}/${totalParts} (${response.status})${detail ? `: ${detail}` : ""}`
            );
          }
        }
        setUploadProgress(Math.round(((part + 1) / totalParts) * 100));
      }
      await register.mutateAsync({
        releaseCode,
        country: "BR",
        fileName: file.name,
        storageKey: target.key,
        sizeBytes: file.size,
      });
      await utils.workflow.sapLibrary.releases.invalidate();
      toast.success("ZIP recebido; processamento iniciado");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível enviar o ZIP");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };
  const statusLabel: Record<string, string> = {
    uploaded: "Recebido",
    processing: "Processando",
    ready: "Pronto para ativar",
    active: "Ativo",
    archived: "Histórico",
    failed: "Falhou",
  };
  return (
    <div className="space-y-4">
      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="grid gap-4 p-4 lg:grid-cols-[1fr_180px_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-2 font-semibold text-blue-950">
              <Database className="h-5 w-5" />
              Biblioteca SAP Best Practices
            </div>
            <p className="mt-1 text-sm text-blue-900/75">
              Envie o ZIP oficial de uma release. Os códigos e documentos serão
              catalogados sem adicionar todos os scope items aos projetos.
            </p>
          </div>
          <div>
            <Label>Release</Label>
            <Input
              value={releaseCode}
              onChange={event =>
                setReleaseCode(
                  event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "")
                )
              }
              placeholder="2608_BR"
            />
          </div>
          <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? `Enviando ${uploadProgress}%` : "Enviar ZIP"}
            <input
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              disabled={uploading || !releaseCode}
              onChange={event => {
                void uploadZip(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </CardContent>
      </Card>
      <div className="grid gap-3 lg:grid-cols-2">
        {(releases as any[]).map(release => (
          <Card key={release.id}>
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <FileArchive className="h-4 w-4" />
                  <strong>{release.releaseCode}</strong>
                  <Badge
                    variant={
                      release.status === "failed" ? "destructive" : "secondary"
                    }
                  >
                    {statusLabel[release.status] || release.status}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {release.fileName} ·{" "}
                  {Math.round(Number(release.sizeBytes) / 1024 / 1024)} MB
                </p>
                {release.summary && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {release.summary.scopeItems || 0} scope items ·{" "}
                    {release.summary.files || 0} documentos
                  </p>
                )}
                {release.lastError && (
                  <p className="mt-1 text-sm text-destructive">
                    {release.lastError}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {release.status === "ready" && (
                  <Button
                    size="sm"
                    onClick={() => activate.mutate({ id: release.id })}
                  >
                    Ativar
                  </Button>
                )}
                {release.status === "failed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retry.mutate({ id: release.id })}
                  >
                    Reprocessar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {!releases.length && <Empty label="Nenhuma release SAP importada." />}
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar código, nome ou resumo do scope item"
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        {(scopes as any[]).map(scope => (
          <SapScopeCard key={scope.id} scope={scope} />
        ))}
        {!isLoading && !scopes.length && (
          <Empty label="Nenhum scope item disponível na release ativa." />
        )}
      </div>
    </div>
  );
}

function SapScopeCard({ scope }: { scope: any }) {
  const [expanded, setExpanded] = useState(false);
  const { data: assets = [] } = trpc.workflow.sapLibrary.assets.useQuery(
    { scopeId: scope.id },
    { enabled: expanded }
  );
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{scope.code}</Badge>
          <strong>{scope.name}</strong>
          <Badge variant="outline">{scope.primaryLanguage}</Badge>
          <Badge variant="secondary">{scope.assetCount} arquivo(s)</Badge>
          {scope.reviewStatus !== "approved" && (
            <Badge className="bg-amber-100 text-amber-900">
              Revisão necessária
            </Badge>
          )}
          {Number(scope.assetCount) > 0 && (
            <Button
              className="ml-auto"
              size="sm"
              variant="outline"
              onClick={() => setExpanded(value => !value)}
            >
              {expanded ? "Ocultar arquivos" : "Ver arquivos"}
            </Button>
          )}
        </div>
        {scope.summary && (
          <p className="mt-2 text-sm text-muted-foreground">{scope.summary}</p>
        )}
        {expanded && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(assets as any[]).map(asset => (
              <a
                key={asset.id}
                href={asset.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-md border p-2 text-sm text-primary hover:bg-muted"
              >
                <FileArchive className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {asset.fileName}
                </span>
                <Badge variant="outline">
                  {asset.language || asset.assetType}
                </Badge>
              </a>
            ))}
            {!assets.length && (
              <p className="text-sm text-muted-foreground">
                Carregando arquivos...
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {label}
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
  values: Array<{ value: string; label: string }>;
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
