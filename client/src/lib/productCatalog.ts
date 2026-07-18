import {
  BarChart3, CalendarOff, CalendarRange, ClipboardCheck, Database, FolderKanban,
  KanbanSquare, LayoutDashboard, ListChecks, Network, Settings, ShieldCheck,
  Users, Workflow,
  type LucideIcon,
} from "lucide-react";
import type { AppTab, UserPermissions } from "../../../shared/types";

export type ProductId = "techboard" | "techlead" | "techmove" | "techtask" | "admin";

export type ProductMenuItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  permission: AppTab;
};

export type ProductDefinition = {
  id: ProductId;
  name: string;
  description: string;
  icon: LucideIcon;
  homePath: string;
  accent: string;
  iconClass: string;
  menus: ProductMenuItem[];
};

export const PRODUCT_CATALOG: Record<ProductId, ProductDefinition> = {
  techboard: {
    id: "techboard", name: "TechBoard", icon: BarChart3, homePath: "/techboard",
    description: "Recursos, projetos, disponibilidade e alocações.",
    accent: "from-blue-600 to-cyan-500", iconClass: "bg-blue-600 text-white",
    menus: [
      { icon: LayoutDashboard, label: "Visão geral", path: "/techboard", permission: "dashboard" },
      { icon: Users, label: "Recursos", path: "/techboard/resources", permission: "resources" },
      { icon: FolderKanban, label: "Projetos", path: "/techboard/projects", permission: "projects" },
      { icon: CalendarOff, label: "Férias e ausências", path: "/techboard/absences", permission: "absences" },
      { icon: CalendarRange, label: "Planner Gantt", path: "/techboard/planner", permission: "planner" },
      { icon: Network, label: "Organograma", path: "/techboard/org-chart", permission: "organogram" },
    ],
  },
  techlead: {
    id: "techlead", name: "TechLead", icon: Users, homePath: "/techlead",
    description: "Liderança, times, trilhas e acompanhamento de entregas.",
    accent: "from-violet-600 to-fuchsia-500", iconClass: "bg-violet-600 text-white",
    menus: [
      { icon: LayoutDashboard, label: "Visão geral", path: "/techlead", permission: "gpChecklist" },
      { icon: ClipboardCheck, label: "Trilha do GP", path: "/techlead/gp-track", permission: "gpChecklist" },
      { icon: Users, label: "Times e frentes", path: "/techlead/teams", permission: "gpChecklist" },
      { icon: BarChart3, label: "Indicadores", path: "/techlead/indicators", permission: "gpChecklist" },
    ],
  },
  techmove: {
    id: "techmove", name: "TechMove", icon: Workflow, homePath: "/techmove",
    description: "Jornada de implementação, escopo, workshops e gaps.",
    accent: "from-emerald-600 to-teal-500", iconClass: "bg-emerald-600 text-white",
    menus: [
      { icon: Workflow, label: "Projetos", path: "/techmove", permission: "techmove" },
      { icon: ListChecks, label: "Itens de escopo", path: "/techmove/scope-items", permission: "techmove" },
      { icon: ClipboardCheck, label: "BDCQ", path: "/techmove/bdcq", permission: "techmove" },
      { icon: Users, label: "Workshops", path: "/techmove/workshops", permission: "techmove" },
      { icon: Database, label: "DCD", path: "/techmove/dcd", permission: "techmove" },
      { icon: BarChart3, label: "Gaps", path: "/techmove/gaps", permission: "techmove" },
      { icon: Settings, label: "Configurações", path: "/techmove/configurations", permission: "techmove" },
      { icon: ClipboardCheck, label: "Testes", path: "/techmove/tests", permission: "techmove" },
    ],
  },
  techtask: {
    id: "techtask", name: "TechTask", icon: KanbanSquare, homePath: "/techtask",
    description: "Kanban, atividades, responsáveis e notificações.",
    accent: "from-orange-500 to-amber-400", iconClass: "bg-orange-500 text-white",
    menus: [
      { icon: LayoutDashboard, label: "Visão geral", path: "/techtask", permission: "activities" },
      { icon: KanbanSquare, label: "Kanban", path: "/techtask/board", permission: "activities" },
      { icon: ListChecks, label: "Meu trabalho", path: "/techtask/my-work", permission: "activities" },
    ],
  },
  admin: {
    id: "admin", name: "Administração", icon: ShieldCheck, homePath: "/admin",
    description: "Usuários, permissões, cadastros e configurações.",
    accent: "from-slate-700 to-slate-500", iconClass: "bg-slate-700 text-white",
    menus: [
      { icon: ShieldCheck, label: "Usuários e permissões", path: "/admin/users", permission: "access" },
      { icon: Database, label: "Cadastros gerais", path: "/admin/registrations", permission: "settings" },
    ],
  },
};

export const PRODUCTS = Object.values(PRODUCT_CATALOG);

export function canViewTab(tab: AppTab, permissions: UserPermissions) {
  const actions = permissions.actions?.[tab];
  return Boolean(permissions[tab] && (!actions || actions.view));
}

export function productForPath(path: string): ProductDefinition | undefined {
  return PRODUCTS.find(product => path === product.homePath || path.startsWith(`${product.homePath}/`));
}

export function canAccessProduct(product: ProductDefinition, permissions: UserPermissions) {
  const explicit = permissions.products?.[product.id];
  if (typeof explicit === "boolean") return explicit;
  return product.menus.some(item => canViewTab(item.permission, permissions));
}

export function firstAccessiblePath(product: ProductDefinition, permissions: UserPermissions) {
  return product.menus.find(item => canViewTab(item.permission, permissions))?.path || product.homePath;
}

export function canAccessPath(path: string, permissions: UserPermissions) {
  if (path === "/") return true;
  const product = productForPath(path);
  if (!product || !canAccessProduct(product, permissions)) return false;
  const matches = product.menus
    .filter(item => path === item.path || path.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length);
  return matches.length === 0 || canViewTab(matches[0].permission, permissions);
}
