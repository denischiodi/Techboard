import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Shield, ShieldCheck, Eye, Users } from "lucide-react";
import type { AppUser, UserRole, UserPermissions } from "../../../shared/types";
import { DEFAULT_PERMISSIONS } from "../../../shared/types";

type AccessAction = 'view' | 'modify' | 'create';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  technical_lead: 'Líder Técnico',
  consultant: 'Consultor',
  viewer: 'Visualizador',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-800 border-red-200',
  manager: 'bg-blue-100 text-blue-800 border-blue-200',
  technical_lead: 'bg-violet-100 text-violet-800 border-violet-200',
  consultant: 'bg-green-100 text-green-800 border-green-200',
  viewer: 'bg-gray-100 text-gray-800 border-gray-200',
};

const TAB_LABELS = {
  dashboard: 'Dashboard',
  resources: 'Recursos',
  projects: 'Projetos',
  absences: 'Férias/Ausências',
  planner: 'Planner Gantt',
  activities: 'Atividades',
  gpChecklist: 'Trilha do GP',
  organogram: 'Organograma',
  techmove: 'TechMove',
  access: 'Gestão de Acesso',
  settings: 'Cadastros e Configurações',
} as const;

type AccessTab = keyof typeof TAB_LABELS;
type AccessLevelMatrix = Record<AccessTab, Record<AccessAction, boolean>>;
type RoleFilter = 'all' | UserRole;

const ACCESS_ACTION_LABELS: Record<AccessAction, string> = {
  view: 'Exibir',
  modify: 'Modificar',
  create: 'Criar',
};

const DEFAULT_ACCESS_LEVELS: Record<UserRole, AccessLevelMatrix> = {
  admin: {
    dashboard: { view: true, modify: true, create: true },
    resources: { view: true, modify: true, create: true },
    projects: { view: true, modify: true, create: true },
    absences: { view: true, modify: true, create: true },
    planner: { view: true, modify: true, create: true },
    activities: { view: true, modify: true, create: true },
    gpChecklist: { view: true, modify: true, create: true },
    organogram: { view: true, modify: true, create: true },
    techmove: { view: true, modify: true, create: true },
    access: { view: true, modify: true, create: true },
    settings: { view: true, modify: true, create: true },
  },
  manager: {
    dashboard: { view: true, modify: false, create: false },
    resources: { view: true, modify: true, create: false },
    projects: { view: true, modify: true, create: true },
    absences: { view: true, modify: true, create: true },
    planner: { view: true, modify: true, create: true },
    activities: { view: true, modify: true, create: true },
    gpChecklist: { view: true, modify: true, create: true },
    organogram: { view: true, modify: false, create: false },
    techmove: { view: true, modify: true, create: true },
    access: { view: false, modify: false, create: false },
    settings: { view: true, modify: true, create: true },
  },
  technical_lead: {
    dashboard: { view: true, modify: false, create: false },
    resources: { view: true, modify: false, create: false },
    projects: { view: false, modify: false, create: false },
    absences: { view: true, modify: true, create: true },
    planner: { view: true, modify: true, create: true },
    activities: { view: true, modify: true, create: true },
    gpChecklist: { view: false, modify: false, create: false },
    organogram: { view: true, modify: false, create: false },
    techmove: { view: true, modify: true, create: true },
    access: { view: false, modify: false, create: false },
    settings: { view: false, modify: false, create: false },
  },
  consultant: {
    dashboard: { view: false, modify: false, create: false },
    resources: { view: true, modify: false, create: false },
    projects: { view: false, modify: false, create: false },
    absences: { view: true, modify: false, create: false },
    planner: { view: true, modify: false, create: false },
    activities: { view: true, modify: true, create: true },
    gpChecklist: { view: false, modify: false, create: false },
    organogram: { view: false, modify: false, create: false },
    techmove: { view: true, modify: true, create: true },
    access: { view: false, modify: false, create: false },
    settings: { view: false, modify: false, create: false },
  },
  viewer: {
    dashboard: { view: true, modify: false, create: false },
    resources: { view: false, modify: false, create: false },
    projects: { view: false, modify: false, create: false },
    absences: { view: false, modify: false, create: false },
    planner: { view: true, modify: false, create: false },
    activities: { view: false, modify: false, create: false },
    gpChecklist: { view: false, modify: false, create: false },
    organogram: { view: true, modify: false, create: false },
    techmove: { view: false, modify: false, create: false },
    access: { view: false, modify: false, create: false },
    settings: { view: false, modify: false, create: false },
  },
};

const ACCESS_TABS = Object.keys(TAB_LABELS) as AccessTab[];

function levelsFromPermissions(role: UserRole, permissions: UserPermissions): AccessLevelMatrix {
  return ACCESS_TABS.reduce((acc, tab) => {
    acc[tab] = permissions[tab]
      ? { ...(permissions.actions?.[tab] || DEFAULT_ACCESS_LEVELS[role][tab]), view: true }
      : { view: false, modify: false, create: false };
    return acc;
  }, {} as AccessLevelMatrix);
}

function permissionsFromLevels(levels: AccessLevelMatrix, previous: UserPermissions): UserPermissions {
  const permissions = ACCESS_TABS.reduce((acc, tab) => {
    acc[tab] = levels[tab].view || levels[tab].modify || levels[tab].create;
    return acc;
  }, { ...previous });
  permissions.actions = Object.fromEntries(ACCESS_TABS.map(tab => [tab, { ...levels[tab] }]));
  permissions.products = {
    techboard: permissions.dashboard || permissions.resources || permissions.projects || permissions.absences || permissions.planner || permissions.organogram,
    techlead: permissions.gpChecklist,
    techmove: permissions.techmove,
    techtask: permissions.activities,
    admin: permissions.access || permissions.settings,
  };
  return permissions;
}

function cloneAccessLevels(levels: AccessLevelMatrix): AccessLevelMatrix {
  return ACCESS_TABS.reduce((acc, tab) => {
    acc[tab] = { ...levels[tab] };
    return acc;
  }, {} as AccessLevelMatrix);
}

function cloneAllGroupLevels() {
  return (Object.keys(DEFAULT_ACCESS_LEVELS) as UserRole[]).reduce((acc, role) => {
    acc[role] = cloneAccessLevels(DEFAULT_ACCESS_LEVELS[role]);
    return acc;
  }, {} as Record<UserRole, AccessLevelMatrix>);
}

function summarizeAccessLevels(levels: AccessLevelMatrix, tab: AccessTab) {
  const enabled = (Object.keys(ACCESS_ACTION_LABELS) as AccessAction[])
    .filter(action => levels[tab]?.[action])
    .map(action => ACCESS_ACTION_LABELS[action]);
  return enabled.length > 0 ? enabled : ['Sem acesso'];
}

export default function Access() {
  const utils = trpc.useUtils();
  const { data: users = [], isLoading } = trpc.access.list.useQuery();
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const { data: lookups } = trpc.settings.getLookups.useQuery();
  const fronts = lookups?.fronts?.filter(item => item.active).map(item => item.value) || [];
  const createUser = trpc.access.create.useMutation({
    onSuccess: () => { utils.access.list.invalidate(); toast.success("Usuário criado!"); setDialogOpen(false); },
    onError: () => toast.error("Erro ao criar usuário"),
  });
  const updateUser = trpc.access.update.useMutation({
    onSuccess: () => { utils.access.list.invalidate(); toast.success("Usuário atualizado!"); setDialogOpen(false); },
    onError: () => toast.error("Erro ao atualizar usuário"),
  });
  const updateGroupUser = trpc.access.update.useMutation();
  const deleteUser = trpc.access.delete.useMutation({
    onSuccess: () => { utils.access.list.invalidate(); toast.success("Usuário removido!"); },
    onError: () => toast.error("Erro ao remover usuário"),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editingGroup, setEditingGroup] = useState<UserRole>('consultant');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [groupPermissionLevels, setGroupPermissionLevels] = useState<Record<UserRole, AccessLevelMatrix>>(cloneAllGroupLevels);
  const [groupFormLevels, setGroupFormLevels] = useState<AccessLevelMatrix>(cloneAccessLevels(DEFAULT_ACCESS_LEVELS.consultant));
  const [groupLevelsLoaded, setGroupLevelsLoaded] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'consultant' as UserRole,
    permissions: { ...DEFAULT_PERMISSIONS.consultant },
    active: true,
    resourceId: '',
    teamFronts: [] as string[],
  });

  useEffect(() => {
    if (groupLevelsLoaded || users.length === 0) return;
    setGroupPermissionLevels(() => {
      const next = cloneAllGroupLevels();
      (Object.keys(ROLE_LABELS) as UserRole[]).forEach(role => {
        const sampleUser = users.find((user: AppUser) => user.role === role);
        if (sampleUser) {
          next[role] = levelsFromPermissions(role, { ...DEFAULT_PERMISSIONS[role], ...sampleUser.permissions });
        }
      });
      return next;
    });
    setGroupLevelsLoaded(true);
  }, [groupLevelsLoaded, users]);

  const roleCounts = useMemo(() => {
    return users.reduce((acc: Record<UserRole, number>, user: AppUser) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, { admin: 0, manager: 0, technical_lead: 0, consultant: 0, viewer: 0 });
  }, [users]);

  const filteredUsers = useMemo(() => {
    if (roleFilter === 'all') return users;
    return users.filter((user: AppUser) => user.role === roleFilter);
  }, [users, roleFilter]);

  const openCreate = () => {
    setEditingUser(null);
    setForm({
      name: '',
      email: '',
      role: 'consultant',
      permissions: permissionsFromLevels(groupPermissionLevels.consultant, DEFAULT_PERMISSIONS.consultant),
      active: true,
      resourceId: '',
      teamFronts: [],
    });
    setDialogOpen(true);
  };

  const openEdit = (user: AppUser) => {
    setEditingUser(user);
    setForm({
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: { ...DEFAULT_PERMISSIONS[user.role], ...user.permissions },
      active: user.active,
      resourceId: user.resourceId || '',
      teamFronts: user.teamFronts || [],
    });
    setDialogOpen(true);
  };

  const handleRoleChange = (role: UserRole) => {
    setForm(prev => ({
      ...prev,
      role,
      permissions: permissionsFromLevels(groupPermissionLevels[role], DEFAULT_PERMISSIONS[role]),
      teamFronts: role === 'technical_lead' ? prev.teamFronts : [],
    }));
  };

  const toggleTeamFront = (front: string) => {
    setForm(prev => ({
      ...prev,
      teamFronts: prev.teamFronts.includes(front)
        ? prev.teamFronts.filter(item => item !== front)
        : [...prev.teamFronts, front],
    }));
  };

  const openGroupPermissions = (role: UserRole) => {
    setEditingGroup(role);
    setGroupFormLevels(cloneAccessLevels(groupPermissionLevels[role]));
    setGroupDialogOpen(true);
  };

  const toggleGroupAccessLevel = (tab: AccessTab, action: AccessAction) => {
    if (tab === 'access' && editingGroup !== 'admin') return;
    setGroupFormLevels(prev => ({
      ...prev,
      [tab]: (() => {
        const current = prev[tab];
        const next = { ...current, [action]: !current[action] };
        if (action === 'view' && !next.view) {
          next.modify = false;
          next.create = false;
        }
        if ((action === 'modify' || action === 'create') && next[action]) {
          next.view = true;
        }
        return next;
      })(),
    }));
  };

  const handleSaveGroupPermissions = async () => {
    const nextLevels = cloneAccessLevels(groupFormLevels);
    const nextPermissions = permissionsFromLevels(nextLevels, DEFAULT_PERMISSIONS[editingGroup]);
    const usersInGroup = users.filter((user: AppUser) => user.role === editingGroup);

    try {
      await Promise.all(usersInGroup.map((user: AppUser) => updateGroupUser.mutateAsync({
        id: user.id,
        permissions: nextPermissions,
      })));
      setGroupPermissionLevels(prev => ({ ...prev, [editingGroup]: nextLevels }));
      await utils.access.list.invalidate();
      toast.success(`Permissões do grupo ${ROLE_LABELS[editingGroup]} atualizadas!`);
      setGroupDialogOpen(false);
    } catch {
      toast.error("Erro ao atualizar permissões do grupo");
    }
  };

  const handleSave = () => {
    if (!form.name || !form.email) {
      toast.error("Nome e email são obrigatórios");
      return;
    }
    const groupPermissions = permissionsFromLevels(groupPermissionLevels[form.role], DEFAULT_PERMISSIONS[form.role]);
    if (editingUser) {
      updateUser.mutate({
        id: editingUser.id,
        name: form.name,
        email: form.email,
        role: form.role,
        permissions: groupPermissions,
        active: form.active,
        resourceId: form.resourceId,
        teamFronts: form.teamFronts,
      });
    } else {
      createUser.mutate({
        name: form.name,
        email: form.email,
        role: form.role,
        permissions: groupPermissions,
        resourceId: form.resourceId,
        teamFronts: form.teamFronts,
      });
    }
  };

  const handleDelete = (user: AppUser) => {
    if (user.role === 'admin') {
      toast.error("Não é possível remover um administrador");
      return;
    }
    if (confirm(`Deseja remover o usuário "${user.name}"?`)) {
      deleteUser.mutate({ id: user.id });
    }
  };

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'admin': return <ShieldCheck className="h-4 w-4" />;
      case 'manager': return <Shield className="h-4 w-4" />;
      case 'technical_lead': return <Users className="h-4 w-4" />;
      case 'consultant': return <Users className="h-4 w-4" />;
      case 'viewer': return <Eye className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestão de Acesso</h1>
          <p className="text-muted-foreground text-sm mt-1">Controle por grupo, usuário e nível de ação por aba</p>
        </div>
        <Button onClick={openCreate} className="w-full gap-2 sm:w-auto">
          <Plus className="h-4 w-4" /> Adicionar Pessoa
        </Button>
      </div>

      {/* Access Groups */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grupos de Acesso</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([role, label]) => {
              const enabledTabs = ACCESS_TABS.filter(tab => groupPermissionLevels[role][tab].view);
              return (
                <button
                  key={role}
                  type="button"
                  className={`rounded-lg border bg-background p-3 text-left transition hover:border-primary/50 ${roleFilter === role ? 'border-primary ring-2 ring-primary/20' : ''}`}
                  onClick={() => setRoleFilter(roleFilter === role ? 'all' : role)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className={`${ROLE_COLORS[role]} text-xs`}>
                      {getRoleIcon(role)}
                      <span className="ml-1">{label}</span>
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={(event) => {
                        event.stopPropagation();
                        openGroupPermissions(role);
                      }}
                    >
                      Permissões
                    </Button>
                  </div>
                  <div className="mt-3 text-2xl font-bold">{roleCounts[role]}</div>
                  <p className="text-xs text-muted-foreground">pessoa(s) neste grupo</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {enabledTabs.slice(0, 3).map(tab => (
                      <Badge key={tab} variant="secondary" className="text-[10px]">{TAB_LABELS[tab]}</Badge>
                    ))}
                    {enabledTabs.length > 3 && <Badge variant="secondary" className="text-[10px]">+{enabledTabs.length - 3}</Badge>}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Role Legend */}
      <div className="flex flex-wrap gap-3">
        {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([role, label]) => (
          <button
            key={role}
            type="button"
            className={`rounded-md transition-opacity hover:opacity-80 ${roleFilter === role ? 'ring-2 ring-primary ring-offset-2' : ''}`}
            onClick={() => setRoleFilter(roleFilter === role ? 'all' : role)}
            aria-label={`Filtrar por ${label}`}
          >
            <Badge variant="outline" className={`${ROLE_COLORS[role]} text-xs`}>
              {getRoleIcon(role)}
              <span className="ml-1">{label}</span>
              <span className="ml-1 rounded bg-white/60 px-1">{roleCounts[role]}</span>
            </Badge>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-2 sm:w-72">
          <Label>Tipo de acesso</Label>
          <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as RoleFilter)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os acessos ({users.length})</SelectItem>
              {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([role, label]) => (
                <SelectItem key={role} value={role}>{label} ({roleCounts[role]})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Exibindo <span className="font-medium text-foreground">{filteredUsers.length}</span> de {users.length} usuário(s)
          </p>
          {roleFilter !== 'all' && (
            <Button type="button" variant="outline" size="sm" onClick={() => setRoleFilter('all')}>
              Limpar filtro
            </Button>
          )}
        </div>
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Grupo de acesso</TableHead>
                {ACCESS_TABS.map(tab => <TableHead key={tab} className="min-w-[120px] text-center">{TAB_LABELS[tab]}</TableHead>)}
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={ACCESS_TABS.length + 5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow><TableCell colSpan={ACCESS_TABS.length + 5} className="text-center py-8 text-muted-foreground">Nenhum usuário encontrado para este tipo de acesso.</TableCell></TableRow>
              ) : (
                filteredUsers.map((user: AppUser) => (
                  <TableRow key={user.id} className={!user.active ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`${ROLE_COLORS[user.role]} text-xs`}>
                        {getRoleIcon(user.role)}
                        <span className="ml-1">{ROLE_LABELS[user.role]}</span>
                      </Badge>
                    </TableCell>
                    {ACCESS_TABS.map(tab => (
                      <TableCell key={tab} className="text-center">
                        <div className="flex flex-wrap justify-center gap-1">
                          {summarizeAccessLevels(levelsFromPermissions(user.role, { ...DEFAULT_PERMISSIONS[user.role], ...user.permissions }), tab).map(label => (
                            <Badge
                              key={label}
                              variant={label === 'Sem acesso' ? 'secondary' : 'outline'}
                              className={`text-[10px] ${label === 'Sem acesso' ? 'text-muted-foreground' : 'border-green-200 bg-green-50 text-green-700'}`}
                            >
                              {label}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    ))}
                    <TableCell className="text-center">
                      <Badge variant={user.active ? "default" : "secondary"} className="text-xs">
                        {user.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(user)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700" onClick={() => handleDelete(user)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar Pessoa e Grupo' : 'Adicionar Pessoa ao Grupo'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Nome completo" />
              </div>
              <div className="min-w-0 space-y-2">
                <Label>Email *</Label>
                <Input value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} placeholder="email@empresa.com" type="email" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Grupo de acesso</Label>
                <Select value={form.role} onValueChange={(v) => handleRoleChange(v as UserRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="manager">Gerente</SelectItem>
                    <SelectItem value="technical_lead">Líder Técnico</SelectItem>
                    <SelectItem value="consultant">Consultor</SelectItem>
                    <SelectItem value="viewer">Visualizador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editingUser && (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="flex items-center gap-2 pt-2">
                    <Switch checked={form.active} onCheckedChange={v => setForm(prev => ({ ...prev, active: v }))} />
                    <span className="text-sm">{form.active ? 'Ativo' : 'Inativo'}</span>
                  </div>
                </div>
              )}
            </div>

            {(form.role === 'consultant' || form.role === 'technical_lead') && (
              <div className="space-y-2">
                <Label>Colaborador vinculado</Label>
                <Select value={form.resourceId || 'none'} onValueChange={v => setForm(prev => ({ ...prev, resourceId: v === 'none' ? '' : v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o colaborador..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem vínculo</SelectItem>
                    {resources.map((resource: any) => (
                      <SelectItem key={resource.id} value={resource.id}>{resource.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Consultor vê somente este cadastro, férias e alocações. Líder também pode usar este vínculo como parte do próprio time.
                </p>
              </div>
            )}

            {form.role === 'technical_lead' && (
              <div className="space-y-2">
                <Label>Frentes do time</Label>
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3">
                  {fronts.map(front => (
                    <label key={front} className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={form.teamFronts.includes(front)}
                        onCheckedChange={() => toggleTeamFront(front)}
                      />
                      <span>{front}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  O líder verá Recursos, Planner e Férias somente das frentes selecionadas.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createUser.isPending || updateUser.isPending}>
              {(createUser.isPending || updateUser.isPending) ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Permissions Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl">
          <DialogHeader>
            <DialogTitle>Permissões do Grupo - {ROLE_LABELS[editingGroup]}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Configure uma vez o que este grupo pode exibir, modificar ou criar. Depois, basta adicionar a pessoa ao grupo.
            </p>
            <div className="overflow-x-auto rounded-lg border bg-muted/30">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[170px]">Aba</TableHead>
                    {(Object.keys(ACCESS_ACTION_LABELS) as AccessAction[]).map(action => (
                      <TableHead key={action} className="min-w-[110px] text-center">
                        {ACCESS_ACTION_LABELS[action]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ACCESS_TABS.map(tab => (
                    <TableRow key={tab}>
                      <TableCell className="font-medium">{TAB_LABELS[tab]}</TableCell>
                      {(Object.keys(ACCESS_ACTION_LABELS) as AccessAction[]).map(action => {
                        const disabled = tab === 'access' && editingGroup !== 'admin';
                        return (
                          <TableCell key={action} className="text-center">
                            <Switch
                              checked={!!groupFormLevels[tab][action]}
                              onCheckedChange={() => toggleGroupAccessLevel(tab, action)}
                              disabled={disabled}
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              Gestão de Acesso só pode ser liberada para o grupo Administrador. Alterações neste grupo serão aplicadas às pessoas já cadastradas nele.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveGroupPermissions} disabled={updateGroupUser.isPending}>
              {updateGroupUser.isPending ? 'Salvando...' : 'Salvar permissões'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
