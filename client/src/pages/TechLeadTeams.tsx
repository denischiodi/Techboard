import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProjectContext } from "@/hooks/useProjectContext";
import { trpc } from "@/lib/trpc";
import { ArrowRight, FolderKanban, Users } from "lucide-react";
import { useLocation } from "wouter";

export default function TechLeadTeams({ indicators = false }: { indicators?: boolean }) {
  const { data: projects = [], isLoading } = trpc.projects.list.useQuery();
  const [, navigate] = useLocation();
  const { rememberProject, withProject } = useProjectContext();

  if (indicators) {
    const counts = [...new Set(projects.map(project => project.status))].map(status => ({
      status,
      total: projects.filter(project => project.status === status).length,
    }));
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div><p className="text-sm font-medium text-violet-600">TechLead</p><h1 className="text-3xl font-bold">Indicadores</h1><p className="mt-1 text-muted-foreground">Selecione um indicador para abrir os itens que compõem o resultado.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {counts.map(item => <Card key={item.status} className="group cursor-pointer transition hover:shadow-md" onClick={() => navigate(`/techtask/board?view=projects&q=${encodeURIComponent(item.status)}`)}><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-sm">{item.status}</CardTitle><ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1" /></CardHeader><CardContent><p className="text-3xl font-bold">{item.total}</p><p className="mt-1 text-xs text-muted-foreground">Abrir atividades relacionadas</p></CardContent></Card>)}
          {!isLoading && counts.length === 0 && <p className="text-muted-foreground">Nenhum projeto disponível.</p>}
        </div>
      </div>
    );
  }

  const managers = [...new Set(projects.map(project => project.manager).filter(Boolean))];
  const openProject = (projectId: string) => {
    rememberProject(projectId);
    navigate(withProject("/techmove", projectId));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div><p className="text-sm font-medium text-violet-600">TechLead</p><h1 className="text-3xl font-bold">Times e frentes</h1><p className="mt-1 text-muted-foreground">Visão dos responsáveis e projetos acompanhados.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {managers.map(manager => {
          const managed = projects.filter(project => project.manager === manager);
          return <Card key={manager}><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-5 w-5 text-violet-600" />{manager}</CardTitle></CardHeader><CardContent><div className="space-y-2">{managed.map(project => <button key={project.id} className="flex w-full items-center justify-between gap-2 rounded-lg border p-2 text-left text-sm transition hover:bg-muted" onClick={() => openProject(project.id)}><span className="flex min-w-0 items-center gap-2"><FolderKanban className="h-4 w-4 shrink-0" /><span className="truncate">{project.name}</span></span><Badge variant="secondary">{project.status}</Badge></button>)}</div></CardContent></Card>;
        })}
        {!isLoading && managers.length === 0 && <p className="text-muted-foreground">Nenhum time disponível.</p>}
      </div>
    </div>
  );
}
