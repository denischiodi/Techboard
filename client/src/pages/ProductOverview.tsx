import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  canViewMenuItem,
  PRODUCT_CATALOG,
  type ProductId,
} from "@/lib/productCatalog";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  ServerCog,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { DEFAULT_PERMISSIONS } from "../../../shared/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AnalyticsMetricCard,
  DashboardDrilldown,
  DashboardFilterBar,
} from "@/components/analytics/DashboardKit";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";
import type {
  DashboardDetailRow,
  DashboardMetric,
} from "../../../shared/types";
import { useMemo, useState } from "react";

export default function ProductOverview({
  productId,
}: {
  productId: ProductId;
}) {
  const product = PRODUCT_CATALOG[productId];
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { data: appUser } = trpc.access.getByEmail.useQuery(
    { email: user?.email || "" },
    { enabled: Boolean(user?.email) }
  );
  const permissions = appUser?.permissions || DEFAULT_PERMISSIONS.viewer;
  const isAdmin = productId === "admin" && appUser?.role === "admin";
  const diagnostics = trpc.system.diagnostics.useQuery(undefined, {
    enabled: isAdmin,
    retry: false,
  });
  const usersQuery = trpc.access.list.useQuery(undefined, {
    enabled: isAdmin,
    retry: false,
  });
  const projectsQuery = trpc.projects.list.useQuery(undefined, {
    enabled: isAdmin,
  });
  const resourcesQuery = trpc.resources.list.useQuery(undefined, {
    enabled: isAdmin,
  });
  const allocationsQuery = trpc.allocations.list.useQuery(undefined, {
    enabled: isAdmin,
  });
  const { filters, setFilters, clearFilters } = useDashboardFilters();
  const [adminDetail, setAdminDetail] = useState<{
    metric: DashboardMetric;
    rows: DashboardDetailRow[];
  } | null>(null);
  const Icon = product.icon;
  const links = product.menus.filter(
    item => item.path !== product.homePath && canViewMenuItem(item, permissions)
  );
  const filteredAdminUsers = useMemo(() => {
    const allocations = allocationsQuery.data || [];
    const selectedProjectIds = new Set(filters.projectIds);
    const selectedProjectResourceIds = new Set(
      allocations
        .filter(
          item =>
            !selectedProjectIds.size || selectedProjectIds.has(item.projectId)
        )
        .map(item => item.resourceId)
    );
    return (usersQuery.data || []).filter(
      item =>
        (!filters.resourceIds.length ||
          (item.resourceId && filters.resourceIds.includes(item.resourceId))) &&
        (!filters.projectIds.length ||
          (item.resourceId && selectedProjectResourceIds.has(item.resourceId)))
    );
  }, [
    allocationsQuery.data,
    filters.projectIds,
    filters.resourceIds,
    usersQuery.data,
  ]);
  const adminAnalytics = useMemo(() => {
    const users = filteredAdminUsers;
    const resources = resourcesQuery.data || [];
    const projects = projectsQuery.data || [];
    const selectedUsers = users;
    const active = selectedUsers.filter(item => item.active);
    const inactive = selectedUsers.filter(item => !item.active);
    const withoutResource = active.filter(
      item =>
        !item.resourceId ||
        !resources.some(resource => resource.id === item.resourceId)
    );
    const withoutManager = projects.filter(
      item =>
        (!filters.projectIds.length || filters.projectIds.includes(item.id)) &&
        !item.manager?.trim()
    );
    const userRow = (item: (typeof users)[number]): DashboardDetailRow => ({
      id: item.id,
      title: item.name,
      subtitle: item.email,
      status: item.active ? item.role : "Inativo",
      resourceId: item.resourceId,
      sourceUrl: "/admin/users",
    });
    const projectRow = (
      item: (typeof projects)[number]
    ): DashboardDetailRow => ({
      id: item.id,
      title: item.name,
      subtitle: item.client,
      status: "Sem gestor",
      projectId: item.id,
      sourceUrl: "/admin/registrations",
    });
    return [
      {
        metric: {
          id: "admin.active-users",
          label: "Usuários ativos",
          value: active.length,
          tone: "positive",
          formula: "Usuários ativos no escopo dos filtros.",
        } as DashboardMetric,
        rows: active.map(userRow),
      },
      {
        metric: {
          id: "admin.inactive-users",
          label: "Usuários inativos",
          value: inactive.length,
          tone: inactive.length ? "warning" : "neutral",
          formula: "Usuários com acesso inativo.",
        } as DashboardMetric,
        rows: inactive.map(userRow),
      },
      {
        metric: {
          id: "admin.unlinked-users",
          label: "Ativos sem recurso válido",
          value: withoutResource.length,
          tone: withoutResource.length ? "critical" : "positive",
          formula:
            "Usuários ativos sem recurso vinculado ou com vínculo inexistente.",
        } as DashboardMetric,
        rows: withoutResource.map(userRow),
      },
      {
        metric: {
          id: "admin.projects-without-manager",
          label: "Projetos sem gestor",
          value: withoutManager.length,
          tone: withoutManager.length ? "critical" : "positive",
          formula: "Projetos visíveis sem gestor cadastrado.",
        } as DashboardMetric,
        rows: withoutManager.map(projectRow),
      },
    ];
  }, [
    filteredAdminUsers,
    filters.projectIds,
    projectsQuery.data,
    resourcesQuery.data,
  ]);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div
        className={`overflow-hidden rounded-2xl bg-gradient-to-r ${product.accent} p-6 text-white shadow-sm`}
      >
        <div className="flex items-center gap-4">
          <span className="rounded-xl bg-white/15 p-3">
            <Icon className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-3xl font-bold">{product.name}</h1>
            <p className="mt-1 text-white/80">{product.description}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {links.map(item => {
          const ItemIcon = item.icon;
          return (
            <Card
              key={item.path}
              className="group cursor-pointer transition hover:shadow-md"
              onClick={() => navigate(item.path)}
            >
              <CardContent className="flex items-center gap-4 p-5">
                <span className="rounded-xl bg-muted p-3">
                  <ItemIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{item.label}</h2>
                  <p className="text-xs text-muted-foreground">Abrir módulo</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </CardContent>
            </Card>
          );
        })}
      </div>
      {isAdmin && (
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">
              Controle de usuários e qualidade cadastral
            </h2>
            <p className="text-sm text-muted-foreground">
              Perfis, vínculos e exceções que exigem ação administrativa.
            </p>
          </div>
          <DashboardFilterBar
            filters={filters}
            onChange={setFilters}
            onClear={clearFilters}
            projects={projectsQuery.data || []}
            resources={resourcesQuery.data || []}
            showPeriod={false}
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {adminAnalytics.map(item => (
              <AnalyticsMetricCard
                key={item.metric.id}
                metric={item.metric}
                onClick={() => setAdminDetail(item)}
              />
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Distribuição de perfis</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {Object.entries(
                filteredAdminUsers.reduce<Record<string, number>>(
                  (result, item) => {
                    result[item.role] = (result[item.role] || 0) + 1;
                    return result;
                  },
                  {}
                )
              ).map(([role, total]) => (
                <button
                  key={role}
                  onClick={() => {
                    const rows = filteredAdminUsers
                      .filter(item => item.role === role)
                      .map(item => ({
                        id: item.id,
                        title: item.name,
                        subtitle: item.email,
                        status: item.active ? role : "Inativo",
                        sourceUrl: "/admin/users",
                      }));
                    setAdminDetail({
                      metric: {
                        id: `admin.role.${role}`,
                        label: `Perfil: ${role}`,
                        value: total,
                        formula: `Usuários cadastrados com perfil “${role}”.`,
                      },
                      rows,
                    });
                  }}
                >
                  <Badge
                    variant="outline"
                    className="cursor-pointer px-3 py-2 hover:bg-muted"
                  >
                    {role}: {total}
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>
          <DashboardDrilldown
            open={Boolean(adminDetail)}
            onOpenChange={open => !open && setAdminDetail(null)}
            title={adminDetail?.metric.label || ""}
            formula={adminDetail?.metric.formula || ""}
            rows={adminDetail?.rows || []}
            description={
              adminDetail
                ? `${adminDetail.rows.length} registros compõem este indicador.`
                : undefined
            }
            onOpenRow={row => navigate(row.sourceUrl || "/admin/users")}
          />
        </section>
      )}
      {isAdmin && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <ServerCog className="h-5 w-5" />
                Diagnóstico do ambiente
              </h2>
              <p className="text-sm text-muted-foreground">
                Configuração e disponibilidade dos serviços essenciais.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => diagnostics.refetch()}
              disabled={diagnostics.isFetching}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${diagnostics.isFetching ? "animate-spin" : ""}`}
              />
              Atualizar
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(diagnostics.data?.services || []).map(service => {
              const healthy =
                service.status === "operational" ||
                service.status === "configured";
              return (
                <Card key={service.id}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm">{service.label}</CardTitle>
                    {healthy ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                    )}
                  </CardHeader>
                  <CardContent>
                    <Badge variant={healthy ? "secondary" : "outline"}>
                      {healthy ? "Disponível" : "Atenção"}
                    </Badge>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {service.detail}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
            {diagnostics.isLoading && (
              <Card>
                <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
                  <Activity className="h-4 w-4 animate-pulse" />
                  Verificando serviços...
                </CardContent>
              </Card>
            )}
          </div>
          {diagnostics.data && (
            <p className="text-xs text-muted-foreground">
              Versão {diagnostics.data.version} · {diagnostics.data.environment}{" "}
              · verificado em{" "}
              {new Date(diagnostics.data.checkedAt).toLocaleString("pt-BR")}
            </p>
          )}
          {diagnostics.error && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Não foi possível consultar o diagnóstico:{" "}
              {diagnostics.error.message}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
