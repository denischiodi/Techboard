import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  FilterX,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  DashboardDetailRow,
  DashboardFilters,
  DashboardMetric,
  Project,
  Resource,
} from "../../../../shared/types";

export function DashboardFilterBar({
  filters,
  onChange,
  onClear,
  projects = [],
  resources = [],
  showResources = true,
  showPeriod = true,
}: {
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
  onClear: () => void;
  projects?: Project[];
  resources?: Resource[];
  showResources?: boolean;
  showPeriod?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 p-4">
        {showPeriod && (
          <>
            <div className="space-y-1">
              <Label htmlFor="dashboard-start">Início</Label>
              <Input
                id="dashboard-start"
                type="date"
                value={filters.startDate}
                onChange={event =>
                  onChange({ ...filters, startDate: event.target.value })
                }
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dashboard-end">Fim</Label>
              <Input
                id="dashboard-end"
                type="date"
                value={filters.endDate}
                onChange={event =>
                  onChange({ ...filters, endDate: event.target.value })
                }
                className="w-40"
              />
            </div>
          </>
        )}
        <div className="min-w-52 flex-1 space-y-1">
          <Label>Projeto</Label>
          <Select
            value={filters.projectIds[0] || "all"}
            onValueChange={value =>
              onChange({
                ...filters,
                projectIds: value === "all" ? [] : [value],
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos os projetos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os projetos</SelectItem>
              {projects.map(project => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showResources && (
          <div className="min-w-52 flex-1 space-y-1">
            <Label>Recurso</Label>
            <Select
              value={filters.resourceIds[0] || "all"}
              onValueChange={value =>
                onChange({
                  ...filters,
                  resourceIds: value === "all" ? [] : [value],
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos os recursos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os recursos</SelectItem>
                {resources.map(resource => (
                  <SelectItem key={resource.id} value={resource.id}>
                    {resource.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button variant="outline" onClick={onClear}>
          <FilterX className="mr-2 h-4 w-4" />
          Limpar
        </Button>
      </CardContent>
    </Card>
  );
}

const toneClass = {
  neutral: "border-l-slate-500 text-slate-700",
  positive: "border-l-emerald-500 text-emerald-700",
  warning: "border-l-amber-500 text-amber-700",
  critical: "border-l-red-500 text-red-700",
};

export function AnalyticsMetricCard({
  metric,
  onClick,
}: {
  metric: DashboardMetric;
  onClick?: () => void;
}) {
  const trend = metric.trendPercent;
  return (
    <Card
      className={cn(
        "border-l-4 transition",
        toneClass[metric.tone || "neutral"],
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md"
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span>{metric.label}</span>
          {onClick && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-2">
          <p className="text-3xl font-bold text-foreground">
            {metric.value.toLocaleString("pt-BR")}
            {metric.unit && (
              <span className="ml-1 text-base font-medium text-muted-foreground">
                {metric.unit}
              </span>
            )}
          </p>
          {trend != null && (
            <Badge
              variant="outline"
              className={trend >= 0 ? "text-emerald-700" : "text-red-700"}
            >
              {trend >= 0 ? (
                <ArrowUpRight className="mr-1 h-3 w-3" />
              ) : (
                <ArrowDownRight className="mr-1 h-3 w-3" />
              )}
              {Math.abs(trend).toFixed(1)}%
            </Badge>
          )}
        </div>
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          {metric.formula}
        </p>
      </CardContent>
    </Card>
  );
}

export function AnalyticsLoading({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: cards }, (_, index) => (
        <Skeleton key={index} className="h-32 rounded-xl" />
      ))}
    </div>
  );
}

export function AnalyticsEmpty({
  text = "Nenhum dado encontrado para os filtros selecionados.",
}: {
  text?: string;
}) {
  return (
    <div className="flex min-h-36 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
      <Activity className="mr-2 h-4 w-4" />
      {text}
    </div>
  );
}

export function DashboardDrilldown({
  open,
  onOpenChange,
  title,
  description,
  formula,
  rows,
  onOpenRow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  formula: string;
  rows: DashboardDetailRow[];
  onOpenRow?: (row: DashboardDetailRow) => void;
}) {
  const [search, setSearch] = useState("");
  const visible = useMemo(
    () =>
      rows.filter(row =>
        `${row.title} ${row.subtitle || ""} ${row.status || ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR"))
      ),
    [rows, search]
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {description || `${rows.length} registros compõem este indicador.`}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          <div className="rounded-lg bg-muted p-3 text-xs">
            <strong>Regra de cálculo:</strong> {formula}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar no detalhe..."
              className="pl-9"
            />
          </div>
          <div className="space-y-2">
            {visible.map(row => (
              <button
                key={row.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition hover:bg-muted"
                onClick={() => onOpenRow?.(row)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {row.title}
                  </span>
                  {row.subtitle && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.subtitle}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {row.status && <Badge variant="outline">{row.status}</Badge>}
                  {onOpenRow && <ArrowRight className="h-4 w-4" />}
                </span>
              </button>
            ))}
            {visible.length === 0 && <AnalyticsEmpty />}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
