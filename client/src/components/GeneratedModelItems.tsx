import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const statuses = [
  ["not_started", "Não iniciado"],
  ["ready", "Pronto"],
  ["in_progress", "Em andamento"],
  ["awaiting_validation", "Aguardando validação"],
  ["approved", "Aprovado"],
  ["blocked", "Bloqueado"],
  ["completed", "Concluído"],
] as const;

export function GeneratedModelItems({
  projectId,
  types,
  title = "Padrões aplicados",
}: {
  projectId: string;
  types: string[];
  title?: string;
}) {
  const { data: items = [], refetch } = trpc.workflow.delivery.trail.list.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );
  const update = trpc.workflow.delivery.trail.update.useMutation({
    onSuccess: async () => {
      await refetch();
      toast.success("Item atualizado");
    },
    onError: error => toast.error(error.message),
  });
  const visible = (items as any[]).filter(item => types.includes(item.type));
  if (!visible.length) return null;

  return (
    <section className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">Itens publicados pela liderança técnica e selecionados para este projeto.</p>
        </div>
        <Badge variant="secondary">{visible.length}</Badge>
      </div>
      <div className="space-y-2">
        {visible.map(item => (
          <Card key={item.id}>
            <CardContent className="grid gap-3 p-3 md:grid-cols-[1fr_190px] md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.title}</span>
                  {item.module && <Badge variant="outline">{item.module}</Badge>}
                  {item.required && <Badge>Obrigatório</Badge>}
                  {item.customized && <Badge variant="secondary">Personalizado</Badge>}
                </div>
                {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
                {item.payload?.instructions && <p className="mt-1 text-xs">{item.payload.instructions}</p>}
              </div>
              <Select value={item.status} onValueChange={(status: any) =>
                update.mutate({ projectId, id: item.id, data: { status } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statuses.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
