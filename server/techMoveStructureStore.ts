import { nanoid } from "nanoid";
import { getPgPool } from "./db";

export type ProcessModelInput = {
  name: string;
  description?: string;
  kind: "primary" | "complementary";
  phases?: string[];
  templateIds?: string[];
  active?: boolean;
};

export async function listTeams() {
  const pool = getPgPool();
  if (!pool) return [];
  const [teams, roles, members] = await Promise.all([
    pool.query('SELECT * FROM "delivery_teams" ORDER BY "name"'),
    pool.query('SELECT * FROM "delivery_roles" WHERE "active"=true ORDER BY "name"'),
    pool.query(`SELECT m.*,u."name" AS "userName",u."email" AS "userEmail"
      FROM "delivery_team_members" m LEFT JOIN "app_users" u ON u."id"=m."appUserId"
      WHERE m."active"=true ORDER BY u."name"`),
  ]);
  return teams.rows.map(team => ({
    ...team,
    roles: roles.rows.filter(role => role.teamId === team.id),
    members: members.rows.filter(member => member.teamId === team.id),
  }));
}

export async function createTeam(input: { name: string; description?: string }, userId: string) {
  const pool = getPgPool();
  if (!pool) return { id: nanoid(), ...input, active: true, roles: [], members: [] };
  const id = nanoid();
  const result = await pool.query(
    'INSERT INTO "delivery_teams" ("id","name","description","createdBy") VALUES ($1,$2,$3,$4) RETURNING *',
    [id, input.name, input.description || "", userId]
  );
  return result.rows[0];
}

export async function addRole(teamId: string, name: string, description = "") {
  const pool = getPgPool();
  const row = { id: nanoid(), teamId, name, description, active: true };
  if (!pool) return row;
  const result = await pool.query(
    'INSERT INTO "delivery_roles" ("id","teamId","name","description") VALUES ($1,$2,$3,$4) RETURNING *',
    [row.id, teamId, name, description]
  );
  return result.rows[0];
}

export async function addTeamMember(teamId: string, roleId: string, appUserId: string) {
  const pool = getPgPool();
  const row = { id: nanoid(), teamId, roleId, appUserId, active: true };
  if (!pool) return row;
  const result = await pool.query(
    `INSERT INTO "delivery_team_members" ("id","teamId","roleId","appUserId") VALUES ($1,$2,$3,$4)
     ON CONFLICT ("teamId","appUserId","roleId") DO UPDATE SET "active"=true RETURNING *`,
    [row.id, teamId, roleId, appUserId]
  );
  return result.rows[0];
}

export async function listProjectMembers(projectId: string) {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(`SELECT pm.*,u."name" AS "userName",u."email" AS "userEmail",t."name" AS "teamName",r."name" AS "roleName"
    FROM "project_delivery_members" pm
    JOIN "app_users" u ON u."id"=pm."appUserId"
    JOIN "delivery_teams" t ON t."id"=pm."teamId"
    JOIN "delivery_roles" r ON r."id"=pm."roleId"
    WHERE pm."projectId"=$1 AND pm."active"=true ORDER BY t."name",r."name",u."name"`, [projectId]);
  return result.rows;
}

export async function listEligibleUsers() {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query('SELECT "id","name","email","role","resourceId" FROM "app_users" WHERE "active"=true ORDER BY "name"');
  return result.rows;
}

export async function addProjectMember(projectId: string, teamId: string, roleId: string, appUserId: string) {
  const pool = getPgPool();
  const row = { id: nanoid(), projectId, teamId, roleId, appUserId, active: true };
  if (!pool) return row;
  const result = await pool.query(`INSERT INTO "project_delivery_members" ("id","projectId","teamId","roleId","appUserId") VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT ("projectId","teamId","appUserId","roleId") DO UPDATE SET "active"=true RETURNING *`, [row.id, projectId, teamId, roleId, appUserId]);
  return result.rows[0];
}

export async function listModels() {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(`SELECT m.*,
    COALESCE(jsonb_agg(jsonb_build_object('id',t."id",'title',t."title",'type',t."type",'phase',t."phase",'stage',t."stage",'ownerRole',t."ownerRole",'criticality',t."criticality") ORDER BY mt."position") FILTER (WHERE t."id" IS NOT NULL),'[]'::jsonb) AS "templates"
    FROM "process_models" m
    LEFT JOIN "process_model_templates" mt ON mt."modelId"=m."id"
    LEFT JOIN "delivery_templates" t ON t."id"=mt."templateId"
    GROUP BY m."id" ORDER BY m."kind" DESC,m."name"`);
  return result.rows;
}

export async function createModel(input: ProcessModelInput, userId: string) {
  const pool = getPgPool();
  const id = nanoid();
  const model = { id, ...input, description: input.description || "", phases: input.phases || [], version: 1, active: input.active ?? true, createdBy: userId };
  if (!pool) return { ...model, templates: [] };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      'INSERT INTO "process_models" ("id","name","description","kind","phases","active","createdBy") VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING *',
      [id, input.name, input.description || "", input.kind, JSON.stringify(input.phases || []), input.active ?? true, userId]
    );
    for (const [position, templateId] of (input.templateIds || []).entries())
      await client.query('INSERT INTO "process_model_templates" ("modelId","templateId","position") VALUES ($1,$2,$3)', [id, templateId, position]);
    await client.query('INSERT INTO "process_model_versions" ("id","modelId","version","snapshot","changedBy") VALUES ($1,$2,1,$3::jsonb,$4)', [nanoid(), id, JSON.stringify(model), userId]);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function duplicateModel(modelId: string, name: string, userId: string) {
  const models: any[] = await listModels();
  const source = models.find(model => model.id === modelId);
  if (!source) throw new Error("Modelo não encontrado");
  return createModel({ name, description: source.description, kind: source.kind, phases: source.phases, templateIds: source.templates.map((item: any) => item.id), active: false }, userId);
}

export async function previewApplication(projectId: string, modelId: string) {
  const models: any[] = await listModels();
  const model = models.find(item => item.id === modelId);
  if (!model) throw new Error("Modelo não encontrado");
  const pool = getPgPool();
  const current = pool ? (await pool.query('SELECT * FROM "project_process_applications" WHERE "projectId"=$1 AND "modelId"=$2', [projectId, modelId])).rows[0] : null;
  return {
    model,
    currentVersion: current?.modelVersion || null,
    nextVersion: model.version,
    added: current ? [] : model.templates,
    changed: current && current.modelVersion < model.version ? model.templates : [],
    unassigned: model.templates.filter((item: any) => !item.ownerRole),
  };
}

export async function applyModel(projectId: string, modelId: string, userId: string) {
  const preview = await previewApplication(projectId, modelId);
  const pool = getPgPool();
  if (!pool) return preview;
  if (preview.model.kind === "primary")
    await pool.query(`UPDATE "project_process_applications" SET "status"='replaced',"updatedAt"=now() WHERE "projectId"=$1 AND "kind"='primary' AND "modelId"<>$2`, [projectId, modelId]);
  await pool.query(`INSERT INTO "project_process_applications" ("id","projectId","modelId","modelVersion","kind","appliedBy") VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT ("projectId","modelId") DO UPDATE SET "modelVersion"=EXCLUDED."modelVersion","status"='active',"appliedBy"=EXCLUDED."appliedBy","updatedAt"=now()`,
    [nanoid(), projectId, modelId, preview.model.version, preview.model.kind, userId]);
  for (const template of preview.model.templates) {
    await pool.query(`UPDATE "delivery_templates" SET "projectIds"=(SELECT jsonb_agg(DISTINCT value) FROM jsonb_array_elements_text(COALESCE("projectIds",'[]'::jsonb) || to_jsonb($2::text)) value),"updatedAt"=now() WHERE "id"=$1`, [template.id, projectId]);
  }
  return preview;
}
