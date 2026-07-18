import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { FolderKanban, Users } from "lucide-react";

export default function TechLeadTeams({ indicators = false }: { indicators?: boolean }) {
  const { data: projects = [], isLoading } = trpc.projects.list.useQuery();
  if (indicators) {
    const counts = [...new Set(projects.map(project => project.status))].map(status => ({ status, total: projects.filter(project => project.status === status).length }));
    return <div className="mx-auto max-w-6xl space-y-6"><div><p className="text-sm font-medium text-violet-600">TechLead</p><h1 className="text-3xl font-bold">Indicadores</h1><p className="mt-1 text-muted-foreground">Distribuição dos projetos que estão sob acompanhamento.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{counts.map(item => <Card key={item.status}><CardHeader><CardTitle className="text-sm">{item.status}</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{item.total}</p></CardContent></Card>)}{!isLoading && counts.length === 0 && <p className="text-muted-foreground">Nenhum projeto disponível.</p>}</div></div>;
  }
  const managers = [...new Set(projects.map(project => project.manager).filter(Boolean))];
  return <div className="mx-auto max-w-6xl space-y-6"><div><p className="text-sm font-medium text-violet-600">TechLead</p><h1 className="text-3xl font-bold">Times e frentes</h1><p className="mt-1 text-muted-foreground">Visão dos responsáveis e projetos acompanhados.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{managers.map(manager => { const managed = projects.filter(project => project.manager === manager); return <Card key={manager}><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-5 w-5 text-violet-600" />{manager}</CardTitle></CardHeader><CardContent><div className="space-y-2">{managed.map(project => <div key={project.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"><span className="flex min-w-0 items-center gap-2"><FolderKanban className="h-4 w-4 shrink-0" /><span className="truncate">{project.name}</span></span><Badge variant="secondary">{project.status}</Badge></div>)}</div></CardContent></Card>; })}{!isLoading && managers.length === 0 && <p className="text-muted-foreground">Nenhum time disponível.</p>}</div></div>;
}
