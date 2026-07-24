import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, Paperclip } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useWorkflowProject } from "./useWorkflowProject";

const stageLabels: Record<string, string> = {
  cutover: "Cutover", "go-live": "Go-live e estabilização", go_live: "Go-live e estabilização",
  closure: "Encerramento", unit_tests: "Testes unitários", cycle_1: "Ciclo 1", cycle_2: "Ciclo 2",
};
const statuses = [
  ["not_started", "Não iniciado"], ["ready", "Pronto para começar"], ["in_progress", "Em andamento"],
  ["awaiting_validation", "Aguardando validação"], ["approved", "Aprovado"], ["blocked", "Bloqueado"], ["completed", "Concluído"],
] as const;

export default function TrailStagePage() {
  const [, setLocation] = useLocation();
  const { projectId, withProject } = useWorkflowProject();
  const stage = new URLSearchParams(window.location.search).get("stage") || "cutover";
  const normalizedStage = stage.replaceAll("-", "_");
  const [search, setSearch] = useState("");
  const { data: items = [], refetch } = trpc.workflow.delivery.trail.list.useQuery({ projectId });
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const { data: allocations = [] } = trpc.allocations.list.useQuery();
  const update = trpc.workflow.delivery.trail.update.useMutation({
    onSuccess: async () => { await refetch(); toast.success("Item da trilha atualizado"); },
    onError: error => toast.error(error.message),
  });
  const allocatedIds = useMemo(() => new Set(allocations.filter((allocation: any) => allocation.projectId === projectId).map((allocation: any) => allocation.resourceId)), [allocations, projectId]);
  const people = resources.filter((resource: any) => allocatedIds.has(resource.id));
  const stageItems = (items as any[]).filter(item => String(item.stage).replaceAll("-", "_") === normalizedStage || String(item.type).replaceAll("-", "_") === normalizedStage)
    .filter(item => !search || `${item.code} ${item.title} ${item.description}`.toLowerCase().includes(search.toLowerCase()));
  const completed = stageItems.filter(item => ["completed", "approved"].includes(item.status)).length;

  return <div className="space-y-5 p-3 sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Button variant="ghost" className="-ml-3 mb-1" onClick={() => setLocation(withProject("/techmove"))}><ArrowLeft className="mr-2 h-4 w-4" />Voltar para a trilha</Button>
        <h1 className="text-2xl font-bold">{stageLabels[stage] || stageLabels[normalizedStage] || "Etapa da trilha"}</h1>
        <p className="text-sm text-muted-foreground">Execute os itens gerados pelos modelos e registre responsáveis, prazos e evidências.</p>
      </div>
      <Badge variant="secondary">{completed}/{stageItems.length} concluídos</Badge>
    </div>
    <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar nesta etapa..." className="max-w-lg" />
    <div className="space-y-3">
      {stageItems.map(item => {
        const evidencePending = (item.evidenceRequirements || []).length > (item.evidences || []).length;
        return <Card key={item.id}>
          <CardContent className="grid gap-4 p-4 lg:grid-cols-[1fr_220px_180px] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{item.code}</Badge><h2 className="font-semibold">{item.title}</h2><Badge variant={item.required ? "default" : "outline"}>{item.required ? "Obrigatório" : "Opcional"}</Badge></div>
              <p className="mt-1 text-sm text-muted-foreground">{item.description || "Sem descrição"}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {item.module && <Badge variant="secondary">{item.module}</Badge>}
                {evidencePending ? <span className="flex items-center gap-1 text-amber-700"><CircleAlert className="h-3.5 w-3.5" />Evidência pendente</span> : item.evidenceRequirements?.length ? <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Evidências completas</span> : null}
                {item.evidenceRequirements?.map((requirement: string) => <span key={requirement} className="flex items-center gap-1 text-muted-foreground"><Paperclip className="h-3 w-3" />{requirement}</span>)}
              </div>
            </div>
            <Select value={item.responsibleId || "none"} onValueChange={responsibleId => update.mutate({ projectId, id: item.id, data: { responsibleId: responsibleId === "none" ? "" : responsibleId } })}>
              <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
              <SelectContent><SelectItem value="none">Sem responsável</SelectItem>{people.map((person: any) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={item.status} onValueChange={(status: any) => update.mutate({ projectId, id: item.id, data: { status } })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{statuses.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </CardContent>
        </Card>;
      })}
      {!stageItems.length && <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">Nenhum modelo foi aplicado a esta etapa. Cadastre modelos em Configurações do Tech e aplique a trilha no projeto.</div>}
    </div>
  </div>;
}
