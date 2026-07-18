import { Resource, Project, Phase, Absence, Allocation, LookupItem } from '../shared/types';
import { addDays } from 'date-fns/addDays';
import { format } from 'date-fns/format';
import { startOfWeek } from 'date-fns/startOfWeek';
import type { AppUser } from '../shared/types';

// Use current week's Monday so data appears immediately
const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

// Get current month/day for birthday alert demo
const now = new Date();
const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
const nearDay = String(Math.min(now.getDate() + 3, 28)).padStart(2, '0');

// ===== RESOURCES =====
export let resources: Resource[] = [
  { id: 'r1', name: 'Pedro Silva', email: 'pedro.silva@consultoria.com', profile: 'Funcional', front: 'MM', fronts: ['MM'], dailyCapacity: 8, status: 'Ativo', birthDate: `1990-${currentMonth}-${nearDay}`, startDate: '2020-01-10', endDate: '', contractType: 'CLT', vacationDaysEntitled: 30, notes: 'Especialista em MM' },
  { id: 'r2', name: 'Maria Santos', email: 'maria.santos@consultoria.com', profile: 'Funcional', front: 'SD', fronts: ['SD'], dailyCapacity: 8, status: 'Ativo', birthDate: '1988-07-22', startDate: '2019-06-01', endDate: '', contractType: 'CLT', vacationDaysEntitled: 30, notes: 'Especialista em SD' },
  { id: 'r3', name: 'João Oliveira', email: 'joao.oliveira@consultoria.com', profile: 'Técnico', front: 'BTP', fronts: ['BTP', 'Integrações'], dailyCapacity: 8, status: 'Ativo', birthDate: '1992-11-05', startDate: '2021-03-15', endDate: '', contractType: 'PJ', vacationDaysEntitled: 10, notes: 'Desenvolvedor BTP' },
  { id: 'r4', name: 'Ana Costa', email: 'ana.costa@consultoria.com', profile: 'Gerente de Projeto', front: 'PMO', fronts: ['PMO', 'Gestão'], dailyCapacity: 8, status: 'Ativo', birthDate: '1985-01-30', startDate: '2017-08-01', endDate: '', contractType: 'CLT', vacationDaysEntitled: 30, notes: 'GP Senior' },
  { id: 'r5', name: 'Carlos Ferreira', email: 'carlos.ferreira@consultoria.com', profile: 'Funcional', front: 'FI', fronts: ['FI', 'CO'], dailyCapacity: 8, status: 'Ativo', birthDate: '1991-09-12', startDate: '2022-02-01', endDate: '', contractType: 'CLT', vacationDaysEntitled: 30, notes: 'Especialista em FI' },
  { id: 'r6', name: 'Luciana Almeida', email: 'luciana.almeida@consultoria.com', profile: 'Funcional', front: 'CO', fronts: ['CO'], dailyCapacity: 8, status: 'Ativo', birthDate: '1993-04-18', startDate: '2023-01-10', endDate: '', contractType: 'PJ', vacationDaysEntitled: 10, notes: 'Especialista em CO' },
  { id: 'r7', name: 'Roberto Mendes', email: 'roberto.mendes@consultoria.com', profile: 'Técnico', front: 'Integrações', fronts: ['Integrações', 'BTP'], dailyCapacity: 8, status: 'Ativo', birthDate: '1987-12-03', startDate: '2018-11-01', endDate: '', contractType: 'CLT', vacationDaysEntitled: 30, notes: 'Integrador PI/PO' },
  { id: 'r8', name: 'Fernanda Lima', email: 'fernanda.lima@consultoria.com', profile: 'Líder de Frente', front: 'SD', fronts: ['SD'], dailyCapacity: 8, status: 'Inativo', birthDate: '1989-06-25', startDate: '2020-05-01', endDate: '2024-12-31', contractType: 'CLT', vacationDaysEntitled: 30, notes: 'Saiu da consultoria' },
];

// ===== PROJECTS (with fronts) =====
export let projects: Project[] = [
  { id: 'p1', name: 'Projeto Alpha', client: 'Cliente A', manager: 'Ana Costa', status: 'Em andamento', startDate: fmt(addDays(monday, -30)), endDate: fmt(addDays(monday, 90)), fronts: ['MM', 'SD', 'BTP', 'CO', 'Integrações', 'PMO', 'FI'], notes: 'Implementação S/4HANA' },
  { id: 'p2', name: 'Projeto Beta', client: 'Cliente B', manager: 'Ana Costa', status: 'Em andamento', startDate: fmt(addDays(monday, -15)), endDate: fmt(addDays(monday, 60)), fronts: ['MM', 'SD', 'BTP', 'Dados'], notes: 'Migração ECC para S/4' },
  { id: 'p3', name: 'Projeto Gamma', client: 'Cliente C', manager: 'Ana Costa', status: 'Planejado', startDate: fmt(addDays(monday, 7)), endDate: fmt(addDays(monday, 120)), fronts: ['MM', 'FI', 'CO', 'PP', 'EWM'], notes: 'Greenfield S/4HANA Cloud' },
  { id: 'p4', name: 'Projeto Delta', client: 'Cliente D', manager: 'Ana Costa', status: 'Em risco', startDate: fmt(addDays(monday, -45)), endDate: fmt(addDays(monday, 30)), fronts: ['FI', 'PMO', 'Integrações', 'QM'], notes: 'Rollout internacional' },
];

// ===== PHASES =====
export let phases: Phase[] = [
  { id: 'ph1', projectId: 'p1', phase: 'Realize', startDate: fmt(addDays(monday, -10)), endDate: fmt(addDays(monday, 30)), responsible: 'Pedro Silva', completionPercent: 40, status: 'Em andamento', notes: '' },
  { id: 'ph2', projectId: 'p2', phase: 'Explore', startDate: fmt(addDays(monday, -5)), endDate: fmt(addDays(monday, 20)), responsible: 'Maria Santos', completionPercent: 60, status: 'Em andamento', notes: '' },
  { id: 'ph3', projectId: 'p3', phase: 'Prepare', startDate: fmt(addDays(monday, 7)), endDate: fmt(addDays(monday, 30)), responsible: 'Ana Costa', completionPercent: 0, status: 'Planejado', notes: '' },
  { id: 'ph4', projectId: 'p4', phase: 'Deploy', startDate: fmt(addDays(monday, -5)), endDate: fmt(addDays(monday, 10)), responsible: 'Carlos Ferreira', completionPercent: 70, status: 'Em risco', notes: '' },
];

// ===== ABSENCES =====
export let absences: Absence[] = [
  { id: 'abs1', resourceId: 'r2', type: 'Férias', startDate: fmt(addDays(monday, 2)), endDate: fmt(addDays(monday, 6)), approved: true, notes: 'Férias programadas' },
  { id: 'abs2', resourceId: 'r5', type: 'Treinamento', startDate: fmt(addDays(monday, 3)), endDate: fmt(addDays(monday, 4)), approved: true, notes: 'Treinamento SAP' },
  { id: 'abs3', resourceId: 'r7', type: 'Feriado', startDate: fmt(addDays(monday, 0)), endDate: fmt(addDays(monday, 0)), approved: true, notes: 'Feriado nacional' },
];

// ===== ALLOCATIONS =====
export let allocations: Allocation[] = [
  // Pedro - full week allocation (8h/day)
  { id: 'a1', resourceId: 'r1', projectId: 'p1', phaseId: 'ph1', front: 'MM', startDate: fmt(monday), endDate: fmt(addDays(monday, 4)), hoursPerDay: 2, allocationType: 'Projeto', status: 'Confirmado', notes: '' },
  { id: 'a2', resourceId: 'r1', projectId: 'p2', phaseId: 'ph2', front: 'MM', startDate: fmt(monday), endDate: fmt(addDays(monday, 4)), hoursPerDay: 4, allocationType: 'Projeto', status: 'Confirmado', notes: '' },
  { id: 'a3', resourceId: 'r1', projectId: 'p3', phaseId: 'ph3', front: 'MM', startDate: fmt(monday), endDate: fmt(addDays(monday, 2)), hoursPerDay: 2, allocationType: 'Projeto', status: 'Planejado', notes: '' },
  { id: 'a4', resourceId: 'r1', projectId: 'p4', phaseId: 'ph4', front: 'MM', startDate: fmt(addDays(monday, 3)), endDate: fmt(addDays(monday, 4)), hoursPerDay: 2, allocationType: 'Projeto', status: 'Confirmado', notes: '' },

  // Maria - partial allocation (will be on leave Wed-Sun)
  { id: 'a5', resourceId: 'r2', projectId: 'p2', phaseId: 'ph2', front: 'SD', startDate: fmt(monday), endDate: fmt(addDays(monday, 1)), hoursPerDay: 6, allocationType: 'Projeto', status: 'Confirmado', notes: '' },
  { id: 'a6', resourceId: 'r2', projectId: 'p1', phaseId: 'ph1', front: 'SD', startDate: fmt(monday), endDate: fmt(addDays(monday, 1)), hoursPerDay: 2, allocationType: 'Projeto', status: 'Confirmado', notes: '' },

  // João - BTP work (overallocated)
  { id: 'a7', resourceId: 'r3', projectId: 'p1', phaseId: 'ph1', front: 'BTP', startDate: fmt(monday), endDate: fmt(addDays(monday, 4)), hoursPerDay: 6, allocationType: 'Projeto', status: 'Confirmado', notes: 'Desenvolvimento extensões' },
  { id: 'a8', resourceId: 'r3', projectId: 'p2', phaseId: 'ph2', front: 'BTP', startDate: fmt(monday), endDate: fmt(addDays(monday, 4)), hoursPerDay: 4, allocationType: 'Projeto', status: 'Confirmado', notes: 'Sobrealocado intencionalmente' },

  // Ana - GP across projects
  { id: 'a9', resourceId: 'r4', projectId: 'p1', phaseId: 'ph1', front: 'PMO', startDate: fmt(monday), endDate: fmt(addDays(monday, 4)), hoursPerDay: 3, allocationType: 'Projeto', status: 'Confirmado', notes: '' },
  { id: 'a10', resourceId: 'r4', projectId: 'p4', phaseId: 'ph4', front: 'PMO', startDate: fmt(monday), endDate: fmt(addDays(monday, 4)), hoursPerDay: 3, allocationType: 'Projeto', status: 'Em risco', notes: '' },

  // Carlos - FI work
  { id: 'a11', resourceId: 'r5', projectId: 'p4', phaseId: 'ph4', front: 'FI', startDate: fmt(monday), endDate: fmt(addDays(monday, 4)), hoursPerDay: 8, allocationType: 'Projeto', status: 'Confirmado', notes: '' },

  // Luciana - CO work
  { id: 'a12', resourceId: 'r6', projectId: 'p1', phaseId: 'ph1', front: 'CO', startDate: fmt(monday), endDate: fmt(addDays(monday, 4)), hoursPerDay: 4, allocationType: 'Projeto', status: 'Confirmado', notes: '' },

  // Roberto - Integrations
  { id: 'a13', resourceId: 'r7', projectId: 'p1', phaseId: 'ph1', front: 'Integrações', startDate: fmt(addDays(monday, 1)), endDate: fmt(addDays(monday, 4)), hoursPerDay: 8, allocationType: 'Projeto', status: 'Confirmado', notes: '' },
];

// ===== ID GENERATORS =====
let resourceCounter = resources.length + 1;
let projectCounter = projects.length + 1;
let phaseCounter = phases.length + 1;
let absenceCounter = absences.length + 1;
let allocationCounter = allocations.length + 1;

// ===== APP USERS (Access Control) =====
export let appUsers: AppUser[] = [
  { id: 'u1', name: 'Denis Chiodi', email: 'defechi@gmail.com', role: 'admin', permissions: { dashboard: true, resources: true, projects: true, absences: true, planner: true, activities: true, gpChecklist: true, organogram: true, techmove: true, access: true, settings: true }, active: true, resourceId: '', teamFronts: [] },
  { id: 'u2', name: 'Ana Costa', email: 'ana.costa@consultoria.com', role: 'manager', permissions: { dashboard: true, resources: true, projects: true, absences: true, planner: true, activities: true, gpChecklist: true, organogram: true, techmove: true, access: false, settings: true }, active: true, resourceId: 'r4', teamFronts: [] },
  { id: 'u3', name: 'Pedro Silva', email: 'pedro.silva@consultoria.com', role: 'consultant', permissions: { dashboard: false, resources: true, projects: false, absences: true, planner: true, activities: true, gpChecklist: false, organogram: false, techmove: true, access: false, settings: false }, active: true, resourceId: 'r1', teamFronts: [] },
  { id: 'u4', name: 'Maria Santos', email: 'maria.santos@consultoria.com', role: 'consultant', permissions: { dashboard: false, resources: true, projects: false, absences: true, planner: true, activities: true, gpChecklist: false, organogram: false, techmove: true, access: false, settings: false }, active: true, resourceId: 'r2', teamFronts: [] },
  { id: 'u5', name: 'João Oliveira', email: 'joao.oliveira@consultoria.com', role: 'technical_lead', permissions: { dashboard: false, resources: true, projects: false, absences: true, planner: true, activities: true, gpChecklist: false, organogram: true, techmove: true, access: false, settings: false }, active: true, resourceId: 'r3', teamFronts: ['BTP', 'Integrações'] },
];

let userCounter = 6;
export const generateUserId = (): string => `u${userCounter++}`;

type LookupCategory =
  | 'profiles'
  | 'fronts'
  | 'resourceStatuses'
  | 'projectStatuses'
  | 'absenceTypes'
  | 'allocationTypes'
  | 'allocationStatuses'
  | 'contractTypes'
  | 'dashboardCheckStatuses';

export let lookups: Record<LookupCategory, LookupItem[]> = {
  profiles: ['Técnico', 'Funcional', 'Gerente de Projeto', 'Diretor Delivery', 'Líder Técnico', 'Desenvolvedor', 'Diretor Operações'].map((value, index) => ({ id: `lk-prof-${index}`, value, active: true })),
  fronts: ['PM', 'PP', 'ABAP', 'SD', 'HCM', 'MM', 'CO', 'Basis', 'FI', 'QM', 'CPI', 'PMO', 'WM', 'Gestão', 'TRM', 'SAC', 'Group Reporting', 'BTP', 'Integrações', 'Dados', 'Testes'].map((value, index) => ({ id: `lk-front-${index}`, value, active: true })),
  resourceStatuses: ['Ativo', 'Inativo', 'Em Férias', 'Desligado', 'A contratar'].map((value, index) => ({ id: `lk-rs-${index}`, value, active: true })),
  projectStatuses: ['Planejado', 'Em andamento', 'Em Andamento', 'Em risco', 'Suspenso', 'Concluído', 'Cancelado'].map((value, index) => ({ id: `lk-ps-${index}`, value, active: true })),
  absenceTypes: ['Férias', 'Dias vendidos', 'Banco de Horas', 'Atestado', 'Treinamento', 'Folga', 'Licença', 'Feriado'].map((value, index) => ({ id: `lk-abs-${index}`, value, active: true })),
  allocationTypes: ['Projeto', 'Interna', 'Suporte', 'Treinamento', 'Gestão'].map((value, index) => ({ id: `lk-at-${index}`, value, active: true })),
  allocationStatuses: ['Planejado', 'Planejada', 'Confirmado', 'Confirmada', 'Em risco', 'Concluído'].map((value, index) => ({ id: `lk-as-${index}`, value, active: true })),
  contractTypes: ['CLT', 'PJ', 'Terceiro', 'Parceiro', 'A contratar'].map((value, index) => ({ id: `lk-ct-${index}`, value, active: true })),
  dashboardCheckStatuses: ['Em Andamento', 'Planejado'].map((value, index) => ({ id: `lk-ds-${index}`, value, active: true })),
};

let lookupCounter = Object.values(lookups).reduce((sum, items) => sum + items.length, 0) + 1;
export const generateLookupId = (): string => `lk${lookupCounter++}`;

export const generateId = (prefix: string): string => {
  switch (prefix) {
    case 'r': return `r${resourceCounter++}`;
    case 'p': return `p${projectCounter++}`;
    case 'ph': return `ph${phaseCounter++}`;
    case 'abs': return `abs${absenceCounter++}`;
    case 'a': return `a${allocationCounter++}`;
    default: return `${prefix}${Date.now()}`;
  }
};
