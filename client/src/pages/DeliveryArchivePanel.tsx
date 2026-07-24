import { useState } from "react";
import { ArchiveRestore, DatabaseBackup, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function DeliveryArchivePanel() {
  const utils = trpc.useUtils();
  const { data: preview } = trpc.workflow.delivery.archive.preview.useQuery();
  const { data: batches = [] } = trpc.workflow.delivery.archive.batches.useQuery();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const archive = trpc.workflow.delivery.archive.execute.useMutation({
    onSuccess: async result => {
      setOpen(false); setReason(""); setConfirmation("");
      await utils.workflow.invalidate();
      toast.success(`${result.total} registros arquivados em um lote recuperável`);
    },
    onError: error => toast.error(error.message),
  });
  const restore = trpc.workflow.delivery.archive.restore.useMutation({
    onSuccess: async result => { await utils.workflow.invalidate(); toast.success(`${result.restored} registros restaurados`); },
    onError: error => toast.error(error.message),
  });

  return <Card className="border-amber-300">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base"><DatabaseBackup className="h-5 w-5 text-amber-700" />Transição para a Trilha Mestre</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium">{preview?.total || 0} registros atuais disponíveis para arquivamento</p>
          <p className="text-xs text-muted-foreground">Proteção permanente: projetos, recursos, alocações, fases, ausências, usuários e acessos do Planner nunca entram neste lote. O conteúdo do TechMove/TechTask é preservado e pode ser restaurado.</p>
        </div>
        <Button variant="outline" disabled={!preview?.total} onClick={() => setOpen(true)}><ShieldAlert className="mr-2 h-4 w-4" />Arquivar dados atuais</Button>
      </div>
      {batches.length > 0 && <div className="space-y-2 border-t pt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lotes de segurança</p>
        {(batches as any[]).map(batch => <div key={batch.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2"><Badge variant="outline">{batch.id}</Badge>{batch.restoredAt && <Badge variant="secondary">Restaurado</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{batch.reason} · {new Date(batch.createdAt).toLocaleString("pt-BR")}</p></div>
          {!batch.restoredAt && <Button size="sm" variant="outline" disabled={restore.isPending} onClick={() => restore.mutate({ batchId: batch.id, confirmation: "RESTAURAR LOTE" })}><ArchiveRestore className="mr-2 h-4 w-4" />Restaurar</Button>}
        </div>)}
      </div>}
    </CardContent>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Arquivar operação e modelos atuais</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Esta ação oculta os registros operacionais e modelos antigos, criando antes um lote de segurança completo. Nenhum registro será apagado fisicamente.</p>
          <div><Label>Motivo da transição *</Label><Textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="Ex.: Início da operação pela Trilha Mestre configurável" /></div>
          <div><Label>Digite ARQUIVAR DADOS ATUAIS para confirmar</Label><Input value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="destructive" disabled={reason.trim().length < 10 || confirmation !== "ARQUIVAR DADOS ATUAIS" || archive.isPending} onClick={() => archive.mutate({ reason, confirmation: "ARQUIVAR DADOS ATUAIS" })}>{archive.isPending ? "Arquivando..." : "Criar lote e arquivar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </Card>;
}
