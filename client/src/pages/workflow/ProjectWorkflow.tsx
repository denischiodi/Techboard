import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { FileSpreadsheet, MessageSquare, Users, FileText, AlertTriangle, Settings2, ArrowRight, History, Search, Download, DatabaseZap, FlaskConical, ShieldCheck, LockKeyhole, PlayCircle, CheckCircle2, ClipboardCheck, Layers3, Rocket, Flag, RefreshCw, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useWorkflowProject } from "./useWorkflowProject";
import { ProjectName } from "@/components/ProjectLogo";
import { useEffect, useState } from "react";

const steps = [
  { id: "governance", title: "Preparação e governança", description: "Defina responsáveis, aprovadores e regras antes das entregas críticas", icon: ShieldCheck, path: "/techmove/governance", color: "bg-slate-700", dependencies: [] as string[], action: "Configurar governança" },
  { id: "scope-items", title: "Escopo e DDA", description: "Importe o DDA e confirme os scope items que orientam a implementação", icon: FileSpreadsheet, path: "/techmove/scope-items", color: "bg-blue-500", dependencies: [] as string[], action: "Preparar escopo" },
  { id: "bdcq", title: "Levantamento BDCQ", description: "Organize perguntas, responsáveis e respostas do cliente", icon: MessageSquare, path: "/techmove/bdcq", color: "bg-purple-500", dependencies: ["scope-items"], action: "Responder BDCQ" },
  { id: "workshops", title: "Workshops", description: "Planeje sessões, registre decisões e gere atas", icon: Users, path: "/techmove/workshops", color: "bg-green-500", dependencies: ["scope-items"], action: "Preparar workshop" },
  { id: "dcd", title: "Documentação DCD", description: "Consolide o desenho e envie a versão para validação", icon: FileText, path: "/techmove/dcd", color: "bg-orange-500", dependencies: ["bdcq", "workshops"], action: "Revisar documentação" },
  { id: "gaps", title: "Gaps", description: "Classifique impactos, responsáveis e decisões", icon: AlertTriangle, path: "/techmove/gaps", color: "bg-red-500", dependencies: ["dcd"], action: "Resolver gaps" },
  { id: "configurations", title: "Configurações do consultor", description: "Execute o checklist rastreado ao escopo, BDCQ, DCD e gaps", icon: Settings2, path: "/techmove/configurations", color: "bg-teal-500", dependencies: ["dcd"], action: "Executar configurações" },
  { id: "unit-tests", title: "Testes unitários", description: "Valide cada configuração e registre as evidências obrigatórias", icon: ClipboardCheck, path: "/techmove/tests?testType=unit_test", color: "bg-cyan-600", dependencies: ["configurations"], action: "Executar testes unitários" },
  { id: "cycle-1", title: "Ciclo 1", description: "Execute o primeiro ciclo integrado e trate as reprovações", icon: FlaskConical, path: "/techmove/tests?testType=cycle_1", color: "bg-indigo-500", dependencies: ["unit-tests"], action: "Executar Ciclo 1" },
  { id: "cycle-2", title: "Ciclo 2", description: "Confirme as correções e a prontidão para entrada em produção", icon: Layers3, path: "/techmove/tests?testType=cycle_2", color: "bg-violet-600", dependencies: ["cycle-1"], action: "Executar Ciclo 2" },
  { id: "cutover", title: "Cutover", description: "Planeje ondas, responsáveis, validações e retorno", icon: Rocket, path: "/techmove/trail?stage=cutover", color: "bg-amber-600", dependencies: ["cycle-2"], action: "Preparar cutover" },
  { id: "go-live", title: "Go-live e estabilização", description: "Controle a entrada em produção, suporte e estabilização", icon: Sparkles, path: "/techmove/trail?stage=go-live", color: "bg-emerald-600", dependencies: ["cutover"], action: "Acompanhar go-live" },
  { id: "closure", title: "Encerramento", description: "Consolide entregas, pendências aceitas e aprovação final", icon: Flag, path: "/techmove/trail?stage=closure", color: "bg-slate-600", dependencies: ["go-live"], action: "Encerrar projeto" },
];

const deliveryTypesByStep: Record<string, string[]> = {
  governance: ["activity"],
  "scope-items": ["activity"],
  bdcq: ["bdcq"],
  workshops: ["workshop"],
  dcd: ["dcd"],
  gaps: ["gap", "risk", "issue"],
  configurations: ["configuration"],
  "unit-tests": ["unit_test"],
  "cycle-1": ["cycle_1"],
  "cycle-2": ["cycle_2"],
  cutover: ["cutover"],
  "go-live": ["go_live"],
  closure: ["closure"],
};

export default function ProjectWorkflow() {
  const [, setLocation] = useLocation();
  const { projectId, withProject, rememberProject } = useWorkflowProject();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [modelsOpen, setModelsOpen] = useState(false);
  const [selectedOccurrences, setSelectedOccurrences] = useState<string[]>([]);
  const [selectedBlocked, setSelectedBlocked] = useState<string[]>([]);
  const { data: projects = [] } = trpc.projects.list.useQuery();
  const utils = trpc.useUtils();
  const hasSelectedProject = projects.some((project: any) => project.id === projectId);
  const { data: progress } = trpc.workflow.progress.useQuery({ projectId }, { enabled: Boolean(projectId && hasSelectedProject) });
  const { data: auditEntries = [] } = trpc.workflow.audit.list.useQuery(
    { projectId, limit: 20 },
    { enabled: Boolean(projectId && hasSelectedProject) },
  );
  const { data: searchResults = [], isFetching: searching } = trpc.workflow.search.useQuery(
    { projectId, query: debouncedSearch, limit: 50 },
    { enabled: Boolean(projectId && hasSelectedProject && debouncedSearch.length >= 2) },
  );
  const { data: legacyPreview } = trpc.workflow.legacy.preview.useQuery(
    { projectId },
    { enabled: Boolean(projectId && hasSelectedProject) },
  );
  const { data: trailPreview, isFetching: previewingTrail } = trpc.workflow.delivery.trail.preview.useQuery(
    { projectId },
    { enabled: Boolean(projectId && hasSelectedProject) },
  );
  const { data: deliveryItems = [] } = trpc.workflow.delivery.trail.list.useQuery(
    { projectId },
    { enabled: Boolean(projectId && hasSelectedProject) },
  );
  const { data: blockedPublications = [], refetch: refetchBlocked } =
    trpc.workflow.delivery.publications.blocked.useQuery(
      { projectId },
      { enabled: Boolean(projectId && hasSelectedProject) },
    );
  const confirmBlocked = trpc.workflow.delivery.publications.confirmBlocked.useMutation({
    onSuccess: async result => {
      setSelectedBlocked([]);
      await Promise.all([refetchBlocked(), utils.workflow.invalidate()]);
      toast.success(`${result.created} padrões aplicados e ${result.preserved} itens preservados`);
    },
    onError: error => toast.error(error.message),
  });
  const applyTrail = trpc.workflow.delivery.trail.applyModels.useMutation({
    onSuccess: async result => {
      setModelsOpen(false);
      toast.success(`Trilha atualizada: ${result.added} adicionados, ${result.updated} atualizados e ${result.preserved} personalizados preservados.`);
      await Promise.all([
        utils.workflow.delivery.trail.invalidate(),
        utils.workflow.progress.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message || "Erro ao aplicar os modelos à trilha"),
  });
  const importLegacy = trpc.workflow.legacy.import.useMutation({
    onSuccess: async result => {
      const imported = Object.entries(result).filter(([key]) => key !== "ignored").reduce((sum, [, value]) => sum + value, 0);
      toast.success(imported ? `${imported} registros legados incorporados ao TechMove` : "Os dados legados já estavam consolidados");
      await utils.workflow.invalidate();
    },
    onError: error => toast.error(error.message || "Erro ao importar dados legados"),
  });
  const consolidatedReport = trpc.workflow.reports.consolidatedPdf.useMutation({
    onSuccess: data => {
      const bytes = Uint8Array.from(window.atob(data.base64), character => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: data.contentType }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = data.filename; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000); toast.success("Relatório consolidado exportado");
    },
    onError: error => toast.error(error.message || "Erro ao exportar relatório"),
  });
  const progressByStep = new Map((progress?.steps || []).map(step => [step.id, step]));
  const itemsForStep = (stepId: string) => {
    const acceptedTypes = deliveryTypesByStep[stepId] || [];
    return (deliveryItems as any[]).filter(item => {
      const normalizedStage = String(item.stage || "").toLocaleLowerCase("pt-BR").replaceAll("_", "-");
      if (item.type === "activity") {
        if (stepId === "governance") return ["governance", "governanca", "preparation", "preparacao"].includes(normalizedStage);
        if (stepId === "scope-items") return ["scope", "scope-items", "dda", "escopo"].includes(normalizedStage);
        return normalizedStage === stepId;
      }
      return acceptedTypes.includes(item.type) || normalizedStage === stepId;
    });
  };
  const deliverySummary = (stepId: string) => {
    const items = itemsForStep(stepId);
    const completedStatuses = new Set(["completed", "concluido", "approved", "aprovado", "accepted", "aceito"]);
    const completed = items.filter(item => completedStatuses.has(String(item.status || "").toLocaleLowerCase("pt-BR"))).length;
    const requiredPending = items.filter(item => item.required && !completedStatuses.has(String(item.status || "").toLocaleLowerCase("pt-BR"))).length;
    const evidencePending = items.filter(item => {
      const requirements = Array.isArray(item.evidenceRequirements) ? item.evidenceRequirements : [];
      const evidences = Array.isArray(item.evidences) ? item.evidences : [];
      return requirements.length > evidences.length;
    }).length;
    return {
      total: items.length,
      completed,
      requiredPending,
      evidencePending,
      percent: items.length ? Math.round((completed / items.length) * 100) : null,
    };
  };
  const stateForStep = (step: typeof steps[number]) => {
    const summary = deliverySummary(step.id);
    const percent = summary.percent ?? progressByStep.get(step.id)?.percent ?? 0;
    const missingDependencies = step.dependencies.filter(id => {
      const dependencySummary = deliverySummary(id);
      if (dependencySummary.total > 0) return dependencySummary.requiredPending > 0;
      return (dependencySummary.percent ?? progressByStep.get(id)?.percent ?? 0) < 100;
    });
    if (percent >= 100) return { label: "Concluído", className: "bg-emerald-100 text-emerald-800", blocked: false, missingDependencies };
    if (percent > 0) return { label: "Em andamento", className: "bg-blue-100 text-blue-800", blocked: false, missingDependencies };
    if (missingDependencies.length) return { label: "Aguardando dependência", className: "bg-amber-100 text-amber-800", blocked: true, missingDependencies };
    return { label: "Pronto para começar", className: "bg-violet-100 text-violet-800", blocked: false, missingDependencies };
  };
  const selectProject = (value: string) => { rememberProject(value); setLocation(`/techmove?projectId=${encodeURIComponent(value)}`); };
  useEffect(() => {
    if (projects.length && !hasSelectedProject) selectProject((projects[0] as any).id);
  }, [projects, hasSelectedProject]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!modelsOpen) return;
    setSelectedOccurrences((trailPreview?.items || [])
      .filter((item: any) => ["new", "update"].includes(item.state))
      .map((item: any) => item.key));
  }, [modelsOpen, trailPreview]);
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trilha do Projeto</h1>
          <p className="text-muted-foreground mt-1">Fluxo completo de implementação SAP S/4HANA - do escopo à configuração</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Select value={hasSelectedProject ? projectId : undefined} onValueChange={selectProject}>
            <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Selecione o projeto" /></SelectTrigger>
            <SelectContent>{projects.map((project: any) => <SelectItem key={project.id} value={project.id}><ProjectName project={project} /></SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setLocation(withProject("/techmove/raid"))}><AlertTriangle className="mr-2 h-4 w-4" />Issues e riscos</Button>
          <Button variant="outline" onClick={() => consolidatedReport.mutate({ projectId })} disabled={!hasSelectedProject || consolidatedReport.isPending}><Download className="mr-2 h-4 w-4" />{consolidatedReport.isPending ? "Gerando..." : "Relatório consolidado"}</Button>
        </div>
      </div>
      {hasSelectedProject && (
        <Card className="border-primary/25 bg-primary/[0.03]">
          <CardContent className="py-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Padrões publicados automaticamente</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Configurações do Tech distribui os padrões compatíveis com módulos e scope items. Personalizações e etapas concluídas são preservadas.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline">{deliveryItems.length} itens centrais na trilha</Badge>
                <Badge variant={blockedPublications.length ? "destructive" : "secondary"}>{blockedPublications.length} pendentes por etapa concluída</Badge>
              </div>
            </div>
            {blockedPublications.length > 0 && <div className="mt-4 space-y-2 border-t pt-4">
              <p className="text-sm font-medium">A etapa foi reaberta? Selecione os padrões que deseja publicar.</p>
              {blockedPublications.map((item: any) => <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-md border bg-background p-3">
                <Checkbox checked={selectedBlocked.includes(item.templateId)} onCheckedChange={() => setSelectedBlocked(current => current.includes(item.templateId) ? current.filter(id => id !== item.templateId) : [...current, item.templateId])} />
                <span className="flex-1 text-sm">{item.title}</span><Badge variant="outline">{item.stage}</Badge><Badge variant="secondary">v{item.version}</Badge>
              </label>)}
              <Button disabled={!selectedBlocked.length || confirmBlocked.isPending} onClick={() => confirmBlocked.mutate({ projectId, templateIds: [...new Set(selectedBlocked)] })}>
                <CheckCircle2 className="mr-2 h-4 w-4" />Confirmar {selectedBlocked.length} padrão(ões)
              </Button>
            </div>}
          </CardContent>
        </Card>
      )}
      {(legacyPreview?.total || 0) > 0 && (
        <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
          <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <DatabaseZap className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <h2 className="font-semibold">Dados da versão anterior encontrados</h2>
                <p className="text-sm text-muted-foreground">Há {legacyPreview?.total} registros no TechMove legado. A importação é segura e ignora itens já consolidados.</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => importLegacy.mutate({ projectId })} disabled={importLegacy.isPending}>
              {importLegacy.isPending ? "Consolidando..." : "Consolidar dados agora"}
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar em todo o TechMove..." value={search} onChange={event => setSearch(event.target.value)} />
      </div>
      {debouncedSearch.length >= 2 && (
        <Card>
          <CardContent className="py-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold">Resultados da busca</h2>
              <Badge variant="secondary">{searching ? "Buscando..." : `${searchResults.length} encontrados`}</Badge>
            </div>
            {!searching && searchResults.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum resultado encontrado.</p> : (
              <div className="divide-y">
                {searchResults.map((result: any) => (
                  <button key={`${result.type}-${result.id}`} className="block w-full py-3 text-left hover:bg-muted/40" onClick={() => setLocation(withProject(result.route))}>
                    <div className="flex items-center gap-2"><Badge variant="outline">{result.type}</Badge><span className="font-medium"><HighlightedText text={result.title} query={debouncedSearch} /></span></div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground"><HighlightedText text={result.excerpt} query={debouncedSearch} /></p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4">
        {steps.map((step, index) => {
          const state = stateForStep(step);
          const summary = deliverySummary(step.id);
          const percent = summary.percent ?? progressByStep.get(step.id)?.percent ?? 0;
          return (
          <Card key={step.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => setLocation(withProject(step.path))}>
            <CardContent className="flex items-center gap-4 py-4">
              <div className={`p-3 rounded-lg ${step.color} text-white`}>
                <step.icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{index + 1}</Badge>
                  <h3 className="min-w-0 break-words font-semibold">{step.title}</h3>
                  <Badge className={state.className} variant="secondary">{state.label}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={percent} className="h-2" />
                  <span className="w-10 text-right text-xs font-medium">{percent}%</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{progressByStep.get(step.id)?.label || (summary.total ? `${summary.total} itens gerados pelos modelos` : "Nenhum modelo aplicado nesta etapa")}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="flex items-center gap-1 font-medium text-primary">{state.blocked ? <LockKeyhole className="h-3.5 w-3.5" /> : percent >= 100 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}{percent >= 100 ? "Consultar entrega" : step.action}</span>
                  {state.missingDependencies.length > 0 && <span className="text-muted-foreground">Depende de: {state.missingDependencies.map(id => steps.find(item => item.id === id)?.title).join(", ")}</span>}
                </div>
                {summary.total > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline">{summary.completed}/{summary.total} itens concluídos</Badge>
                    {summary.requiredPending > 0 && <Badge className="bg-amber-100 text-amber-800">{summary.requiredPending} obrigatórios pendentes</Badge>}
                    {summary.evidencePending > 0 && <Badge className="bg-rose-100 text-rose-800">{summary.evidencePending} evidências pendentes</Badge>}
                  </div>
                )}
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        )})}
      </div>
      <Card>
        <CardContent className="py-5">
          <div className="mb-4 flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">Atividades recentes</h2>
              <p className="text-xs text-muted-foreground">Histórico de geração, aprovação e alterações relevantes do TechMove</p>
            </div>
          </div>
          {auditEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma atividade registrada para este projeto.</p>
          ) : (
            <div className="divide-y">
              {auditEntries.map((entry: any) => (
                <div key={entry.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{entry.userName || "Usuário"}</span>{" "}
                      {formatAuditAction(entry.action)} <span className="font-medium">{formatEntityType(entry.entityType)}</span>
                    </p>
                    {entry.details?.title && <p className="truncate text-xs text-muted-foreground">{String(entry.details.title)}</p>}
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={String(entry.createdAt)}>
                    {formatAuditDate(entry.createdAt)}
                  </time>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatAuditAction(action: string) {
  const labels: Record<string, string> = {
    created: "criou",
    updated: "alterou",
    deleted: "removeu",
    generated: "gerou",
    approved: "aprovou",
    bulk_updated: "alterou em lote",
    cache_reused: "reutilizou a versão em cache de",
    DCD_GENERATED: "gerou",
    DCD_GENERATED_STREAM: "gerou com acompanhamento",
    DCD_APPROVED: "aprovou",
    DCD_UPDATED: "alterou",
    DCD_CACHE_REUSED: "reutilizou a versão em cache de",
    DCDS_BULK_APPROVED: "aprovou em lote",
    DCDS_BULK_UPDATED: "alterou em lote",
    DCD_EXPORTED_PDF: "exportou em PDF",
    DCD_REFINED: "refinou",
    GAP_CREATED: "criou",
    GAP_UPDATED: "alterou",
    GAPS_BULK_UPDATED: "alterou em lote",
    CONFIGURATIONS_BULK_UPDATED: "alterou em lote",
    WORKSHOP_AUDIO_TRANSCRIBED: "transcreveu áudio de",
    WORKFLOW_REPORT_EXPORTED: "exportou o relatório de",
    TECHMOVE_LEGACY_IMPORTED: "consolidou dados legados em",
  };
  return labels[action] || action;
}

function formatEntityType(entityType: string) {
  const labels: Record<string, string> = {
    dcd: "um DCD",
    gap: "um gap",
    gaps: "gaps",
    configuration: "uma configuração",
    configurations: "configurações",
    client_requirement: "um requisito do cliente",
    workshop: "um workshop",
    project: "um projeto",
  };
  return labels[entityType] || entityType.replaceAll("_", " ");
}

function formatAuditDate(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const normalizedText = text.toLocaleLowerCase("pt-BR");
  const normalizedQuery = query.toLocaleLowerCase("pt-BR");
  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  while (normalizedQuery && cursor < text.length) {
    const index = normalizedText.indexOf(normalizedQuery, cursor);
    if (index < 0) break;
    if (index > cursor) parts.push({ text: text.slice(cursor, index), match: false });
    parts.push({ text: text.slice(index, index + query.length), match: true });
    cursor = index + query.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return <>{parts.map((part, index) => part.match ? <mark key={index} className="rounded bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-800">{part.text}</mark> : part.text)}</>;
}
