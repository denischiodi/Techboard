import { randomUUID } from "node:crypto";
import type { ActivityTemplate, ActivityTemplateProject } from "../shared/types";
import { getPgPool } from "./db";

export type ActivityTemplateInput = Omit<ActivityTemplate, "id" | "createdAt" | "updatedAt" | "createdByUserId">;

const memoryTemplates = new Map<string, ActivityTemplate>();

function templateId() {
  return `atp_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function iso(value: unknown) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

function fromRow(row: any, projects: ActivityTemplateProject[]): ActivityTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    priority: row.priority,
    recurrence: row.recurrence,
    weekday: Number(row.weekday ?? 1),
    monthDay: Number(row.monthDay ?? 1),
    dueOffsetDays: Number(row.dueOffsetDays ?? 0),
    ownerRole: row.ownerRole,
    appliesToAllProjects: Boolean(row.appliesToAllProjects),
    active: Boolean(row.active),
    projects,
    createdByUserId: row.createdByUserId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export async function listActivityTemplates() {
  const db = getPgPool();
  if (!db) return [...memoryTemplates.values()].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  const [templates, projects] = await Promise.all([
    db.query('SELECT * FROM "activity_templates" ORDER BY "title"'),
    db.query('SELECT "templateId","projectId","assigneeUserId" FROM "activity_template_projects"'),
  ]);
  return templates.rows.map(row => fromRow(row, projects.rows.filter(item => item.templateId === row.id)));
}

export async function getActivityTemplate(id: string) {
  return (await listActivityTemplates()).find(item => item.id === id) || null;
}

async function replaceProjects(id: string, projects: ActivityTemplateProject[]) {
  const db = getPgPool();
  if (!db) return;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query('DELETE FROM "activity_template_projects" WHERE "templateId" = $1', [id]);
    for (const project of projects) {
      await client.query('INSERT INTO "activity_template_projects" ("templateId","projectId","assigneeUserId") VALUES ($1,$2,$3)', [id, project.projectId, project.assigneeUserId || ""]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createActivityTemplate(input: ActivityTemplateInput, createdByUserId: string) {
  const now = new Date().toISOString();
  const created: ActivityTemplate = { id: templateId(), ...input, createdByUserId, createdAt: now, updatedAt: now };
  const db = getPgPool();
  if (!db) memoryTemplates.set(created.id, created);
  else {
    await db.query(
      'INSERT INTO "activity_templates" ("id","title","description","priority","recurrence","weekday","monthDay","dueOffsetDays","ownerRole","appliesToAllProjects","active","createdByUserId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [created.id, created.title, created.description, created.priority, created.recurrence, created.weekday, created.monthDay, created.dueOffsetDays, created.ownerRole, created.appliesToAllProjects, created.active, created.createdByUserId],
    );
    await replaceProjects(created.id, created.projects);
  }
  return created;
}

export async function updateActivityTemplate(id: string, input: ActivityTemplateInput) {
  const current = await getActivityTemplate(id);
  if (!current) return null;
  const updated: ActivityTemplate = { ...current, ...input, id, createdByUserId: current.createdByUserId, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
  const db = getPgPool();
  if (!db) memoryTemplates.set(id, updated);
  else {
    await db.query(
      'UPDATE "activity_templates" SET "title"=$2,"description"=$3,"priority"=$4,"recurrence"=$5,"weekday"=$6,"monthDay"=$7,"dueOffsetDays"=$8,"ownerRole"=$9,"appliesToAllProjects"=$10,"active"=$11,"updatedAt"=now() WHERE "id"=$1',
      [id, updated.title, updated.description, updated.priority, updated.recurrence, updated.weekday, updated.monthDay, updated.dueOffsetDays, updated.ownerRole, updated.appliesToAllProjects, updated.active],
    );
    await replaceProjects(id, updated.projects);
  }
  return updated;
}

export async function setActivityTemplateActive(id: string, active: boolean) {
  const current = await getActivityTemplate(id);
  if (!current) return null;
  return updateActivityTemplate(id, { ...current, active, projects: current.projects });
}
