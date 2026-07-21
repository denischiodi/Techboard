import {
  BarChart3, CalendarOff, CalendarRange, ClipboardCheck, Database, FolderKanban,
  KanbanSquare, LayoutDashboard, ListChecks, Network, Settings, ShieldCheck,
  Users, Workflow,
  type LucideIcon,
} from "lucide-react";
import type { AppScreen, AppTab, UserPermissions } from "../../../shared/types";

export type ProductId = "techboard" | "techlead" | "techmove" | "techtask" | "admin";

export type ProductMenuItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  permission: AppTab;
  accessKey: AppScreen;
};

export type ProductDefinition = {
  id: ProductId;
  name: string;
  logoPath: string;
  description: string;
  icon: LucideIcon;
  homePath: string;
  accent: string;
  iconClass: string;
  menus: ProductMenuItem[];
};

export const PRODUCT_CATALOG: Record<ProductId, ProductDefinition> = {
  techboard: {
    id: "techboard", name: "TechBoard", logoPath: "/techboard-logo.png", icon: BarChart3, homePath: "/techboard",
    description: "Recursos, projetos, disponibilidade e alocações.",
    accent: "from-blue-600 to-cyan-500", iconClass: "bg-blue-600 text-white",
    menus: [
      { icon: LayoutDashboard, label: "Visão geral", path: "/techboard", permission: "dashboard", accessKey: "techboard.overview" },
      { icon: Users, label: "Recursos", path: "/techboard/resources", permission: "resources", accessKey: "techboard.resources" },
      { icon: FolderKanban, label: "Projetos", path: "/techboard/projects", permission: "projects", accessKey: "techboard.projects" },
      { icon: CalendarOff, label: "Férias e ausências", path: "/techboard/absences", permission: "absences", accessKey: "techboard.absences" },
      { icon: CalendarRange, label: "Planner Gantt", path: "/techboard/planner", permission: "planner", accessKey: "techboard.planner" },
      { icon: Network, label: "Organograma", path: "/techboard/org-chart", permission: "organogram", accessKey: "techboard.organogram" },
    ],
  },
  techlead: {
    id: "techlead", name: "TechLead", logoPath: "/techlead-logo.svg", icon: Users, homePath: "/techlead",
    description: "Liderança, times, trilhas e acompanhamento de entregas.",
    accent: "from-violet-600 to-fuchsia-500", iconClass: "bg-violet-600 text-white",
    menus: [
      { icon: LayoutDashboard, label: "Visão geral", path: "/techlead", permission: "gpChecklist", accessKey: "techlead.overview" },
      { icon: ClipboardCheck, label: "Trilha do GP", path: "/techlead/gp-track", permission: "gpChecklist", accessKey: "techlead.gpTrack" },
      { icon: Users, label: "Times e frentes", path: "/techlead/teams", permission: "gpChecklist", accessKey: "techlead.teams" },
      { icon: BarChart3, label: "Indicadores", path: "/techlead/indicators", permission: "gpChecklist", accessKey: "techlead.indicators" },
    ],
  },
  techmove: {
    id: "techmove", name: "TechMove", logoPath: "/techmove-logo.svg", icon: Workflow, homePath: "/techmove",
    description: "Jornada de implementação, escopo, workshops e gaps.",
    accent: "from-emerald-600 to-teal-500", iconClass: "bg-emerald-600 text-white",
    menus: [
      { icon: Workflow, label: "Projetos", path: "/techmove", permission: "techmove", accessKey: "techmove.projects" },
      { icon: ListChecks, label: "Itens de escopo", path: "/techmove/scope-items", permission: "techmove", accessKey: "techmove.scopeItems" },
      { icon: ClipboardCheck, label: "BDCQ", path: "/techmove/bdcq", permission: "techmove", accessKey: "techmove.bdcq" },
      { icon: Users, label: "Workshops", path: "/techmove/workshops", permission: "techmove", accessKey: "techmove.workshops" },
      { icon: Database, label: "DCD", path: "/techmove/dcd", permission: "techmove", accessKey: "techmove.dcd" },
      { icon: BarChart3, label: "Gaps", path: "/techmove/gaps", permission: "techmove", accessKey: "techmove.gaps" },
      { icon: Settings, label: "Configurações", path: "/techmove/configurations", permission: "techmove", accessKey: "techmove.configurations" },
      { icon: ClipboardCheck, label: "Testes", path: "/techmove/tests", permission: "techmove", accessKey: "techmove.tests" },
      { icon: ShieldCheck, label: "Governança", path: "/techmove/governance", permission: "techmove", accessKey: "techmove.governance" },
    ],
  },
  techtask: {
    id: "techtask", name: "TechTask", logoPath: "/techtask-logo.svg", icon: KanbanSquare, homePath: "/techtask",
    description: "Kanban, atividades, responsáveis e notificações.",
    accent: "from-orange-500 to-amber-400", iconClass: "bg-orange-500 text-white",
    menus: [
      { icon: LayoutDashboard, label: "Visão geral", path: "/techtask", permission: "activities", accessKey: "techtask.overview" },
      { icon: KanbanSquare, label: "Kanban", path: "/techtask/board", permission: "activities", accessKey: "techtask.board" },
      { icon: ListChecks, label: "Meu trabalho", path: "/techtask/my-work", permission: "activities", accessKey: "techtask.myWork" },
    ],
  },
  admin: {
    id: "admin", name: "Administração", logoPath: "/techadmin-logo.svg", icon: ShieldCheck, homePath: "/admin",
    description: "Usuários, permissões, cadastros e configurações.",
    accent: "from-slate-700 to-slate-500", iconClass: "bg-slate-700 text-white",
    menus: [
      { icon: LayoutDashboard, label: "Visão geral", path: "/admin", permission: "access", accessKey: "admin.overview" },
      { icon: ShieldCheck, label: "Usuários e permissões", path: "/admin/users", permission: "access", accessKey: "admin.users" },
      { icon: Database, label: "Cadastros gerais", path: "/admin/registrations", permission: "settings", accessKey: "admin.registrations" },
      { icon: Settings, label: "Configurações padrão", path: "/admin/standards", permission: "access", accessKey: "admin.standards" },
    ],
  },
};

export const PRODUCTS = Object.values(PRODUCT_CATALOG);

export function canViewTab(tab: AppTab, permissions: UserPermissions) {
  const actions = permissions.actions?.[tab];
  return Boolean(permissions[tab] && (!actions || actions.view));
}

export function canViewMenuItem(item: ProductMenuItem, permissions: UserPermissions) {
  const screenActions = permissions.actions?.[item.accessKey];
  if (screenActions) return Boolean(screenActions.view);
  return canViewTab(item.permission, permissions);
}

export function productForPath(path: string): ProductDefinition | undefined {
  return PRODUCTS.find(product => path === product.homePath || path.startsWith(`${product.homePath}/`));
}

export function canAccessProduct(product: ProductDefinition, permissions: UserPermissions) {
  const explicit = permissions.products?.[product.id];
  if (typeof explicit === "boolean") return explicit;
  return product.menus.some(item => canViewMenuItem(item, permissions));
}

export function firstAccessiblePath(product: ProductDefinition, permissions: UserPermissions) {
  return product.menus.find(item => canViewMenuItem(item, permissions))?.path || product.homePath;
}

export function canAccessPath(path: string, permissions: UserPermissions) {
  if (path === "/") return true;
  const product = productForPath(path);
  if (!product || !canAccessProduct(product, permissions)) return false;
  const matches = product.menus
    .filter(item => path === item.path || path.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length);
  return matches.length === 0 || canViewMenuItem(matches[0], permissions);
}
