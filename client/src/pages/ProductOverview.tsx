import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canViewMenuItem, PRODUCT_CATALOG, type ProductId } from "@/lib/productCatalog";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, ServerCog } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { DEFAULT_PERMISSIONS } from "../../../shared/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ProductOverview({ productId }: { productId: ProductId }) {
  const product = PRODUCT_CATALOG[productId];
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { data: appUser } = trpc.access.getByEmail.useQuery({ email: user?.email || "" }, { enabled: Boolean(user?.email) });
  const permissions = appUser?.permissions || DEFAULT_PERMISSIONS.viewer;
  const diagnostics = trpc.system.diagnostics.useQuery(undefined, { enabled: productId === "admin" && appUser?.role === "admin", retry: false });
  const Icon = product.icon;
  const links = product.menus.filter(
    item => item.path !== product.homePath && canViewMenuItem(item, permissions),
  );
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className={`overflow-hidden rounded-2xl bg-gradient-to-r ${product.accent} p-6 text-white shadow-sm`}>
        <div className="flex items-center gap-4"><span className="rounded-xl bg-white/15 p-3"><Icon className="h-7 w-7" /></span><div><h1 className="text-3xl font-bold">{product.name}</h1><p className="mt-1 text-white/80">{product.description}</p></div></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {links.map(item => { const ItemIcon = item.icon; return <Card key={item.path} className="group cursor-pointer transition hover:shadow-md" onClick={() => navigate(item.path)}><CardContent className="flex items-center gap-4 p-5"><span className="rounded-xl bg-muted p-3"><ItemIcon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><h2 className="font-semibold">{item.label}</h2><p className="text-xs text-muted-foreground">Abrir módulo</p></div><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></CardContent></Card>; })}
      </div>
      {productId === "admin" && appUser?.role === "admin" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="flex items-center gap-2 text-xl font-semibold"><ServerCog className="h-5 w-5" />Diagnóstico do ambiente</h2><p className="text-sm text-muted-foreground">Configuração e disponibilidade dos serviços essenciais.</p></div>
            <Button variant="outline" size="sm" onClick={() => diagnostics.refetch()} disabled={diagnostics.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${diagnostics.isFetching ? "animate-spin" : ""}`} />Atualizar</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(diagnostics.data?.services || []).map(service => {
              const healthy = service.status === "operational" || service.status === "configured";
              return <Card key={service.id}><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm">{service.label}</CardTitle>{healthy ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}</CardHeader><CardContent><Badge variant={healthy ? "secondary" : "outline"}>{healthy ? "Disponível" : "Atenção"}</Badge><p className="mt-2 text-xs text-muted-foreground">{service.detail}</p></CardContent></Card>;
            })}
            {diagnostics.isLoading && <Card><CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Activity className="h-4 w-4 animate-pulse" />Verificando serviços...</CardContent></Card>}
          </div>
          {diagnostics.data && <p className="text-xs text-muted-foreground">Versão {diagnostics.data.version} · {diagnostics.data.environment} · verificado em {new Date(diagnostics.data.checkedAt).toLocaleString("pt-BR")}</p>}
          {diagnostics.error && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Não foi possível consultar o diagnóstico: {diagnostics.error.message}</p>}
        </section>
      )}
    </div>
  );
}
