import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { canAccessProduct, firstAccessiblePath, PRODUCTS } from "@/lib/productCatalog";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useLocation } from "wouter";
import { DEFAULT_PERMISSIONS } from "../../../shared/types";
import { ProductLogo } from "@/components/ProductLogo";

export default function AppLauncher() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: appUser } = trpc.access.getByEmail.useQuery(
    { email: user?.email || "" }, { enabled: Boolean(user?.email) },
  );
  const permissions = appUser?.permissions || DEFAULT_PERMISSIONS.viewer;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Portal Tech</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Qual ferramenta você quer usar?</h1>
        <p className="mt-2 text-muted-foreground">Cada ambiente mostra somente os menus e recursos daquela ferramenta.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PRODUCTS.map(product => {
          const allowed = canAccessProduct(product, permissions);
          return (
            <Card key={product.id} className={`group overflow-hidden transition ${allowed ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg" : "opacity-55"}`} onClick={() => allowed && navigate(firstAccessiblePath(product, permissions))}>
              <div className={`h-1.5 bg-gradient-to-r ${product.accent}`} />
              <CardContent className="flex min-h-44 flex-col justify-between p-5">
                <div className="flex items-start justify-between gap-4">
                  <ProductLogo product={product} />
                  {!allowed && <LockKeyhole className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-semibold">{product.name}{allowed && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{allowed ? product.description : "Solicite acesso ao administrador."}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
