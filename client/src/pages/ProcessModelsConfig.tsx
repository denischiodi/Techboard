import { useMemo, useState } from "react";
import { Copy, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const PHASES = ["Discover", "Prepare", "Explore", "Realize", "Deploy", "Run"];

export default function ProcessModelsConfig() {
  const utils = trpc.useUtils();
  const { data: models = [] } = trpc.workflow.delivery.structure.models.list.useQuery();
  const { data: teams = [] } = trpc.workflow.delivery.structure.teams.list.useQuery();
  const { data: templates = [] } = trpc.workflow.delivery.templates.list.useQuery({ includeArchived: false });
  const { data: users = [] } = trpc.access.list.useQuery();
  const [modelOpen, setModelOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [model, setModel] = useState({ name: "", description: "", kind: "primary" as "primary" | "complementary", phases: [...PHASES], templateIds: [] as string[] });
  const [team, setTeam] = useState({ name: "", description: "" });
  const [roleTeamId, setRoleTeamId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [memberTarget, setMemberTarget] = useState({ teamId: "", roleId: "", appUserId: "" });
  const createModel = trpc.workflow.delivery.structure.models.create.useMutation({
    onSuccess: async () => { await utils.workflow.delivery.structure.models.list.invalidate(); setModelOpen(false); toast.success("Modelo de processo criado"); },
    onError: error => toast.error(error.message),
  });
  const duplicate = trpc.workflow.delivery.structure.models.duplicate.useMutation({
    onSuccess: async () => { await utils.workflow.delivery.structure.models.list.invalidate(); toast.success("Cópia criada como rascunho"); },
    onError: error => toast.error(error.message),
  });
  const createTeam = trpc.workflow.delivery.structure.teams.create.useMutation({
    onSuccess: async () => { await utils.workflow.delivery.structure.teams.list.invalidate(); setTeamOpen(false); toast.success("Equipe criada"); },
    onError: error => toast.error(error.message),
  });
  const addRole = trpc.workflow.delivery.structure.teams.addRole.useMutation({
    onSuccess: async () => { await utils.workflow.delivery.structure.teams.list.invalidate(); setRoleTeamId(""); setRoleName(""); toast.success("Papel adicionado"); },
    onError: error => toast.error(error.message),
  });
  const addMember = trpc.workflow.delivery.structure.teams.addMember.useMutation({
    onSuccess: async () => { await utils.workflow.delivery.structure.teams.list.invalidate(); setMemberTarget({ teamId: "", roleId: "", appUserId: "" }); toast.success("Membro adicionado"); },
    onError: error => toast.error(error.message),
  });
  const byPhase = useMemo(() => PHASES.map(phase => ({ phase, items: (templates as any[]).filter(item => item.phase === phase) })), [templates]);
  const toggle = (values: string[], value: string) => values.includes(value) ? values.filter(item => item !== value) : [...values, value];

  return <Tabs defaultValue="models" className="space-y-4">
    <TabsList><TabsTrigger value="models">Modelos de processo</TabsTrigger><TabsTrigger value="teams">Equipes e papéis</TabsTrigger></TabsList>
    <TabsContent value="models" className="space-y-4">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Trilhas reutilizáveis</h2><p className="text-sm text-muted-foreground">Um modelo principal e complementos podem ser combinados por projeto.</p></div><Button onClick={() => setModelOpen(true)}><Plus className="mr-2 h-4 w-4" />Novo processo</Button></div>
      <div className="grid gap-3 lg:grid-cols-2">{(models as any[]).map(item => <Card key={item.id}><CardHeader className="pb-2"><div className="flex items-start justify-between gap-3"><CardTitle className="text-base">{item.name}</CardTitle><Badge>{item.kind === "primary" ? "Principal" : "Complementar"}</Badge></div></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{item.description || "Sem descrição"}</p><div className="flex flex-wrap gap-1">{(item.phases || []).map((phase: string) => <Badge key={phase} variant="outline">{phase}</Badge>)}</div><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{item.templates?.length || 0} item(ns) · v{item.version}</span><Button size="sm" variant="outline" onClick={() => duplicate.mutate({ id: item.id, name: `${item.name} — cópia` })}><Copy className="mr-2 h-3.5 w-3.5" />Duplicar</Button></div></CardContent></Card>)}</div>
    </TabsContent>
    <TabsContent value="teams" className="space-y-4">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Equipes operacionais</h2><p className="text-sm text-muted-foreground">Equipes globais são vinculadas aos projetos com papéis próprios.</p></div><Button onClick={() => setTeamOpen(true)}><Plus className="mr-2 h-4 w-4" />Nova equipe</Button></div>
      <div className="grid gap-3 lg:grid-cols-2">{(teams as any[]).map(item => <Card key={item.id}><CardContent className="p-4"><div className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4 text-emerald-600" />{item.name}</div><p className="mt-1 text-sm text-muted-foreground">{item.description}</p><div className="mt-3 flex flex-wrap gap-1">{item.roles?.map((role: any) => <Badge key={role.id} variant="secondary">{role.name}</Badge>)}</div><div className="mt-3 space-y-1">{item.members?.map((member: any) => <p key={member.id} className="text-xs text-muted-foreground">{member.userName || member.userEmail} · {item.roles?.find((role: any) => role.id === member.roleId)?.name}</p>)}</div><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => setRoleTeamId(item.id)}>Adicionar papel</Button><Button size="sm" variant="outline" disabled={!item.roles?.length} onClick={() => setMemberTarget({ teamId: item.id, roleId: item.roles[0].id, appUserId: "" })}>Adicionar membro</Button></div></CardContent></Card>)}</div>
    </TabsContent>
    <Dialog open={modelOpen} onOpenChange={setModelOpen}><DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Novo modelo de processo</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Nome</Label><Input value={model.name} onChange={event => setModel(current => ({ ...current, name: event.target.value }))} /></div><div><Label>Descrição</Label><Textarea value={model.description} onChange={event => setModel(current => ({ ...current, description: event.target.value }))} /></div><div><Label>Tipo</Label><Select value={model.kind} onValueChange={(kind: "primary" | "complementary") => setModel(current => ({ ...current, kind }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="primary">Processo principal</SelectItem><SelectItem value="complementary">Complementar</SelectItem></SelectContent></Select></div><div><Label>Fases</Label><div className="mt-2 flex flex-wrap gap-3">{PHASES.map(phase => <label key={phase} className="flex items-center gap-2 text-sm"><Checkbox checked={model.phases.includes(phase)} onCheckedChange={() => setModel(current => ({ ...current, phases: toggle(current.phases, phase) }))} />{phase}</label>)}</div></div><div><Label>Itens do processo</Label><div className="mt-2 max-h-80 space-y-3 overflow-y-auto rounded-md border p-3">{byPhase.map(group => <div key={group.phase}><p className="mb-1 text-sm font-semibold">{group.phase}</p>{group.items.map((item: any) => <label key={item.id} className="flex items-center gap-2 rounded p-1 text-sm hover:bg-muted"><Checkbox checked={model.templateIds.includes(item.id)} onCheckedChange={() => setModel(current => ({ ...current, templateIds: toggle(current.templateIds, item.id) }))} /><span className="flex-1">{item.title}</span><Badge variant="outline">{item.ownerRole}</Badge></label>)}</div>)}</div></div></div><DialogFooter><Button variant="outline" onClick={() => setModelOpen(false)}>Cancelar</Button><Button disabled={!model.name.trim() || !model.phases.length || createModel.isPending} onClick={() => createModel.mutate({ ...model, active: true })}>Criar processo</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={teamOpen} onOpenChange={setTeamOpen}><DialogContent><DialogHeader><DialogTitle>Nova equipe</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Nome</Label><Input value={team.name} onChange={event => setTeam(current => ({ ...current, name: event.target.value }))} /></div><div><Label>Descrição</Label><Textarea value={team.description} onChange={event => setTeam(current => ({ ...current, description: event.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setTeamOpen(false)}>Cancelar</Button><Button disabled={!team.name.trim() || createTeam.isPending} onClick={() => createTeam.mutate(team)}>Criar equipe</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(roleTeamId)} onOpenChange={open => !open && setRoleTeamId("")}><DialogContent><DialogHeader><DialogTitle>Novo papel operacional</DialogTitle></DialogHeader><div><Label>Nome do papel</Label><Input value={roleName} onChange={event => setRoleName(event.target.value)} placeholder="Ex.: Arquiteto de solução" /></div><DialogFooter><Button variant="outline" onClick={() => setRoleTeamId("")}>Cancelar</Button><Button disabled={!roleName.trim() || addRole.isPending} onClick={() => addRole.mutate({ teamId: roleTeamId, name: roleName, description: "" })}>Adicionar</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(memberTarget.teamId)} onOpenChange={open => !open && setMemberTarget({ teamId: "", roleId: "", appUserId: "" })}><DialogContent><DialogHeader><DialogTitle>Adicionar membro à equipe</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Papel</Label><Select value={memberTarget.roleId} onValueChange={roleId => setMemberTarget(current => ({ ...current, roleId }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{((teams as any[]).find(team => team.id === memberTarget.teamId)?.roles || []).map((role: any) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Usuário</Label><Select value={memberTarget.appUserId} onValueChange={appUserId => setMemberTarget(current => ({ ...current, appUserId }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{(users as any[]).filter(user => user.active).map(user => <SelectItem key={user.id} value={user.id}>{user.name} · {user.email}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setMemberTarget({ teamId: "", roleId: "", appUserId: "" })}>Cancelar</Button><Button disabled={!memberTarget.roleId || !memberTarget.appUserId || addMember.isPending} onClick={() => addMember.mutate(memberTarget)}>Adicionar</Button></DialogFooter></DialogContent></Dialog>
  </Tabs>;
}
