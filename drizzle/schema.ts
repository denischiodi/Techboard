import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean as mysqlBoolean,
  json,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Resources - consultores e profissionais
 */
export const resources = mysqlTable("resources", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).default(""),
  profile: varchar("profile", { length: 128 }).notNull().default("Funcional"),
  front: varchar("front", { length: 128 }).notNull().default(""),
  fronts: json("fronts").$type<string[]>().default([]),
  dailyCapacity: int("dailyCapacity").notNull().default(8),
  status: varchar("status", { length: 64 }).notNull().default("Ativo"),
  birthDate: varchar("birthDate", { length: 10 }).default(""),
  startDate: varchar("startDate", { length: 10 }).default(""),
  endDate: varchar("endDate", { length: 10 }).default(""),
  contractType: varchar("contractType", { length: 64 })
    .notNull()
    .default("CLT"),
  vacationDaysEntitled: int("vacationDaysEntitled").notNull().default(30),
  skipAllocationCheck: mysqlBoolean("skipAllocationCheck")
    .notNull()
    .default(false),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Projects - projetos de implementação
 */
export const projects = mysqlTable("projects", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  logoUrl: text("logoUrl"),
  client: varchar("client", { length: 255 }).notNull().default(""),
  manager: varchar("manager", { length: 255 }).notNull().default(""),
  status: varchar("status", { length: 64 }).notNull().default("Planejado"),
  startDate: varchar("startDate", { length: 10 }).notNull().default(""),
  endDate: varchar("endDate", { length: 10 }).notNull().default(""),
  fronts: json("fronts").$type<string[]>().default([]),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Phases - fases de projeto (Prepare, Explore, Realize, Deploy, Run)
 */
export const phases = mysqlTable("phases", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  phase: varchar("phase", { length: 64 }).notNull(),
  startDate: varchar("startDate", { length: 10 }).notNull().default(""),
  endDate: varchar("endDate", { length: 10 }).notNull().default(""),
  responsible: varchar("responsible", { length: 255 }).notNull().default(""),
  completionPercent: int("completionPercent").notNull().default(0),
  status: varchar("status", { length: 64 }).notNull().default("Não iniciado"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Absences - férias, ausências, feriados
 */
export const absences = mysqlTable("absences", {
  id: varchar("id", { length: 64 }).primaryKey(),
  resourceId: varchar("resourceId", { length: 64 }).notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  startDate: varchar("startDate", { length: 10 }).notNull(),
  endDate: varchar("endDate", { length: 10 }).notNull(),
  approved: int("approved").notNull().default(1),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Allocations - alocações de recursos em projetos
 */
export const allocations = mysqlTable("allocations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  resourceId: varchar("resourceId", { length: 64 }).notNull(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  phaseId: varchar("phaseId", { length: 64 }).notNull().default(""),
  front: varchar("front", { length: 128 }).notNull().default(""),
  startDate: varchar("startDate", { length: 10 }).notNull(),
  endDate: varchar("endDate", { length: 10 }).notNull(),
  hoursPerDay: int("hoursPerDay").notNull().default(8),
  allocationType: varchar("allocationType", { length: 64 })
    .notNull()
    .default("Projeto"),
  status: varchar("status", { length: 64 }).notNull().default("Confirmada"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * App Users - gestão de acesso (separado do auth users)
 */
export const appUsers = mysqlTable("app_users", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  role: varchar("role", { length: 32 }).notNull().default("viewer"),
  permissions: json("permissions")
    .$type<{
      dashboard: boolean;
      resources: boolean;
      projects: boolean;
      absences: boolean;
      planner: boolean;
      activities: boolean;
      gpChecklist: boolean;
      organogram: boolean;
      techmove: boolean;
      access: boolean;
      settings: boolean;
      products?: Partial<
        Record<
          "techboard" | "techlead" | "techmove" | "techtask" | "admin",
          boolean
        >
      >;
      actions?: Partial<
        Record<string, { view: boolean; create: boolean; modify: boolean }>
      >;
    }>()
    .notNull(),
  active: int("active").notNull().default(1),
  resourceId: varchar("resourceId", { length: 64 }).default(""),
  teamFronts: json("teamFronts").$type<string[]>().default([]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Lookups - cadastros auxiliares configuráveis
 */
export const lookups = mysqlTable("lookups", {
  id: varchar("id", { length: 64 }).primaryKey(),
  category: varchar("category", { length: 64 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  active: int("active").notNull().default(1),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * TechMove Projects - dados do fluxo TechMove
 */
export const techmoveProjects = mysqlTable("techmove_projects", {
  id: int("id").autoincrement().primaryKey(),
  projectId: varchar("projectId", { length: 64 }).notNull().unique(),
  data: json("data").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Activities - kanban unificado e colaborativo. */
export const activities = mysqlTable("activities", {
  id: varchar("id", { length: 64 }).primaryKey(),
  scope: varchar("scope", { length: 16 }).notNull().default("project"),
  projectId: varchar("projectId", { length: 64 }).notNull().default(""),
  stage: varchar("stage", { length: 16 }).notNull().default("GERAL"),
  sequenceNumber: int("sequenceNumber").notNull().default(1),
  title: text("title").notNull(),
  description: text("description"),
  status: varchar("status", { length: 32 }).notNull().default("A fazer"),
  priority: varchar("priority", { length: 16 }).notNull().default("Média"),
  assigneeUserId: varchar("assigneeUserId", { length: 64 })
    .notNull()
    .default(""),
  creatorUserId: varchar("creatorUserId", { length: 64 }).notNull(),
  dueDate: varchar("dueDate", { length: 10 }).notNull().default(""),
  sourceType: varchar("sourceType", { length: 64 }).notNull().default("manual"),
  sourceKey: varchar("sourceKey", { length: 255 }).notNull().default(""),
  sourceUrl: text("sourceUrl"),
  sourceResolved: mysqlBoolean("sourceResolved").notNull().default(false),
  archivedAt: timestamp("archivedAt"),
  archivedByUserId: varchar("archivedByUserId", { length: 64 }).notNull().default(""),
  archiveReason: text("archiveReason"),
  archiveSnapshot: json("archiveSnapshot").$type<Record<string, unknown>>().default({}),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const activitySourceSuppressions = mysqlTable("activity_source_suppressions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  sourceType: varchar("sourceType", { length: 64 }).notNull(),
  sourceKey: varchar("sourceKey", { length: 255 }).notNull(),
  activityId: varchar("activityId", { length: 64 }).notNull(),
  reason: text("reason").notNull(),
  createdByUserId: varchar("createdByUserId", { length: 64 }).notNull(),
  restoredAt: timestamp("restoredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const activitySequenceCounters = mysqlTable(
  "activity_sequence_counters",
  {
    counterKey: varchar("counterKey", { length: 160 }).primaryKey(),
    scope: varchar("scope", { length: 16 }).notNull(),
    projectId: varchar("projectId", { length: 64 }).notNull().default(""),
    stage: varchar("stage", { length: 16 }).notNull().default("GERAL"),
    lastNumber: int("lastNumber").notNull().default(0),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);

export const activityParticipants = mysqlTable("activity_participants", {
  activityId: varchar("activityId", { length: 64 }).notNull(),
  userId: varchar("userId", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const activityChecklistItems = mysqlTable("activity_checklist_items", {
  id: varchar("id", { length: 64 }).primaryKey(),
  activityId: varchar("activityId", { length: 64 }).notNull(),
  description: text("description").notNull(),
  assigneeUserId: varchar("assigneeUserId", { length: 64 })
    .notNull()
    .default(""),
  dueDate: varchar("dueDate", { length: 10 }).notNull().default(""),
  required: mysqlBoolean("required").notNull().default(true),
  completed: mysqlBoolean("completed").notNull().default(false),
  position: int("position").notNull().default(0),
  createdByUserId: varchar("createdByUserId", { length: 64 }).notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const activityComments = mysqlTable("activity_comments", {
  id: varchar("id", { length: 64 }).primaryKey(),
  activityId: varchar("activityId", { length: 64 }).notNull(),
  authorUserId: varchar("authorUserId", { length: 64 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const activityAttachments = mysqlTable("activity_attachments", {
  id: varchar("id", { length: 64 }).primaryKey(),
  activityId: varchar("activityId", { length: 64 }).notNull(),
  fileName: text("fileName").notNull(),
  contentType: varchar("contentType", { length: 255 }).notNull(),
  url: text("url").notNull(),
  uploadedByUserId: varchar("uploadedByUserId", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const activityHistory = mysqlTable("activity_history", {
  id: varchar("id", { length: 64 }).primaryKey(),
  activityId: varchar("activityId", { length: 64 }).notNull(),
  actorUserId: varchar("actorUserId", { length: 64 }).notNull().default(""),
  actorName: varchar("actorName", { length: 255 }).notNull().default("Sistema"),
  action: varchar("action", { length: 128 }).notNull(),
  details: json("details").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const activityNotifications = mysqlTable("activity_notifications", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull(),
  activityId: varchar("activityId", { length: 64 }).notNull(),
  eventKey: varchar("eventKey", { length: 255 }).notNull(),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  title: text("title").notNull(),
  message: text("message"),
  readAt: timestamp("readAt"),
  emailStatus: varchar("emailStatus", { length: 16 })
    .notNull()
    .default("pending"),
  emailAttempts: int("emailAttempts").notNull().default(0),
  lastEmailError: text("lastEmailError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ===== WORKFLOW MODULE TABLES =====

/**
 * Scope Items - itens de escopo do DDA
 */
export const scopeItems = mysqlTable("scope_items", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  module: varchar("module", { length: 128 }).notNull(),
  code: varchar("code", { length: 128 }).notNull().default(""),
  name: varchar("name", { length: 512 }).notNull(),
  processArea: varchar("processArea", { length: 256 }).notNull().default(""),
  description: text("description"),
  active: int("active").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * BDCQ Questions - perguntas do Business Driven Configuration Questionnaire
 */
export const bdcqQuestions = mysqlTable("bdcq_questions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  module: varchar("module", { length: 128 }).notNull(),
  category: varchar("category", { length: 256 }).notNull().default(""),
  question: text("question").notNull(),
  templateId: varchar("templateId", { length: 64 }).notNull().default(""),
  scopeItemIds: json("scopeItemIds").$type<string[]>().default([]),
  consultantResourceId: varchar("consultantResourceId", { length: 64 })
    .notNull()
    .default(""),
  keyUserId: varchar("keyUserId", { length: 64 }).notNull().default(""),
  required: mysqlBoolean("required").notNull().default(false),
  isDefault: int("isDefault").notNull().default(0),
  sortOrder: int("sortOrder").notNull().default(0),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const workflowProjectKeyUsers = mysqlTable(
  "workflow_project_key_users",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    projectId: varchar("projectId", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 320 }).notNull().default(""),
    role: varchar("role", { length: 255 }).notNull().default(""),
    active: int("active").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);

export const projectMemberships = mysqlTable("project_memberships", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  appUserId: varchar("appUserId", { length: 64 }).notNull(),
  profile: varchar("profile", { length: 32 }).notNull().default("reader"),
  jobTitle: varchar("jobTitle", { length: 255 }).notNull().default(""),
  capabilityOverrides: json("capabilityOverrides")
    .$type<Record<string, boolean>>()
    .default({}),
  active: mysqlBoolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const projectApprovalPolicies = mysqlTable("project_approval_policies", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  entityType: varchar("entityType", { length: 32 }).notNull(),
  enabled: mysqlBoolean("enabled").notNull().default(false),
  quorum: varchar("quorum", { length: 16 }).notNull().default("any"),
  minimumApprovals: int("minimumApprovals").notNull().default(1),
  approverMembershipIds: json("approverMembershipIds")
    .$type<string[]>()
    .default([]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const approvalRounds = mysqlTable("approval_rounds", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  entityType: varchar("entityType", { length: 32 }).notNull(),
  entityId: varchar("entityId", { length: 64 }).notNull(),
  version: int("version").notNull().default(1),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  quorum: varchar("quorum", { length: 16 }).notNull().default("any"),
  minimumApprovals: int("minimumApprovals").notNull().default(1),
  snapshot: json("snapshot").$type<Record<string, unknown>>().default({}),
  requestedByUserId: varchar("requestedByUserId", { length: 64 }).notNull(),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  reopenedFromRoundId: varchar("reopenedFromRoundId", { length: 64 })
    .notNull()
    .default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const approvalDecisions = mysqlTable("approval_decisions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  roundId: varchar("roundId", { length: 64 }).notNull(),
  approverMembershipId: varchar("approverMembershipId", {
    length: 64,
  }).notNull(),
  decision: varchar("decision", { length: 16 }).notNull().default("pending"),
  comment: text("comment"),
  decidedAt: timestamp("decidedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const workflowBdcqTemplates = mysqlTable("workflow_bdcq_templates", {
  id: varchar("id", { length: 64 }).primaryKey(),
  question: text("question").notNull(),
  category: varchar("category", { length: 256 }).notNull().default(""),
  modules: json("modules").$type<string[]>().default([]),
  scopeItemKeys: json("scopeItemKeys").$type<string[]>().default([]),
  required: mysqlBoolean("required").notNull().default(false),
  active: int("active").notNull().default(1),
  createdBy: varchar("createdBy", { length: 255 }).notNull().default(""),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const workflowConfigurationTemplates = mysqlTable(
  "workflow_configuration_templates",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    description: text("description").notNull(),
    category: varchar("category", { length: 256 })
      .notNull()
      .default("Configuração"),
    modules: json("modules").$type<string[]>().default([]),
    scopeItemKeys: json("scopeItemKeys").$type<string[]>().default([]),
    active: mysqlBoolean("active").notNull().default(true),
    createdBy: varchar("createdBy", { length: 255 }).notNull().default(""),
    archivedAt: timestamp("archivedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);

export type WorkshopPresentationFile = {
  name: string;
  url: string;
  contentType: string;
};

export const workflowWorkshopTemplates = mysqlTable(
  "workflow_workshop_templates",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    title: varchar("title", { length: 512 }).notNull(),
    objective: text("objective"),
    content: text("content"),
    duration: varchar("duration", { length: 64 }).notNull().default(""),
    modules: json("modules").$type<string[]>().default([]),
    projectIds: json("projectIds").$type<string[]>().default([]),
    scopeItemKeys: json("scopeItemKeys").$type<string[]>().default([]),
    agenda: json("agenda").$type<string[]>().default([]),
    expectedOutcomes: json("expectedOutcomes").$type<string[]>().default([]),
    prerequisites: json("prerequisites").$type<string[]>().default([]),
    requiredRoles: json("requiredRoles").$type<string[]>().default([]),
    presentationFiles: json("presentationFiles")
      .$type<WorkshopPresentationFile[]>()
      .default([]),
    active: mysqlBoolean("active").notNull().default(true),
    createdBy: varchar("createdBy", { length: 255 }).notNull().default(""),
    archivedAt: timestamp("archivedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  }
);

/**
 * BDCQ Answers - respostas do BDCQ
 */
export const bdcqAnswers = mysqlTable("bdcq_answers", {
  id: varchar("id", { length: 64 }).primaryKey(),
  questionId: varchar("questionId", { length: 64 }).notNull(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  answer: text("answer").notNull(),
  answeredBy: varchar("answeredBy", { length: 255 }).notNull().default(""),
  attachments: json("attachments").$type<string[]>().default([]),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const bdcqAnswerHistory = mysqlTable("bdcq_answer_history", {
  id: varchar("id", { length: 64 }).primaryKey(),
  answerId: varchar("answerId", { length: 64 }).notNull(),
  questionId: varchar("questionId", { length: 64 }).notNull(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  answer: text("answer").notNull(),
  answeredBy: varchar("answeredBy", { length: 255 }).notNull().default(""),
  changedBy: varchar("changedBy", { length: 255 }).notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Workshops - sessões de workshop
 */
export const workshops = mysqlTable("workshops", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  module: varchar("module", { length: 128 }).notNull().default(""),
  modules: json("modules").$type<string[]>().default([]),
  scopeItemIds: json("scopeItemIds").$type<string[]>().default([]),
  objective: text("objective"),
  content: text("content"),
  expectedOutcomes: json("expectedOutcomes").$type<string[]>().default([]),
  prerequisites: json("prerequisites").$type<string[]>().default([]),
  requiredRoles: json("requiredRoles").$type<string[]>().default([]),
  presentationFiles: json("presentationFiles")
    .$type<WorkshopPresentationFile[]>()
    .default([]),
  templateId: varchar("templateId", { length: 64 }).notNull().default(""),
  source: varchar("source", { length: 32 }).notNull().default("manual"),
  scheduledDate: varchar("scheduledDate", { length: 10 }).notNull().default(""),
  duration: varchar("duration", { length: 64 }).notNull().default(""),
  participants: json("participants").$type<string[]>().default([]),
  agenda: json("agenda").$type<string[]>().default([]),
  status: varchar("status", { length: 64 }).notNull().default("Planejado"),
  notes: text("notes"),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Workshop Transcripts - transcrições de workshops
 */
export const workshopTranscripts = mysqlTable("workshop_transcripts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  workshopId: varchar("workshopId", { length: 64 }).notNull(),
  content: text("content").notNull(),
  fileUrl: varchar("fileUrl", { length: 1024 }).default(""),
  uploadedBy: varchar("uploadedBy", { length: 255 }).notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Meeting Minutes - atas geradas por IA
 */
export const meetingMinutes = mysqlTable("meeting_minutes", {
  id: varchar("id", { length: 64 }).primaryKey(),
  workshopId: varchar("workshopId", { length: 64 }).notNull(),
  content: text("content").notNull(),
  generatedBy: varchar("generatedBy", { length: 64 }).notNull().default("ai"),
  version: int("version").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Client Requirements - requisitos levantados e validados antes do DCD
 */
export const clientRequirements = mysqlTable("client_requirements", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  workshopId: varchar("workshopId", { length: 64 }).notNull(),
  code: varchar("code", { length: 128 }).notNull().default(""),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description").notNull(),
  module: varchar("module", { length: 128 }).notNull().default(""),
  category: varchar("category", { length: 128 }).notNull().default("Funcional"),
  priority: varchar("priority", { length: 64 }).notNull().default("Média"),
  status: varchar("status", { length: 64 }).notNull().default("Identificado"),
  source: varchar("source", { length: 255 }).notNull().default("Cliente"),
  acceptanceCriteria: text("acceptanceCriteria"),
  responsible: varchar("responsible", { length: 255 }).notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * DCD Documents - Design Configuration Documents gerados por IA
 */
export const dcdDocuments = mysqlTable("dcd_documents", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  seriesId: varchar("seriesId", { length: 64 }).notNull().default(""),
  sourceHash: varchar("sourceHash", { length: 64 }).notNull().default(""),
  module: varchar("module", { length: 128 }).notNull().default(""),
  title: varchar("title", { length: 512 }).notNull(),
  content: text("content").notNull(),
  version: int("version").notNull().default(1),
  status: varchar("status", { length: 64 }).notNull().default("Rascunho"),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Gaps - lacunas identificadas no DCD
 */
export const gaps = mysqlTable("gaps", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  dcdId: varchar("dcdId", { length: 64 }).notNull().default(""),
  module: varchar("module", { length: 128 }).notNull().default(""),
  modules: json("modules").$type<string[]>().default([]),
  description: text("description").notNull(),
  impact: varchar("impact", { length: 64 }).notNull().default("Médio"),
  responsible: varchar("responsible", { length: 255 }).notNull().default(""),
  abapHours: int("abapHours").notNull().default(0),
  technicalHours: int("technicalHours").notNull().default(0),
  attachments: json("attachments").$type<string[]>().default([]),
  resolution: text("resolution"),
  status: varchar("status", { length: 64 }).notNull().default("Aberto"),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Configurations - itens de configuração (checklist)
 */
export const configurations = mysqlTable("configurations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  module: varchar("module", { length: 128 }).notNull().default(""),
  category: varchar("category", { length: 256 }).notNull().default(""),
  description: text("description").notNull(),
  responsible: varchar("responsible", { length: 255 }).notNull().default(""),
  status: varchar("status", { length: 64 }).notNull().default("Pendente"),
  notes: text("notes"),
  templateId: varchar("templateId", { length: 64 }).notNull().default(""),
  bdcqQuestionId: varchar("bdcqQuestionId", { length: 64 })
    .notNull()
    .default(""),
  scopeItemIds: json("scopeItemIds").$type<string[]>().default([]),
  source: varchar("source", { length: 32 }).notNull().default("manual"),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Test cases executed after configuration, covering unit and integrated validation. */
export const workflowTestCases = mysqlTable("workflow_test_cases", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  type: varchar("type", { length: 32 }).notNull().default("Unitário"),
  code: varchar("code", { length: 128 }).notNull().default(""),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  module: varchar("module", { length: 128 }).notNull().default(""),
  requirementId: varchar("requirementId", { length: 64 }).notNull().default(""),
  scopeItemId: varchar("scopeItemId", { length: 64 }).notNull().default(""),
  dcdId: varchar("dcdId", { length: 64 }).notNull().default(""),
  preconditions: text("preconditions"),
  steps: text("steps"),
  expectedResult: text("expectedResult"),
  actualResult: text("actualResult"),
  responsible: varchar("responsible", { length: 255 }).notNull().default(""),
  evidence: text("evidence"),
  status: varchar("status", { length: 64 }).notNull().default("Não iniciado"),
  executedAt: varchar("executedAt", { length: 10 }).notNull().default(""),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Executable steps of an E2E test scenario, independently assigned to key users. */
export const workflowTestSteps = mysqlTable("workflow_test_steps", {
  id: varchar("id", { length: 64 }).primaryKey(),
  testCaseId: varchar("testCaseId", { length: 64 }).notNull(),
  position: int("position").notNull().default(1),
  title: varchar("title", { length: 512 }).notNull(),
  instruction: text("instruction"),
  expectedResult: text("expectedResult"),
  actualResult: text("actualResult"),
  responsible: varchar("responsible", { length: 255 }).notNull().default(""),
  status: varchar("status", { length: 64 }).notNull().default("Não iniciado"),
  evidences: json("evidences")
    .$type<Array<{ name: string; url: string; contentType: string }>>()
    .default([]),
  executedAt: varchar("executedAt", { length: 10 }).notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Master catalog used to assemble a complete, scope-aware delivery trail. */
export const deliveryTemplates = mysqlTable("delivery_templates", {
  id: varchar("id", { length: 64 }).primaryKey(),
  type: varchar("type", { length: 32 }).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  phase: varchar("phase", { length: 32 }).notNull().default("Prepare"),
  stage: varchar("stage", { length: 64 }).notNull().default("governance"),
  modules: json("modules").$type<string[]>().default([]),
  scopeItemKeys: json("scopeItemKeys").$type<string[]>().default([]),
  projectIds: json("projectIds").$type<string[]>().default([]),
  required: mysqlBoolean("required").notNull().default(true),
  sortOrder: int("sortOrder").notNull().default(0),
  dependencyTemplateIds: json("dependencyTemplateIds")
    .$type<string[]>()
    .default([]),
  ownerRole: varchar("ownerRole", { length: 64 })
    .notNull()
    .default("consultant"),
  dueOffsetDays: int("dueOffsetDays").notNull().default(0),
  evidenceRequirements: json("evidenceRequirements")
    .$type<string[]>()
    .default([]),
  approvalPolicy: json("approvalPolicy")
    .$type<{
      mode: "none" | "any" | "all" | "minimum";
      minimumApprovals: number;
    }>()
    .default({ mode: "none", minimumApprovals: 1 }),
  completionCriteria: text("completionCriteria").notNull().default(""),
  payload: json("payload").$type<Record<string, unknown>>().default({}),
  version: int("version").notNull().default(1),
  effectiveFrom: varchar("effectiveFrom", { length: 10 }).notNull().default(""),
  active: mysqlBoolean("active").notNull().default(true),
  archivedAt: timestamp("archivedAt"),
  archivedBy: varchar("archivedBy", { length: 64 }).notNull().default(""),
  createdBy: varchar("createdBy", { length: 64 }).notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const deliveryItems = mysqlTable("delivery_items", {
  id: varchar("id", { length: 64 }).primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  sequenceNumber: int("sequenceNumber").notNull().unique(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  templateId: varchar("templateId", { length: 64 }).notNull().default(""),
  occurrenceKey: varchar("occurrenceKey", { length: 512 }).notNull().default(""),
  templateVersion: int("templateVersion").notNull().default(1),
  type: varchar("type", { length: 32 }).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description").notNull().default(""),
  phase: varchar("phase", { length: 32 }).notNull().default("Prepare"),
  stage: varchar("stage", { length: 64 }).notNull(),
  module: varchar("module", { length: 128 }).notNull().default(""),
  scopeItemIds: json("scopeItemIds").$type<string[]>().default([]),
  required: mysqlBoolean("required").notNull().default(true),
  sortOrder: int("sortOrder").notNull().default(0),
  dependencyItemIds: json("dependencyItemIds").$type<string[]>().default([]),
  ownerRole: varchar("ownerRole", { length: 64 })
    .notNull()
    .default("consultant"),
  responsibleId: varchar("responsibleId", { length: 64 }).notNull().default(""),
  dueDate: varchar("dueDate", { length: 10 }).notNull().default(""),
  status: varchar("status", { length: 32 }).notNull().default("not_started"),
  evidenceRequirements: json("evidenceRequirements")
    .$type<string[]>()
    .default([]),
  evidences: json("evidences")
    .$type<Array<{ name: string; url: string; contentType: string }>>()
    .default([]),
  approvalPolicy: json("approvalPolicy")
    .$type<Record<string, unknown>>()
    .default({}),
  payload: json("payload").$type<Record<string, unknown>>().default({}),
  customized: mysqlBoolean("customized").notNull().default(false),
  archivedAt: timestamp("archivedAt"),
  archivedBy: varchar("archivedBy", { length: 64 }).notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Asynchronous distribution of a central template to compatible projects. */
export const deliveryPublicationJobs = mysqlTable("delivery_publication_jobs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  templateId: varchar("templateId", { length: 64 }).notNull(),
  templateVersion: int("templateVersion").notNull().default(1),
  trigger: varchar("trigger", { length: 64 }).notNull().default("template_changed"),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  attempts: int("attempts").notNull().default(0),
  summary: json("summary").$type<Record<string, unknown>>().default({}),
  lastError: text("lastError").notNull().default(""),
  createdBy: varchar("createdBy", { length: 64 }).notNull().default(""),
  startedAt: timestamp("startedAt"),
  finishedAt: timestamp("finishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Idempotent link between one applicable template occurrence and its operational record. */
export const deliveryMaterializations = mysqlTable("delivery_materializations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  templateId: varchar("templateId", { length: 64 }).notNull(),
  templateVersion: int("templateVersion").notNull().default(1),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  occurrenceKey: varchar("occurrenceKey", { length: 512 }).notNull(),
  targetType: varchar("targetType", { length: 64 }).notNull(),
  targetId: varchar("targetId", { length: 64 }).notNull().default(""),
  state: varchar("state", { length: 32 }).notNull().default("current"),
  reason: text("reason").notNull().default(""),
  publishedAt: timestamp("publishedAt"),
  confirmedAt: timestamp("confirmedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const deliveryRaidItems = mysqlTable("delivery_raid_items", {
  id: varchar("id", { length: 64 }).primaryKey(),
  deliveryItemId: varchar("deliveryItemId", { length: 64 }).notNull().unique(),
  kind: varchar("kind", { length: 16 }).notNull(),
  category: varchar("category", { length: 128 }).notNull().default(""),
  cause: text("cause").notNull().default(""),
  consequence: text("consequence").notNull().default(""),
  probability: int("probability").notNull().default(1),
  impact: int("impact").notNull().default(1),
  severity: int("severity").notNull().default(1),
  strategy: varchar("strategy", { length: 32 }).notNull().default(""),
  responsePlan: text("responsePlan").notNull().default(""),
  workaround: text("workaround").notNull().default(""),
  rootCause: text("rootCause").notNull().default(""),
  sponsorId: varchar("sponsorId", { length: 64 }).notNull().default(""),
  nextAction: text("nextAction").notNull().default(""),
  reviewDate: varchar("reviewDate", { length: 10 }).notNull().default(""),
  escalated: mysqlBoolean("escalated").notNull().default(false),
  acceptedReason: text("acceptedReason").notNull().default(""),
  materializedIssueId: varchar("materializedIssueId", { length: 64 })
    .notNull()
    .default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const workflowAuditLog = mysqlTable("workflow_audit_log", {
  id: varchar("id", { length: 64 }).primaryKey(),
  projectId: varchar("projectId", { length: 64 }).notNull(),
  userId: varchar("userId", { length: 128 }).notNull(),
  userName: varchar("userName", { length: 255 }).notNull().default(""),
  action: varchar("action", { length: 128 }).notNull(),
  entityType: varchar("entityType", { length: 128 }).notNull(),
  entityId: varchar("entityId", { length: 64 }).notNull(),
  details: json("details").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const workflowPrompts = mysqlTable("workflow_prompts", {
  key: varchar("key", { length: 128 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  systemPrompt: text("systemPrompt").notNull(),
  model: varchar("model", { length: 255 }).notNull().default(""),
  updatedBy: varchar("updatedBy", { length: 255 }).notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
