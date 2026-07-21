import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import type { ApprovalEntityType, ApprovalQuorum } from "../../../../shared/types";
import { useWorkflowProject } from "./useWorkflowProject";

const TYPES: Array<{ value: ApprovalEntityType; label: string }> = [
  { value: "bdcq_answer", label: "Respostas BDCQ" }, { value: "dcd", label: "DCDs" },
  { value: "gap", label: "Gaps" }, { value: "test_case", label: "Testes" }, { value: "activity", label: "Atividades em validação" },
];
type PolicyDraft = { enabled: boolean; quorum: ApprovalQuorum; minimumApprovals: number; approverMembershipIds: string[] };

export default function GovernancePage() {
  const { projectId } = useWorkflowProject();
  const utils = trpc.useUtils();
  const { data: policies = [] } = trpc.approvals.policies.useQuery({ projectId });
  const { data: members = [] } = trpc.approvals.members.useQuery({ projectId });
  const configure = trpc.approvals.configurePolicy.useMutation({ onSuccess: () => utils.approvals.policies.invalidate({ projectId }) });
  const [drafts, setDrafts] = useState<Record<string, PolicyDraft>>({});
  useEffect(() => {
    const next: Record<string, PolicyDraft> = {};
    for (const type of TYPES) {
      const policy = policies.find((item: any) => item.entityType === type.value);
      next[type.value] = { enabled: policy?.enabled || false, quorum: policy?.quorum || "any", minimumApprovals: policy?.minimumApprovals || 1, approverMembershipIds: policy?.approverMembershipIds || [] };
    }
    setDrafts(next);
  }, [policies]);
  const approvers = members.filter((item: any) => item.active && item.capabilities?.approveAssigned);
  const update = (type: string, patch: Partial<PolicyDraft>) => setDrafts(current => ({ ...current, [type]: { ...current[type], ...patch } }));
  const save = async (entityType: ApprovalEntityType) => {
    const draft = drafts[entityType];
    try { await configure.mutateAsync({ projectId, entityType, ...draft }); toast.success("Política de aprovação salva"); }
    catch (error: any) { toast.error(error?.message || "Não foi possível salvar"); }
  };
  return <div className="space-y-5 p-3 sm:p-6">
    <div><div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /><h1 className="text-2xl font-bold">Governança e aprovações</h1></div><p className="mt-1 text-sm text-muted-foreground">Defina quais entregas exigem aprovação e quem pode decidir neste projeto.</p></div>
    <div className="grid gap-4">{TYPES.map(type => { const draft = drafts[type.value]; if (!draft) return null; return <Card key={type.value}><CardHeader className="pb-3"><CardTitle className="flex items-center justify-between gap-3 text-base"><span>{type.label}</span><Switch checked={draft.enabled} onCheckedChange={enabled => update(type.value, { enabled })} /></CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2"><div><Label>Regra de quórum</Label><Select value={draft.quorum} onValueChange={quorum => update(type.value, { quorum: quorum as ApprovalQuorum })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">Qualquer um</SelectItem><SelectItem value="all">Todos</SelectItem><SelectItem value="minimum">Mínimo N</SelectItem></SelectContent></Select></div>{draft.quorum === "minimum" && <div><Label>Mínimo de aprovações</Label><Input type="number" min={1} max={Math.max(1, draft.approverMembershipIds.length)} value={draft.minimumApprovals} onChange={event => update(type.value, { minimumApprovals: Number(event.target.value) || 1 })} /></div>}</div>
      <div><Label>Aprovadores padrão</Label><div className="mt-2 flex flex-wrap gap-2">{approvers.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum membro possui permissão de aprovação.</p> : approvers.map((member: any) => { const selected = draft.approverMembershipIds.includes(member.id); return <button type="button" key={member.id} onClick={() => update(type.value, { approverMembershipIds: selected ? draft.approverMembershipIds.filter(id => id !== member.id) : [...draft.approverMembershipIds, member.id] })}><Badge variant={selected ? "default" : "outline"}>{member.user?.name || member.appUserId}</Badge></button>; })}</div></div>
      <div className="flex justify-end"><Button disabled={configure.isPending || (draft.enabled && draft.approverMembershipIds.length === 0)} onClick={() => save(type.value)}>Salvar política</Button></div>
    </CardContent></Card>; })}</div>
  </div>;
}
