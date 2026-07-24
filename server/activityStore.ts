import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  Activity,
  ActivityAttachment,
  ActivityChecklistItem,
  ActivityComment,
  ActivityHistoryEvent,
  ActivityNotification,
  ActivityPriority,
  ActivityScope,
  ActivitySourceType,
  ActivityStage,
  ActivityStatus,
  AppUser,
} from "../shared/types";
import { getPgPool } from "./db";
import * as plannerStore from "./plannerStore";

type ActivityRow = Omit<
  Activity,
  | "projectName"
  | "displayTitle"
  | "trackingCode"
  | "assigneeName"
  | "creatorName"
  | "participantUserIds"
  | "participants"
  | "checklist"
  | "comments"
  | "attachments"
  | "history"
>;

const memoryActivities = new Map<string, ActivityRow>();
const memoryParticipants = new Map<string, Set<string>>();
const memoryChecklist = new Map<string, ActivityChecklistItem[]>();
const memoryComments = new Map<string, ActivityComment[]>();
const memoryAttachments = new Map<string, ActivityAttachment[]>();
const memoryHistory = new Map<string, ActivityHistoryEvent[]>();
const memoryNotifications: ActivityNotification[] = [];
const memoryNotificationKeys = new Set<string>();
const memorySequenceCounters = new Map<string, number>();
const memorySuppressions = new Map<string, { activityId: string; reason: string; createdByUserId: string; restoredAt: string }>();

function id(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function iso(value: unknown) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

function now() {
  return new Date().toISOString();
}

function normalizedStage(
  scope: ActivityScope,
  stage?: ActivityStage
): ActivityStage {
  return scope === "internal" ? "GERAL" : stage || "GERAL";
}

export function activityStageForSource(
  sourceType?: ActivitySourceType,
  sourceUrl = ""
): ActivityStage {
  if (sourceType === "bdcq_question" || sourceType === "techmove_question")
    return "BDCQ";
  if (sourceType === "workflow_test") return "TESTE";
  if (
    [
      "workflow_configuration",
      "techmove_gap",
      "techmove_configuration",
    ].includes(sourceType || "")
  )
    return "DCD";
  if (sourceType === "approval") {
    if (sourceUrl.includes("/bdcq")) return "BDCQ";
    if (sourceUrl.includes("/tests")) return "TESTE";
    if (sourceUrl.includes("/dcd")) return "DCD";
  }
  return "GERAL";
}

function sequenceKey(
  scope: ActivityScope,
  projectId: string,
  stage: ActivityStage
) {
  return `${scope}:${projectId}:${stage}`;
}

function nextMemorySequence(
  scope: ActivityScope,
  projectId: string,
  stage: ActivityStage
) {
  const key = sequenceKey(scope, projectId, stage);
  const next = (memorySequenceCounters.get(key) || 0) + 1;
  memorySequenceCounters.set(key, next);
  return next;
}

async function nextDatabaseSequence(
  client: PoolClient,
  scope: ActivityScope,
  projectId: string,
  stage: ActivityStage
) {
  const key = sequenceKey(scope, projectId, stage);
  const result = await client.query<{ lastNumber: number }>(
    `INSERT INTO "activity_sequence_counters" ("counterKey","scope","projectId","stage","lastNumber")
     VALUES ($1,$2,$3,$4,1)
     ON CONFLICT ("counterKey") DO UPDATE SET "lastNumber"="activity_sequence_counters"."lastNumber"+1,"updatedAt"=now()
     RETURNING "lastNumber"`,
    [key, scope, projectId, stage]
  );
  return Number(result.rows[0].lastNumber);
}

function rowFromDb(row: any): ActivityRow {
  return {
    id: row.id,
    scope: row.scope,
    projectId: row.projectId || "",
    stage: row.stage || "GERAL",
    sequenceNumber: Number(row.sequenceNumber || 1),
    title: row.title,
    description: row.description || "",
    status: row.status,
    priority: row.priority,
    assigneeUserId: row.assigneeUserId || "",
    creatorUserId: row.creatorUserId,
    dueDate: row.dueDate || "",
    sourceType: row.sourceType,
    sourceKey: row.sourceKey || "",
    sourceUrl: row.sourceUrl || "",
    sourceResolved: Boolean(row.sourceResolved),
    archivedAt: iso(row.archivedAt),
    archivedByUserId: row.archivedByUserId || "",
    archiveReason: row.archiveReason || "",
    archiveSnapshot: row.archiveSnapshot || {},
    completedAt: iso(row.completedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function checklistFromDb(
  row: any,
  users: Map<string, AppUser>
): ActivityChecklistItem {
  return {
    id: row.id,
    activityId: row.activityId,
    description: row.description,
    assigneeUserId: row.assigneeUserId || "",
    assigneeName: users.get(row.assigneeUserId)?.name || "",
    dueDate: row.dueDate || "",
    required: Boolean(row.required),
    completed: Boolean(row.completed),
    position: Number(row.position || 0),
    createdByUserId: row.createdByUserId,
    completedAt: iso(row.completedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

async function hydrate(rows: ActivityRow[]): Promise<Activity[]> {
  if (rows.length === 0) return [];
  const [users, projects] = await Promise.all([
    plannerStore.listAppUsers(),
    plannerStore.listProjects(),
  ]);
  const usersById = new Map(users.map(user => [user.id, user]));
  const projectsById = new Map(projects.map(project => [project.id, project]));
  const db = getPgPool();

  let participantRows: any[] = [];
  let checklistRows: any[] = [];
  let commentRows: any[] = [];
  let attachmentRows: any[] = [];
  let historyRows: any[] = [];
  if (db) {
    const activityIds = rows.map(row => row.id);
    const [participants, checklist, comments, attachments, history] =
      await Promise.all([
        db.query(
          'SELECT * FROM "activity_participants" WHERE "activityId" = ANY($1)',
          [activityIds]
        ),
        db.query(
          'SELECT * FROM "activity_checklist_items" WHERE "activityId" = ANY($1) ORDER BY "position", "createdAt"',
          [activityIds]
        ),
        db.query(
          'SELECT * FROM "activity_comments" WHERE "activityId" = ANY($1) ORDER BY "createdAt"',
          [activityIds]
        ),
        db.query(
          'SELECT * FROM "activity_attachments" WHERE "activityId" = ANY($1) ORDER BY "createdAt"',
          [activityIds]
        ),
        db.query(
          'SELECT * FROM "activity_history" WHERE "activityId" = ANY($1) ORDER BY "createdAt" DESC',
          [activityIds]
        ),
      ]);
    participantRows = participants.rows;
    checklistRows = checklist.rows;
    commentRows = comments.rows;
    attachmentRows = attachments.rows;
    historyRows = history.rows;
  }

  const groupByActivity = <T extends { activityId: string }>(items: T[]) => {
    const grouped = new Map<string, T[]>();
    for (const item of items) {
      const group = grouped.get(item.activityId);
      if (group) group.push(item);
      else grouped.set(item.activityId, [item]);
    }
    return grouped;
  };
  const participantsByActivity = groupByActivity(participantRows);
  const checklistByActivity = groupByActivity(checklistRows);
  const commentsByActivity = groupByActivity(commentRows);
  const attachmentsByActivity = groupByActivity(attachmentRows);
  const historyByActivity = groupByActivity(historyRows);

  return rows.map(row => {
    const participantIds = db
      ? (participantsByActivity.get(row.id) || []).map(item => item.userId)
      : [...(memoryParticipants.get(row.id) || new Set())];
    const checklist = db
      ? (checklistByActivity.get(row.id) || []).map(item =>
          checklistFromDb(item, usersById)
        )
      : (memoryChecklist.get(row.id) || []).map(item => ({
          ...item,
          assigneeName: usersById.get(item.assigneeUserId)?.name || "",
        }));
    const comments = db
      ? (commentsByActivity.get(row.id) || []).map(item => ({
          id: item.id,
          activityId: item.activityId,
          authorUserId: item.authorUserId,
          authorName: usersById.get(item.authorUserId)?.name || "Usuário",
          content: item.content,
          createdAt: iso(item.createdAt),
        }))
      : memoryComments.get(row.id) || [];
    const attachments = db
      ? (attachmentsByActivity.get(row.id) || []).map(item => ({
          id: item.id,
          activityId: item.activityId,
          fileName: item.fileName,
          contentType: item.contentType,
          url: item.url,
          uploadedByUserId: item.uploadedByUserId,
          uploadedByName:
            usersById.get(item.uploadedByUserId)?.name || "Usuário",
          createdAt: iso(item.createdAt),
        }))
      : memoryAttachments.get(row.id) || [];
    const history = db
      ? (historyByActivity.get(row.id) || []).map(item => ({
          id: item.id,
          activityId: item.activityId,
          actorUserId: item.actorUserId,
          actorName: item.actorName,
          action: item.action,
          details: item.details || {},
          createdAt: iso(item.createdAt),
        }))
      : memoryHistory.get(row.id) || [];
    const projectName =
      projectsById.get(row.projectId)?.name ||
      (row.scope === "internal" ? "Operação interna" : "Projeto");
    const trackingCode = `${projectName} - ${row.stage} - ${String(row.sequenceNumber).padStart(3, "0")}`;
    return {
      ...row,
      projectName,
      trackingCode,
      displayTitle: `${trackingCode} - ${row.title}`,
      assigneeName: usersById.get(row.assigneeUserId)?.name || "",
      creatorName: usersById.get(row.creatorUserId)?.name || "Sistema",
      participantUserIds: participantIds,
      participants: participantIds.flatMap(userId => {
        const user = usersById.get(userId);
        return user
          ? [{ id: user.id, name: user.name, email: user.email }]
          : [];
      }),
      checklist,
      comments,
      attachments,
      history,
    };
  });
}

export async function listActivities(includeArchived = false) {
  const db = getPgPool();
  if (!db) {
    const rows = [...memoryActivities.values()].filter(
      row => includeArchived || !row.archivedAt
    );
    return hydrate(rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }
  const result = await db.query(
    `SELECT * FROM "activities" ${includeArchived ? "" : 'WHERE "archivedAt" IS NULL'} ORDER BY "updatedAt" DESC`
  );
  return hydrate(result.rows.map(rowFromDb));
}

export async function getActivity(activityId: string) {
  const db = getPgPool();
  const row = db
    ? (
        await db.query('SELECT * FROM "activities" WHERE "id" = $1', [
          activityId,
        ])
      ).rows[0]
    : memoryActivities.get(activityId);
  if (!row) return null;
  return (await hydrate([db ? rowFromDb(row) : row]))[0] || null;
}

export type CreateActivityInput = {
  scope: ActivityScope;
  projectId?: string;
  stage?: ActivityStage;
  title: string;
  description?: string;
  status?: ActivityStatus;
  priority?: ActivityPriority;
  assigneeUserId?: string;
  creatorUserId: string;
  participantUserIds?: string[];
  dueDate?: string;
  sourceType?: ActivitySourceType;
  sourceKey?: string;
  sourceUrl?: string;
  sourceResolved?: boolean;
};

export async function createActivity(input: CreateActivityInput) {
  const timestamp = now();
  const projectId = input.scope === "internal" ? "" : input.projectId || "";
  const stage = normalizedStage(
    input.scope,
    input.stage || activityStageForSource(input.sourceType, input.sourceUrl)
  );
  const row: ActivityRow = {
    id: id("act"),
    scope: input.scope,
    projectId,
    stage,
    sequenceNumber: 0,
    title: input.title,
    description: input.description || "",
    status: input.status || "A fazer",
    priority: input.priority || "Média",
    assigneeUserId: input.assigneeUserId || "",
    creatorUserId: input.creatorUserId,
    dueDate: input.dueDate || "",
    sourceType: input.sourceType || "manual",
    sourceKey: input.sourceKey || "",
    sourceUrl: input.sourceUrl || "",
    sourceResolved: input.sourceResolved || false,
    archivedAt: "",
    archivedByUserId: "",
    archiveReason: "",
    archiveSnapshot: {},
    completedAt: input.status === "Concluída" ? timestamp : "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const participantIds = [
    ...new Set(
      [
        input.creatorUserId,
        ...(input.participantUserIds || []),
        input.assigneeUserId || "",
      ].filter(Boolean)
    ),
  ];
  const db = getPgPool();
  if (!db) {
    row.sequenceNumber = nextMemorySequence(
      row.scope,
      row.projectId,
      row.stage
    );
    memoryActivities.set(row.id, row);
    memoryParticipants.set(row.id, new Set(participantIds));
  } else {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      row.sequenceNumber = await nextDatabaseSequence(
        client,
        row.scope,
        row.projectId,
        row.stage
      );
      await client.query(
        'INSERT INTO "activities" ("id","scope","projectId","stage","sequenceNumber","title","description","status","priority","assigneeUserId","creatorUserId","dueDate","sourceType","sourceKey","sourceUrl","sourceResolved","completedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)',
        [
          row.id,
          row.scope,
          row.projectId,
          row.stage,
          row.sequenceNumber,
          row.title,
          row.description,
          row.status,
          row.priority,
          row.assigneeUserId,
          row.creatorUserId,
          row.dueDate,
          row.sourceType,
          row.sourceKey,
          row.sourceUrl,
          row.sourceResolved,
          row.completedAt || null,
        ]
      );
      for (const userId of participantIds) {
        await client.query(
          'INSERT INTO "activity_participants" ("activityId","userId") VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [row.id, userId]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return getActivity(row.id);
}

export async function updateActivity(
  activityId: string,
  data: Partial<
    Pick<
      ActivityRow,
      | "title"
      | "description"
      | "status"
      | "priority"
      | "assigneeUserId"
      | "dueDate"
      | "sourceResolved"
      | "sourceUrl"
    >
  >
) {
  const db = getPgPool();
  const timestamp = now();
  if (!db) {
    const current = memoryActivities.get(activityId);
    if (!current) throw new Error("Atividade não encontrada");
    const next = { ...current, ...data, updatedAt: timestamp };
    if (data.status !== undefined)
      next.completedAt =
        data.status === "Concluída" ? current.completedAt || timestamp : "";
    memoryActivities.set(activityId, next);
  } else {
    const allowed = [
      "title",
      "description",
      "status",
      "priority",
      "assigneeUserId",
      "dueDate",
      "sourceResolved",
      "sourceUrl",
    ];
    const entries = Object.entries(data).filter(
      ([key, value]) => allowed.includes(key) && value !== undefined
    );
    if (entries.length === 0) return getActivity(activityId);
    const assignments = entries.map(
      ([key], index) => `"${key}" = $${index + 2}`
    );
    if (data.status !== undefined) {
      assignments.push(
        data.status === "Concluída"
          ? '"completedAt" = COALESCE("completedAt", now())'
          : '"completedAt" = NULL'
      );
    }
    assignments.push('"updatedAt" = now()');
    const result = await db.query(
      `UPDATE "activities" SET ${assignments.join(",")} WHERE "id" = $1 RETURNING "id"`,
      [activityId, ...entries.map(([, value]) => value)]
    );
    if (!result.rows[0]) throw new Error("Atividade não encontrada");
  }
  if (data.assigneeUserId)
    await addParticipant(activityId, data.assigneeUserId);
  return getActivity(activityId);
}

export async function archiveActivity(activityId: string) {
  const db = getPgPool();
  if (!db) {
    const current = memoryActivities.get(activityId);
    if (!current) throw new Error("Atividade não encontrada");
    memoryActivities.set(activityId, {
      ...current,
      archivedAt: now(),
      updatedAt: now(),
    });
  } else {
    await db.query(
      'UPDATE "activities" SET "archivedAt" = now(), "updatedAt" = now() WHERE "id" = $1',
      [activityId]
    );
  }
}

export async function adminArchiveActivity(
  activityId: string,
  actor: Pick<AppUser, "id" | "name">,
  reason: string,
  originSnapshot: Record<string, unknown> | null = null
) {
  const current = await getActivity(activityId);
  if (!current || current.archivedAt) throw new Error(current ? "Atividade já arquivada" : "Atividade não encontrada");
  const snapshot = {
    title: current.title, description: current.description, status: current.status,
    priority: current.priority, assigneeUserId: current.assigneeUserId,
    dueDate: current.dueDate, sourceResolved: current.sourceResolved, origin: originSnapshot,
  };
  const db = getPgPool();
  if (!db) {
    const row = memoryActivities.get(activityId)!;
    memoryActivities.set(activityId, { ...row, archivedAt: now(), archivedByUserId: actor.id, archiveReason: reason, archiveSnapshot: snapshot, updatedAt: now() });
    if (current.sourceType !== "manual")
      memorySuppressions.set(`${current.sourceType}:${current.sourceKey}`, { activityId, reason, createdByUserId: actor.id, restoredAt: "" });
    await addHistory(activityId, actor, "ADMIN_ARCHIVED", { reason, before: snapshot, sourceType: current.sourceType, sourceKey: current.sourceKey });
  } else {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        'UPDATE "activities" SET "archivedAt"=now(),"archivedByUserId"=$2,"archiveReason"=$3,"archiveSnapshot"=$4,"updatedAt"=now() WHERE "id"=$1',
        [activityId, actor.id, reason, JSON.stringify(snapshot)]
      );
      if (current.sourceType !== "manual")
        await client.query(
          'INSERT INTO "activity_source_suppressions" ("id","sourceType","sourceKey","activityId","reason","createdByUserId") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("sourceType","sourceKey") WHERE "restoredAt" IS NULL DO NOTHING',
          [id("asu"), current.sourceType, current.sourceKey, activityId, reason, actor.id]
        );
      await client.query(
        'INSERT INTO "activity_history" ("id","activityId","actorUserId","actorName","action","details") VALUES ($1,$2,$3,$4,$5,$6)',
        [id("ahe"), activityId, actor.id, actor.name, "ADMIN_ARCHIVED", JSON.stringify({ reason, before: snapshot, sourceType: current.sourceType, sourceKey: current.sourceKey })]
      );
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  return getActivity(activityId);
}

export async function adminRestoreActivity(
  activityId: string,
  actor: Pick<AppUser, "id" | "name">,
  reason: string
) {
  const current = await getActivity(activityId);
  if (!current || !current.archivedAt) throw new Error(current ? "Atividade não está arquivada" : "Atividade não encontrada");
  const db = getPgPool();
  if (!db) {
    const row = memoryActivities.get(activityId)!;
    memoryActivities.set(activityId, { ...row, archivedAt: "", archivedByUserId: "", archiveReason: "", updatedAt: now() });
    const suppression = memorySuppressions.get(`${current.sourceType}:${current.sourceKey}`);
    if (suppression) suppression.restoredAt = now();
    await addHistory(activityId, actor, "ADMIN_RESTORED", { reason, restoredSnapshot: current.archiveSnapshot, archivedAt: current.archivedAt });
  } else {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`UPDATE "activities" SET "archivedAt"=NULL,"archivedByUserId"='',"archiveReason"='',"updatedAt"=now() WHERE "id"=$1`, [activityId]);
      await client.query('UPDATE "activity_source_suppressions" SET "restoredAt"=now() WHERE "activityId"=$1 AND "restoredAt" IS NULL', [activityId]);
      await client.query(
        'INSERT INTO "activity_history" ("id","activityId","actorUserId","actorName","action","details") VALUES ($1,$2,$3,$4,$5,$6)',
        [id("ahe"), activityId, actor.id, actor.name, "ADMIN_RESTORED", JSON.stringify({ reason, restoredSnapshot: current.archiveSnapshot, archivedAt: current.archivedAt })]
      );
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  return getActivity(activityId);
}

export async function isSourceSuppressed(sourceType: ActivitySourceType, sourceKey: string) {
  const db = getPgPool();
  if (!db) {
    const item = memorySuppressions.get(`${sourceType}:${sourceKey}`);
    return Boolean(item && !item.restoredAt);
  }
  const result = await db.query(
    'SELECT 1 FROM "activity_source_suppressions" WHERE "sourceType"=$1 AND "sourceKey"=$2 AND "restoredAt" IS NULL LIMIT 1',
    [sourceType, sourceKey]
  );
  return Boolean(result.rows[0]);
}

export async function addParticipant(activityId: string, userId: string) {
  const db = getPgPool();
  if (!db) {
    const participants =
      memoryParticipants.get(activityId) || new Set<string>();
    participants.add(userId);
    memoryParticipants.set(activityId, participants);
  } else {
    await db.query(
      'INSERT INTO "activity_participants" ("activityId","userId") VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [activityId, userId]
    );
  }
  return getActivity(activityId);
}

export async function removeParticipant(activityId: string, userId: string) {
  const db = getPgPool();
  if (!db) memoryParticipants.get(activityId)?.delete(userId);
  else
    await db.query(
      'DELETE FROM "activity_participants" WHERE "activityId" = $1 AND "userId" = $2',
      [activityId, userId]
    );
  return getActivity(activityId);
}

export async function replaceParticipants(
  activityId: string,
  userIds: string[]
) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  const db = getPgPool();
  if (!db) {
    memoryParticipants.set(activityId, new Set(uniqueUserIds));
  } else {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        'DELETE FROM "activity_participants" WHERE "activityId" = $1',
        [activityId]
      );
      for (const userId of uniqueUserIds) {
        await client.query(
          'INSERT INTO "activity_participants" ("activityId","userId") VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [activityId, userId]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return getActivity(activityId);
}

export async function addHistory(
  activityId: string,
  actor: Pick<AppUser, "id" | "name"> | null,
  action: string,
  details: Record<string, unknown> = {}
) {
  const event: ActivityHistoryEvent = {
    id: id("ahe"),
    activityId,
    actorUserId: actor?.id || "",
    actorName: actor?.name || "Sistema",
    action,
    details,
    createdAt: now(),
  };
  const db = getPgPool();
  if (!db)
    memoryHistory.set(activityId, [
      event,
      ...(memoryHistory.get(activityId) || []),
    ]);
  else
    await db.query(
      'INSERT INTO "activity_history" ("id","activityId","actorUserId","actorName","action","details") VALUES ($1,$2,$3,$4,$5,$6)',
      [
        event.id,
        activityId,
        event.actorUserId,
        event.actorName,
        event.action,
        JSON.stringify(details),
      ]
    );
  return event;
}

export async function createChecklistItem(
  activityId: string,
  input: {
    description: string;
    assigneeUserId?: string;
    dueDate?: string;
    required?: boolean;
    createdByUserId: string;
  }
) {
  const existing = (await getActivity(activityId))?.checklist || [];
  const timestamp = now();
  const item: ActivityChecklistItem = {
    id: id("aci"),
    activityId,
    description: input.description,
    assigneeUserId: input.assigneeUserId || "",
    assigneeName: "",
    dueDate: input.dueDate || "",
    required: input.required ?? true,
    completed: false,
    position: existing.length,
    createdByUserId: input.createdByUserId,
    completedAt: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const db = getPgPool();
  if (!db) memoryChecklist.set(activityId, [...existing, item]);
  else
    await db.query(
      'INSERT INTO "activity_checklist_items" ("id","activityId","description","assigneeUserId","dueDate","required","completed","position","createdByUserId") VALUES ($1,$2,$3,$4,$5,$6,false,$7,$8)',
      [
        item.id,
        activityId,
        item.description,
        item.assigneeUserId,
        item.dueDate,
        item.required,
        item.position,
        item.createdByUserId,
      ]
    );
  if (item.assigneeUserId)
    await addParticipant(activityId, item.assigneeUserId);
  return (
    (await getActivity(activityId))?.checklist.find(
      current => current.id === item.id
    ) || item
  );
}

export async function updateChecklistItem(
  activityId: string,
  itemId: string,
  data: Partial<
    Pick<
      ActivityChecklistItem,
      | "description"
      | "assigneeUserId"
      | "dueDate"
      | "required"
      | "completed"
      | "position"
    >
  >
) {
  const db = getPgPool();
  if (!db) {
    const items = memoryChecklist.get(activityId) || [];
    const index = items.findIndex(item => item.id === itemId);
    if (index < 0) throw new Error("Item não encontrado");
    const current = items[index];
    items[index] = {
      ...current,
      ...data,
      completedAt:
        data.completed === undefined
          ? current.completedAt
          : data.completed
            ? current.completedAt || now()
            : "",
      updatedAt: now(),
    };
    memoryChecklist.set(activityId, items);
  } else {
    const allowed = [
      "description",
      "assigneeUserId",
      "dueDate",
      "required",
      "completed",
      "position",
    ];
    const entries = Object.entries(data).filter(
      ([key, value]) => allowed.includes(key) && value !== undefined
    );
    if (entries.length === 0)
      return (await getActivity(activityId))?.checklist.find(
        item => item.id === itemId
      );
    const assignments = entries.map(
      ([key], index) => `"${key}" = $${index + 3}`
    );
    if (data.completed !== undefined) {
      const param = entries.findIndex(([key]) => key === "completed") + 3;
      assignments.push(
        `"completedAt" = CASE WHEN $${param} THEN COALESCE("completedAt", now()) ELSE NULL END`
      );
    }
    assignments.push('"updatedAt" = now()');
    const result = await db.query(
      `UPDATE "activity_checklist_items" SET ${assignments.join(",")} WHERE "activityId" = $1 AND "id" = $2 RETURNING "id"`,
      [activityId, itemId, ...entries.map(([, value]) => value)]
    );
    if (!result.rows[0]) throw new Error("Item não encontrado");
  }
  if (data.assigneeUserId)
    await addParticipant(activityId, data.assigneeUserId);
  return (await getActivity(activityId))?.checklist.find(
    item => item.id === itemId
  );
}

export async function deleteChecklistItem(activityId: string, itemId: string) {
  const db = getPgPool();
  if (!db)
    memoryChecklist.set(
      activityId,
      (memoryChecklist.get(activityId) || []).filter(item => item.id !== itemId)
    );
  else
    await db.query(
      'DELETE FROM "activity_checklist_items" WHERE "activityId" = $1 AND "id" = $2',
      [activityId, itemId]
    );
}

export async function reorderChecklist(activityId: string, itemIds: string[]) {
  const db = getPgPool();
  if (!db) {
    const positions = new Map(
      itemIds.map((itemId, position) => [itemId, position])
    );
    memoryChecklist.set(
      activityId,
      (memoryChecklist.get(activityId) || [])
        .map(item => ({
          ...item,
          position: positions.get(item.id) ?? item.position,
        }))
        .sort((a, b) => a.position - b.position)
    );
  } else {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      for (const [position, itemId] of itemIds.entries())
        await client.query(
          'UPDATE "activity_checklist_items" SET "position" = $3, "updatedAt" = now() WHERE "activityId" = $1 AND "id" = $2',
          [activityId, itemId, position]
        );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return (await getActivity(activityId))?.checklist || [];
}

export async function addComment(
  activityId: string,
  author: Pick<AppUser, "id" | "name">,
  content: string
) {
  const comment: ActivityComment = {
    id: id("acm"),
    activityId,
    authorUserId: author.id,
    authorName: author.name,
    content,
    createdAt: now(),
  };
  const db = getPgPool();
  if (!db)
    memoryComments.set(activityId, [
      ...(memoryComments.get(activityId) || []),
      comment,
    ]);
  else
    await db.query(
      'INSERT INTO "activity_comments" ("id","activityId","authorUserId","content") VALUES ($1,$2,$3,$4)',
      [comment.id, activityId, author.id, content]
    );
  return comment;
}

export async function addAttachment(
  activityId: string,
  input: Omit<
    ActivityAttachment,
    "id" | "activityId" | "createdAt" | "uploadedByName"
  >
) {
  const attachment: ActivityAttachment = {
    id: id("aat"),
    activityId,
    fileName: input.fileName,
    contentType: input.contentType,
    url: input.url,
    uploadedByUserId: input.uploadedByUserId,
    uploadedByName: "",
    createdAt: now(),
  };
  const db = getPgPool();
  if (!db)
    memoryAttachments.set(activityId, [
      ...(memoryAttachments.get(activityId) || []),
      attachment,
    ]);
  else
    await db.query(
      'INSERT INTO "activity_attachments" ("id","activityId","fileName","contentType","url","uploadedByUserId") VALUES ($1,$2,$3,$4,$5,$6)',
      [
        attachment.id,
        activityId,
        attachment.fileName,
        attachment.contentType,
        attachment.url,
        attachment.uploadedByUserId,
      ]
    );
  return attachment;
}

export async function createNotifications(input: {
  activityId: string;
  eventKey: string;
  eventType: string;
  title: string;
  message: string;
  userIds: string[];
}) {
  const db = getPgPool();
  const created: ActivityNotification[] = [];
  for (const userId of [...new Set(input.userIds.filter(Boolean))]) {
    const notification: ActivityNotification = {
      id: id("ant"),
      userId,
      activityId: input.activityId,
      eventType: input.eventType,
      title: input.title,
      message: input.message,
      readAt: "",
      createdAt: now(),
    };
    if (!db) {
      const memoryKey = `${input.eventKey}:${userId}`;
      if (memoryNotificationKeys.has(memoryKey)) continue;
      memoryNotificationKeys.add(memoryKey);
      memoryNotifications.push(notification);
      created.push(notification);
    } else {
      const result = await db.query(
        'INSERT INTO "activity_notifications" ("id","userId","activityId","eventKey","eventType","title","message") VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT ("eventKey","userId") DO NOTHING RETURNING *',
        [
          notification.id,
          userId,
          input.activityId,
          input.eventKey,
          input.eventType,
          input.title,
          input.message,
        ]
      );
      if (result.rows[0]) created.push(notification);
    }
  }
  return created;
}

export async function listNotifications(userId: string) {
  const db = getPgPool();
  if (!db)
    return memoryNotifications
      .filter(item => item.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const result = await db.query(
    'SELECT * FROM "activity_notifications" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 100',
    [userId]
  );
  return result.rows.map(
    row =>
      ({
        id: row.id,
        userId: row.userId,
        activityId: row.activityId,
        eventType: row.eventType,
        title: row.title,
        message: row.message,
        readAt: iso(row.readAt),
        createdAt: iso(row.createdAt),
      }) as ActivityNotification
  );
}

export async function markNotificationsRead(
  userId: string,
  notificationId?: string
) {
  const db = getPgPool();
  if (!db) {
    for (const item of memoryNotifications)
      if (
        item.userId === userId &&
        (!notificationId || item.id === notificationId)
      )
        item.readAt = now();
  } else {
    await db.query(
      `UPDATE "activity_notifications" SET "readAt" = now() WHERE "userId" = $1 ${notificationId ? 'AND "id" = $2' : ""}`,
      notificationId ? [userId, notificationId] : [userId]
    );
  }
}

export async function findBySource(
  sourceType: ActivitySourceType,
  sourceKey: string
) {
  const db = getPgPool();
  if (!db) {
    const row = [...memoryActivities.values()].find(
      activity =>
        activity.sourceType === sourceType && activity.sourceKey === sourceKey
    );
    return row ? (await hydrate([row]))[0] : null;
  }
  const result = await db.query(
    'SELECT * FROM "activities" WHERE "sourceType" = $1 AND "sourceKey" = $2 LIMIT 1',
    [sourceType, sourceKey]
  );
  return result.rows[0]
    ? (await hydrate([rowFromDb(result.rows[0])]))[0]
    : null;
}

export async function upsertSourceActivity(input: CreateActivityInput) {
  if (!input.sourceType || !input.sourceKey)
    throw new Error("Origem automática inválida");
  if (await isSourceSuppressed(input.sourceType, input.sourceKey)) return null;
  const db = getPgPool();
  if (db) {
    const existingResult = await db.query(
      'SELECT * FROM "activities" WHERE "sourceType" = $1 AND "sourceKey" = $2 LIMIT 1',
      [input.sourceType, input.sourceKey]
    );
    let existing = existingResult.rows[0];
    if (!existing) {
      const activityId = id("act");
      const status = input.status || "A fazer";
      const projectId = input.scope === "internal" ? "" : input.projectId || "";
      const stage = normalizedStage(
        input.scope,
        input.stage || activityStageForSource(input.sourceType, input.sourceUrl)
      );
      const client = await db.connect();
      let created = false;
      try {
        await client.query("BEGIN");
        const sequenceNumber = await nextDatabaseSequence(
          client,
          input.scope,
          projectId,
          stage
        );
        existing = (
          await client.query(
            'SELECT * FROM "activities" WHERE "sourceType"=$1 AND "sourceKey"=$2 LIMIT 1',
            [input.sourceType, input.sourceKey]
          )
        ).rows[0];
        if (existing) {
          await client.query("ROLLBACK");
        } else {
          await client.query(
            'INSERT INTO "activities" ("id","scope","projectId","stage","sequenceNumber","title","description","status","priority","assigneeUserId","creatorUserId","dueDate","sourceType","sourceKey","sourceUrl","sourceResolved","completedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)',
            [
              activityId,
              input.scope,
              projectId,
              stage,
              sequenceNumber,
              input.title,
              input.description || "",
              status,
              input.priority || "Média",
              input.assigneeUserId || "",
              input.creatorUserId,
              input.dueDate || "",
              input.sourceType,
              input.sourceKey,
              input.sourceUrl || "",
              input.sourceResolved || false,
              status === "Concluída" ? new Date() : null,
            ]
          );
          for (const userId of [
            ...new Set(
              [
                input.creatorUserId,
                input.assigneeUserId || "",
                ...(input.participantUserIds || []),
              ].filter(Boolean)
            ),
          ]) {
            await client.query(
              'INSERT INTO "activity_participants" ("activityId","userId") VALUES ($1,$2) ON CONFLICT DO NOTHING',
              [activityId, userId]
            );
          }
          await client.query("COMMIT");
          created = true;
        }
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      if (created) {
        await addHistory(activityId, null, "SOURCE_CREATED", {
          sourceType: input.sourceType,
          sourceKey: input.sourceKey,
        });
        return null;
      }
    }
    const pending = await db.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM "activity_checklist_items" WHERE "activityId" = $1 AND "required" = true AND "completed" = false',
      [existing.id]
    );
    const requestedStatus = input.status || existing.status;
    const status =
      requestedStatus === "Concluída" && Number(pending.rows[0]?.count || 0) > 0
        ? "Em validação"
        : requestedStatus;
    await db.query(
      `UPDATE "activities" SET "title"=$2,"description"=$3,"status"=$4,"priority"=$5,"assigneeUserId"=$6,"dueDate"=$7,"sourceUrl"=$8,"sourceResolved"=$9,
       "completedAt"=CASE WHEN $4='Concluída' THEN COALESCE("completedAt",now()) ELSE NULL END,"updatedAt"=now() WHERE "id"=$1`,
      [
        existing.id,
        input.title,
        input.description || "",
        status,
        input.priority || existing.priority,
        input.assigneeUserId || "",
        input.dueDate || "",
        input.sourceUrl || "",
        input.sourceResolved || false,
      ]
    );
    if (input.assigneeUserId)
      await db.query(
        'INSERT INTO "activity_participants" ("activityId","userId") VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [existing.id, input.assigneeUserId]
      );
    return null;
  }
  const existing = await findBySource(input.sourceType, input.sourceKey);
  if (!existing) {
    const created = await createActivity(input);
    if (created)
      await addHistory(created.id, null, "SOURCE_CREATED", {
        sourceType: input.sourceType,
        sourceKey: input.sourceKey,
      });
    return created;
  }
  const hasRequiredPending = existing.checklist.some(
    item => item.required && !item.completed
  );
  const requestedStatus = input.status || existing.status;
  const status =
    requestedStatus === "Concluída" && hasRequiredPending
      ? "Em validação"
      : requestedStatus;
  return updateActivity(existing.id, {
    title: input.title,
    description: input.description,
    status,
    priority: input.priority,
    assigneeUserId: input.assigneeUserId,
    dueDate: input.dueDate,
    sourceUrl: input.sourceUrl,
    sourceResolved: input.sourceResolved,
  });
}
