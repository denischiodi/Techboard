import { eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  scopeItems, bdcqQuestions, bdcqAnswers, workshops,
  workshopTranscripts, meetingMinutes, dcdDocuments, gaps, configurations
} from "../../drizzle/schema";

// ===== Scope Items =====
export async function listScopeItems(projectId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scopeItems).where(eq(scopeItems.projectId, projectId));
}
export async function createScopeItem(data: typeof scopeItems.$inferInsert) {
  const db = await getDb();
  if (!db) return data;
  await db.insert(scopeItems).values(data);
  return data;
}
export async function updateScopeItem(id: string, data: Partial<typeof scopeItems.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(scopeItems).set(data).where(eq(scopeItems.id, id));
}
export async function deleteScopeItem(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(scopeItems).where(eq(scopeItems.id, id));
}

// ===== BDCQ Questions =====
export async function listBdcqQuestions(projectId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bdcqQuestions).where(eq(bdcqQuestions.projectId, projectId));
}
export async function createBdcqQuestion(data: typeof bdcqQuestions.$inferInsert) {
  const db = await getDb();
  if (!db) return data;
  await db.insert(bdcqQuestions).values(data);
  return data;
}
export async function updateBdcqQuestion(id: string, data: Partial<typeof bdcqQuestions.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(bdcqQuestions).set(data).where(eq(bdcqQuestions.id, id));
}
export async function deleteBdcqQuestion(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(bdcqQuestions).where(eq(bdcqQuestions.id, id));
}

// ===== BDCQ Answers =====
export async function listBdcqAnswers(projectId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bdcqAnswers).where(eq(bdcqAnswers.projectId, projectId));
}
export async function createBdcqAnswer(data: typeof bdcqAnswers.$inferInsert) {
  const db = await getDb();
  if (!db) return data;
  await db.insert(bdcqAnswers).values(data);
  return data;
}
export async function updateBdcqAnswer(id: string, data: Partial<typeof bdcqAnswers.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(bdcqAnswers).set(data).where(eq(bdcqAnswers.id, id));
}
export async function deleteBdcqAnswer(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(bdcqAnswers).where(eq(bdcqAnswers.id, id));
}

// ===== Workshops =====
export async function listWorkshops(projectId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workshops).where(eq(workshops.projectId, projectId));
}
export async function createWorkshop(data: typeof workshops.$inferInsert) {
  const db = await getDb();
  if (!db) return data;
  await db.insert(workshops).values(data);
  return data;
}
export async function updateWorkshop(id: string, data: Partial<typeof workshops.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(workshops).set(data).where(eq(workshops.id, id));
}
export async function deleteWorkshop(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(workshops).where(eq(workshops.id, id));
}

// ===== Workshop Transcripts =====
export async function listTranscripts(workshopId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workshopTranscripts).where(eq(workshopTranscripts.workshopId, workshopId));
}
export async function createTranscript(data: typeof workshopTranscripts.$inferInsert) {
  const db = await getDb();
  if (!db) return data;
  await db.insert(workshopTranscripts).values(data);
  return data;
}
export async function deleteTranscript(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(workshopTranscripts).where(eq(workshopTranscripts.id, id));
}

// ===== Meeting Minutes =====
export async function getMinutesByWorkshop(workshopId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(meetingMinutes).where(eq(meetingMinutes.workshopId, workshopId));
  return rows[0] || null;
}
export async function createMinutes(data: typeof meetingMinutes.$inferInsert) {
  const db = await getDb();
  if (!db) return data;
  await db.insert(meetingMinutes).values(data);
  return data;
}
export async function updateMinutes(id: string, data: Partial<typeof meetingMinutes.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(meetingMinutes).set(data).where(eq(meetingMinutes.id, id));
}

// ===== DCD Documents =====
export async function listDcdDocuments(projectId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dcdDocuments).where(eq(dcdDocuments.projectId, projectId));
}
export async function createDcdDocument(data: typeof dcdDocuments.$inferInsert) {
  const db = await getDb();
  if (!db) return data;
  await db.insert(dcdDocuments).values(data);
  return data;
}
export async function updateDcdDocument(id: string, data: Partial<typeof dcdDocuments.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(dcdDocuments).set(data).where(eq(dcdDocuments.id, id));
}
export async function deleteDcdDocument(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(dcdDocuments).where(eq(dcdDocuments.id, id));
}

// ===== Gaps =====
export async function listGaps(projectId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(gaps).where(eq(gaps.projectId, projectId));
}
export async function createGap(data: typeof gaps.$inferInsert) {
  const db = await getDb();
  if (!db) return data;
  await db.insert(gaps).values(data);
  return data;
}
export async function updateGap(id: string, data: Partial<typeof gaps.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(gaps).set(data).where(eq(gaps.id, id));
}
export async function deleteGap(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(gaps).where(eq(gaps.id, id));
}

// ===== Configurations =====
export async function listConfigurations(projectId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(configurations).where(eq(configurations.projectId, projectId));
}
export async function createConfiguration(data: typeof configurations.$inferInsert) {
  const db = await getDb();
  if (!db) return data;
  await db.insert(configurations).values(data);
  return data;
}
export async function updateConfiguration(id: string, data: Partial<typeof configurations.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(configurations).set(data).where(eq(configurations.id, id));
}
export async function deleteConfiguration(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(configurations).where(eq(configurations.id, id));
}
