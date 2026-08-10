import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Eye,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useWorkflowProject } from "./useWorkflowProject";

const PROJECT_PHASES = ["Discover", "Prepare", "Explore", "Realize", "Deploy", "Run"] as const;
const stagePhase: Record<string, (typeof PROJECT_PHASES)[number]> = {
  unit_tests: "Realize",
  cycle_1: "Realize",
  cycle_2: "Realize",
  cutover: "Deploy",
  go_live: "Deploy",
  closure: "Run",
};

const statuses = [
  ["not_started", "Não iniciado"],
  ["ready", "Pronto para começar"],
  ["in_progress", "Em andamento"],
  ["awaiting_validation", "Aguardando validação"],
  ["approved", "Aprovado"],
  ["blocked", "Bloqueado"],
  ["completed", "Concluído"],
] as const;

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function TrailStagePage() {
  const [, setLocation] = useLocation();
  const { projectId, withProject } = useWorkflowProject();
  const stage = new URLSearchParams(window.location.search).get("stage") || "";
  const normalizedStage = stage.replaceAll("-", "_");
  const requestedPhase = new URLSearchParams(window.location.search).get("phase");
  const initialPhase = PROJECT_PHASES.includes(requestedPhase as any)
    ? requestedPhase as (typeof PROJECT_PHASES)[number]
    : stagePhase[normalizedStage] || "Discover";
  const [selectedPhase, setSelectedPhase] = useState<(typeof PROJECT_PHASES)[number]>(initialPhase);
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const { data: items = [], refetch } =
    trpc.workflow.delivery.trail.list.useQuery({ projectId });
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const { data: allocations = [] } = trpc.allocations.list.useQuery();
  const upload = trpc.workflow.upload.useMutation();
  const update = trpc.workflow.delivery.trail.update.useMutation({
    onSuccess: async () => {
      await refetch();
      toast.success("Item da trilha atualizado");
    },
    onError: error => toast.error(error.message),
  });
  const allocatedIds = useMemo(
    () =>
      new Set(
        allocations
          .filter((allocation: any) => allocation.projectId === projectId)
          .map((allocation: any) => allocation.resourceId)
      ),
    [allocations, projectId]
  );
  const people = resources.filter((resource: any) =>
    allocatedIds.has(resource.id)
  );
  const phaseForItem = (item: any): (typeof PROJECT_PHASES)[number] => {
    if (PROJECT_PHASES.includes(item.phase)) return item.phase;
    const itemStage = String(item.stage || item.type || "").replaceAll("-", "_");
    return stagePhase[itemStage] || "Explore";
  };
  const stageItems = (items as any[])
    .filter(item => phaseForItem(item) === selectedPhase)
    .filter(
      item =>
        !search ||
        `${item.code} ${item.title} ${item.description}`
          .toLowerCase()
          .includes(search.toLowerCase())
    );
  const completed = stageItems.filter(item =>
    ["completed", "approved"].includes(item.status)
  ).length;
  const currentPhase = selectedPhase;
  const completedStatuses = new Set(["completed", "approved"]);
  const phaseProgress = PROJECT_PHASES.map(phase => {
    const phaseItems = (items as any[]).filter(item => phaseForItem(item) === phase);
    const phaseCompleted = phaseItems.filter(item => completedStatuses.has(item.status)).length;
    return {
      phase,
      total: phaseItems.length,
      completed: phaseCompleted,
      percent: phaseItems.length ? Math.round((phaseCompleted / phaseItems.length) * 100) : 0,
    };
  });

  const saveItem = async (item: any, data: Record<string, unknown>) => {
    setSelectedItem((current: any) =>
      current?.id === item.id ? { ...current, ...data } : current
    );
    await update.mutateAsync({ projectId, id: item.id, data: data as any });
  };

  const attachEvidence = async (files: FileList | null) => {
    if (!files?.length || !selectedItem) return;
    try {
      const uploaded = [];
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
      await saveItem(selectedItem, {
        evidences: [...(selectedItem.evidences || []), ...uploaded],
      });
    } catch (error: any) {
      toast.error(error.message || "Não foi possível anexar a evidência");
    }
  };

  return (
    <div className="space-y-5 p-3 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button
            variant="ghost"
            className="-ml-3 mb-1"
            onClick={() => setLocation(withProject("/techmove"))}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar para a trilha
          </Button>
          <h1 className="text-2xl font-bold">
            Trilha do Projeto · {selectedPhase}
          </h1>
          <p className="text-sm text-muted-foreground">
            Execute os itens gerados pelos modelos e registre responsáveis,
            prazos e evidências.
          </p>
        </div>
        <Badge variant="secondary">
          {completed}/{stageItems.length} concluídos
        </Badge>
      </div>
      <Card className="overflow-hidden border-primary/20 bg-card">
        <CardContent className="p-3">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div>
              <p className="font-semibold">Trilha do projeto</p>
              <p className="text-xs text-muted-foreground">Selecione uma fase para visualizar suas atividades, checklists e evidências</p>
            </div>
            <Badge>{currentPhase}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6">
            {phaseProgress.map((phase, index) => {
              const active = phase.phase === currentPhase;
              return (
                <button
                  key={phase.phase}
                  type="button"
                  onClick={() => {
                    setSelectedPhase(phase.phase);
                    setLocation(withProject(`/techmove/trail?phase=${phase.phase}`));
                  }}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "bg-muted/30 hover:bg-muted"}`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${active ? "bg-primary-foreground/20" : "bg-background"}`}>
                      {phase.percent >= 100 ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    {phase.phase}
                  </span>
                  <span className={`mt-1 block text-[10px] ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {phase.percent}% · {phase.completed}/{phase.total} itens
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Input
        value={search}
        onChange={event => setSearch(event.target.value)}
        placeholder="Buscar nesta etapa..."
        className="max-w-lg"
      />
      <div className="space-y-3">
        {stageItems.map(item => {
          const evidencePending =
            (item.evidenceRequirements || []).length >
            (item.evidences || []).length;
          return (
            <Card
              key={item.id}
              role="button"
              tabIndex={0}
              className="cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/20"
              onClick={() => setSelectedItem(item)}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") setSelectedItem(item);
              }}
            >
              <CardContent className="grid gap-4 p-4 lg:grid-cols-[1fr_220px_180px] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{item.code}</Badge>
                    <h2 className="font-semibold">{item.title}</h2>
                    <Badge variant={item.required ? "default" : "outline"}>
                      {item.criticality === "blocking" ? "Crítico · bloqueante" : item.criticality === "optional" ? "Opcional" : "Obrigatório"}
                    </Badge>
                    {item.exceptionReason && <Badge variant="secondary">Exceção aprovada</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.description || "Sem descrição"}
                  </p>
                  {item.payload?.helpUrl && (
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="outline"
                      asChild
                    >
                      <a href={item.payload.helpUrl}>
                        <ExternalLink className="mr-2 h-3.5 w-3.5" />
                        Ver orientação detalhada na TechEduca
                      </a>
                    </Button>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {item.module && (
                      <Badge variant="secondary">{item.module}</Badge>
                    )}
                    {evidencePending ? (
                      <span className="flex items-center gap-1 text-amber-700">
                        <CircleAlert className="h-3.5 w-3.5" />
                        Evidência pendente
                      </span>
                    ) : item.evidenceRequirements?.length ? (
                      <span className="flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Evidências completas
                      </span>
                    ) : null}
                    {item.evidenceRequirements?.map((requirement: string) => (
                      <span
                        key={requirement}
                        className="flex items-center gap-1 text-muted-foreground"
                      >
                        <Paperclip className="h-3 w-3" />
                        {requirement}
                      </span>
                    ))}
                  </div>
                  <Button variant="link" size="sm" className="mt-2 h-auto p-0">
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    Abrir atividade, evidências e modelos
                  </Button>
                </div>
                <div onClick={event => event.stopPropagation()}>
                <Select
                  value={item.responsibleId || "none"}
                  onValueChange={responsibleId =>
                    update.mutate({
                      projectId,
                      id: item.id,
                      data: {
                        responsibleId:
                          responsibleId === "none" ? "" : responsibleId,
                      },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem responsável</SelectItem>
                    {people.map((person: any) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                </div>
                <div onClick={event => event.stopPropagation()}>
                <Select
                  value={item.status}
                  onValueChange={(status: any) =>
                    update.mutate({ projectId, id: item.id, data: { status } })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!stageItems.length && (
          <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
            Nenhum modelo foi aplicado a esta etapa. Cadastre modelos em
            Configurações do TechMove e aplique a trilha no projeto.
          </div>
        )}
      </div>
      <Dialog open={Boolean(selectedItem)} onOpenChange={open => !open && setSelectedItem(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          {selectedItem && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2 pr-8">
                  <Badge variant="outline">{selectedItem.code}</Badge>
                  <Badge>{selectedItem.criticality === "blocking" ? "Crítico · bloqueante" : selectedItem.criticality === "optional" ? "Opcional" : "Obrigatório"}</Badge>
                </div>
                <DialogTitle className="text-xl">{selectedItem.title}</DialogTitle>
              </DialogHeader>

              <div className="space-y-5">
                <section className="rounded-lg border p-4">
                  <h3 className="font-semibold">Orientação da atividade</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {selectedItem.payload?.instructions || selectedItem.description || "Nenhuma orientação cadastrada."}
                  </p>
                  {selectedItem.payload?.helpUrl && (
                    <Button variant="outline" size="sm" className="mt-3" asChild>
                      <a href={selectedItem.payload.helpUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />Abrir orientação completa
                      </a>
                    </Button>
                  )}
                </section>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Responsável</Label>
                    <Select value={selectedItem.responsibleId || "none"} onValueChange={responsibleId => void saveItem(selectedItem, { responsibleId: responsibleId === "none" ? "" : responsibleId })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem responsável</SelectItem>
                        {people.map((person: any) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={selectedItem.status} onValueChange={(status: any) => void saveItem(selectedItem, { status })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{statuses.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Prazo</Label>
                    <Input type="date" value={selectedItem.dueDate?.slice(0, 10) || ""} onChange={event => void saveItem(selectedItem, { dueDate: event.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Fase e etapa</Label>
                    <div className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
                      <Badge variant="secondary">{phaseForItem(selectedItem)}</Badge>
                      <span>{selectedItem.stage || "Geral"}</span>
                    </div>
                  </div>
                </div>

                <section className="space-y-3 rounded-lg border p-4">
                  <div>
                    <h3 className="font-semibold">Checklist e evidências obrigatórias</h3>
                    <p className="text-xs text-muted-foreground">Anexe os arquivos que comprovam a conclusão dos itens abaixo.</p>
                  </div>
                  {(selectedItem.evidenceRequirements || []).length ? (
                    <div className="space-y-2">
                      {selectedItem.evidenceRequirements.map((requirement: string, index: number) => (
                        <div key={requirement} className="flex items-center gap-2 rounded-md bg-muted/40 p-2 text-sm">
                          {selectedItem.evidences?.[index] ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <CircleAlert className="h-4 w-4 text-amber-600" />}
                          <span>{requirement}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">Esta atividade não exige evidência específica.</p>}

                  <Button variant="outline" size="sm" asChild disabled={upload.isPending}>
                    <label className="cursor-pointer">
                      <Upload className="mr-2 h-4 w-4" />{upload.isPending ? "Enviando..." : "Anexar evidência"}
                      <input className="hidden" type="file" multiple onChange={event => { void attachEvidence(event.target.files); event.currentTarget.value = ""; }} />
                    </label>
                  </Button>
                  <div className="space-y-2">
                    {(selectedItem.evidences || []).map((file: any, index: number) => (
                      <div key={`${file.url}-${index}`} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                        <Paperclip className="h-4 w-4" />
                        <a className="min-w-0 flex-1 truncate text-primary hover:underline" href={file.url} target="_blank" rel="noreferrer">{file.name}</a>
                        <Button variant="ghost" size="icon" onClick={() => void saveItem(selectedItem, { evidences: selectedItem.evidences.filter((_: any, fileIndex: number) => fileIndex !== index) })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-3 rounded-lg border p-4">
                  <div>
                    <h3 className="font-semibold">Modelos e materiais de apoio</h3>
                    <p className="text-xs text-muted-foreground">Documentos publicados junto com o modelo desta atividade.</p>
                  </div>
                  {selectedItem.payload?.attachments?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedItem.payload.attachments.map((file: any) => (
                        <Button key={`${file.url}-${file.name}`} variant="outline" size="sm" asChild>
                          <a href={file.url} target="_blank" rel="noreferrer"><Paperclip className="mr-2 h-4 w-4" />{file.name}</a>
                        </Button>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">Nenhum modelo ou material foi anexado a esta atividade.</p>}
                </section>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
