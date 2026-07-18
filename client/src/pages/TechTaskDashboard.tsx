import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle2, Clock3, KanbanSquare } from "lucide-react";
import { useLocation } from "wouter";

export default function TechTaskDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: appUser } = trpc.access.getByEmail.useQuery({ email: user?.email || "" }, { enabled: Boolean(user?.email) });
  const { data: activities = [], isLoading } = trpc.activities.list.useQuery();
  const mine = activities.filter(item => appUser && (item.creatorUserId === appUser.id || item.assigneeUserId === appUser.id || item.participantUserIds.includes(appUser.id)));
  const today = new Date().toISOString().slice(0, 10);
  const metrics = [
    { label: "Meu trabalho", value: mine.length, icon: KanbanSquare, color: "text-orange-600" },
    { label: "Em andamento", value: mine.filter(item => item.status === "Em andamento").length, icon: Clock3, color: "text-blue-600" },
    { label: "Atrasadas", value: mine.filter(item => item.dueDate && item.dueDate < today && item.status !== "Concluída").length, icon: AlertTriangle, color: "text-red-600" },
    { label: "Concluídas", value: mine.filter(item => item.status === "Concluída").length, icon: CheckCircle2, color: "text-emerald-600" },
  ];
  return <div className="mx-auto max-w-6xl space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-orange-600">TechTask</p><h1 className="text-3xl font-bold">Visão geral das atividades</h1><p className="mt-1 text-muted-foreground">Priorize o trabalho e acompanhe pendências integradas.</p></div><Button onClick={() => navigate("/techtask/board")}><KanbanSquare className="mr-2 h-4 w-4" />Abrir Kanban</Button></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(metric => <Card key={metric.label}><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">{metric.label}</CardTitle><metric.icon className={`h-4 w-4 ${metric.color}`} /></CardHeader><CardContent><p className="text-3xl font-bold">{isLoading ? "—" : metric.value}</p></CardContent></Card>)}</div></div>;
}
