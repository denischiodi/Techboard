import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ClipboardCheck, FolderKanban, Users } from "lucide-react";
import { useLocation } from "wouter";
import { ProductLogo } from "@/components/ProductLogo";
import { PRODUCT_CATALOG } from "@/lib/productCatalog";

export default function TechLeadDashboard() {
  const [, navigate] = useLocation();
  const { data: projects = [], isLoading } = trpc.projects.list.useQuery();
  const active = projects.filter(project => !["Concluído", "Cancelado"].includes(project.status));
  return <div className="mx-auto max-w-6xl space-y-6"><div className="rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 p-6 text-white"><ProductLogo product={PRODUCT_CATALOG.techlead} className="mb-4 h-12 w-44" /><h1 className="mt-1 text-3xl font-bold">Central de liderança</h1><p className="mt-2 text-white/80">Acompanhe projetos, trilhas de gestão e times em um só ambiente.</p></div><div className="grid gap-4 md:grid-cols-3"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FolderKanban className="h-5 w-5 text-violet-600" />Projetos visíveis</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{isLoading ? "—" : projects.length}</p><p className="text-sm text-muted-foreground">{active.length} em andamento</p></CardContent></Card><Card className="cursor-pointer hover:shadow-md" onClick={() => navigate("/techlead/gp-track")}><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-5 w-5 text-violet-600" />Trilha do GP</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Atividades, quality gates e ciclos Fit-to-Standard.</p><Button className="mt-4" variant="outline">Abrir trilha</Button></CardContent></Card><Card className="cursor-pointer hover:shadow-md" onClick={() => navigate("/techlead/teams")}><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-5 w-5 text-violet-600" />Times e frentes</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Consulte os recursos e a composição das frentes.</p><Button className="mt-4" variant="outline">Ver times</Button></CardContent></Card></div></div>;
}
