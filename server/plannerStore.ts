import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Absence, Allocation, AppUser, LookupConfig, LookupItem, Phase, Project, Resource, TechMoveData, UserPermissions, UserRole } from "../shared/types";
import { DEFAULT_PERMISSIONS } from "../shared/types";
import { getPgPool } from "./db";
import type { QueryResultRow } from "pg";
import { ensureProjectChecklist } from "./gpChecklistStore";
import {
  absences as memoryAbsences,
  allocations as memoryAllocations,
  appUsers as memoryAppUsers,
  generateId,
  generateLookupId,
  generateUserId,
  lookups as memoryLookups,
  phases as memoryPhases,
  projects as memoryProjects,
  resources as memoryResources,
} from "./mockData";

type LookupCategory = keyof LookupConfig;

let schemaReady = false;
let lookupsSeeded = false;
let appUsersSeeded = false;
const memoryTechMove = new Map<string, TechMoveData>();
const bootstrapAdminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || "denis_chiodi@hotmail.com").trim().toLowerCase();
const bootstrapAdminName = process.env.BOOTSTRAP_ADMIN_NAME || "Denis Chiodi";

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

function createDatabaseId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function createEntityId(prefix: string) {
  return hasDatabase() ? createDatabaseId(prefix) : generateId(prefix);
}

function getPool() {
  return getPgPool();
}

async function query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<{ rows: T[]; rowCount?: number | null } | null> {
  const db = getPool();
  if (!db) return null;
  return db.query<T>(sql, params);
}

export function isCanonicalMigrationFile(file: string) {
  return /^\d+_[^\s]+\.sql$/.test(file);
}

export async function ensureDatabaseSchema() {
  if (!hasDatabase() || schemaReady) return;
  if (
    process.env.NODE_ENV === "production" &&
    process.env.RUN_MIGRATIONS_ON_START === "false"
  ) {
    schemaReady = true;
    return;
  }

  const migrationsDir = join(process.cwd(), "drizzle");
  const migrationFiles = (await readdir(migrationsDir))
    .filter(isCanonicalMigrationFile)
    .sort();

  for (const migrationFile of migrationFiles) {
    const migrationSql = await readFile(join(migrationsDir, migrationFile), "utf8");
    const statements = migrationSql
      .split("--> statement-breakpoint")
      .map(statement => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      try {
        // Skip PostgreSQL-specific statements that don't work in MySQL/TiDB
        if (statement.startsWith("CREATE TYPE") || statement.startsWith("DROP TYPE")) {
          continue;
        }
        await query(statement);
      } catch (error: any) {
        // Ignore "already exists", "duplicate", and other non-critical migration errors
        const code = error?.code || error?.errno;
        const errno = error?.errno;
        // 42710/42P07/42701 = PG already exists; 1064 = parse error; 1050 = table exists; 1060 = dup field; 1101 = BLOB default
        if (code === "42710" || code === "42P07" || code === "42701" || code === "ER_PARSE_ERROR" || errno === 1064 || code === "ER_TABLE_EXISTS_ERROR" || errno === 1050 || code === "ER_DUP_FIELDNAME" || errno === 1060 || errno === 1101) {
          continue;
        }
        // Log and continue for any migration error to avoid blocking server startup
        console.warn(`Migration warning (${migrationFile}):`, error?.message || error);
        continue;
      }
    }
  }

  schemaReady = true;
}

function normalizeFronts(fronts: unknown, front = ""): string[] {
  if (Array.isArray(fronts)) return fronts.filter((value): value is string => typeof value === "string" && value.length > 0);
  return front ? [front] : [];
}

function toResource(row: any): Resource {
  const fronts = normalizeFronts(row.fronts, row.front);
  return { ...row, photoUrl: row.photoUrl || "", group: row.group || "", skipAllocationCheck: Boolean(row.skipAllocationCheck), fronts, front: fronts[0] || row.front || "" } as Resource;
}

function toProject(row: any): Project {
  return { ...row, fronts: normalizeFronts(row.fronts) } as Project;
}

function normalizePermissions(permissions: Partial<UserPermissions> | null | undefined, role: UserRole): UserPermissions {
  return {
    ...DEFAULT_PERMISSIONS[role],
    ...(permissions || {}),
  };
}

function toAppUser(row: any): AppUser {
  const role = row.role as UserRole;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role,
    permissions: normalizePermissions(row.permissions as Partial<UserPermissions>, role),
    active: row.active,
    resourceId: row.resourceId || "",
    teamFronts: normalizeFronts(row.teamFronts),
  };
}

function toLookup(row: any): LookupItem {
  return { id: row.id, value: row.value, active: row.active };
}

function getBootstrapAdminUser(): AppUser | null {
  if (!bootstrapAdminEmail) return null;
  return {
    id: "u-bootstrap-admin",
    name: bootstrapAdminName,
    email: bootstrapAdminEmail,
    role: "admin",
    permissions: normalizePermissions(DEFAULT_PERMISSIONS.admin, "admin"),
    active: true,
    resourceId: "",
    teamFronts: [],
  };
}

function withBootstrapAdmin(users: AppUser[]) {
  const bootstrapAdmin = getBootstrapAdminUser();
  if (!bootstrapAdmin) return users;
  const exists = users.some(user => user.email.toLowerCase() === bootstrapAdmin.email.toLowerCase());
  return exists ? users : [...users, bootstrapAdmin];
}

function rowsByCategory(rows: any[]): LookupConfig {
  const grouped: LookupConfig = {
    profiles: [],
    fronts: [],
    resourceStatuses: [],
    projectStatuses: [],
    absenceTypes: [],
    allocationTypes: [],
    allocationStatuses: [],
    contractTypes: [],
    dashboardCheckStatuses: [],
  };
  for (const row of rows) {
    const category = row.category as LookupCategory;
    if (category in grouped) grouped[category].push(toLookup(row));
  }
  return grouped;
}

async function seedLookupsIfNeeded() {
  if (!hasDatabase() || lookupsSeeded) return;
  const existing = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM "lookups"');
  if (!existing || Number(existing.rows[0]?.count ?? 0) > 0) {
    lookupsSeeded = true;
    return;
  }

  for (const [category, items] of Object.entries(memoryLookups)) {
    for (const item of items) {
      await query(
        'INSERT INTO "lookups" ("id", "category", "value", "active") VALUES ($1, $2, $3, $4) ON CONFLICT ("id") DO NOTHING',
        [item.id, category, item.value, item.active],
      );
    }
  }
  lookupsSeeded = true;
}

async function seedAppUsersIfNeeded() {
  if (!hasDatabase() || appUsersSeeded) return;
  const existing = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM "app_users"');
  if (!existing || Number(existing.rows[0]?.count ?? 0) > 0) {
    await upsertBootstrapAdmin();
    appUsersSeeded = true;
    return;
  }

  for (const user of memoryAppUsers) {
    await query(
      'INSERT INTO "app_users" ("id", "name", "email", "role", "permissions", "active", "resourceId", "teamFronts") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT ("email") DO NOTHING',
      [user.id, user.name, user.email, user.role, JSON.stringify(user.permissions), user.active, user.resourceId || "", JSON.stringify(user.teamFronts || [])],
    );
  }
  await upsertBootstrapAdmin();
  appUsersSeeded = true;
}

async function upsertBootstrapAdmin() {
  const bootstrapAdmin = getBootstrapAdminUser();
  if (!bootstrapAdmin) return;
  await query(
    'INSERT INTO "app_users" ("id", "name", "email", "role", "permissions", "active", "resourceId", "teamFronts") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT ("email") DO UPDATE SET "name" = EXCLUDED."name", "role" = EXCLUDED."role", "permissions" = EXCLUDED."permissions", "active" = true, "resourceId" = COALESCE(NULLIF("app_users"."resourceId", \'\'), EXCLUDED."resourceId"), "teamFronts" = EXCLUDED."teamFronts"',
    [bootstrapAdmin.id, bootstrapAdmin.name, bootstrapAdmin.email, bootstrapAdmin.role, JSON.stringify(bootstrapAdmin.permissions), bootstrapAdmin.active, bootstrapAdmin.resourceId || "", JSON.stringify(bootstrapAdmin.teamFronts || [])],
  );
}

async function updateById<T>(table: string, id: string, values: Record<string, unknown>, columns: string[], mapper: (row: any) => T) {
  const entries = Object.entries(values).filter(([key, value]) => key !== "id" && value !== undefined && columns.includes(key));
  if (entries.length === 0) {
    const current = await query(`SELECT * FROM "${table}" WHERE "id" = $1`, [id]);
    if (!current || current.rows.length === 0) throw new Error(`${table} item not found`);
    return mapper(current.rows[0]);
  }
  const assignments = entries.map(([key], index) => `"${key}" = $${index + 2}`);
  assignments.push('"updatedAt" = now()');
  const result = await query(
    `UPDATE "${table}" SET ${assignments.join(", ")} WHERE "id" = $1 RETURNING *`,
    [id, ...entries.map(([, value]) => value)],
  );
  if (!result || result.rows.length === 0) throw new Error(`${table} item not found`);
  return mapper(result.rows[0]);
}

export async function getPlannerSnapshot() {
  const [resources, projects, phases, absences, allocations, appUsers, lookups] = await Promise.all([
    listResources(),
    listProjects(),
    listPhases(),
    listAbsences(),
    listAllocations(),
    listAppUsers(),
    getLookups(),
  ]);
  return { resources, projects, phases, absences, allocations, appUsers, lookups };
}

function createEmptyTechMove(projectId: string): TechMoveData {
  return {
    projectId,
    phase: "prepare",
    scopeItems: [],
    bdcqCatalog: [],
    questions: [],
    workshops: [],
    gaps: [],
    dcdDraft: "",
    updatedAt: new Date().toISOString(),
  };
}

function normalizeTechMove(projectId: string, data: Partial<TechMoveData> | null | undefined): TechMoveData {
  const empty = createEmptyTechMove(projectId);
  return {
    ...empty,
    ...(data || {}),
    projectId,
    scopeItems: Array.isArray(data?.scopeItems) ? data!.scopeItems : [],
    bdcqCatalog: Array.isArray(data?.bdcqCatalog) ? data!.bdcqCatalog : [],
    questions: Array.isArray(data?.questions) ? data!.questions : [],
    workshops: Array.isArray(data?.workshops) ? data!.workshops : [],
    gaps: Array.isArray(data?.gaps) ? data!.gaps : [],
    dcdDraft: typeof data?.dcdDraft === "string" ? data.dcdDraft : "",
    updatedAt: typeof data?.updatedAt === "string" ? data.updatedAt : empty.updatedAt,
  };
}

export async function getTechMoveData(projectId: string) {
  const result = await query<{ data: TechMoveData }>('SELECT "data" FROM "techmove_projects" WHERE "projectId" = $1', [projectId]);
  if (result) {
    return normalizeTechMove(projectId, result.rows[0]?.data);
  }
  return normalizeTechMove(projectId, memoryTechMove.get(projectId));
}

export async function saveTechMoveData(projectId: string, data: TechMoveData) {
  const normalized = normalizeTechMove(projectId, { ...data, updatedAt: new Date().toISOString() });
  if (!hasDatabase()) {
    memoryTechMove.set(projectId, normalized);
    return normalized;
  }
  const result = await query<{ data: TechMoveData }>(
    'INSERT INTO "techmove_projects" ("projectId", "data") VALUES ($1, $2) ON CONFLICT ("projectId") DO UPDATE SET "data" = EXCLUDED."data", "updatedAt" = now() RETURNING "data"',
    [projectId, JSON.stringify(normalized)],
  );
  return normalizeTechMove(projectId, result?.rows[0]?.data || normalized);
}

export async function listResources() {
  const result = await query('SELECT * FROM "resources" ORDER BY "name"');
  return result ? result.rows.map(toResource) : memoryResources;
}

export async function getResourceById(id: string) {
  const result = await query('SELECT * FROM "resources" WHERE "id" = $1', [id]);
  return result ? (result.rows[0] ? toResource(result.rows[0]) : null) : memoryResources.find(r => r.id === id) || null;
}

export async function createResource(input: Omit<Resource, "id"> & { id?: string }) {
  const fronts = normalizeFronts(input.fronts, input.front);
  const resource: Resource = { ...input, id: input.id || createEntityId("r"), front: fronts[0] || "", fronts } as Resource;
  if (!hasDatabase()) {
    memoryResources.push(resource);
    return resource;
  }
  const result = await query(
    'INSERT INTO "resources" ("id", "name", "email", "photoUrl", "group", "profile", "front", "fronts", "dailyCapacity", "status", "birthDate", "startDate", "endDate", "contractType", "vacationDaysEntitled", "skipAllocationCheck", "notes") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *',
    [resource.id, resource.name, resource.email, resource.photoUrl || "", resource.group || "", resource.profile, resource.front, JSON.stringify(resource.fronts), resource.dailyCapacity, resource.status, resource.birthDate, resource.startDate, resource.endDate, resource.contractType, resource.vacationDaysEntitled, resource.skipAllocationCheck, resource.notes],
  );
  return toResource(result!.rows[0]);
}

export async function updateResource(input: Partial<Resource> & { id: string }) {
  if (!hasDatabase()) {
    const idx = memoryResources.findIndex(r => r.id === input.id);
    if (idx === -1) throw new Error("Resource not found");
    const fronts = input.fronts ?? (input.front ? [input.front] : memoryResources[idx].fronts);
    memoryResources[idx] = { ...memoryResources[idx], ...input, fronts, front: fronts?.[0] ?? input.front ?? memoryResources[idx].front } as Resource;
    return memoryResources[idx];
  }
  const next: Record<string, unknown> = { ...input };
  if (Array.isArray(input.fronts)) {
    next.front = input.fronts[0] || "";
    next.fronts = JSON.stringify(input.fronts);
  }
  return updateById("resources", input.id, next, ["name", "email", "photoUrl", "group", "profile", "front", "fronts", "dailyCapacity", "status", "birthDate", "startDate", "endDate", "contractType", "vacationDaysEntitled", "skipAllocationCheck", "notes"], toResource);
}

export async function deleteResource(id: string) {
  const result = await query('DELETE FROM "resources" WHERE "id" = $1', [id]);
  if (!result) {
    const idx = memoryResources.findIndex(r => r.id === id);
    if (idx === -1) throw new Error("Resource not found");
    memoryResources.splice(idx, 1);
    return { success: true };
  }
  if (result.rowCount === 0) throw new Error("Resource not found");
  return { success: true };
}

export async function listProjects() {
  const result = await query('SELECT * FROM "projects" ORDER BY "name"');
  const projects = result ? result.rows.map(toProject) : memoryProjects;
  await Promise.all(projects.map(project => ensureProjectChecklist(project)));
  return projects;
}

export async function getProjectById(id: string) {
  const result = await query('SELECT * FROM "projects" WHERE "id" = $1', [id]);
  return result ? (result.rows[0] ? toProject(result.rows[0]) : null) : memoryProjects.find(p => p.id === id) || null;
}

export async function createProject(input: Omit<Project, "id"> & { id?: string }) {
  const project: Project = { ...input, id: input.id || createEntityId("p"), fronts: normalizeFronts(input.fronts) } as Project;
  if (!hasDatabase()) {
    memoryProjects.push(project);
    await ensureProjectChecklist(project);
    return project;
  }
  const result = await query(
    'INSERT INTO "projects" ("id", "name", "logoUrl", "client", "manager", "status", "startDate", "endDate", "fronts", "notes") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
    [project.id, project.name, project.logoUrl || "", project.client, project.manager, project.status, project.startDate, project.endDate, JSON.stringify(project.fronts), project.notes],
  );
  const created = toProject(result!.rows[0]);
  await ensureProjectChecklist(created);
  return created;
}

export async function updateProject(input: Partial<Project> & { id: string }) {
  if (!hasDatabase()) {
    const idx = memoryProjects.findIndex(p => p.id === input.id);
    if (idx === -1) throw new Error("Project not found");
    memoryProjects[idx] = { ...memoryProjects[idx], ...input } as Project;
    return memoryProjects[idx];
  }
  const next: Record<string, unknown> = { ...input };
  if (Array.isArray(input.fronts)) next.fronts = JSON.stringify(input.fronts);
  return updateById("projects", input.id, next, ["name", "logoUrl", "client", "manager", "status", "startDate", "endDate", "fronts", "notes"], toProject);
}

export async function deleteProject(id: string) {
  const result = await query('DELETE FROM "projects" WHERE "id" = $1', [id]);
  if (!result) {
    const idx = memoryProjects.findIndex(p => p.id === id);
    if (idx === -1) throw new Error("Project not found");
    memoryProjects.splice(idx, 1);
    return { success: true };
  }
  if (result.rowCount === 0) throw new Error("Project not found");
  return { success: true };
}

export async function listPhases() {
  const result = await query('SELECT * FROM "phases" ORDER BY "startDate"');
  return result ? result.rows as Phase[] : memoryPhases;
}

export async function createPhase(input: Omit<Phase, "id"> & { id?: string }) {
  const phase: Phase = { ...input, id: input.id || createEntityId("ph") } as Phase;
  if (!hasDatabase()) {
    memoryPhases.push(phase);
    return phase;
  }
  const result = await query(
    'INSERT INTO "phases" ("id", "projectId", "phase", "startDate", "endDate", "responsible", "completionPercent", "status", "notes") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [phase.id, phase.projectId, phase.phase, phase.startDate, phase.endDate, phase.responsible, phase.completionPercent, phase.status, phase.notes],
  );
  return result!.rows[0] as Phase;
}

export async function updatePhase(input: Partial<Phase> & { id: string }) {
  if (!hasDatabase()) {
    const idx = memoryPhases.findIndex(p => p.id === input.id);
    if (idx === -1) throw new Error("Phase not found");
    memoryPhases[idx] = { ...memoryPhases[idx], ...input } as Phase;
    return memoryPhases[idx];
  }
  return updateById("phases", input.id, input, ["projectId", "phase", "startDate", "endDate", "responsible", "completionPercent", "status", "notes"], row => row as Phase);
}

export async function deletePhase(id: string) {
  const result = await query('DELETE FROM "phases" WHERE "id" = $1', [id]);
  if (!result) {
    const idx = memoryPhases.findIndex(p => p.id === id);
    if (idx === -1) throw new Error("Phase not found");
    memoryPhases.splice(idx, 1);
    return { success: true };
  }
  if (result.rowCount === 0) throw new Error("Phase not found");
  return { success: true };
}

export async function listAbsences() {
  const result = await query('SELECT * FROM "absences" ORDER BY "startDate"');
  return result ? result.rows as Absence[] : memoryAbsences;
}

export async function createAbsence(input: Omit<Absence, "id"> & { id?: string }) {
  const absence: Absence = { ...input, id: input.id || createEntityId("abs") } as Absence;
  if (!hasDatabase()) {
    memoryAbsences.push(absence);
    return absence;
  }
  const result = await query(
    'INSERT INTO "absences" ("id", "resourceId", "type", "startDate", "endDate", "daysCount", "approved", "notes") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [absence.id, absence.resourceId, absence.type, absence.startDate, absence.endDate, absence.daysCount ?? null, absence.approved, absence.notes],
  );
  return result!.rows[0] as Absence;
}

export async function updateAbsence(input: Partial<Absence> & { id: string }) {
  if (!hasDatabase()) {
    const idx = memoryAbsences.findIndex(a => a.id === input.id);
    if (idx === -1) throw new Error("Absence not found");
    memoryAbsences[idx] = { ...memoryAbsences[idx], ...input } as Absence;
    return memoryAbsences[idx];
  }
  return updateById("absences", input.id, input, ["resourceId", "type", "startDate", "endDate", "daysCount", "approved", "notes"], row => row as Absence);
}

export async function deleteAbsence(id: string) {
  const result = await query('DELETE FROM "absences" WHERE "id" = $1', [id]);
  if (!result) {
    const idx = memoryAbsences.findIndex(a => a.id === id);
    if (idx === -1) throw new Error("Absence not found");
    memoryAbsences.splice(idx, 1);
    return { success: true };
  }
  if (result.rowCount === 0) throw new Error("Absence not found");
  return { success: true };
}

export async function listAllocations() {
  const result = await query('SELECT * FROM "allocations" ORDER BY "startDate"');
  return result ? result.rows.map(toAllocation) : memoryAllocations;
}

function toAllocation(row: any): Allocation {
  return { ...row, phaseId: row.phaseId ?? "" } as Allocation;
}

async function generateAvailableAllocationId() {
  if (hasDatabase()) return createDatabaseId("a");

  for (let attempt = 0; attempt < 1000; attempt++) {
    const id = generateId("a");
    if (!memoryAllocations.some(allocation => allocation.id === id)) return id;
  }

  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function createAllocation(input: Omit<Allocation, "id"> & { id?: string }) {
  const allocation: Allocation = { ...input, id: input.id || await generateAvailableAllocationId() } as Allocation;
  if (!hasDatabase()) {
    memoryAllocations.push(allocation);
    return allocation;
  }
  const result = await query(
    'INSERT INTO "allocations" ("id", "resourceId", "projectId", "phaseId", "front", "startDate", "endDate", "hoursPerDay", "allocationType", "status", "notes") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
    [allocation.id, allocation.resourceId, allocation.projectId, allocation.phaseId || null, allocation.front, allocation.startDate, allocation.endDate, allocation.hoursPerDay, allocation.allocationType, allocation.status, allocation.notes],
  );
  return toAllocation(result!.rows[0]);
}

export async function updateAllocation(input: Partial<Allocation> & { id: string }) {
  if (!hasDatabase()) {
    const idx = memoryAllocations.findIndex(a => a.id === input.id);
    if (idx === -1) throw new Error("Allocation not found");
    memoryAllocations[idx] = { ...memoryAllocations[idx], ...input } as Allocation;
    return memoryAllocations[idx];
  }
  const next = { ...input, phaseId: input.phaseId === "" ? null : input.phaseId };
  return updateById("allocations", input.id, next, ["resourceId", "projectId", "phaseId", "front", "startDate", "endDate", "hoursPerDay", "allocationType", "status", "notes"], toAllocation);
}

export async function deleteAllocation(id: string) {
  const result = await query('DELETE FROM "allocations" WHERE "id" = $1', [id]);
  if (!result) {
    const idx = memoryAllocations.findIndex(a => a.id === id);
    if (idx === -1) throw new Error("Allocation not found");
    memoryAllocations.splice(idx, 1);
    return { success: true };
  }
  if (result.rowCount === 0) throw new Error("Allocation not found");
  return { success: true };
}

export async function getLookups() {
  await seedLookupsIfNeeded();
  const result = await query('SELECT * FROM "lookups" ORDER BY "category", "value"');
  return result ? rowsByCategory(result.rows) : memoryLookups;
}

export async function addLookup(category: LookupCategory, value: string) {
  const item: LookupItem = { id: generateLookupId(), value, active: true };
  if (!hasDatabase()) {
    memoryLookups[category].push(item);
    return item;
  }
  const result = await query(
    'INSERT INTO "lookups" ("id", "category", "value", "active") VALUES ($1,$2,$3,$4) RETURNING *',
    [item.id, category, item.value, item.active],
  );
  return toLookup(result!.rows[0]);
}

export async function updateLookup(input: LookupItem) {
  if (!hasDatabase()) {
    for (const category of Object.keys(memoryLookups) as LookupCategory[]) {
      const item = memoryLookups[category].find(entry => entry.id === input.id);
      if (item) {
        item.value = input.value;
        item.active = input.active;
        return item;
      }
    }
    throw new Error("Lookup item not found");
  }
  return updateById("lookups", input.id, { ...input }, ["value", "active"], toLookup);
}

export async function deleteLookup(id: string) {
  const result = await query('DELETE FROM "lookups" WHERE "id" = $1', [id]);
  if (!result) {
    for (const category of Object.keys(memoryLookups) as LookupCategory[]) {
      const idx = memoryLookups[category].findIndex(entry => entry.id === id);
      if (idx >= 0) {
        memoryLookups[category].splice(idx, 1);
        return { success: true };
      }
    }
    throw new Error("Lookup item not found");
  }
  if (result.rowCount === 0) throw new Error("Lookup item not found");
  return { success: true };
}

export async function listAppUsers() {
  await seedAppUsersIfNeeded();
  const result = await query('SELECT * FROM "app_users" ORDER BY "name"');
  return result ? result.rows.map(toAppUser) : withBootstrapAdmin(memoryAppUsers).map(user => ({
    ...user,
    permissions: normalizePermissions(user.permissions, user.role),
  }));
}

export async function getAppUserByEmail(email: string) {
  await seedAppUsersIfNeeded();
  const result = await query('SELECT * FROM "app_users" WHERE lower("email") = lower($1)', [email]);
  const normalized = email.trim().toLowerCase();
  if (result) return result.rows[0] ? toAppUser(result.rows[0]) : null;
  const user = withBootstrapAdmin(memoryAppUsers).find(u => u.email.toLowerCase() === normalized);
  return user ? { ...user, permissions: normalizePermissions(user.permissions, user.role) } : null;
}

export async function createAppUser(input: Omit<AppUser, "id" | "active"> & { id?: string; active?: boolean }) {
  const appUser: AppUser = {
    id: input.id || generateUserId(),
    name: input.name,
    email: input.email,
    role: input.role,
    permissions: normalizePermissions(input.permissions, input.role),
    active: input.active ?? true,
    resourceId: input.resourceId || "",
    teamFronts: input.teamFronts || [],
  };
  if (!hasDatabase()) {
    memoryAppUsers.push(appUser);
    return appUser;
  }
  const result = await query(
    'INSERT INTO "app_users" ("id", "name", "email", "role", "permissions", "active", "resourceId", "teamFronts") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [appUser.id, appUser.name, appUser.email, appUser.role, JSON.stringify(appUser.permissions), appUser.active, appUser.resourceId || "", JSON.stringify(appUser.teamFronts || [])],
  );
  return toAppUser(result!.rows[0]);
}

export async function updateAppUser(input: Partial<AppUser> & { id: string }) {
  if (!hasDatabase()) {
    const idx = memoryAppUsers.findIndex(u => u.id === input.id);
    if (idx === -1) throw new Error("User not found");
    const next = { ...memoryAppUsers[idx], ...input } as AppUser;
    next.permissions = normalizePermissions(input.permissions || next.permissions, next.role);
    memoryAppUsers[idx] = next;
    return next;
  }
  const next: Record<string, unknown> = { ...input };
  if (input.permissions || input.role) {
    const currentUsers = await listAppUsers();
    const current = currentUsers.find(user => user.id === input.id);
    const role = (input.role || current?.role || "viewer") as UserRole;
    next.permissions = normalizePermissions(input.permissions || current?.permissions, role);
  }
  if (next.permissions) next.permissions = JSON.stringify(next.permissions);
  if (Array.isArray(input.teamFronts)) next.teamFronts = JSON.stringify(input.teamFronts);
  return updateById("app_users", input.id, next, ["name", "email", "role", "permissions", "active", "resourceId", "teamFronts"], toAppUser);
}

export async function deleteAppUser(id: string) {
  const result = await query('DELETE FROM "app_users" WHERE "id" = $1', [id]);
  if (!result) {
    const idx = memoryAppUsers.findIndex(u => u.id === id);
    if (idx === -1) throw new Error("User not found");
    memoryAppUsers.splice(idx, 1);
    return { success: true };
  }
  if (result.rowCount === 0) throw new Error("User not found");
  return { success: true };
}
