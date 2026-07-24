import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type {
  ApprovalDecision, ApprovalDecisionValue, ApprovalEntityType, ApprovalQuorum,
  ApprovalRound, AppUser, ProjectApprovalPolicy,
} from "../shared/types";
import { getPgPool } from "./db";
import * as activityStore from "./activityStore";
import * as projectAccess from "./projectAccess";
import { flushActivityEmailOutbox } from "./activityMailer";

const memoryPolicies: ProjectApprovalPolicy[] = [];
const memoryRounds: ApprovalRound[] = [];

const entityTables: Record<Exclude<ApprovalEntityType, "activity">, string> = {
  bdcq_answer: "bdcq_answers", dcd: "dcd_documents", gap: "gaps", test_case: "workflow_test_cases",
  workshop: "delivery_items", configuration: "delivery_items", risk: "delivery_items",
  issue: "delivery_items", cutover: "delivery_items", closure: "delivery_items",
};

function id(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function iso(value: unknown) {
  return value ? new Date(value as string | number | Date).toISOString() : "";
}

function asPolicy(row: any): ProjectApprovalPolicy {
  return { id: row.id, projectId: row.projectId, entityType: row.entityType, enabled: Boolean(row.enabled), quorum: row.quorum,
    minimumApprovals: Number(row.minimumApprovals || 1), approverMembershipIds: row.approverMembershipIds || [], updatedAt: iso(row.updatedAt) };
}

function asDecision(row: any): ApprovalDecision {
  return { id: row.id, roundId: row.roundId, approverMembershipId: row.approverMembershipId, decision: row.decision,
    comment: row.comment || "", decidedAt: iso(row.decidedAt), approverName: row.approverName || undefined };
}

function asRound(row: any, decisions: ApprovalDecision[] = []): ApprovalRound {
  return { id: row.id, projectId: row.projectId, entityType: row.entityType, entityId: row.entityId,
    version: Number(row.version), status: row.status, quorum: row.quorum, minimumApprovals: Number(row.minimumApprovals || 1),
    snapshot: row.snapshot || {}, requestedByUserId: row.requestedByUserId, requestedAt: iso(row.requestedAt),
    completedAt: iso(row.completedAt), reopenedFromRoundId: row.reopenedFromRoundId || "", decisions };
}

export async function listPolicies(projectId: string) {
  const db = getPgPool();
  if (!db) return memoryPolicies.filter(item => item.projectId === projectId);
  const result = await db.query('SELECT * FROM "project_approval_policies" WHERE "projectId"=$1 ORDER BY "entityType"', [projectId]);
  return result.rows.map(asPolicy);
}

export async function upsertPolicy(input: Omit<ProjectApprovalPolicy, "id" | "updatedAt">) {
  const memberships = await projectAccess.listProjectMemberships(input.projectId);
  const eligible = new Set(memberships.filter(item => item.active && item.capabilities?.approveAssigned).map(item => item.id));
  if (input.approverMembershipIds.some(item => !eligible.has(item))) throw new TRPCError({ code: "BAD_REQUEST", message: "A lista contém aprovador sem permissão no projeto" });
  if (input.quorum === "minimum" && (input.minimumApprovals < 1 || input.minimumApprovals > input.approverMembershipIds.length)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O mínimo deve estar entre 1 e o número de aprovadores" });
  }
  const db = getPgPool();
  if (!db) {
    const existing = memoryPolicies.find(item => item.projectId === input.projectId && item.entityType === input.entityType);
    const next = { ...input, id: existing?.id || id("pap"), updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, next); else memoryPolicies.push(next);
    return next;
  }
  const result = await db.query(`INSERT INTO "project_approval_policies" ("id","projectId","entityType","enabled","quorum","minimumApprovals","approverMembershipIds")
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT ("projectId","entityType") DO UPDATE SET
    "enabled"=EXCLUDED."enabled","quorum"=EXCLUDED."quorum","minimumApprovals"=EXCLUDED."minimumApprovals",
    "approverMembershipIds"=EXCLUDED."approverMembershipIds","updatedAt"=now() RETURNING *`,
    [id("pap"), input.projectId, input.entityType, input.enabled, input.quorum, input.minimumApprovals, JSON.stringify(input.approverMembershipIds)]);
  return asPolicy(result.rows[0]);
}

async function getEntity(entityType: ApprovalEntityType, entityId: string) {
  if (entityType === "activity") {
    const activity = await activityStore.getActivity(entityId);
    return activity ? { projectId: activity.projectId, snapshot: activity } : null;
  }
  const db = getPgPool();
  if (!db) return null;
  const table = entityTables[entityType];
  const result = await db.query(`SELECT * FROM "${table}" WHERE "id"=$1`, [entityId]);
  const row = result.rows[0];
  return row ? { projectId: row.projectId, snapshot: row } : null;
}

export async function getRound(roundId: string) {
  const db = getPgPool();
  if (!db) return memoryRounds.find(item => item.id === roundId) || null;
  const [round, decisions] = await Promise.all([
    db.query('SELECT * FROM "approval_rounds" WHERE "id"=$1', [roundId]),
    db.query(`SELECT d.*, u."name" AS "approverName" FROM "approval_decisions" d
      JOIN "project_memberships" m ON m."id"=d."approverMembershipId" JOIN "app_users" u ON u."id"=m."appUserId"
      WHERE d."roundId"=$1 ORDER BY u."name"`, [roundId]),
  ]);
  return round.rows[0] ? asRound(round.rows[0], decisions.rows.map(asDecision)) : null;
}

export async function listRounds(projectId: string, entityType?: ApprovalEntityType, entityId?: string) {
  const db = getPgPool();
  if (!db) return memoryRounds.filter(item => item.projectId === projectId && (!entityType || item.entityType === entityType) && (!entityId || item.entityId === entityId));
  const params: string[] = [projectId];
  const where = ['"projectId"=$1'];
  if (entityType) { params.push(entityType); where.push(`"entityType"=$${params.length}`); }
  if (entityId) { params.push(entityId); where.push(`"entityId"=$${params.length}`); }
  const result = await db.query(`SELECT * FROM "approval_rounds" WHERE ${where.join(" AND ")} ORDER BY "version" DESC`, params);
  return Promise.all(result.rows.map(row => getRound(row.id))) as Promise<ApprovalRound[]>;
}

function sourceUrl(entityType: ApprovalEntityType, projectId: string, snapshot: any) {
  if (entityType === "bdcq_answer") return `/techmove/bdcq?projectId=${encodeURIComponent(projectId)}&questionId=${encodeURIComponent(snapshot.questionId || "")}`;
  if (entityType === "dcd") return `/techmove/dcd?projectId=${encodeURIComponent(projectId)}`;
  if (entityType === "gap") return `/techmove/gaps?projectId=${encodeURIComponent(projectId)}`;
  if (entityType === "test_case") return `/techmove/tests?projectId=${encodeURIComponent(projectId)}`;
  if (entityType === "risk" || entityType === "issue") return `/techmove/raid?projectId=${encodeURIComponent(projectId)}`;
  if (["cutover", "closure"].includes(entityType)) return `/techmove/trail?projectId=${encodeURIComponent(projectId)}&stage=${entityType}`;
  if (entityType === "configuration") return `/techmove/configurations?projectId=${encodeURIComponent(projectId)}`;
  if (entityType === "workshop") return `/techmove/workshops?projectId=${encodeURIComponent(projectId)}`;
  return "/techtask/board";
}

function entityLabel(entityType: ApprovalEntityType) {
  return ({ bdcq_answer: "resposta BDCQ", dcd: "DCD", gap: "gap", test_case: "teste", activity: "atividade", workshop: "workshop", configuration: "configuração", risk: "risco", issue: "issue", cutover: "cutover", closure: "encerramento" } as const)[entityType];
}

async function findExecutionActivity(entityType: ApprovalEntityType, entityId: string, snapshot: Record<string, unknown>) {
  if (entityType === "activity") return activityStore.getActivity(entityId);
  if (entityType === "bdcq_answer" && typeof snapshot.questionId === "string") return activityStore.findBySource("bdcq_question", snapshot.questionId);
  if (entityType === "test_case") return activityStore.findBySource("workflow_test", entityId);
  return null;
}

export async function submitForApproval(input: {
  projectId: string; entityType: ApprovalEntityType; entityId: string; requestedBy: AppUser;
  approverMembershipIds?: string[]; quorum?: ApprovalQuorum; minimumApprovals?: number;
}) {
  const entity = await getEntity(input.entityType, input.entityId);
  if (!entity || entity.projectId !== input.projectId) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado no projeto" });
  const existing = await listRounds(input.projectId, input.entityType, input.entityId);
  if (existing.some(item => item.status === "pending")) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma aprovação pendente" });
  const policy = (await listPolicies(input.projectId)).find(item => item.entityType === input.entityType);
  const approverIds = input.approverMembershipIds?.length ? input.approverMembershipIds : policy?.approverMembershipIds || [];
  const quorum = input.quorum || policy?.quorum || "any";
  const minimumApprovals = input.minimumApprovals || policy?.minimumApprovals || 1;
  if (!approverIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione pelo menos um aprovador" });
  const memberships = await projectAccess.listProjectMemberships(input.projectId);
  const approvers = memberships.filter(item => approverIds.includes(item.id) && item.active && item.capabilities?.approveAssigned && item.user?.active);
  if (approvers.length !== new Set(approverIds).size) throw new TRPCError({ code: "BAD_REQUEST", message: "Há aprovador inválido ou inativo" });
  if (quorum === "minimum" && (minimumApprovals < 1 || minimumApprovals > approvers.length)) throw new TRPCError({ code: "BAD_REQUEST", message: "Quórum mínimo inválido" });
  const roundId = id("apr");
  const version = Math.max(0, ...existing.map(item => item.version)) + 1;
  const round: ApprovalRound = { id: roundId, projectId: input.projectId, entityType: input.entityType, entityId: input.entityId, version,
    status: "pending", quorum, minimumApprovals, snapshot: entity.snapshot as Record<string, unknown>, requestedByUserId: input.requestedBy.id,
    requestedAt: new Date().toISOString(), completedAt: "", reopenedFromRoundId: "", decisions: approvers.map(item => ({ id: id("apd"), roundId,
      approverMembershipId: item.id, decision: "pending", comment: "", decidedAt: "", approverName: item.user?.name })) };
  const db = getPgPool();
  if (!db) memoryRounds.push(round);
  else {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO "approval_rounds" ("id","projectId","entityType","entityId","version","status","quorum","minimumApprovals","snapshot","requestedByUserId")
        VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8::jsonb,$9)`, [round.id, round.projectId, round.entityType, round.entityId, round.version, round.quorum, round.minimumApprovals, JSON.stringify(round.snapshot), round.requestedByUserId]);
      for (const decision of round.decisions) await client.query(`INSERT INTO "approval_decisions" ("id","roundId","approverMembershipId","decision") VALUES ($1,$2,$3,'pending')`, [decision.id, round.id, decision.approverMembershipId]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  for (const approver of approvers) {
    const sourceKey = `${round.id}:${approver.id}`;
    await activityStore.upsertSourceActivity({ scope: "project", projectId: input.projectId, title: `Aprovar ${entityLabel(input.entityType)} · versão ${version}`,
      description: `Solicitação enviada por ${input.requestedBy.name}.`, status: "Em validação", priority: "Alta",
      assigneeUserId: approver.appUserId, creatorUserId: input.requestedBy.id, participantUserIds: [input.requestedBy.id],
      sourceType: "approval", sourceKey, sourceUrl: sourceUrl(input.entityType, input.projectId, entity.snapshot), sourceResolved: false });
    const activity = await activityStore.findBySource("approval", sourceKey);
    if (activity) await activityStore.createNotifications({ activityId: activity.id, eventKey: `${sourceKey}:assigned`, eventType: "approval_requested",
      title: activity.displayTitle, message: `${input.requestedBy.name} solicitou sua aprovação.`, userIds: [approver.appUserId] });
  }
  const executionActivity = await findExecutionActivity(input.entityType, input.entityId, round.snapshot);
  if (executionActivity) {
    await activityStore.updateActivity(executionActivity.id, { status: "Em validação", sourceResolved: false });
    await activityStore.addHistory(executionActivity.id, input.requestedBy, "SUBMITTED_FOR_APPROVAL", { roundId: round.id, version });
  }
  void flushActivityEmailOutbox().catch(error => console.warn("Falha ao enviar e-mail de aprovação", error));
  return getRound(round.id);
}

function quorumReached(round: ApprovalRound) {
  const approvals = round.decisions.filter(item => item.decision === "approved").length;
  if (round.quorum === "any") return approvals >= 1;
  if (round.quorum === "all") return approvals === round.decisions.length;
  return approvals >= round.minimumApprovals;
}

export async function decide(roundId: string, appUser: AppUser, decisionValue: Exclude<ApprovalDecisionValue, "pending" | "waived">, comment: string) {
  const round = await getRound(roundId);
  if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Rodada não encontrada" });
  if (round.status !== "pending") throw new TRPCError({ code: "CONFLICT", message: "Esta rodada já foi encerrada" });
  const membership = await projectAccess.getProjectMembership(round.projectId, appUser.id);
  const decision = round.decisions.find(item => item.approverMembershipId === membership?.id);
  if (!decision || !membership?.capabilities?.approveAssigned) throw new TRPCError({ code: "FORBIDDEN", message: "Você não é aprovador desta rodada" });
  if (decisionValue === "rejected" && !comment.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o motivo da reprovação" });
  decision.decision = decisionValue; decision.comment = comment.trim(); decision.decidedAt = new Date().toISOString();
  const nextStatus = decisionValue === "rejected" ? "rejected" : quorumReached(round) ? "approved" : "pending";
  round.status = nextStatus;
  if (nextStatus !== "pending") round.completedAt = new Date().toISOString();
  const db = getPgPool();
  if (db) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query('UPDATE "approval_decisions" SET "decision"=$2,"comment"=$3,"decidedAt"=now(),"updatedAt"=now() WHERE "id"=$1', [decision.id, decisionValue, decision.comment]);
      if (nextStatus !== "pending") await client.query('UPDATE "approval_rounds" SET "status"=$2,"completedAt"=now(),"updatedAt"=now() WHERE "id"=$1', [round.id, nextStatus]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  const activities = await activityStore.listActivities();
  for (const activity of activities.filter(item => item.sourceType === "approval" && item.sourceKey.startsWith(`${round.id}:`))) {
    const own = activity.sourceKey === `${round.id}:${membership.id}`;
    if (own || nextStatus !== "pending") await activityStore.updateActivity(activity.id, { status: "Concluída", sourceResolved: true });
    await activityStore.addHistory(activity.id, appUser, decisionValue === "approved" ? "APPROVED" : "REJECTED", { roundId, comment: decision.comment, result: nextStatus });
    if (nextStatus !== "pending") await activityStore.createNotifications({ activityId: activity.id, eventKey: `${round.id}:completed:${nextStatus}`,
      eventType: nextStatus === "approved" ? "approval_completed" : "approval_rejected", title: activity.displayTitle,
      message: nextStatus === "approved" ? "A solicitação foi aprovada." : `A solicitação foi reprovada: ${decision.comment}`,
      userIds: [round.requestedByUserId] });
  }
  void flushActivityEmailOutbox().catch(error => console.warn("Falha ao enviar resultado da aprovação", error));
  const executionActivity = await findExecutionActivity(round.entityType, round.entityId, round.snapshot);
  if (executionActivity && nextStatus !== "pending") {
    await activityStore.updateActivity(executionActivity.id, { status: nextStatus === "rejected" ? "A fazer" : "Concluída", sourceResolved: nextStatus === "approved" });
    await activityStore.addHistory(executionActivity.id, appUser, nextStatus === "rejected" ? "APPROVAL_REJECTED" : "APPROVAL_APPROVED", { roundId, comment: decision.comment, result: nextStatus });
  }
  return getRound(round.id);
}

export async function isEntityLocked(entityType: ApprovalEntityType, entityId: string) {
  const db = getPgPool();
  if (!db) return memoryRounds.some(item => item.entityType === entityType && item.entityId === entityId && item.status === "approved");
  const result = await db.query('SELECT 1 FROM "approval_rounds" WHERE "entityType"=$1 AND "entityId"=$2 AND "status"=$3 LIMIT 1', [entityType, entityId, "approved"]);
  return Boolean(result.rows[0]);
}

export async function assertEntityEditable(entityType: ApprovalEntityType, entityId: string) {
  if (await isEntityLocked(entityType, entityId)) throw new TRPCError({ code: "CONFLICT", message: "Conteúdo aprovado está bloqueado. Solicite ao GP interno uma nova versão." });
}

export async function reopen(roundId: string, actor: AppUser, justification: string) {
  const round = await getRound(roundId);
  if (!round || round.status !== "approved") throw new TRPCError({ code: "BAD_REQUEST", message: "Somente uma rodada aprovada pode ser reaberta" });
  await projectAccess.assertProjectCapability(actor, round.projectId, "reopenApproved");
  if (!justification.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a justificativa da nova versão" });
  const db = getPgPool();
  if (!db) round.status = "superseded";
  else await db.query('UPDATE "approval_rounds" SET "status"=$2,"updatedAt"=now() WHERE "id"=$1', [round.id, "superseded"]);
  return { entityType: round.entityType, entityId: round.entityId, nextVersion: round.version + 1, previousRoundId: round.id, justification: justification.trim() };
}
