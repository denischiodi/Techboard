// ===== Shared Types for Delivery Resource Planner =====

// Configurable lookup types (managed via Settings page)
export type ResourceProfile = string;
export type ResourceFront = string;
export type ResourceStatus = string;
export type ProjectStatus = string;
export type ProjectPhase = string;
export type AbsenceType = string;
export type AllocationType = string;
export type AllocationStatus = string;

// Lookup item for configurable lists
export interface LookupItem {
  id: string;
  value: string;
  active: boolean;
}

// All configurable lookup categories
export interface LookupConfig {
  profiles: LookupItem[];
  fronts: LookupItem[];
  resourceStatuses: LookupItem[];
  projectStatuses: LookupItem[];
  absenceTypes: LookupItem[];
  allocationTypes: LookupItem[];
  allocationStatuses: LookupItem[];
  contractTypes: LookupItem[];
  dashboardCheckStatuses: LookupItem[];
}

export interface Resource {
  id: string;
  name: string;
  email: string;
  photoUrl?: string;
  group?: string; // management/grouping area for org chart
  profile: ResourceProfile;
  front: ResourceFront; // legacy single front (kept for backward compat)
  fronts: ResourceFront[]; // multiple fronts (primary field)
  dailyCapacity: number; // hours
  status: ResourceStatus;
  birthDate: string; // ISO date
  startDate: string; // ISO date - data de início na consultoria
  endDate: string; // ISO date - data fim na consultoria (vazio se ainda ativo)
  contractType: string; // CLT, PJ, etc.
  vacationDaysEntitled: number; // dias de férias de direito por ano
  skipAllocationCheck?: boolean; // permite alocações sobrepostas no mesmo projeto/frente
  notes: string;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  manager: string;
  status: ProjectStatus;
  startDate: string; // ISO date
  endDate: string; // ISO date
  fronts: ResourceFront[]; // frentes necessárias no projeto
  notes: string;
}

export interface Phase {
  id: string;
  projectId: string;
  phase: ProjectPhase;
  startDate: string;
  endDate: string;
  responsible: string;
  completionPercent: number;
  status: string;
  notes: string;
}

export interface Absence {
  id: string;
  resourceId: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  daysCount?: number;
  approved: boolean;
  notes: string;
}

export interface Allocation {
  id: string;
  resourceId: string;
  projectId: string;
  phaseId: string;
  front: ResourceFront;
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  allocationType: AllocationType;
  status: AllocationStatus;
  notes: string;
  clippedEndDate?: string;
}

// ===== Access Control Types =====

export type AppTab = 'dashboard' | 'resources' | 'projects' | 'absences' | 'planner' | 'organogram' | 'techmove' | 'access' | 'settings';

export type UserRole = 'admin' | 'manager' | 'technical_lead' | 'consultant' | 'viewer';

export interface UserPermissions {
  dashboard: boolean;
  resources: boolean;
  projects: boolean;
  absences: boolean;
  planner: boolean;
  organogram: boolean;
  techmove: boolean;
  access: boolean; // only admin can manage access
  settings: boolean;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  permissions: UserPermissions;
  active: boolean;
  resourceId?: string;
  teamFronts?: ResourceFront[];
}

export interface ProjectFrontGap {
  front: ResourceFront;
  gapStart: string;
  gapEnd: string;
  reason: string;
  resourceId?: string;
  resourceName?: string;
  allocationId?: string;
}

export interface ProjectMissingFrontsAlert {
  projectId: string;
  projectName: string;
  missingFronts: ResourceFront[];
  gaps: ProjectFrontGap[];
}

export interface ResourceEndDateImpact {
  projectId: string;
  projectName: string;
  front: ResourceFront;
  allocationEnd: string;
  projectEnd: string;
  impactStart: string;
  impactEnd: string;
  reason: string;
}

export interface ResourceEndDateAlert {
  resourceId: string;
  resourceName: string;
  endDate: string;
  affectedProjects: ResourceEndDateImpact[];
}

export const DEFAULT_PERMISSIONS: Record<UserRole, UserPermissions> = {
  admin: { dashboard: true, resources: true, projects: true, absences: true, planner: true, organogram: true, techmove: true, access: true, settings: true },
  manager: { dashboard: true, resources: true, projects: true, absences: true, planner: true, organogram: true, techmove: true, access: false, settings: true },
  technical_lead: { dashboard: false, resources: true, projects: false, absences: true, planner: true, organogram: true, techmove: true, access: false, settings: false },
  consultant: { dashboard: false, resources: true, projects: false, absences: true, planner: true, organogram: false, techmove: true, access: false, settings: false },
  viewer: { dashboard: true, resources: false, projects: false, absences: false, planner: true, organogram: true, techmove: false, access: false, settings: false },
};

export type TechMovePhase = 'prepare' | 'explore';
export type TechMoveQuestionLevel = 'L2 Cliente' | 'L3 Consultor';
export type TechMoveQuestionStatus = 'Pendente' | 'Respondido' | 'Validado' | 'Gap';

export interface TechMoveScopeItem {
  id: string;
  module: ResourceFront;
  code: string;
  name: string;
  processArea: string;
  description?: string;
  documentRef?: string;
  consultantId?: string;
  consultantName?: string;
  active: boolean;
}

export interface TechMoveQuestion {
  id: string;
  module: ResourceFront;
  scopeItemCodes: string[];
  level: TechMoveQuestionLevel;
  category: string;
  text: string;
  objective?: string;
  answerType?: 'Texto' | 'Sim/Nao' | 'Lista' | 'Data' | 'Numero' | 'Anexo';
  ownerRole?: 'Cliente' | 'Consultor' | 'Arquiteto' | 'PM' | 'Diretor Delivery';
  required?: boolean;
  gapTrigger?: string;
  answer: string;
  evidence: string;
  status: TechMoveQuestionStatus;
  reusable: boolean;
  global?: boolean;
  client?: string;
}

export interface TechMoveWorkshop {
  id: string;
  module: ResourceFront;
  fronts?: ResourceFront[];
  scopeItemCodes?: string[];
  title: string;
  date: string;
  durationMinutes?: number;
  roles?: string[];
  script?: string;
  participants: string;
  transcript: string;
  decisions: string;
  minutes?: string;
  completed?: boolean;
}

export interface TechMoveGap {
  id: string;
  module: ResourceFront;
  scopeItemCode: string;
  title: string;
  description: string;
  impact: string;
  severity: 'Baixo' | 'Medio' | 'Alto' | 'Critico';
  status: 'Aberto' | 'Em analise' | 'Aprovado' | 'Rejeitado';
  resolutionType?: string;
  resolution?: string;
  effort?: string;
  assignedTo?: string;
  dueDate?: string;
}

export interface TechMoveConfiguration {
  id: string;
  module: ResourceFront;
  scopeItemCode: string;
  title: string;
  description: string;
  path: string;
  owner: string;
  priority: 'Baixa' | 'Normal' | 'Alta';
  status: 'Pendente' | 'Em andamento' | 'Concluido' | 'Bloqueado';
}

export interface TechMoveData {
  projectId: string;
  phase: TechMovePhase;
  scopeItems: TechMoveScopeItem[];
  bdcqCatalog?: TechMoveQuestion[];
  questions: TechMoveQuestion[];
  workshops: TechMoveWorkshop[];
  gaps: TechMoveGap[];
  configurations?: TechMoveConfiguration[];
  dcdDraft: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalResources: number;
  activeResources: number;
  totalProjects: number;
  activeProjects: number;
  weeklyAllocatedHours: number;
  overallocatedResources: number;
  availableResources: number;
  onLeaveResources: number;
  projectsByPhase: Record<ProjectPhase, number>;
  unallocatedResources: Array<string | { id: string; name: string }>; // recursos sem alocação na semana
  projectsMissingFronts: ProjectMissingFrontsAlert[];
  resourceEndDateAlerts: ResourceEndDateAlert[];
  upcomingBirthdays: { resourceId: string; resourceName: string; date: string; daysUntil: number }[];
}
