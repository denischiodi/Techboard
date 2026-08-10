import { useMemo, useState } from "react";
import { Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkflowProject } from "./workflow/useWorkflowProject";

export default function TechMoveTeams() {
  const { projectId, rememberProject } = useWorkflowProject();
  const utils = trpc.useUtils();
  const { data: projects = [] } = trpc.projects.list.useQuery();
  const selectedProjectId = projects.some((project: any) => project.id === projectId) ? projectId : (projects[0] as any)?.id || "";
  const { data: teams = [] } = trpc.workflow.delivery.structure.teams.list.useQuery();
  const { data: users = [] } = trpc.workflow.delivery.structure.teams.eligibleUsers.useQuery(
    { projectId: selectedProjectId }, { enabled: Boolean(selectedProjectId) }
  );
  const { data: members = [] } = trpc.workflow.delivery.structure.teams.projectMembers.useQuery(
    { projectId: selectedProjectId }, { enabled: Boolean(selectedProjectId) }
  );
  const [assignment, setAssignment] = useState({ teamId: "", roleId: "", appUserId: "" });
  const selectedTeam: any = (teams as any[]).find(team => team.id === assignment.teamId);
  const add = trpc.workflow.delivery.structure.teams.addProjectMember.useMutation({
    onSuccess: async () => { await utils.workflow.delivery.structure.teams.projectMembers.invalidate(); setAssignment({ teamId: "", roleId: "", appUserId: "" }); toast.success("Pessoa vinculada ao projeto"); },
    onError: error => toast.error(error.message),
  });
  const grouped = useMemo(() => (teams as any[]).map(team => ({ ...team, projectMembers: (members as any[]).filter(member => member.teamId === team.id) })), [teams, members]);

  return <div className="mx-auto max-w-6xl space-y-6 p-3 sm:p-6">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-emerald-700">TechMove</p><h1 className="text-2xl font-bold">Equipes do projeto</h1><p className="text-sm text-muted-foreground">Defina quem exerce cada papel operacional na trilha.</p></div><Select value={selectedProjectId} onValueChange={rememberProject}><SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Selecione o projeto" /></SelectTrigger><SelectContent>{projects.map((project: any) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>
    <Card><CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_1fr_auto]"><Select value={assignment.teamId} onValueChange={teamId => setAssignment({ teamId, roleId: "", appUserId: assignment.appUserId })}><SelectTrigger><SelectValue placeholder="Equipe" /></SelectTrigger><SelectContent>{(teams as any[]).map(team => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}</SelectContent></Select><Select value={assignment.roleId} onValueChange={roleId => setAssignment(current => ({ ...current, roleId }))}><SelectTrigger><SelectValue placeholder="Papel" /></SelectTrigger><SelectContent>{(selectedTeam?.roles || []).map((role: any) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}</SelectContent></Select><Select value={assignment.appUserId} onValueChange={appUserId => setAssignment(current => ({ ...current, appUserId }))}><SelectTrigger><SelectValue placeholder="Pessoa" /></SelectTrigger><SelectContent>{(users as any[]).filter(user => user.active).map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select><Button disabled={!selectedProjectId || !assignment.teamId || !assignment.roleId || !assignment.appUserId || add.isPending} onClick={() => add.mutate({ projectId: selectedProjectId, ...assignment })}><Plus className="mr-2 h-4 w-4" />Vincular</Button></CardContent></Card>
    <div className="grid gap-4 lg:grid-cols-2">{grouped.map(team => <Card key={team.id}><CardContent className="p-4"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-emerald-600" /><h2 className="font-semibold">{team.name}</h2><Badge variant="secondary" className="ml-auto">{team.projectMembers.length}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{team.description}</p><div className="mt-3 space-y-2">{team.projectMembers.map((member: any) => <div key={member.id} className="flex items-center justify-between rounded border p-2 text-sm"><span>{member.userName}</span><Badge variant="outline">{member.roleName}</Badge></div>)}{!team.projectMembers.length && <p className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhum membro vinculado.</p>}</div></CardContent></Card>)}</div>
  </div>;
}
