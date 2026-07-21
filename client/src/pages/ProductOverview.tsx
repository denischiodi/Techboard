import { Card, CardContent } from "@/components/ui/card";
import { canViewMenuItem, PRODUCT_CATALOG, type ProductId } from "@/lib/productCatalog";
import { ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { DEFAULT_PERMISSIONS } from "../../../shared/types";

export default function ProductOverview({ productId }: { productId: ProductId }) {
  const product = PRODUCT_CATALOG[productId];
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { data: appUser } = trpc.access.getByEmail.useQuery({ email: user?.email || "" }, { enabled: Boolean(user?.email) });
  const permissions = appUser?.permissions || DEFAULT_PERMISSIONS.viewer;
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
    </div>
  );
}
