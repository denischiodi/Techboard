import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { FileSpreadsheet, MessageSquare, Users, FileText, AlertTriangle, Settings2, ArrowRight, History, Search, Download, DatabaseZap, FlaskConical } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useWorkflowProject } from "./useWorkflowProject";
import { ProjectName } from "@/components/ProjectLogo";
import { useEffect, useState } from "react";

const steps = [
  { id: "scope-items", title: "DDA / Scope Items", description: "Upload e gestão dos scope items do projeto", icon: FileSpreadsheet, path: "/techmove/scope-items", color: "bg-blue-500" },
  { id: "bdcq", title: "BDCQ", description: "Perguntas de levantamento e respostas do cliente", icon: MessageSquare, path: "/techmove/bdcq", color: "bg-purple-500" },
  { id: "workshops", title: "Workshops", description: "Agendamento, transcrições e atas automáticas", icon: Users, path: "/techmove/workshops", color: "bg-green-500" },
  { id: "dcd", title: "DCD (IA)", description: "Documento de configuração detalhada gerado por IA", icon: FileText, path: "/techmove/dcd", color: "bg-orange-500" },
  { id: "gaps", title: "Gaps", description: "Lista de gaps extraída automaticamente do DCD", icon: AlertTriangle, path: "/techmove/gaps", color: "bg-red-500" },
  { id: "configurations", title: "Configurações", description: "Checklist de configurações a executar", icon: Settings2, path: "/techmove/configurations", color: "bg-teal-500" },
  { id: "tests", title: "Testes", description: "Testes unitários e integrados com evidências e rastreabilidade", icon: FlaskConical, path: "/techmove/tests", color: "bg-indigo-500" },
];

export default function ProjectWorkflow() {
  const [, setLocation] = useLocation();
  const { projectId, withProject, rememberProject } = useWorkflowProject();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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
  const selectProject = (value: string) => { rememberProject(value); setLocation(`/techmove?projectId=${encodeURIComponent(value)}`); };
  useEffect(() => {
    if (projects.length && !hasSelectedProject) selectProject((projects[0] as any).id);
  }, [projects, hasSelectedProject]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
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
          <Button variant="outline" onClick={() => consolidatedReport.mutate({ projectId })} disabled={!hasSelectedProject || consolidatedReport.isPending}><Download className="mr-2 h-4 w-4" />{consolidatedReport.isPending ? "Gerando..." : "Relatório consolidado"}</Button>
        </div>
      </div>
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
        {steps.map((step, index) => (
          <Card key={step.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation(withProject(step.path))}>
            <CardContent className="flex items-center gap-4 py-4">
              <div className={`p-3 rounded-lg ${step.color} text-white`}>
                <step.icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{index + 1}</Badge>
                  <h3 className="min-w-0 break-words font-semibold">{step.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={progressByStep.get(step.id)?.percent || 0} className="h-2" />
                  <span className="w-10 text-right text-xs font-medium">{progressByStep.get(step.id)?.percent || 0}%</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{progressByStep.get(step.id)?.label || "Sem dados"}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
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
