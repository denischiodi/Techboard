import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardList,
  FileCheck2,
  FileText,
  Flag,
  GitBranch,
  LogOut,
  Loader2,
  Lock,
  MessageSquareText,
  Paperclip,
  Plus,
  Route,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { appPath, assetPath } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { parseDdaWorkbook } from "../../../shared/ddaImport";
import { ProjectName } from "@/components/ProjectLogo";
import { EmailCodeLogin } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  Project,
  TechMoveConfiguration,
  TechMoveData,
  TechMoveGap,
  TechMoveQuestion,
  TechMoveScopeItem,
  TechMoveWorkshop,
} from "../../../shared/types";

type StageId =
  | "scope"
  | "bdcq"
  | "workshops"
  | "dcd"
  | "gaps"
  | "configurations";
type StageState = "done" | "current" | "locked";

type TrailStage = {
  id: StageId;
  title: string;
  shortTitle: string;
  description: string;
  state: StageState;
  completed: number;
  total: number;
  blocker?: string;
};

type StepProps = {
  data: TechMoveData;
  project: Project;
  update: (recipe: (current: TechMoveData) => TechMoveData) => void;
};

const STAGE_ORDER: StageId[] = [
  "scope",
  "bdcq",
  "workshops",
  "dcd",
  "gaps",
  "configurations",
];
const GAP_RESOLUTION_TYPES = [
  "Key User Extensibility",
  "RAP / ABAP Cloud",
  "BTP Side-by-Side",
  "BAdI",
  "Workaround",
  "Custom Development",
];

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function asList(value?: string[]) {
  return Array.isArray(value) ? value : [];
}

function readDdaScopeItems(file: File): Promise<TechMoveScopeItem[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("Nao foi possivel ler a planilha DDA."));
    reader.onload = () => {
      try {
        resolve(parseDdaWorkbook(reader.result as ArrayBuffer, file.name));
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error("Erro ao processar a planilha DDA.")
        );
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function emptyData(projectId: string): TechMoveData {
  return {
    projectId,
    phase: "prepare",
    scopeItems: [],
    bdcqCatalog: [],
    questions: [],
    workshops: [],
    gaps: [],
    configurations: [],
    dcdDraft: "",
    updatedAt: new Date().toISOString(),
  };
}

function normalizeData(
  projectId: string,
  data?: TechMoveData | null
): TechMoveData {
  if (!data) return emptyData(projectId);
  return {
    ...emptyData(projectId),
    ...data,
    projectId,
    scopeItems: data.scopeItems || [],
    bdcqCatalog: data.bdcqCatalog || [],
    questions: data.questions || [],
    workshops: data.workshops || [],
    gaps: data.gaps || [],
    configurations: data.configurations || [],
    dcdDraft: data.dcdDraft || "",
  };
}

function seedProject(project: Project): TechMoveData {
  const fronts = project.fronts.length ? project.fronts : ["Geral"];
  const scopeItems = fronts.map(
    (front, index): TechMoveScopeItem => ({
      id: uid("scope"),
      module: front,
      code: `${front.toUpperCase().replace(/\W/g, "").slice(0, 6) || "GERAL"}-${index + 1}`,
      name: `Definir scope item de ${front}`,
      processArea: front,
      description: "Scope item selecionado para validacao Fit-to-Standard.",
      documentRef: "",
      consultantName: "",
      active: false,
    })
  );

  return { ...emptyData(project.id), scopeItems };
}

function buildStages(data: TechMoveData): TrailStage[] {
  const activeScopes = data.scopeItems.filter(item => item.active);
  const requiredQuestions = data.questions.filter(
    question => question.required !== false
  );
  const answeredQuestions = requiredQuestions.filter(
    question => question.answer.trim() && question.status !== "Pendente"
  );
  const completedWorkshops = data.workshops.filter(
    workshop =>
      workshop.completed &&
      (workshop.minutes || workshop.decisions || workshop.transcript)
  );
  const dcdReady = Boolean(data.dcdDraft.trim());
  const openGaps = data.gaps.filter(
    gap => gap.status === "Aberto" || gap.status === "Em analise"
  );
  const configurations = data.configurations || [];
  const doneConfigurations = configurations.filter(
    item => item.status === "Concluido" || item.status === "Bloqueado"
  );

  const scopeReady = activeScopes.length > 0;
  const bdcqReady =
    scopeReady &&
    requiredQuestions.length > 0 &&
    answeredQuestions.length === requiredQuestions.length;
  const workshopsReady =
    bdcqReady &&
    data.workshops.length > 0 &&
    completedWorkshops.length === data.workshops.length;
  const gapsReady = dcdReady && openGaps.length === 0;
  const configurationsReady =
    gapsReady &&
    configurations.length > 0 &&
    doneConfigurations.length === configurations.length;
  const checks = [
    scopeReady,
    bdcqReady,
    workshopsReady,
    dcdReady,
    gapsReady,
    configurationsReady,
  ];
  const currentIndex = checks.findIndex(value => !value);
  const activeIndex = currentIndex === -1 ? STAGE_ORDER.length : currentIndex;
  const stateFor = (index: number): StageState =>
    index < activeIndex ? "done" : index === activeIndex ? "current" : "locked";

  return [
    {
      id: "scope",
      title: "DDA / Scope Items",
      shortTitle: "Escopo",
      description:
        "Cadastre os scope items SAP Best Practices que fazem parte do projeto.",
      state: stateFor(0),
      completed: activeScopes.length,
      total: Math.max(data.scopeItems.length, 1),
      blocker: scopeReady
        ? undefined
        : "Ative pelo menos um scope item para iniciar o Explore.",
    },
    {
      id: "bdcq",
      title: "BDCQ",
      shortTitle: "BDCQ",
      description:
        "Responda perguntas L2 do cliente e L3 do consultor por scope item.",
      state: stateFor(1),
      completed: answeredQuestions.length,
      total: Math.max(requiredQuestions.length, 1),
      blocker:
        requiredQuestions.length === 0
          ? "Carregue as perguntas padrao do BDCQ."
          : `${requiredQuestions.length - answeredQuestions.length} pergunta(s) obrigatoria(s) pendente(s).`,
    },
    {
      id: "workshops",
      title: "Workshops Fit-to-Standard",
      shortTitle: "Workshops",
      description:
        "Planeje workshops, registre roteiro, transcricao, decisoes e ata.",
      state: stateFor(2),
      completed: completedWorkshops.length,
      total: Math.max(data.workshops.length, 1),
      blocker:
        data.workshops.length === 0
          ? "Gere ou cadastre os workshops do projeto."
          : `${data.workshops.length - completedWorkshops.length} workshop(s) sem ata ou conclusao.`,
    },
    {
      id: "dcd",
      title: "DCD",
      shortTitle: "DCD",
      description:
        "Gere o Design Configuration Document com base em BDCQ e workshops.",
      state: stateFor(3),
      completed: dcdReady ? 1 : 0,
      total: 1,
      blocker: dcdReady ? undefined : "Gere ou cole o DCD do projeto.",
    },
    {
      id: "gaps",
      title: "Gaps e Extensibilidade",
      shortTitle: "Gaps",
      description:
        "Identifique gaps, severidade, solucao e decisao de aprovacao.",
      state: stateFor(4),
      completed: Math.max(data.gaps.length - openGaps.length, 0),
      total: Math.max(data.gaps.length, 1),
      blocker: openGaps.length
        ? `${openGaps.length} gap(s) ainda abertos ou em analise.`
        : undefined,
    },
    {
      id: "configurations",
      title: "Configurations",
      shortTitle: "Configuracoes",
      description:
        "Transforme o DCD em checklist de configuracao para a fase Realize.",
      state: stateFor(5),
      completed: doneConfigurations.length,
      total: Math.max(configurations.length, 1),
      blocker:
        configurations.length === 0
          ? "Gere o checklist de configuracoes do DCD."
          : `${configurations.length - doneConfigurations.length} configuracao(oes) pendente(s).`,
    },
  ];
}

export default function TechMove() {
  const { loading, user, logout } = useAuth();

  if (loading) {
    return <LoadingState />;
  }

  if (!user) {
    return <EmailCodeLogin />;
  }

  return (
    <TechMoveShell
      userName={user.name || user.email || "Usuario"}
      onLogout={logout}
    >
      <TechMoveWorkspace />
    </TechMoveShell>
  );
}

function TechMoveShell({
  children,
  userName,
  onLogout,
}: {
  children: React.ReactNode;
  userName: string;
  onLogout: () => Promise<void>;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-40 border-b bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <a
              href={appPath("/")}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white text-slate-700 transition hover:bg-slate-100"
              title="Voltar ao TechBoard"
            >
              <ArrowLeft className="h-4 w-4" />
            </a>
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex rounded-xl bg-[#111b2e] px-3 py-2 shadow-sm">
                <img
                  src={assetPath("/techmove-logo.svg")}
                  alt="TechMove"
                  className="h-7 w-auto max-w-[180px] object-contain"
                />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  Workflow SAP
                </p>
                <p className="truncate text-xs text-slate-500">
                  App separado, sincronizado com projetos e recursos do
                  TechBoard
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className="truncate text-xs text-slate-500 sm:max-w-[220px]">
              {userName}
            </span>
            <Button variant="outline" size="sm" onClick={() => void onLogout()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        {children}
      </main>
    </div>
  );
}

function TechMoveWorkspace() {
  const { data: projects = [], isLoading: projectsLoading } =
    trpc.projects.list.useQuery();
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<TechMoveData | null>(null);
  const [openStage, setOpenStage] = useState<StageId>("scope");
  const hydratedProject = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  useEffect(() => {
    if (!projectId && projects.length) setProjectId(projects[0].id);
  }, [projectId, projects]);

  const selectedProject = projects.find(project => project.id === projectId);
  const query = trpc.techmove.get.useQuery(
    { projectId },
    { enabled: Boolean(projectId) }
  );
  const save = trpc.techmove.save.useMutation({
    onError: error =>
      toast.error(error.message || "Nao foi possivel salvar o TechMove."),
  });

  useEffect(() => {
    if (
      !selectedProject ||
      hydratedProject.current === selectedProject.id ||
      query.isLoading
    )
      return;
    const normalized = normalizeData(selectedProject.id, query.data);
    const hasContent =
      normalized.scopeItems.length ||
      normalized.questions.length ||
      normalized.workshops.length ||
      normalized.gaps.length ||
      normalized.configurations?.length ||
      normalized.dcdDraft.trim();
    const hydrated = hasContent ? normalized : seedProject(selectedProject);
    setData(hydrated);
    setOpenStage(
      buildStages(hydrated).find(stage => stage.state === "current")?.id ||
        "scope"
    );
    hydratedProject.current = selectedProject.id;
  }, [query.data, query.isLoading, selectedProject]);

  useEffect(() => {
    if (!data || !projectId || hydratedProject.current !== projectId) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const payload = normalizeData(projectId, {
        ...data,
        updatedAt: new Date().toISOString(),
      });
      save.mutate({
        projectId,
        data: payload as Parameters<typeof save.mutate>[0]["data"],
      });
    }, 700);
    return () => clearTimeout(saveTimer.current);
  }, [data, projectId]);

  const stages = useMemo(() => (data ? buildStages(data) : []), [data]);
  const completedStages = stages.filter(stage => stage.state === "done").length;
  const progress = Math.round((completedStages / STAGE_ORDER.length) * 100);
  const currentStage = stages.find(stage => stage.state === "current");

  const update = (recipe: (current: TechMoveData) => TechMoveData) => {
    setData(current =>
      current ? normalizeData(current.projectId, recipe(current)) : current
    );
  };

  if (projectsLoading) {
    return <LoadingState />;
  }

  if (!projects.length) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardContent className="py-12 text-center">
          <Route className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold">
            Nenhum projeto disponivel
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cadastre um projeto para iniciar o TechMove.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || query.isLoading || !selectedProject) {
    return <LoadingState />;
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
      <header className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_340px] lg:items-start">
          <div>
            <div className="mb-4 inline-flex rounded-xl bg-[#111b2e] px-4 py-2 shadow-sm">
              <img
                src={assetPath("/techmove-logo.svg")}
                alt="TechMove"
                className="h-8 w-auto max-w-[220px] object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <GitBranch className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">Workflow de Processos SAP</h1>
              <Badge variant="secondary">Prepare + Explore</Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Trilha operacional baseada no blueprint SAP Activate: DDA/Scope
              Items, BDCQ, Workshops Fit-to-Standard, DCD, Gaps e
              Configurations. O objetivo e guiar o consultor sem pular
              perguntas, decisoes e evidencias.
            </p>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4">
            <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
              Projeto
            </Label>
            <Select
              value={projectId}
              onValueChange={value => {
                hydratedProject.current = "";
                setData(null);
                setProjectId(value);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map(project => (
                  <SelectItem key={project.id} value={project.id}>
                    <ProjectName project={project} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <InfoLine label="Cliente" value={selectedProject.client} />
              <InfoLine label="Gestor" value={selectedProject.manager || "-"} />
              <InfoLine
                label="Inicio"
                value={selectedProject.startDate || "-"}
              />
              <InfoLine label="Fim" value={selectedProject.endDate || "-"} />
            </div>
          </div>
        </div>

        <div className="border-t bg-muted/10 p-5">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">{progress}% concluido</p>
              <p className="text-xs text-muted-foreground">
                {completedStages} de {STAGE_ORDER.length} etapas finalizadas
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {save.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" /> Salvamento
                  automatico ativo
                </>
              )}
            </div>
          </div>
          <Progress value={progress} className="h-2.5" />
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stages.map((stage, index) => (
          <TrailMiniCard
            key={stage.id}
            stage={stage}
            index={index}
            active={openStage === stage.id}
            onClick={() => {
              if (stage.state === "locked") return;
              setOpenStage(stage.id);
              document
                .getElementById(`stage-${stage.id}`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        ))}
      </div>

      {currentStage ? (
        <Card className="border-primary/30 bg-primary/[0.04]">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Proxima acao
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                {currentStage.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {currentStage.blocker || currentStage.description}
              </p>
            </div>
            <Button
              onClick={() => {
                setOpenStage(currentStage.id);
                document
                  .getElementById(`stage-${currentStage.id}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              Continuar <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-emerald-300 bg-emerald-50/70">
          <CardContent className="flex items-center gap-4 p-5">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            <div>
              <h2 className="font-semibold text-emerald-900">
                Workflow concluido
              </h2>
              <p className="text-sm text-emerald-700">
                O projeto possui DCD, gaps tratados e checklist de configuracao.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {stages.map((stage, index) => (
          <StageCard
            key={stage.id}
            stage={stage}
            index={index}
            open={openStage === stage.id}
            onToggle={() => stage.state !== "locked" && setOpenStage(stage.id)}
          >
            {stage.id === "scope" && (
              <ScopeStep
                data={data}
                project={selectedProject}
                update={update}
              />
            )}
            {stage.id === "bdcq" && (
              <BdcqStep data={data} project={selectedProject} update={update} />
            )}
            {stage.id === "workshops" && (
              <WorkshopsStep
                data={data}
                project={selectedProject}
                update={update}
              />
            )}
            {stage.id === "dcd" && (
              <DcdStep data={data} project={selectedProject} update={update} />
            )}
            {stage.id === "gaps" && (
              <GapsStep data={data} project={selectedProject} update={update} />
            )}
            {stage.id === "configurations" && (
              <ConfigurationsStep
                data={data}
                project={selectedProject}
                update={update}
              />
            )}
          </StageCard>
        ))}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block font-medium text-foreground">{label}</span>
      <span className="block truncate">{value}</span>
    </div>
  );
}

function TrailMiniCard({
  stage,
  index,
  active,
  onClick,
}: {
  stage: TrailStage;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  const done = stage.state === "done";
  const locked = stage.state === "locked";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition ${active ? "border-primary bg-primary/[0.05] shadow-sm" : "bg-card hover:bg-muted/30"} ${locked ? "cursor-not-allowed opacity-65" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold ${done ? "border-emerald-500 bg-emerald-500 text-white" : stage.state === "current" ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 text-muted-foreground"}`}
        >
          {done ? (
            <Check className="h-4 w-4" />
          ) : locked ? (
            <Lock className="h-4 w-4" />
          ) : (
            index + 1
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {stage.completed}/{stage.total}
        </span>
      </div>
      <h3 className="mt-3 font-semibold">{stage.shortTitle}</h3>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
        {stage.blocker || stage.description}
      </p>
    </button>
  );
}

function StageCard({
  stage,
  index,
  open,
  onToggle,
  children,
}: {
  stage: TrailStage;
  index: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const done = stage.state === "done";
  const locked = stage.state === "locked";
  return (
    <section
      id={`stage-${stage.id}`}
      className={`scroll-mt-4 overflow-hidden rounded-xl border bg-card transition ${stage.state === "current" ? "border-primary shadow-sm ring-1 ring-primary/10" : ""}`}
    >
      <button
        type="button"
        className={`flex w-full items-center gap-4 p-4 text-left ${locked ? "cursor-not-allowed opacity-65" : "hover:bg-muted/30"}`}
        onClick={onToggle}
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 font-semibold ${done ? "border-emerald-500 bg-emerald-500 text-white" : stage.state === "current" ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 text-muted-foreground"}`}
        >
          {done ? (
            <Check className="h-5 w-5" />
          ) : locked ? (
            <Lock className="h-4 w-4" />
          ) : (
            index + 1
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{stage.title}</span>
            <StatusBadge state={stage.state} />
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            {locked && stage.blocker ? stage.blocker : stage.description}
          </span>
        </span>
        <span className="hidden text-sm text-muted-foreground sm:block">
          {stage.completed}/{stage.total}
        </span>
        {!locked && (
          <ChevronDown
            className={`h-5 w-5 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {open && !locked ? (
        <div className="border-t bg-muted/[0.12] p-4 sm:p-5">{children}</div>
      ) : null}
    </section>
  );
}

function StatusBadge({ state }: { state: StageState }) {
  if (state === "done")
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Concluida
      </Badge>
    );
  if (state === "current")
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
        Em andamento
      </Badge>
    );
  return <Badge variant="outline">Bloqueada</Badge>;
}

function StepIntro({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: typeof Circle;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="max-w-3xl text-sm text-muted-foreground">{text}</p>
        </div>
      </div>
      {action ? (
        <div className="flex shrink-0 flex-wrap gap-2">{action}</div>
      ) : null}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      <AlertCircle className="mx-auto mb-2 h-5 w-5" />
      {text}
    </div>
  );
}

function ScopeStep({ data, project, update }: StepProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const add = () =>
    update(current => ({
      ...current,
      scopeItems: [
        ...current.scopeItems,
        {
          id: uid("scope"),
          module: project.fronts[0] || "Geral",
          code: "",
          name: "Novo scope item",
          processArea: project.fronts[0] || "Geral",
          description: "",
          documentRef: "",
          consultantName: "",
          active: true,
        },
      ],
    }));

  const activateAll = () =>
    update(current => ({
      ...current,
      scopeItems: current.scopeItems.map(item => ({ ...item, active: true })),
    }));

  const importDda = async (file?: File) => {
    if (!file) return;
    try {
      const imported = await readDdaScopeItems(file);
      if (!imported.length) {
        toast.error("Nenhum scope item encontrado na planilha DDA.");
        return;
      }
      update(current => {
        const importedKeys = new Set(
          imported.map(item => item.code.trim().toLowerCase()).filter(Boolean)
        );
        const kept = current.scopeItems.filter(
          item => !importedKeys.has(item.code.trim().toLowerCase())
        );
        return {
          ...current,
          phase: "prepare",
          scopeItems: [...kept, ...imported],
        };
      });
      toast.success(`${imported.length} scope item(s) importado(s) do DDA.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao importar DDA."
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <StepIntro
        icon={ClipboardList}
        title="DDA e Scope Items do projeto"
        text="Suba a planilha DDA do projeto ou cadastre manualmente os scope items. Somente itens ativos entram no BDCQ e nos workshops."
        action={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={event => importDda(event.target.files?.[0])}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Importar DDA
            </Button>
            <Button variant="outline" size="sm" onClick={activateAll}>
              <Check className="mr-2 h-4 w-4" />
              Ativar todos
            </Button>
            <Button variant="outline" size="sm" onClick={add}>
              <Plus className="mr-2 h-4 w-4" />
              Scope item
            </Button>
          </>
        }
      />

      <div className="overflow-x-auto rounded-lg border bg-background">
        <div className="min-w-[1180px]">
          <div className="grid grid-cols-[60px_120px_1.4fr_120px_150px_120px_150px_1fr_56px] gap-3 border-b bg-muted/40 p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Ativo</span>
            <span>Codigo</span>
            <span>Nome</span>
            <span>Modulo</span>
            <span>Processo</span>
            <span>Prioridade</span>
            <span>Status</span>
            <span>Documento/Anexo</span>
            <span />
          </div>
          {data.scopeItems.map(item => (
            <div
              key={item.id}
              className="grid grid-cols-[60px_120px_1.4fr_120px_150px_120px_150px_1fr_56px] gap-3 border-b p-3 last:border-b-0"
            >
              <div className="pt-2">
                <Checkbox
                  checked={item.active}
                  onCheckedChange={checked =>
                    patchScope(update, item.id, { active: Boolean(checked) })
                  }
                />
              </div>
              <Input
                value={item.code}
                placeholder="1YE"
                onChange={event =>
                  patchScope(update, item.id, { code: event.target.value })
                }
              />
              <Input
                value={item.name}
                placeholder="Accounts Payable"
                onChange={event =>
                  patchScope(update, item.id, { name: event.target.value })
                }
              />
              <Input
                value={item.module}
                placeholder="FI"
                onChange={event =>
                  patchScope(update, item.id, {
                    module: event.target.value,
                    processArea: event.target.value,
                  })
                }
              />
              <Input
                value={item.processArea || ""}
                placeholder="Processo"
                onChange={event =>
                  patchScope(update, item.id, {
                    processArea: event.target.value,
                  })
                }
              />
              <Select
                value={item.priority || "Normal"}
                onValueChange={value =>
                  patchScope(update, item.id, { priority: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Baixa">Baixa</SelectItem>
                  <SelectItem value="Média">Média</SelectItem>
                  <SelectItem value="Normal">Normal</SelectItem>
                  <SelectItem value="Alta">Alta</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={item.status || ""}
                placeholder="Status"
                onChange={event =>
                  patchScope(update, item.id, { status: event.target.value })
                }
              />
              <Input
                value={item.documentRef || ""}
                placeholder="DDA, link, PDF ou observacao"
                onChange={event =>
                  patchScope(update, item.id, {
                    documentRef: event.target.value,
                  })
                }
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  update(current => ({
                    ...current,
                    scopeItems: current.scopeItems.filter(
                      scope => scope.id !== item.id
                    ),
                  }))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BdcqStep({ data, update }: StepProps) {
  const [scopeFilter, setScopeFilter] = useState("all");
  const activeScopes = data.scopeItems.filter(item => item.active);
  const visibleQuestions = data.questions.filter(
    question =>
      scopeFilter === "all" || question.scopeItemCodes.includes(scopeFilter)
  );
  const grouped = activeScopes.map(scope => ({
    scope,
    questions: visibleQuestions.filter(question =>
      question.scopeItemCodes.includes(scope.code)
    ),
  }));

  const seedQuestions = () => {
    const existingKeys = new Set(
      data.questions.map(
        question =>
          `${question.scopeItemCodes.join("|")}::${question.level}::${question.text}`
      )
    );
    const additions = activeScopes
      .flatMap(scope => defaultQuestionsForScope(scope))
      .filter(question => {
        const key = `${question.scopeItemCodes.join("|")}::${question.level}::${question.text}`;
        return !existingKeys.has(key);
      });
    update(current => ({
      ...current,
      phase: "explore",
      questions: [...current.questions, ...additions],
    }));
    toast.success(`${additions.length} pergunta(s) BDCQ adicionada(s).`);
  };

  const addQuestion = () => {
    const scope = activeScopes[0];
    if (!scope) {
      toast.error("Ative um scope item antes de criar perguntas.");
      return;
    }
    update(current => ({
      ...current,
      questions: [
        ...current.questions,
        makeQuestion(
          scope,
          "L3 Consultor",
          "Nova pergunta do BDCQ",
          "Customizada"
        ),
      ],
    }));
  };

  return (
    <div className="space-y-4">
      <StepIntro
        icon={MessageSquareText}
        title="Business Driven Configuration Questionnaire"
        text="Perguntas L2 sao respondidas pelo cliente. Perguntas L3 orientam o consultor a capturar configuracao, processo, dados mestres, integracoes e gaps."
        action={
          <>
            <Button variant="outline" size="sm" onClick={seedQuestions}>
              <Sparkles className="mr-2 h-4 w-4" />
              Carregar padrao
            </Button>
            <Button variant="outline" size="sm" onClick={addQuestion}>
              <Plus className="mr-2 h-4 w-4" />
              Pergunta
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os scope items</SelectItem>
            {activeScopes.map(scope => (
              <SelectItem key={scope.id} value={scope.code}>
                {scope.code} - {scope.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline">
          {
            data.questions.filter(question => question.status !== "Pendente")
              .length
          }
          /{Math.max(data.questions.length, 1)} respondidas
        </Badge>
      </div>

      {!data.questions.length ? (
        <Empty text="Nenhuma pergunta criada. Use Carregar padrao ou crie uma pergunta manual." />
      ) : null}

      {grouped.map(group =>
        group.questions.length ? (
          <div key={group.scope.id} className="rounded-xl border bg-background">
            <div className="border-b bg-muted/30 p-4">
              <h4 className="font-semibold">
                {group.scope.code} - {group.scope.name}
              </h4>
              <p className="text-sm text-muted-foreground">
                {group.scope.module} • {group.questions.length} pergunta(s)
              </p>
            </div>
            <div className="space-y-3 p-4">
              {group.questions.map(question => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  update={update}
                />
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}

function QuestionCard({
  question,
  update,
}: {
  question: TechMoveQuestion;
  update: StepProps["update"];
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                question.level === "L2 Cliente" ? "default" : "secondary"
              }
            >
              {question.level}
            </Badge>
            <Badge variant="outline">{question.category}</Badge>
            {question.required !== false ? (
              <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                Obrigatoria
              </Badge>
            ) : null}
          </div>
          <Input
            className="mt-3 font-medium"
            value={question.text}
            onChange={event =>
              patchQuestion(update, question.id, { text: event.target.value })
            }
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={question.status}
            onValueChange={value =>
              patchQuestion(update, question.id, {
                status: value as TechMoveQuestion["status"],
              })
            }
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Pendente">Pendente</SelectItem>
              <SelectItem value="Respondido">Respondido</SelectItem>
              <SelectItem value="Validado">Validado</SelectItem>
              <SelectItem value="Gap">Gap</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              update(current => ({
                ...current,
                questions: current.questions.filter(
                  item => item.id !== question.id
                ),
              }))
            }
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Textarea
        className="mt-3 min-h-24"
        value={question.answer}
        placeholder="Resposta, decisao de negocio ou configuracao levantada..."
        onChange={event =>
          patchQuestion(update, question.id, { answer: event.target.value })
        }
      />
      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_170px_150px]">
        <Input
          value={question.evidence}
          placeholder="Anexo/link/evidencia"
          onChange={event =>
            patchQuestion(update, question.id, { evidence: event.target.value })
          }
        />
        <Select
          value={question.ownerRole || "Consultor"}
          onValueChange={value =>
            patchQuestion(update, question.id, {
              ownerRole: value as TechMoveQuestion["ownerRole"],
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Cliente">Cliente</SelectItem>
            <SelectItem value="Consultor">Consultor</SelectItem>
            <SelectItem value="Arquiteto">Arquiteto</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
            <SelectItem value="Diretor Delivery">Diretor Delivery</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          onClick={() =>
            patchQuestion(update, question.id, {
              evidence: question.evidence || "Anexo pendente",
            })
          }
        >
          <Paperclip className="mr-2 h-4 w-4" />
          Anexo
        </Button>
      </div>
    </div>
  );
}

function WorkshopsStep({ data, project, update }: StepProps) {
  const activeScopes = data.scopeItems.filter(item => item.active);
  const add = () =>
    update(current => ({
      ...current,
      workshops: [
        ...current.workshops,
        makeWorkshop(project, activeScopes.slice(0, 1)),
      ],
    }));

  const generateWorkshops = () => {
    const byModule = activeScopes.reduce<Record<string, TechMoveScopeItem[]>>(
      (acc, scope) => {
        acc[scope.module] = [...(acc[scope.module] || []), scope];
        return acc;
      },
      {}
    );
    const additions = Object.values(byModule).map(scopes =>
      makeWorkshop(project, scopes)
    );
    update(current => ({
      ...current,
      workshops: [...current.workshops, ...additions],
    }));
    toast.success(`${additions.length} workshop(s) sugerido(s).`);
  };

  return (
    <div className="space-y-4">
      <StepIntro
        icon={Users}
        title="Workshops Fit-to-Standard"
        text="Para cada modulo ou conjunto de scope items, prepare roteiro, participantes, transcricao, decisoes e ata. Isso vira insumo direto do DCD."
        action={
          <>
            <Button variant="outline" size="sm" onClick={generateWorkshops}>
              <Sparkles className="mr-2 h-4 w-4" />
              Sugerir workshops
            </Button>
            <Button variant="outline" size="sm" onClick={add}>
              <Plus className="mr-2 h-4 w-4" />
              Workshop
            </Button>
          </>
        }
      />

      {!data.workshops.length ? (
        <Empty text="Nenhum workshop planejado." />
      ) : (
        data.workshops.map(workshop => (
          <WorkshopCard
            key={workshop.id}
            workshop={workshop}
            project={project}
            update={update}
          />
        ))
      )}
    </div>
  );
}

function WorkshopCard({
  workshop,
  project,
  update,
}: {
  workshop: TechMoveWorkshop;
  project: Project;
  update: StepProps["update"];
}) {
  const generateAgenda = () => {
    const script = [
      `Objetivo: validar processo standard SAP para ${workshop.title}.`,
      "1. Revisar processo standard e scope items cobertos.",
      "2. Demonstrar cenarios e conceitos de negocio.",
      "3. Confirmar respostas do BDCQ e decisoes criticas.",
      "4. Identificar requisitos delta, integracoes, extensibilidade e dados mestres.",
      "5. Registrar configuracoes necessarias para Realize.",
      "6. Confirmar proximos passos, responsaveis e pendencias.",
    ].join("\n");
    patchWorkshop(update, workshop.id, { script });
    toast.success("Agenda sugerida.");
  };

  const generateMinutes = () => {
    const minutes = [
      `# Ata - ${workshop.title}`,
      "",
      `Projeto: ${project.name}`,
      `Data: ${workshop.date || todayIso()}`,
      `Participantes: ${workshop.participants || "Nao informado"}`,
      "",
      "## Topicos discutidos",
      workshop.transcript || workshop.script || "Sem transcricao informada.",
      "",
      "## Decisoes tomadas",
      workshop.decisions || "Sem decisoes registradas.",
      "",
      "## Pontos em aberto",
      "Validar pendencias marcadas como gap no BDCQ.",
      "",
      "## Proximos passos",
      "Atualizar DCD, registrar gaps e gerar checklist de configuracao.",
    ].join("\n");
    patchWorkshop(update, workshop.id, { minutes, completed: true });
    toast.success("Ata gerada.");
  };

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_160px_140px_140px_auto]">
        <Input
          value={workshop.title}
          onChange={event =>
            patchWorkshop(update, workshop.id, { title: event.target.value })
          }
        />
        <Input
          value={workshop.module}
          placeholder="Modulo"
          onChange={event =>
            patchWorkshop(update, workshop.id, { module: event.target.value })
          }
        />
        <Input
          type="date"
          value={workshop.date}
          onChange={event =>
            patchWorkshop(update, workshop.id, { date: event.target.value })
          }
        />
        <Select
          value={workshop.completed ? "Realizado" : "Agendado"}
          onValueChange={value =>
            patchWorkshop(update, workshop.id, {
              completed: value === "Realizado",
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Agendado">Agendado</SelectItem>
            <SelectItem value="Realizado">Realizado</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            update(current => ({
              ...current,
              workshops: current.workshops.filter(
                item => item.id !== workshop.id
              ),
            }))
          }
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Input
          value={workshop.participants}
          placeholder="Participantes sugeridos/confirmados"
          onChange={event =>
            patchWorkshop(update, workshop.id, {
              participants: event.target.value,
            })
          }
        />
        <Input
          value={asList(workshop.scopeItemCodes).join(", ")}
          placeholder="Scope items cobertos"
          onChange={event =>
            patchWorkshop(update, workshop.id, {
              scopeItemCodes: event.target.value
                .split(",")
                .map(item => item.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Textarea
          className="min-h-32"
          value={workshop.script || ""}
          placeholder="Roteiro / agenda do workshop"
          onChange={event =>
            patchWorkshop(update, workshop.id, { script: event.target.value })
          }
        />
        <Textarea
          className="min-h-32"
          value={workshop.transcript}
          placeholder="Cole aqui a transcricao ou resumo da reuniao"
          onChange={event =>
            patchWorkshop(update, workshop.id, {
              transcript: event.target.value,
            })
          }
        />
        <Textarea
          className="min-h-32"
          value={workshop.minutes || ""}
          placeholder="Ata gerada/revisada"
          onChange={event =>
            patchWorkshop(update, workshop.id, { minutes: event.target.value })
          }
        />
      </div>
      <Input
        className="mt-3"
        value={workshop.decisions}
        placeholder="Decisoes principais e proximos passos"
        onChange={event =>
          patchWorkshop(update, workshop.id, { decisions: event.target.value })
        }
      />
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            toast.info(
              "Nesta versao, cole a transcricao ou referencia do arquivo no campo de transcricao."
            )
          }
        >
          <Upload className="mr-2 h-4 w-4" />
          Transcricao
        </Button>
        <Button variant="outline" size="sm" onClick={generateAgenda}>
          <Sparkles className="mr-2 h-4 w-4" />
          Sugerir agenda
        </Button>
        <Button size="sm" onClick={generateMinutes}>
          <FileCheck2 className="mr-2 h-4 w-4" />
          Gerar ata
        </Button>
      </div>
    </div>
  );
}

function DcdStep({ data, project, update }: StepProps) {
  const generate = () => {
    const activeScopes = data.scopeItems.filter(item => item.active);
    const document = [
      `# DCD - Design Configuration Document`,
      "",
      `Projeto: ${project.name}`,
      `Cliente: ${project.client}`,
      `Periodo: ${project.startDate || "-"} a ${project.endDate || "-"}`,
      "",
      "## 1. Visao Geral",
      `Este DCD consolida o desenho de configuracao do projeto ${project.name}, com base nos scope items selecionados, respostas BDCQ e workshops Fit-to-Standard.`,
      "",
      "## 2. Scope Items Cobertos",
      ...activeScopes.map(
        scope => `- ${scope.code} - ${scope.name} (${scope.module})`
      ),
      "",
      "## 3. Decisoes de Configuracao",
      ...data.questions.map(
        question =>
          `- **${question.scopeItemCodes.join(", ")} / ${question.level}:** ${question.text}\n  - Resposta: ${question.answer || "Pendente"}`
      ),
      "",
      "## 4. Workshops e Ata",
      ...data.workshops.map(
        workshop =>
          `- **${workshop.title}:** ${workshop.minutes || workshop.decisions || "Sem ata registrada"}`
      ),
      "",
      "## 5. Estrutura Organizacional e Dados Mestres",
      "Detalhar company code, plants, sales orgs, purchasing orgs, centros, usuarios-chave e dados mestres impactados conforme respostas do BDCQ.",
      "",
      "## 6. Processos de Negocio",
      "Descrever o fluxo padrao SAP, variantes escolhidas, dependencias integradas e excecoes aprovadas.",
      "",
      "## 7. Integracoes",
      "Registrar interfaces, sistemas satelites, responsaveis, origem/destino dos dados e criterios de validacao.",
      "",
      "## 8. Gaps e Extensibilidade",
      ...(data.gaps.length
        ? data.gaps.map(
            gap =>
              `- ${gap.title}: ${gap.description || gap.impact || gap.status}`
          )
        : ["- Nenhum gap registrado ate o momento."]),
      "",
      "## 9. Testes",
      "Criar cenarios de teste por processo, incluindo dados de entrada, resultado esperado, responsavel e evidencia.",
      "",
      "## 10. Configuracoes Necessarias",
      ...((data.configurations || []).length
        ? (data.configurations || []).map(
            item =>
              `- ${item.title} (${item.module}) - ${item.path || "caminho SAP pendente"}`
          )
        : ["- Gerar checklist na etapa Configurations."]),
    ].join("\n");
    update(current => ({ ...current, dcdDraft: document }));
    toast.success("DCD gerado com base nos dados da trilha.");
  };

  return (
    <div className="space-y-3">
      <StepIntro
        icon={FileText}
        title="Design Configuration Document"
        text="O DCD deve consolidar respostas BDCQ, atas dos workshops, decisoes, gaps, dados mestres, integracoes, testes e configuracoes."
        action={
          <Button variant="outline" size="sm" onClick={generate}>
            <Sparkles className="mr-2 h-4 w-4" />
            Gerar DCD
          </Button>
        }
      />
      <Textarea
        className="min-h-[520px] bg-background font-mono text-sm"
        value={data.dcdDraft}
        placeholder="Gere ou cole o DCD em Markdown..."
        onChange={event =>
          update(current => ({ ...current, dcdDraft: event.target.value }))
        }
      />
    </div>
  );
}

function GapsStep({ data, update }: StepProps) {
  const add = () =>
    update(current => ({
      ...current,
      gaps: [
        ...current.gaps,
        makeGap(current.scopeItems.find(item => item.active)),
      ],
    }));
  const extract = () => {
    const additions = data.questions
      .filter(question => question.status === "Gap")
      .map(question =>
        makeGap(
          data.scopeItems.find(scope =>
            question.scopeItemCodes.includes(scope.code)
          ),
          question
        )
      );
    if (!additions.length) {
      toast.info("Nenhuma pergunta marcada como Gap.");
      return;
    }
    update(current => ({ ...current, gaps: [...current.gaps, ...additions] }));
    toast.success(`${additions.length} gap(s) extraido(s) do BDCQ.`);
  };

  return (
    <div className="space-y-3">
      <StepIntro
        icon={Flag}
        title="Gaps e Extensibilidade"
        text="Classifique lacunas entre requisito e standard SAP. A aprovacao do gap deve indicar tipo de solucao e esforco."
        action={
          <>
            <Button variant="outline" size="sm" onClick={extract}>
              <Sparkles className="mr-2 h-4 w-4" />
              Extrair do BDCQ
            </Button>
            <Button variant="outline" size="sm" onClick={add}>
              <Plus className="mr-2 h-4 w-4" />
              Gap
            </Button>
          </>
        }
      />
      {!data.gaps.length ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle2 className="mr-2 inline h-4 w-4" />
          Nenhum gap registrado. Se o DCD nao tiver desvio, pode avancar.
        </div>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {data.gaps.map(gap => (
          <div key={gap.id} className="rounded-xl border bg-background p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_150px_160px_auto]">
              <Input
                value={gap.title}
                onChange={event =>
                  patchGap(update, gap.id, { title: event.target.value })
                }
              />
              <Select
                value={gap.severity}
                onValueChange={value =>
                  patchGap(update, gap.id, {
                    severity: value as TechMoveGap["severity"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Baixo">Baixo</SelectItem>
                  <SelectItem value="Medio">Medio</SelectItem>
                  <SelectItem value="Alto">Alto</SelectItem>
                  <SelectItem value="Critico">Critico</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={gap.status}
                onValueChange={value =>
                  patchGap(update, gap.id, {
                    status: value as TechMoveGap["status"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Aberto">Aberto</SelectItem>
                  <SelectItem value="Em analise">Em analise</SelectItem>
                  <SelectItem value="Aprovado">Aprovado</SelectItem>
                  <SelectItem value="Resolvido">Resolvido</SelectItem>
                  <SelectItem value="Rejeitado">Rejeitado</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  update(current => ({
                    ...current,
                    gaps: current.gaps.filter(item => item.id !== gap.id),
                  }))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              className="mt-3"
              value={gap.description}
              placeholder="Descricao detalhada do gap"
              onChange={event =>
                patchGap(update, gap.id, { description: event.target.value })
              }
            />
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <Textarea
                value={gap.impact}
                placeholder="Impacto e alternativa"
                onChange={event =>
                  patchGap(update, gap.id, { impact: event.target.value })
                }
              />
              <Select
                value={
                  (gap as TechMoveGap & { resolutionType?: string })
                    .resolutionType || GAP_RESOLUTION_TYPES[0]
                }
                onValueChange={value =>
                  patchGap(update, gap.id, {
                    resolutionType: value,
                  } as Partial<TechMoveGap>)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GAP_RESOLUTION_TYPES.map(type => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfigurationsStep({ data, update }: StepProps) {
  const configurations = data.configurations || [];
  const add = () =>
    update(current => ({
      ...current,
      configurations: [
        ...(current.configurations || []),
        makeConfiguration(current.scopeItems.find(item => item.active)),
      ],
    }));
  const generate = () => {
    const additions = data.scopeItems
      .filter(item => item.active)
      .flatMap(scope => [
        makeConfiguration(
          scope,
          "Revisar configuracao organizacional",
          "Validar parametros organizacionais e dependencias do scope item."
        ),
        makeConfiguration(
          scope,
          "Preparar dados mestres",
          "Mapear dados mestres necessarios para executar o processo."
        ),
        makeConfiguration(
          scope,
          "Criar roteiro de teste integrado",
          "Definir cenario, dados de teste, resultado esperado e evidencia."
        ),
      ]);
    update(current => ({
      ...current,
      configurations: [...(current.configurations || []), ...additions],
    }));
    toast.success(`${additions.length} configuracao(oes) criada(s).`);
  };

  return (
    <div className="space-y-3">
      <StepIntro
        icon={Settings2}
        title="Checklist de Configurations para Realize"
        text="Transforme o DCD em atividades de configuracao, responsaveis, caminho SAP, prioridade e status."
        action={
          <>
            <Button variant="outline" size="sm" onClick={generate}>
              <Sparkles className="mr-2 h-4 w-4" />
              Gerar do DCD
            </Button>
            <Button variant="outline" size="sm" onClick={add}>
              <Plus className="mr-2 h-4 w-4" />
              Configuracao
            </Button>
          </>
        }
      />
      {!configurations.length ? (
        <Empty text="Nenhuma configuracao criada." />
      ) : null}
      <div className="overflow-x-auto rounded-lg border bg-background">
        <div className="min-w-[1100px]">
          <div className="grid grid-cols-[1.2fr_110px_1.4fr_1.2fr_150px_150px_56px] gap-3 border-b bg-muted/40 p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Titulo</span>
            <span>Modulo</span>
            <span>Descricao</span>
            <span>Caminho SAP</span>
            <span>Prioridade</span>
            <span>Status</span>
            <span />
          </div>
          {configurations.map(item => (
            <div
              key={item.id}
              className="grid grid-cols-[1.2fr_110px_1.4fr_1.2fr_150px_150px_56px] gap-3 border-b p-3 last:border-b-0"
            >
              <Input
                value={item.title}
                onChange={event =>
                  patchConfiguration(update, item.id, {
                    title: event.target.value,
                  })
                }
              />
              <Input
                value={item.module}
                onChange={event =>
                  patchConfiguration(update, item.id, {
                    module: event.target.value,
                  })
                }
              />
              <Input
                value={item.description}
                onChange={event =>
                  patchConfiguration(update, item.id, {
                    description: event.target.value,
                  })
                }
              />
              <Input
                value={item.path}
                placeholder="App SAP / SSCUI / caminho"
                onChange={event =>
                  patchConfiguration(update, item.id, {
                    path: event.target.value,
                  })
                }
              />
              <Select
                value={item.priority}
                onValueChange={value =>
                  patchConfiguration(update, item.id, {
                    priority: value as TechMoveConfiguration["priority"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Baixa">Baixa</SelectItem>
                  <SelectItem value="Normal">Normal</SelectItem>
                  <SelectItem value="Alta">Alta</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={item.status}
                onValueChange={value =>
                  patchConfiguration(update, item.id, {
                    status: value as TechMoveConfiguration["status"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pendente">Pendente</SelectItem>
                  <SelectItem value="Em andamento">Em andamento</SelectItem>
                  <SelectItem value="Concluido">Concluido</SelectItem>
                  <SelectItem value="Bloqueado">Bloqueado</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  update(current => ({
                    ...current,
                    configurations: (current.configurations || []).filter(
                      config => config.id !== item.id
                    ),
                  }))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function defaultQuestionsForScope(
  scope: TechMoveScopeItem
): TechMoveQuestion[] {
  return [
    makeQuestion(
      scope,
      "L2 Cliente",
      `O processo standard SAP de ${scope.name} atende ao processo atual do cliente?`,
      "Fit-to-Standard"
    ),
    makeQuestion(
      scope,
      "L2 Cliente",
      `Quais variantes, excecoes ou politicas de negocio existem para ${scope.name}?`,
      "Regras de negocio"
    ),
    makeQuestion(
      scope,
      "L2 Cliente",
      `Quais dados mestres e volumes precisam ser considerados para ${scope.name}?`,
      "Dados mestres"
    ),
    makeQuestion(
      scope,
      "L3 Consultor",
      `Quais configuracoes SAP sao necessarias para habilitar ${scope.name}?`,
      "Configuracao"
    ),
    makeQuestion(
      scope,
      "L3 Consultor",
      `Existem integracoes, extensibilidades, relatorios ou gaps para ${scope.name}?`,
      "Integracao e gaps"
    ),
  ];
}

function makeQuestion(
  scope: TechMoveScopeItem,
  level: TechMoveQuestion["level"],
  text: string,
  category: string
): TechMoveQuestion {
  return {
    id: uid("question"),
    module: scope.module,
    scopeItemCodes: [scope.code],
    level,
    category,
    text,
    objective: "Capturar decisao necessaria para DCD e configuracao.",
    answerType: "Texto",
    ownerRole: level === "L2 Cliente" ? "Cliente" : "Consultor",
    required: true,
    gapTrigger: "Resposta indica requisito fora do standard SAP.",
    answer: "",
    evidence: "",
    status: "Pendente",
    reusable: true,
  };
}

function makeWorkshop(
  project: Project,
  scopes: TechMoveScopeItem[]
): TechMoveWorkshop {
  const module = scopes[0]?.module || project.fronts[0] || "Geral";
  const scopeCodes = scopes.map(scope => scope.code).filter(Boolean);
  return {
    id: uid("workshop"),
    module,
    fronts: Array.from(new Set(scopes.map(scope => scope.module))),
    scopeItemCodes: scopeCodes,
    title: `Workshop ${module} - ${scopeCodes.length ? scopeCodes.join(", ") : "Fit-to-Standard"}`,
    date: "",
    durationMinutes: Math.max(60, scopes.length * 45),
    roles: [
      "Configuration Expert",
      "Business Process Expert",
      "Key User",
      "Consultor SAP",
    ],
    script: "",
    participants: "",
    transcript: "",
    decisions: "",
    minutes: "",
    completed: false,
  };
}

function makeGap(
  scope?: TechMoveScopeItem,
  question?: TechMoveQuestion
): TechMoveGap {
  return {
    id: uid("gap"),
    module: scope?.module || question?.module || "Geral",
    scopeItemCode: scope?.code || question?.scopeItemCodes?.[0] || "",
    title: question ? `Gap - ${question.text.slice(0, 70)}` : "Novo gap",
    description: question?.answer || "",
    impact: "",
    severity: "Medio",
    status: "Aberto",
  };
}

function makeConfiguration(
  scope?: TechMoveScopeItem,
  title = "Nova configuracao",
  description = ""
): TechMoveConfiguration {
  return {
    id: uid("config"),
    module: scope?.module || "Geral",
    scopeItemCode: scope?.code || "",
    title,
    description,
    path: "",
    owner: "",
    priority: "Normal",
    status: "Pendente",
  };
}

function patchScope(
  update: StepProps["update"],
  id: string,
  patch: Partial<TechMoveScopeItem>
) {
  update(current => ({
    ...current,
    scopeItems: current.scopeItems.map(item =>
      item.id === id ? { ...item, ...patch } : item
    ),
  }));
}

function patchQuestion(
  update: StepProps["update"],
  id: string,
  patch: Partial<TechMoveQuestion>
) {
  update(current => ({
    ...current,
    questions: current.questions.map(item =>
      item.id === id ? { ...item, ...patch } : item
    ),
  }));
}

function patchWorkshop(
  update: StepProps["update"],
  id: string,
  patch: Partial<TechMoveWorkshop>
) {
  update(current => ({
    ...current,
    workshops: current.workshops.map(item =>
      item.id === id ? { ...item, ...patch } : item
    ),
  }));
}

function patchGap(
  update: StepProps["update"],
  id: string,
  patch: Partial<TechMoveGap>
) {
  update(current => ({
    ...current,
    gaps: current.gaps.map(item =>
      item.id === id ? { ...item, ...patch } : item
    ),
  }));
}

function patchConfiguration(
  update: StepProps["update"],
  id: string,
  patch: Partial<TechMoveConfiguration>
) {
  update(current => ({
    ...current,
    configurations: (current.configurations || []).map(item =>
      item.id === id ? { ...item, ...patch } : item
    ),
  }));
}
