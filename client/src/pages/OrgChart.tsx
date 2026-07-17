import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, FolderKanban, Layers, Network, Users } from "lucide-react";
import type { Allocation, Project, Resource } from "../../../shared/types";

type ViewMode = "team" | "group" | "project";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join("") || "?";
}

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function resourceFronts(resource: Resource) {
  return resource.fronts && resource.fronts.length > 0 ? resource.fronts : resource.front ? [resource.front] : [];
}

function resourceGroup(resource: Resource) {
  return resource.group?.trim() || "Sem grupo";
}

function isActive(resource: Resource) {
  return normalize(resource.status || "") !== "inativo";
}

function hasProfile(resource: Resource, terms: string[]) {
  const profile = normalize(resource.profile || "");
  return terms.some(term => profile.includes(term));
}

function isDirector(resource: Resource) {
  return hasProfile(resource, ["diretor"]);
}

function isManager(resource: Resource) {
  return hasProfile(resource, ["gerente", "pmo", "project manager"]);
}

function isLeader(resource: Resource) {
  return hasProfile(resource, ["lider", "lead", "arquiteto", "architect"]);
}

function sortByName(a: Resource, b: Resource) {
  return a.name.localeCompare(b.name, "pt-BR");
}

function sortForGroup(a: Resource, b: Resource) {
  const leaderDelta = Number(isLeader(b)) - Number(isLeader(a));
  if (leaderDelta !== 0) return leaderDelta;
  return sortByName(a, b);
}

function todayIsoDate() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function PersonNode({ resource, subtitle }: { resource: Resource; subtitle?: string }) {
  return (
    <div className="flex min-w-[220px] items-center gap-3 rounded-sm border-l-4 border-sky-300 bg-white/90 p-3 shadow-sm">
      <Avatar className="h-16 w-16 shrink-0 border-2 border-blue-700">
        <AvatarImage src={resource.photoUrl || ""} alt={resource.name} className="object-cover" />
        <AvatarFallback className="bg-blue-50 text-base font-semibold text-blue-900">{initials(resource.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        {subtitle ? <p className="text-xs font-semibold uppercase tracking-wide text-blue-900">{subtitle}</p> : null}
        <p className="break-words text-base font-semibold leading-tight text-sky-700">{resource.name}</p>
        <p className="mt-1 text-xs text-slate-500">{resource.profile}</p>
      </div>
    </div>
  );
}

function CompactPersonNode({
  resource,
  subtitle,
  roleLabel,
  muted = false,
}: {
  resource: Resource;
  subtitle?: string;
  roleLabel?: string;
  muted?: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-sm border-l-4 bg-white/90 p-2 shadow-sm ${muted ? "border-slate-300 opacity-90" : "border-sky-300"}`}>
      <Avatar className="h-10 w-10 shrink-0 border-2 border-blue-700">
        <AvatarImage src={resource.photoUrl || ""} alt={resource.name} className="object-cover" />
        <AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-900">{initials(resource.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        {roleLabel ? <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-blue-900">{roleLabel}</p> : null}
        <p className="truncate text-sm font-semibold leading-tight text-sky-700">{resource.name}</p>
        {subtitle ? <p className="truncate text-[11px] text-slate-500">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function Section({
  title,
  resources,
  emptyText,
  columns = "md:grid-cols-2 xl:grid-cols-1",
}: {
  title: string;
  resources: Resource[];
  emptyText: string;
  columns?: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xl font-bold text-blue-900">{title}</h3>
        <div className="mt-2 h-1 w-40 bg-sky-300" />
      </div>
      {resources.length > 0 ? (
        <div className={`grid gap-3 ${columns}`}>
          {resources.map(resource => (
            <PersonNode
              key={resource.id}
              resource={resource}
              subtitle={resourceFronts(resource).slice(0, 2).join(", ") || resource.profile}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-sm border border-dashed bg-white/50 p-4 text-sm text-slate-500">{emptyText}</div>
      )}
    </div>
  );
}

function GroupPanel({
  group,
  resources,
  collapsed,
  onToggle,
  getSubtitle,
}: {
  group: string;
  resources: Resource[];
  collapsed: boolean;
  onToggle: () => void;
  getSubtitle: (resource: Resource) => string;
}) {
  const leaders = resources.filter(isLeader).sort(sortByName);
  const sortedResources = resources.slice().sort(sortForGroup);
  const leaderText = leaders.length > 0
    ? `Lider tecnico: ${leaders.map(resource => resource.name).join(", ")}`
    : "Grupo sem lider tecnico definido";

  return (
    <div className="rounded-sm border bg-white/75 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 text-left"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-blue-700/70 bg-sky-50 text-sm font-black text-blue-900">
          {resources.length}
        </div>
        <div className="grid min-w-0 gap-1 md:grid-cols-[minmax(160px,0.5fr)_1fr] md:items-center">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-blue-900">{group}</p>
            <p className="text-xs text-slate-500">Clique para {collapsed ? "expandir" : "minimizar"} este grupo</p>
          </div>
          <p className={`truncate text-sm font-semibold ${leaders.length > 0 ? "text-sky-700" : "text-amber-700"}`}>
            {leaderText}
          </p>
        </div>
        {collapsed ? <ChevronRight className="h-5 w-5 text-blue-900" /> : <ChevronDown className="h-5 w-5 text-blue-900" />}
      </button>
      {!collapsed ? (
        <div className="grid gap-3 border-t p-4 md:grid-cols-2">
          {sortedResources.map(resource => (
            <PersonNode key={`${group}-${resource.id}`} resource={resource} subtitle={getSubtitle(resource)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProjectGroupPanel({
  group,
  fronts,
  resources,
  leader,
  collapsed,
  onToggle,
  getSubtitle,
}: {
  group: string;
  fronts: string[];
  resources: Resource[];
  leader?: Resource;
  collapsed: boolean;
  onToggle: () => void;
  getSubtitle: (resource: Resource) => string;
}) {
  const sortedResources = resources.slice().sort(sortForGroup);

  return (
    <div className="rounded-sm border bg-white/80 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 text-left"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-blue-700/70 bg-sky-50 text-sm font-black text-blue-900">
          {resources.length}
        </div>
        <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(140px,0.35fr)_1fr] lg:items-center">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-blue-900">{group}</p>
            <p className="truncate text-[11px] text-slate-500">{fronts.length > 0 ? fronts.join(", ") : "Sem frente informada"}</p>
          </div>
          {leader ? (
            <div className="flex min-w-0 items-center gap-2 rounded-sm bg-sky-50/80 px-2 py-1">
              <Avatar className="h-9 w-9 shrink-0 border-2 border-blue-700">
                <AvatarImage src={leader.photoUrl || ""} alt={leader.name} className="object-cover" />
                <AvatarFallback className="bg-blue-50 text-[10px] font-semibold text-blue-900">{initials(leader.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-blue-900">Lider tecnico do grupo</p>
                <p className="truncate text-sm font-semibold text-sky-700">{leader.name}</p>
              </div>
            </div>
          ) : (
            <p className="truncate text-sm font-semibold text-amber-700">Grupo sem lider tecnico definido</p>
          )}
        </div>
        {collapsed ? <ChevronRight className="h-5 w-5 text-blue-900" /> : <ChevronDown className="h-5 w-5 text-blue-900" />}
      </button>
      {!collapsed ? (
        <div className="grid gap-2 border-t p-3 md:grid-cols-2 xl:grid-cols-3">
          {sortedResources.map(resource => (
            <CompactPersonNode key={`${group}-${resource.id}`} resource={resource} roleLabel={isLeader(resource) ? "Lider tecnico alocado" : resource.profile} subtitle={getSubtitle(resource)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function OrgChart() {
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const { data: projects = [] } = trpc.projects.list.useQuery();
  const { data: allocations = [] } = trpc.allocations.list.useQuery();

  const activeResources = useMemo(
    () => (resources as Resource[]).filter(isActive).sort(sortByName),
    [resources]
  );

  const groups = useMemo(() => {
    return Array.from(new Set(activeResources.map(resourceGroup).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [activeResources]);

  const activeProjects = useMemo(
    () => (projects as Project[]).slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [projects]
  );

  const [mode, setMode] = useState<ViewMode>("team");
  const [selectedGroup, setSelectedGroup] = useState(() => groups[0] || "");
  const [selectedProjectId, setSelectedProjectId] = useState(() => activeProjects[0]?.id || "");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const currentGroup = selectedGroup || groups[0] || "";
  const currentProject = activeProjects.find(project => project.id === selectedProjectId) || activeProjects[0];
  const today = useMemo(() => todayIsoDate(), []);

  const activeProjectAllocations = useMemo(() => {
    if (mode !== "project" || !currentProject) return [];

    return (allocations as Allocation[]).filter(allocation =>
      allocation.projectId === currentProject.id &&
      (!allocation.endDate || allocation.endDate >= today)
    );
  }, [allocations, currentProject, mode, today]);

  const visibleResources = useMemo(() => {
    if (mode === "group") {
      return activeResources.filter(resource => resourceGroup(resource) === currentGroup);
    }

    if (mode === "project" && currentProject) {
      const resourceIds = new Set(
        activeProjectAllocations.map(allocation => allocation.resourceId)
      );
      return activeResources.filter(resource => resourceIds.has(resource.id));
    }

    return activeResources;
  }, [activeProjectAllocations, activeResources, currentGroup, currentProject, mode]);

  const projectFrontsByResource = useMemo(() => {
    const groupsByResource = new Map<string, Set<string>>();
    if (mode !== "project" || !currentProject) return groupsByResource;

    activeProjectAllocations.forEach(allocation => {
      const frontsForResource = groupsByResource.get(allocation.resourceId) || new Set<string>();
      if (allocation.front) frontsForResource.add(allocation.front);
      groupsByResource.set(allocation.resourceId, frontsForResource);
    });

    return groupsByResource;
  }, [activeProjectAllocations, currentProject, mode]);

  const directors = activeResources
    .filter(isDirector)
    .sort(sortByName);
  const directorIds = new Set(directors.map(resource => resource.id));
  const visibleOperationalResources = visibleResources.filter(resource => !directorIds.has(resource.id));
  const managers = visibleOperationalResources
    .filter(isManager)
    .sort(sortByName);
  const leaders = visibleOperationalResources
    .filter(isLeader)
    .sort(sortByName);

  const getResourceSubtitle = (resource: Resource) => {
    const projectFronts = projectFrontsByResource.get(resource.id);
    const frontsForResource = projectFronts && projectFronts.size > 0 ? Array.from(projectFronts) : resourceFronts(resource);
    return [resource.profile, frontsForResource.slice(0, 2).join(", ")].filter(Boolean).join(" • ");
  };

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    visibleOperationalResources.forEach(resource => {
      const group = resourceGroup(resource);
      counts.set(group, (counts.get(group) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
      .slice(0, 8);
  }, [visibleOperationalResources]);

  const resourcesByGroup = useMemo(() => {
    const groupedResources = new Map<string, Resource[]>();
    visibleOperationalResources.forEach(resource => {
      const group = resourceGroup(resource);
      const list = groupedResources.get(group) || [];
      list.push(resource);
      groupedResources.set(group, list);
    });

    return Array.from(groupedResources.entries())
      .map(([group, items]) => [group, items.sort(sortForGroup)] as const)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt-BR"));
  }, [visibleOperationalResources]);

  const projectManagers = useMemo(() => {
    if (mode !== "project" || !currentProject) return managers;
    const managerName = normalize(currentProject.manager || "");
    const directMatch = managerName
      ? activeResources.filter(resource => normalize(resource.name) === managerName || normalize(resource.name).includes(managerName) || managerName.includes(normalize(resource.name)))
      : [];
    const allocatedManagers = visibleOperationalResources.filter(isManager);
    const merged = new Map<string, Resource>();
    [...directMatch, ...allocatedManagers].forEach(resource => merged.set(resource.id, resource));
    return Array.from(merged.values()).sort(sortByName);
  }, [activeResources, currentProject, managers, mode, visibleOperationalResources]);

  const projectGroups = useMemo(() => {
    if (mode !== "project" || !currentProject) return [];

    const allocationsByResource = new Map<string, Allocation[]>();
    activeProjectAllocations.forEach(allocation => {
      const current = allocationsByResource.get(allocation.resourceId) || [];
      current.push(allocation);
      allocationsByResource.set(allocation.resourceId, current);
    });

    const groupedResources = new Map<string, { fronts: Set<string>; resources: Resource[] }>();
    visibleOperationalResources
      .filter(resource => !isDirector(resource) && !isManager(resource))
      .forEach(resource => {
        const resourceAllocations = allocationsByResource.get(resource.id) || [];
        if (resourceAllocations.length === 0) return;
        const group = resourceGroup(resource);
        const entry = groupedResources.get(group) || { fronts: new Set<string>(), resources: [] };
        resourceAllocations.forEach(allocation => {
          if (allocation.front) entry.fronts.add(allocation.front);
        });
        entry.resources.push(resource);
        groupedResources.set(group, entry);
      });

    return Array.from(groupedResources.entries())
      .map(([group, entry]) => {
        const fronts = Array.from(entry.fronts).sort((a, b) => a.localeCompare(b, "pt-BR"));
        const leader =
          entry.resources.find(isLeader) ||
          activeResources.find(resource =>
            isLeader(resource) &&
            resourceGroup(resource) === group &&
            (fronts.length === 0 || resourceFronts(resource).some(front => fronts.includes(front)))
          ) ||
          activeResources.find(resource =>
            isLeader(resource) &&
            fronts.length > 0 &&
            resourceFronts(resource).some(front => fronts.includes(front))
          );

        return {
          group,
          fronts,
          leader,
          resources: entry.resources.sort(sortForGroup),
        };
      })
      .sort((a, b) => b.resources.length - a.resources.length || a.group.localeCompare(b.group, "pt-BR"));
  }, [activeProjectAllocations, activeResources, currentProject, mode, visibleOperationalResources]);

  const projectGroupCounts = useMemo(() => {
    if (mode !== "project") return groupCounts;
    return projectGroups
      .map(entry => [entry.group, entry.resources.length] as [string, number])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  }, [groupCounts, mode, projectGroups]);

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const setAllGroups = (collapsed: boolean) => {
    const names = mode === "project" ? projectGroups.map(group => group.group) : resourcesByGroup.map(([group]) => group);
    setCollapsedGroups(collapsed ? new Set(names) : new Set());
  };

  const title = mode === "project" && currentProject
    ? `Estrutura do Projeto - ${currentProject.name}`
    : mode === "group"
    ? `Estrutura - ${currentGroup || "Grupo"}`
    : "Estrutura Delivery SAP Cloud ERP";

  return (
    <div className="space-y-4 p-3 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organograma</h1>
          <p className="text-muted-foreground">Visualize a estrutura por time, grupo ou projeto.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex rounded-md border bg-background p-1">
            <Button size="sm" variant={mode === "team" ? "default" : "ghost"} onClick={() => setMode("team")} className="gap-2">
              <Users className="h-4 w-4" /> Time
            </Button>
            <Button size="sm" variant={mode === "group" ? "default" : "ghost"} onClick={() => setMode("group")} className="gap-2">
              <Layers className="h-4 w-4" /> Grupo
            </Button>
            <Button size="sm" variant={mode === "project" ? "default" : "ghost"} onClick={() => setMode("project")} className="gap-2">
              <FolderKanban className="h-4 w-4" /> Projeto
            </Button>
          </div>

          {mode === "group" ? (
            <Select value={currentGroup} onValueChange={setSelectedGroup}>
              <SelectTrigger className="w-full sm:w-[260px]"><SelectValue placeholder="Grupo" /></SelectTrigger>
              <SelectContent>
                {groups.map(group => <SelectItem key={group} value={group}>{group}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : null}

          {mode === "project" ? (
            <Select value={currentProject?.id || ""} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-full sm:w-[260px]"><SelectValue placeholder="Projeto" /></SelectTrigger>
              <SelectContent>
                {activeProjects.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {mode === "project" ? (
            <div className="bg-gradient-to-br from-white via-sky-50 to-blue-300/80 p-4 text-slate-900 sm:p-5">
              <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-start">
                <div className="flex min-w-0 items-start gap-3">
                  <Network className="mt-1 h-7 w-7 shrink-0 text-blue-800" />
                  <div className="min-w-0">
                    <h2 className="text-2xl font-extrabold tracking-tight text-blue-900 sm:text-3xl">{title}</h2>
                    <div className="mt-2 h-1 w-24 bg-sky-300" />
                    {currentProject ? (
                      <p className="mt-2 text-sm font-medium text-slate-600">
                        Cliente: {currentProject.client || "-"} • Gestor: {currentProject.manager || "-"} • {currentProject.startDate} a {currentProject.endDate}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-4 border-blue-800/70 bg-white/30 text-center shadow-inner">
                    <div>
                      <p className="text-2xl font-black text-blue-950">{visibleOperationalResources.length}</p>
                      <p className="text-sm font-extrabold leading-tight text-blue-950">Pessoas<br />dedicadas</p>
                    </div>
                  </div>
                  <div className="hidden text-2xl font-extrabold tracking-[0.35em] text-blue-950 lg:block">TECHBOARD+</div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_0.45fr]">
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Section title="Diretoria" resources={directors} emptyText="Nenhum diretor cadastrado no time." columns="md:grid-cols-2" />
                    <Section title="Gerente do Projeto" resources={projectManagers} emptyText="Nenhum gerente identificado para este projeto." columns="md:grid-cols-2" />
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-blue-900">Grupos e frentes do projeto</h3>
                        <div className="mt-2 h-1 w-44 bg-sky-300" />
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setAllGroups(true)}>Minimizar</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setAllGroups(false)}>Expandir</Button>
                      </div>
                    </div>
                    {projectGroups.length > 0 ? (
                      <div className="grid gap-3">
                        {projectGroups.map(group => (
                          <ProjectGroupPanel
                            key={group.group}
                            group={group.group}
                            fronts={group.fronts}
                            resources={group.resources}
                            leader={group.leader}
                            collapsed={collapsedGroups.has(group.group)}
                            onToggle={() => toggleGroup(group.group)}
                            getSubtitle={getResourceSubtitle}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-sm border border-dashed bg-white/50 p-4 text-sm text-slate-500">Nenhuma pessoa alocada neste projeto.</div>
                    )}
                  </div>
                </div>

                <div className="space-y-4 rounded-sm bg-white/35 p-4">
                  <div>
                    <h3 className="text-xl font-bold text-blue-900">Resumo por grupo</h3>
                    <div className="mt-2 h-1 w-36 bg-sky-300" />
                  </div>
                  {projectGroupCounts.length > 0 ? (
                    <div className="grid gap-3">
                      {projectGroupCounts.map(([group, count]) => (
                        <div key={group} className="flex items-center gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-blue-800/70 bg-white/20 text-lg font-black text-sky-700">
                            {count}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-base font-bold text-blue-900">{group}</p>
                            <p className="text-xs text-blue-900/70">pessoa{count === 1 ? "" : "s"} alocada{count === 1 ? "" : "s"}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-sm border border-dashed bg-white/50 p-4 text-sm text-slate-500">Sem distribuição para este projeto.</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[1180px] bg-gradient-to-br from-white via-sky-50 to-blue-400/80 p-8 text-slate-900">
                <div className="flex items-start justify-between gap-8">
                  <div className="flex items-start gap-3">
                    <Network className="mt-2 h-8 w-8 text-blue-800" />
                    <div>
                      <h2 className="text-4xl font-extrabold tracking-tight text-blue-900">{title}</h2>
                      <div className="mt-4 h-1.5 w-28 bg-sky-300" />
                    </div>
                  </div>
                  <div className="pt-8 text-4xl font-extrabold tracking-[0.35em] text-blue-950">TECHBOARD+</div>
                </div>

                <div className="mt-8 grid grid-cols-[1fr_0.42fr] gap-8">
                  <Section
                    title="Diretoria"
                    resources={directors}
                    emptyText="Nenhum diretor cadastrado no time."
                    columns="md:grid-cols-2 xl:grid-cols-2"
                  />
                  <div className="flex justify-center">
                    <div className="flex h-44 w-44 items-center justify-center rounded-full border-4 border-blue-800/70 bg-white/20 text-center shadow-inner">
                      <div>
                        <p className="text-4xl font-black text-blue-950">{visibleOperationalResources.length}</p>
                        <p className="text-2xl font-extrabold leading-tight text-blue-950">Pessoas<br />dedicadas</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-[1.1fr_0.9fr] gap-8">
                  <div>
                    <div className={`grid gap-8 ${mode === "group" ? "grid-cols-1" : "grid-cols-[0.95fr_1.05fr]"}`}>
                      <Section title="Liderança técnica" resources={leaders} emptyText="Nenhum líder técnico nesta visão." />
                      {mode !== "group" ? (
                        <Section title="Gerentes de Projeto" resources={managers} emptyText="Nenhum gerente nesta visão." />
                      ) : null}
                    </div>

                    <div className="mt-8 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-bold text-blue-900">Consultores por grupo</h3>
                          <div className="mt-2 h-1 w-40 bg-sky-300" />
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setAllGroups(true)}>Minimizar</Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setAllGroups(false)}>Expandir</Button>
                        </div>
                      </div>
                      {resourcesByGroup.length > 0 ? (
                        <div className="grid gap-3">
                          {resourcesByGroup.map(([group, items]) => (
                            <GroupPanel
                              key={group}
                              group={group}
                              resources={items}
                              collapsed={collapsedGroups.has(group)}
                              onToggle={() => toggleGroup(group)}
                              getSubtitle={getResourceSubtitle}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-sm border border-dashed bg-white/50 p-4 text-sm text-slate-500">Nenhum consultor nesta visão.</div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="text-2xl font-bold text-blue-900">Distribuição por grupo</h3>
                      <div className="mt-2 h-1 w-48 bg-sky-300" />
                    </div>
                    {groupCounts.length > 0 ? (
                      groupCounts.map(([group, count]) => (
                        <div key={group} className="flex items-center gap-4">
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-blue-800/70 bg-white/20 text-2xl font-black text-sky-700">
                            {count}
                          </div>
                          <div>
                            <p className="text-lg font-bold text-blue-900">{group}</p>
                            <p className="text-sm text-blue-900/70">pessoa{count === 1 ? "" : "s"} vinculada{count === 1 ? "" : "s"}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-sm border border-dashed bg-white/50 p-4 text-sm text-slate-500">Sem distribuição para esta visão.</div>
                    )}
                  </div>
                </div>

                <div className="mt-10 rounded-lg bg-blue-950 px-6 py-4 text-center text-2xl font-extrabold text-white shadow">
                  Escritório de Projetos TechBoard
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">Time todo</Badge>
        <Badge variant="secondary">Por grupo</Badge>
        <Badge variant="secondary">Por projeto alocado</Badge>
        <span>Use as fotos e o campo Grupo do cadastro de recursos para montar a visão visual.</span>
      </div>
    </div>
  );
}
