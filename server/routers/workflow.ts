import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import { invokeLLM, invokeLLMStream, listLLMModels } from "../_core/llm";
import { storageGetSignedUrl, storagePut } from "../storage";
import * as wdb from "./workflowDb";
import { TRPCError } from "@trpc/server";
import {
  assertWorkflowProjectAccess,
  listWorkflowProjects,
} from "../workflowAccess";
import { createHash } from "node:crypto";
import { BDCQ_TEMPLATES } from "../workflowBdcqTemplates";
import { generateWorkflowPdf } from "../workflowPdf";
import {
  WORKFLOW_PROMPT_DEFAULTS,
  type WorkflowPromptKey,
} from "../workflowPrompts";
import {
  DCD_FEW_SHOT_EXAMPLE,
  getSapKnowledgeContext,
} from "../workflowSapKnowledge";
import { notifyOwner } from "../_core/notification";
import * as plannerStore from "../plannerStore";
import { transcribeAudio } from "../_core/voiceTranscription";
import { buildWorkflowConsolidatedMarkdown } from "../workflowConsolidatedReport";
import type { ProjectCapabilities, TechMoveData } from "../../shared/types";
import * as projectAccess from "../projectAccess";
import * as approvalStore from "../approvalStore";
import { deliveryMasterRouter } from "./deliveryMaster";
import { sapLibraryRouter } from "./sapLibrary";
import {
  assertRegisteredScopeItems,
  getKnowledgeContext,
  listScopes as listRegisteredScopes,
} from "../sapLibraryStore";
import * as deliveryPublisher from "../deliveryPublisher";

const bdcqStandardsEditorProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    if (!["admin", "technical_lead"].includes(ctx.appUser.role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Somente administradores e líderes técnicos podem alterar perguntas BDCQ padrão",
      });
    }
    return next({ ctx });
  }
);

const bdcqProjectMetadataInput = {
  questionOriginal: z.string().trim().max(5000).optional(),
  sapId: z.string().trim().max(64).optional(),
  level: z.string().trim().max(16).optional(),
  process: z.string().trim().max(256).optional(),
  sscuiReference: z.string().trim().max(10000).optional(),
  area: z.string().trim().max(256).optional(),
  topic: z.string().trim().max(256).optional(),
  topicDefinition: z.string().trim().max(20000).optional(),
  solution: z.string().trim().max(10000).optional(),
  source: z.string().trim().max(32).optional(),
  sourceFile: z.string().trim().max(512).optional(),
  sourceRelease: z.string().trim().max(64).optional(),
  required: z.boolean().optional(),
  active: z.number().int().min(0).max(1).optional(),
};

const bdcqProjectFilterInput = {
  search: z.string().trim().max(256).optional(),
  modules: z.array(z.string()).max(50).default([]),
  scopeItemIds: z.array(z.string()).max(200).default([]),
  levels: z.array(z.string()).max(10).default([]),
  areas: z.array(z.string()).max(100).default([]),
  topics: z.array(z.string()).max(100).default([]),
  sources: z.array(z.string()).max(50).default([]),
  statuses: z
    .array(z.enum(["pending", "answered", "inactive"]))
    .max(3)
    .default([]),
  consultantResourceIds: z.array(z.string()).max(200).default([]),
  keyUserIds: z.array(z.string()).max(200).default([]),
};
import { generateDcdDocx, generateDcdPdf } from "../dcdDocuments";

function legacyTechMoveCounts(data: TechMoveData) {
  return {
    scopeItems: data.scopeItems.length,
    questions: data.questions.length,
    workshops: data.workshops.length,
    dcdDocuments: data.dcdDraft.trim() ? 1 : 0,
    gaps: data.gaps.length,
    configurations: data.configurations?.length || 0,
  };
}

const legacyKey = (...values: unknown[]) =>
  values
    .map(value =>
      String(value || "")
        .trim()
        .toLocaleLowerCase("pt-BR")
    )
    .join("|");

async function importLegacyTechMove(projectId: string, legacy: TechMoveData) {
  const [
    currentScope,
    currentQuestions,
    currentAnswers,
    currentWorkshops,
    currentDcds,
    currentGaps,
    currentConfigurations,
  ] = await Promise.all([
    wdb.listScopeItems(projectId),
    wdb.listBdcqQuestions(projectId),
    wdb.listBdcqAnswers(projectId),
    wdb.listWorkshops(projectId),
    wdb.listDcdDocuments(projectId, true),
    wdb.listGaps(projectId),
    wdb.listConfigurations(projectId),
  ]);
  const imported = {
    scopeItems: 0,
    questions: 0,
    answers: 0,
    workshops: 0,
    transcripts: 0,
    minutes: 0,
    dcdDocuments: 0,
    gaps: 0,
    configurations: 0,
    ignored: 0,
  };
  const scopeKeys = new Set(
    currentScope.map((item: any) =>
      legacyKey(item.module, item.code, item.name)
    )
  );
  const scopeByCode = new Map(
    currentScope
      .filter((item: any) => item.code)
      .map((item: any) => [legacyKey(item.code), item.id])
  );
  for (const item of legacy.scopeItems) {
    const key = legacyKey(item.module, item.code, item.name);
    if (scopeKeys.has(key)) {
      imported.ignored++;
      continue;
    }
    const id = nanoid();
    await wdb.createScopeItem({
      id,
      projectId,
      module: item.module,
      code: item.code || "",
      name: item.name,
      processArea: item.processArea || "",
      description: item.description,
      active: item.active ? 1 : 0,
    });
    scopeKeys.add(key);
    if (item.code) scopeByCode.set(legacyKey(item.code), id);
    imported.scopeItems++;
  }

  const questionKeys = new Set(
    currentQuestions.map((item: any) => legacyKey(item.module, item.question))
  );
  const answerQuestionIds = new Set(
    currentAnswers.map((item: any) => item.questionId)
  );
  for (const question of legacy.questions) {
    const key = legacyKey(question.module, question.text);
    let id = currentQuestions.find(
      (item: any) => legacyKey(item.module, item.question) === key
    )?.id as string | undefined;
    if (!questionKeys.has(key)) {
      id = nanoid();
      const scopeItemIds = question.scopeItemCodes
        .map(code => scopeByCode.get(legacyKey(code)))
        .filter((value): value is string => Boolean(value));
      await wdb.createBdcqQuestion({
        id,
        projectId,
        module: question.module,
        category: question.category || "",
        question: question.text,
        scopeItemIds,
        isDefault: question.reusable ? 1 : 0,
        sortOrder: currentQuestions.length + imported.questions,
      });
      questionKeys.add(key);
      imported.questions++;
    } else imported.ignored++;
    if (!id) continue;
    if (question.answer.trim() && !answerQuestionIds.has(id)) {
      await wdb.createBdcqAnswer({
        id: nanoid(),
        projectId,
        questionId: id,
        answer: question.answer,
        answeredBy: question.ownerRole || "Importação TechMove",
        attachments: question.evidence ? [question.evidence] : [],
      });
      answerQuestionIds.add(id);
      imported.answers++;
    }
  }

  const workshopKeys = new Set(
    currentWorkshops.map((item: any) =>
      legacyKey(item.module, item.title, item.scheduledDate)
    )
  );
  for (const workshop of legacy.workshops) {
    const key = legacyKey(workshop.module, workshop.title, workshop.date);
    if (workshopKeys.has(key)) {
      imported.ignored++;
      continue;
    }
    const id = nanoid();
    const participants = workshop.participants
      .split(/[;,\n]/)
      .map(value => value.trim())
      .filter(Boolean);
    await wdb.createWorkshop({
      id,
      projectId,
      title: workshop.title,
      module: workshop.module,
      scheduledDate: workshop.date || "",
      duration: workshop.durationMinutes
        ? `${workshop.durationMinutes} min`
        : "",
      participants,
      agenda: workshop.script
        ? workshop.script.split("\n").filter(Boolean)
        : [],
      status: workshop.completed ? "Concluído" : "Planejado",
      notes: workshop.decisions || "",
    });
    if (workshop.transcript.trim()) {
      await wdb.createTranscript({
        id: nanoid(),
        workshopId: id,
        content: workshop.transcript,
        uploadedBy: "Importação TechMove",
      });
      imported.transcripts++;
    }
    if ((workshop.minutes || "").trim()) {
      await wdb.createMinutes({
        id: nanoid(),
        workshopId: id,
        content: workshop.minutes!,
        generatedBy: "legacy",
      });
      imported.minutes++;
    }
    workshopKeys.add(key);
    imported.workshops++;
  }

  if (
    legacy.dcdDraft.trim() &&
    !currentDcds.some(
      (item: any) => legacyKey(item.content) === legacyKey(legacy.dcdDraft)
    )
  ) {
    const id = nanoid();
    await wdb.createDcdDocument({
      id,
      seriesId: id,
      projectId,
      title: "DCD importado do TechMove legado",
      content: legacy.dcdDraft,
      module: "",
      status: "Rascunho",
    });
    imported.dcdDocuments++;
  }
  const gapKeys = new Set(
    currentGaps.map((item: any) => legacyKey(item.module, item.description))
  );
  for (const gap of legacy.gaps) {
    const description = gap.description || gap.title;
    const key = legacyKey(gap.module, description);
    if (gapKeys.has(key)) {
      imported.ignored++;
      continue;
    }
    const impact =
      gap.severity === "Critico"
        ? "Crítico"
        : gap.severity === "Medio"
          ? "Médio"
          : gap.severity;
    const status =
      gap.status === "Em analise"
        ? "Em Análise"
        : gap.status === "Aprovado"
          ? "Aceito"
          : gap.status === "Rejeitado"
            ? "Resolvido"
            : "Aberto";
    await wdb.createGap({
      id: nanoid(),
      projectId,
      module: gap.module,
      description,
      impact,
      responsible: gap.assignedTo || "",
      resolution: gap.resolution,
      status,
    });
    gapKeys.add(key);
    imported.gaps++;
  }
  const configurationKeys = new Set(
    currentConfigurations.map((item: any) =>
      legacyKey(item.module, item.description)
    )
  );
  for (const configuration of legacy.configurations || []) {
    const description = configuration.description || configuration.title;
    const key = legacyKey(configuration.module, description);
    if (configurationKeys.has(key)) {
      imported.ignored++;
      continue;
    }
    const status =
      configuration.status === "Em andamento"
        ? "Em andamento"
        : configuration.status === "Concluido"
          ? "Concluído"
          : configuration.status;
    await wdb.createConfiguration({
      id: nanoid(),
      projectId,
      module: configuration.module,
      category: configuration.path || "",
      description,
      responsible: configuration.owner || "",
      status,
      notes: `Prioridade: ${configuration.priority}`,
    });
    configurationKeys.add(key);
    imported.configurations++;
  }
  return imported;
}

async function invokeWorkflowLLM(params: Parameters<typeof invokeLLM>[0]) {
  const primaryModel = process.env.WORKFLOW_LLM_MODEL?.trim() || undefined;
  const fallbackModel =
    process.env.WORKFLOW_LLM_FALLBACK_MODEL?.trim() || undefined;
  try {
    return await invokeLLM({ ...params, model: params.model || primaryModel });
  } catch (primaryError) {
    if (!fallbackModel || fallbackModel === (params.model || primaryModel))
      throw primaryError;
    console.warn(
      `Workflow LLM primary model failed; retrying with fallback model ${fallbackModel}`
    );
    return invokeLLM({ ...params, model: fallbackModel });
  }
}

async function getWorkflowAiConfig(key: WorkflowPromptKey) {
  const custom = await wdb.getWorkflowPrompt(key);
  return {
    systemPrompt:
      custom?.systemPrompt?.trim() ||
      WORKFLOW_PROMPT_DEFAULTS[key].systemPrompt,
    model: custom?.model?.trim() || undefined,
  };
}

async function recordWorkshopLearning(
  workshop: any,
  decision: "confirmed" | "edited" | "discarded",
  createdBy: string
) {
  if (!workshop) return;
  const scopeItems = await wdb.listScopeItems(workshop.projectId);
  const selected = new Set(workshop.scopeItemIds || []);
  const learningKey =
    workshop.learningKey ||
    createHash("sha256")
      .update(
        `${workshop.projectId}|${workshop.module || ""}|${[...selected]
          .sort()
          .join(",")}|${workshop.title || ""}`
      )
      .digest("hex")
      .slice(0, 40);
  await wdb.saveWorkshopLearningPattern({
    id: `wlp_${nanoid(20)}`,
    projectId: workshop.projectId,
    workshopId: workshop.id,
    learningKey,
    module: workshop.module || "",
    scopeItemCodes: scopeItems
      .filter((item: any) => selected.has(item.id))
      .map((item: any) => item.code || item.name)
      .filter(Boolean),
    title: workshop.title,
    objective: workshop.objective || "",
    content: workshop.content || "",
    duration: workshop.duration || "",
    agenda: workshop.agenda || [],
    expectedOutcomes: workshop.expectedOutcomes || [],
    prerequisites: workshop.prerequisites || [],
    requiredRoles: workshop.requiredRoles || [],
    decision,
    confidence: decision === "discarded" ? 10 : decision === "edited" ? 80 : 70,
    createdBy,
  });
}

const workshopFileSchema = z.object({
  name: z.string().trim().min(1).max(255),
  url: z.string().trim().min(1).max(2048),
  contentType: z.string().trim().max(255).default("application/octet-stream"),
});

const workshopTemplateDataSchema = z.object({
  title: z.string().trim().min(1).max(512),
  objective: z.string().max(10000).default(""),
  content: z.string().max(20000).default(""),
  duration: z.string().trim().max(64).default(""),
  modules: z.array(z.string().trim().min(1).max(128)).max(30).default([]),
  projectIds: z.array(z.string().trim().min(1).max(64)).max(200).default([]),
  scopeItemKeys: z
    .array(z.string().trim().min(1).max(512))
    .max(200)
    .default([]),
  agenda: z.array(z.string().trim().min(1).max(2000)).max(100).default([]),
  expectedOutcomes: z
    .array(z.string().trim().min(1).max(2000))
    .max(100)
    .default([]),
  prerequisites: z
    .array(z.string().trim().min(1).max(2000))
    .max(100)
    .default([]),
  requiredRoles: z
    .array(z.string().trim().min(1).max(255))
    .max(100)
    .default([]),
  presentationFiles: z.array(workshopFileSchema).max(20).default([]),
  active: z.boolean().default(true),
});

export async function applyWorkshopTemplates(
  projectId: string,
  selectedTemplateIds?: string[]
) {
  const [project, scopeItems, templates, existing] = await Promise.all([
    plannerStore.getProjectById(projectId),
    wdb.listScopeItems(projectId),
    wdb.listWorkshopTemplates(),
    wdb.listWorkshops(projectId),
  ]);
  if (!project)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Projeto não encontrado",
    });
  const selected = selectedTemplateIds?.length
    ? new Set(selectedTemplateIds)
    : null;
  const existingTemplateIds = new Set(
    existing.map((item: any) => item.templateId).filter(Boolean)
  );
  const projectModules = new Set(
    [
      ...(project.fronts || []),
      ...scopeItems.map((item: any) => item.module),
    ].filter(Boolean)
  );
  const normalizedScope = new Map<string, any>();
  for (const item of scopeItems) {
    for (const value of [item.code, item.name]) {
      const key = String(value || "")
        .trim()
        .toLocaleLowerCase("pt-BR");
      if (key) normalizedScope.set(key, item);
    }
  }
  let added = 0;
  let ignored = 0;
  for (const template of templates as any[]) {
    if (
      !template.active ||
      (selected && !selected.has(template.id)) ||
      existingTemplateIds.has(template.id)
    ) {
      ignored++;
      continue;
    }
    if (
      template.projectIds?.length &&
      !template.projectIds.includes(projectId)
    ) {
      ignored++;
      continue;
    }
    if (
      template.modules?.length &&
      !template.modules.some((module: string) => projectModules.has(module))
    ) {
      ignored++;
      continue;
    }
    const matchedScopes = [
      ...new Map(
        (template.scopeItemKeys || [])
          .map((key: string) => {
            const scope = normalizedScope.get(
              key.trim().toLocaleLowerCase("pt-BR")
            );
            return scope ? [scope.id, scope] : [key, null];
          })
          .filter(([, scope]: [string, any]) => Boolean(scope))
      ).values(),
    ] as any[];
    if (template.scopeItemKeys?.length && matchedScopes.length === 0) {
      ignored++;
      continue;
    }
    const modules = template.modules?.length
      ? template.modules.filter((module: string) => projectModules.has(module))
      : [
          ...new Set(
            matchedScopes.map((item: any) => item.module).filter(Boolean)
          ),
        ];
    await wdb.createWorkshop({
      id: nanoid(),
      projectId,
      title: template.title,
      objective: template.objective || "",
      content: template.content || "",
      module: modules[0] || "",
      modules,
      scopeItemIds: matchedScopes.map((item: any) => item.id),
      scheduledDate: "",
      duration: template.duration || "",
      participants: [],
      agenda: template.agenda || [],
      expectedOutcomes: template.expectedOutcomes || [],
      prerequisites: template.prerequisites || [],
      requiredRoles: template.requiredRoles || [],
      presentationFiles: template.presentationFiles || [],
      templateId: template.id,
      source: "template",
      status: "Planejado",
      notes: "",
    });
    existingTemplateIds.add(template.id);
    added++;
  }
  return { added, ignored };
}

const workflowProjectProcedure = (
  write = false,
  capability?: keyof ProjectCapabilities
) =>
  protectedProcedure.use(async ({ ctx, next, getRawInput }) => {
    const input = (await getRawInput()) as { projectId?: string } | null;
    if (!input?.projectId)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Projeto é obrigatório",
      });
    await assertWorkflowProjectAccess(
      ctx.appUser,
      input.projectId,
      write,
      capability || (!write ? "viewWorkflowArtifacts" : undefined)
    );
    return next();
  });

const workflowEntityProcedure = (
  table: string,
  write = false,
  idField = "id",
  capability?: keyof ProjectCapabilities
) =>
  protectedProcedure.use(async ({ ctx, next, getRawInput }) => {
    const input = (await getRawInput()) as Record<string, unknown> | null;
    const id = input?.[idField];
    if (typeof id !== "string" || !id)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Identificador é obrigatório",
      });
    const projectId = await wdb.getWorkflowEntityProjectId(table, id);
    if (!projectId)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Registro do Workflow não encontrado",
      });
    await assertWorkflowProjectAccess(
      ctx.appUser,
      projectId,
      write,
      capability || (!write ? "viewWorkflowArtifacts" : undefined)
    );
    return next();
  });

async function assertCanAnswerBdcq(
  appUser: any,
  projectId: string,
  questionId: string
) {
  if (appUser.role === "admin") return;
  const membership = await projectAccess.getProjectMembership(
    projectId,
    appUser.id
  );
  if (!membership) return;
  if (!membership.active || !membership.capabilities?.fillAssignedBdcq)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Seu perfil não permite preencher BDCQ",
    });
  if (
    membership.profile === "gp_internal" ||
    membership.profile === "internal_team"
  )
    return;
  const question = (await wdb.listBdcqQuestions(projectId)).find(
    (item: any) => item.id === questionId
  );
  if (!question)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Pergunta não encontrada",
    });
  const keyUser = (await wdb.listProjectKeyUsers(projectId)).find(
    (item: any) => item.id === question.keyUserId
  );
  if (!keyUser || keyUser.email?.toLowerCase() !== appUser.email.toLowerCase())
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Esta pergunta está atribuída a outro key user",
    });
}

async function visibleBdcqQuestionIds(
  appUser: any,
  projectId: string,
  questions?: any[]
) {
  if (appUser.role === "admin") return null;
  const membership = await projectAccess.getProjectMembership(
    projectId,
    appUser.id
  );
  if (
    !membership ||
    membership.profile === "gp_internal" ||
    membership.profile === "internal_team" ||
    membership.capabilities?.viewWorkflowArtifacts
  )
    return null;
  const rows = questions || (await wdb.listBdcqQuestions(projectId));
  const keyUsers = await wdb.listProjectKeyUsers(projectId);
  const ownKeyUserIds = new Set(
    keyUsers
      .filter(
        (item: any) =>
          item.active &&
          item.email?.toLowerCase() === appUser.email.toLowerCase()
      )
      .map((item: any) => item.id)
  );
  return new Set(
    rows
      .filter((item: any) => ownKeyUserIds.has(item.keyUserId))
      .map((item: any) => item.id)
  );
}

async function assertCanViewBdcqQuestion(
  appUser: any,
  projectId: string,
  questionId: string
) {
  const visible = await visibleBdcqQuestionIds(appUser, projectId);
  if (visible && !visible.has(questionId))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Esta pergunta está atribuída a outro key user",
    });
}

function responsibleMatches(appUser: any, value: string | null | undefined) {
  const normalized = String(value || "")
    .trim()
    .toLocaleLowerCase("pt-BR");
  return Boolean(
    normalized &&
      [appUser.id, appUser.name, appUser.email].some(
        candidate =>
          String(candidate || "")
            .trim()
            .toLocaleLowerCase("pt-BR") === normalized
      )
  );
}

async function canViewAllWorkflowTests(appUser: any, projectId: string) {
  if (appUser.role === "admin") return true;
  const membership = await projectAccess.getProjectMembership(
    projectId,
    appUser.id
  );
  return (
    !membership ||
    Boolean(
      membership.capabilities?.viewWorkflowArtifacts ||
        membership.profile === "gp_internal" ||
        membership.profile === "internal_team"
    )
  );
}

async function assertCanExecuteTestCase(appUser: any, testCase: any) {
  if (await canViewAllWorkflowTests(appUser, testCase.projectId)) return;
  const steps = await wdb.listWorkflowTestSteps(testCase.id);
  if (
    !responsibleMatches(appUser, testCase.responsible) &&
    !steps.some((step: any) => responsibleMatches(appUser, step.responsible))
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Este teste está atribuído a outro usuário",
    });
}

const gapStatusSchema = z.enum(["Aberto", "Em Análise", "Resolvido", "Aceito"]);
const gapImpactSchema = z.enum(["Alto", "Médio", "Baixo"]);
const workshopStatusSchema = z.enum([
  "Rascunho",
  "Planejado",
  "Agendado",
  "Realizado",
  "Concluído",
  "Cancelado",
]);
const dcdStatusSchema = z.enum(["Rascunho", "Em revisão", "Aprovado"]);
const paginationInput = {
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(500).optional(),
};
const testTypeSchema = z.enum(["Unitário", "Ciclo 1", "Ciclo 2", "Integrado"]);
const testStatusSchema = z.enum([
  "Não iniciado",
  "Em execução",
  "Aprovado",
  "Reprovado",
  "Bloqueado",
]);

async function getDcdGenerationContext(projectId: string, module?: string) {
  const [
    scopeItemsList,
    questions,
    answers,
    requirements,
    workshops,
    minutes,
    gaps,
    template,
  ] = await Promise.all([
    wdb.listScopeItems(projectId),
    wdb.listBdcqQuestions(projectId),
    wdb.listBdcqAnswers(projectId),
    wdb.listClientRequirements(projectId),
    wdb.listWorkshops(projectId),
    wdb.listMinutesByProject(projectId),
    wdb.listGaps(projectId),
    wdb.getActiveDcdTemplate(),
  ]);
  const filteredScope = module
    ? scopeItemsList.filter((item: any) => item.module === module)
    : scopeItemsList;
  const filteredQuestions = module
    ? questions.filter((item: any) => item.module === module)
    : questions;
  const activeRequirements = requirements.filter(
    (item: any) => item.status !== "Descartado"
  );
  const filteredRequirements = module
    ? activeRequirements.filter((item: any) => item.module === module)
    : activeRequirements;
  const answerMap = new Map(
    answers.map((answer: any) => [answer.questionId, answer])
  );
  const filteredWorkshops = workshops.filter(
    (workshop: any) =>
      !module ||
      workshop.module === module ||
      (workshop.modules || []).includes(module) ||
      (workshop.scopeItemIds || []).some((id: string) =>
        filteredScope.some((scope: any) => scope.id === id)
      )
  );
  const transcriptGroups = await Promise.all(
    filteredWorkshops.map(async (workshop: any) => ({
      workshopId: workshop.id,
      items: await wdb.listTranscripts(workshop.id),
    }))
  );
  const transcriptMap = new Map(
    transcriptGroups.map(group => [group.workshopId, group.items])
  );
  const minuteMap = new Map(
    minutes.map((minute: any) => [minute.workshopId, minute])
  );
  const filteredGaps = gaps.filter(
    (gap: any) =>
      !module || gap.module === module || (gap.modules || []).includes(module)
  );
  const sapKnowledge = await getKnowledgeContext(
    filteredScope.map((item: any) => String(item.code || "")).filter(Boolean)
  );
  const hashPayload = {
    module: module || "",
    scope: filteredScope
      .map((item: any) => [
        item.id,
        item.code,
        item.name,
        item.description,
        item.updatedAt,
      ])
      .sort(),
    questions: filteredQuestions
      .map((item: any) => [
        item.id,
        item.question,
        (answerMap.get(item.id) as any)?.answer || "",
        (answerMap.get(item.id) as any)?.updatedAt || "",
      ])
      .sort(),
    requirements: filteredRequirements
      .map((item: any) => [
        item.id,
        item.title,
        item.description,
        item.acceptanceCriteria,
        item.priority,
        item.status,
        item.updatedAt,
      ])
      .sort(),
    workshops: filteredWorkshops.map((item: any) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      objective: item.objective,
      content: item.content,
      notes: item.notes,
      agenda: item.agenda,
      expectedOutcomes: item.expectedOutcomes,
      prerequisites: item.prerequisites,
      attachments: item.attachments,
      presentationFiles: item.presentationFiles,
      transcript: transcriptMap.get(item.id),
      minutes: minuteMap.get(item.id),
      updatedAt: item.updatedAt,
    })),
    gaps: filteredGaps,
    template: template
      ? [template.id, template.version, template.fileHash]
      : ["builtin-v5", 1, "builtin"],
    sapRelease: sapKnowledge.releaseCode,
    sapEntries: sapKnowledge.entries,
  };
  const sourceHash = createHash("sha256")
    .update(JSON.stringify(hashPayload))
    .digest("hex");
  return {
    filteredScope,
    filteredQuestions,
    filteredRequirements,
    answerMap,
    filteredWorkshops,
    transcriptMap,
    minuteMap,
    filteredGaps,
    template,
    sourceSnapshot: {
      capturedAt: new Date().toISOString(),
      module: module || "",
      scopeItems: filteredScope,
      bdcq: filteredQuestions.map((question: any) => ({
        ...question,
        answer: answerMap.get(question.id) || null,
      })),
      workshops: hashPayload.workshops,
      requirements: filteredRequirements,
      gaps: filteredGaps,
      template: hashPayload.template,
    },
    sapKnowledge,
    sourceHash,
  };
}

function buildDcdPrompt(
  context: Awaited<ReturnType<typeof getDcdGenerationContext>>,
  module?: string
) {
  const mandatory = context.filteredQuestions.filter(
    (question: any) => question.required
  );
  const pendingMandatory = mandatory.filter((question: any) => {
    const answer = context.answerMap.get(question.id) as any;
    return !String(answer?.answer || "").trim();
  });
  return `Você é um consultor SAP sênior. Gere um DCD completo para o módulo "${module || "Geral"}".

Use integralmente o snapshot JSON abaixo. Não omita registros por quantidade e não invente fatos. Toda afirmação relevante deve indicar sua origem entre colchetes, por exemplo [BDCQ:ID], [WORKSHOP:ID], [ATA:ID], [TRANSCRICAO:ID], [REQUISITO:ID], [GAP:ID] ou [SCOPE:ID].

${JSON.stringify(context.sourceSnapshot)}

Perguntas obrigatórias (${mandatory.length}); pendências obrigatórias (${pendingMandatory.length}):
${mandatory
  .map((question: any) => {
    const answer = context.answerMap.get(question.id) as any;
    return `- [BDCQ:${question.id}] ${question.question}\n  Resposta: ${String(answer?.answer || "").trim() || "PENDÊNCIA OBRIGATÓRIA — sem resposta registrada"}`;
  })
  .join("\n")}

Contexto SAP da release ativa:
${
  context.sapKnowledge.releaseCode
    ? context.sapKnowledge.entries
        .map(
          (entry: any) =>
            `[SAP:${entry.code}] ${entry.name}\n${entry.summary || ""}\n${entry.context || ""}`
        )
        .join("\n\n")
    : getSapKnowledgeContext(module)
}

Estruture conforme o modelo DCD V5:
1. Escopo do documento e identificação
2. Estrutura organizacional e dados mestres
3. Catálogo de scope items
4. Detalhamento funcional por scope item
5. Configurações, decisões de design, integrações e dependências
6. Requisitos específicos, GAPs e riscos
7. Cenários e critérios de teste
8. Perguntas obrigatórias do BDCQ — inclua todas, detalhadas, mesmo as pendentes
9. Matriz de rastreabilidade
10. Fontes e anexos

Retorne Markdown profissional. Marque ausência de evidência como "Pendência obrigatória" ou "Não informado". Não invente transações, apps, decisões ou configurações.`;
}

async function buildDcdPromptWithChunking(
  context: Awaited<ReturnType<typeof getDcdGenerationContext>>,
  module?: string
) {
  const serialized = JSON.stringify(context.sourceSnapshot);
  if (serialized.length <= 90_000) return buildDcdPrompt(context, module);

  const records = [
    ...((context.sourceSnapshot.scopeItems as unknown[]) || []).map(item => ({
      type: "scope",
      item,
    })),
    ...((context.sourceSnapshot.bdcq as unknown[]) || []).map(item => ({
      type: "bdcq",
      item,
    })),
    ...((context.sourceSnapshot.workshops as unknown[]) || []).map(item => ({
      type: "workshop",
      item,
    })),
    ...((context.sourceSnapshot.requirements as unknown[]) || []).map(item => ({
      type: "requirement",
      item,
    })),
    ...((context.sourceSnapshot.gaps as unknown[]) || []).map(item => ({
      type: "gap",
      item,
    })),
  ];
  const chunks: string[] = [];
  let current = "";
  for (const record of records) {
    const line = `${JSON.stringify(record)}\n`;
    if (current && current.length + line.length > 55_000) {
      chunks.push(current);
      current = "";
    }
    current += line;
  }
  if (current) chunks.push(current);
  const ai = await getWorkflowAiConfig("dcd_generation");
  const summaries: string[] = [];
  for (let index = 0; index < chunks.length; index++) {
    const result = await invokeWorkflowLLM({
      model: ai.model,
      messages: [
        {
          role: "system",
          content:
            "Consolide o bloco de evidências para um DCD SAP. Preserve todos os IDs, decisões, pendências, anexos e referências. Não invente dados.",
        },
        {
          role: "user",
          content: `Bloco ${index + 1} de ${chunks.length} do módulo ${module || "Geral"}:\n${chunks[index]}`,
        },
      ],
    });
    const summary =
      typeof result.choices?.[0]?.message?.content === "string"
        ? result.choices[0].message.content
        : "";
    if (!summary.trim())
      throw new Error(
        `A IA não consolidou o bloco ${index + 1} dos insumos do DCD`
      );
    summaries.push(`## Bloco ${index + 1}\n${summary}`);
  }
  return buildDcdPrompt(
    {
      ...context,
      sourceSnapshot: {
        capturedAt: context.sourceSnapshot.capturedAt,
        module: module || "",
        processing: { chunked: true, chunks: chunks.length },
        consolidatedEvidence: summaries,
      } as any,
    },
    module
  );
}

async function createDcdArtifacts(input: {
  id: string;
  projectId: string;
  module: string;
  title: string;
  content: string;
  version: number;
  status: string;
  author: string;
  template?: any;
}) {
  const project = await plannerStore.getProjectById(input.projectId);
  const context = {
    projectName: project?.name || input.projectId,
    module: input.module || "Geral",
    title: input.title,
    version: input.version,
    status: input.status,
    author: input.author,
    generatedAt: new Date(),
    templateName: input.template?.name || "DCD V5",
  };
  const [docx, pdf] = await Promise.all([
    generateDcdDocx(context, input.content),
    generateDcdPdf(context, input.content),
  ]);
  const base = `workflow/${input.projectId}/dcd/${input.module || "geral"}/${input.id}`;
  const [storedDocx, storedPdf] = await Promise.all([
    storagePut(
      `${base}.docx`,
      docx,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ),
    storagePut(`${base}.pdf`, pdf, "application/pdf"),
  ]);
  return { docxUrl: storedDocx.url, pdfUrl: storedPdf.url };
}

export async function streamDcdGeneration(input: {
  projectId: string;
  module?: string;
  forceRegenerate?: boolean;
  user: { id: string; name: string };
  onDelta: (text: string) => void | Promise<void>;
}) {
  const generationContext = await getDcdGenerationContext(
    input.projectId,
    input.module
  );
  const { sapKnowledge, sourceHash } = generationContext;
  if (!sapKnowledge.releaseCode) {
    throw new Error(
      "Nenhuma release SAP está ativa na Biblioteca SAP. Importe, revise e ative uma release em Configurações do Tech antes de gerar um DCD fundamentado."
    );
  }
  const cached = await wdb.findDcdBySourceHash(input.projectId, sourceHash);
  if (cached && !input.forceRegenerate) {
    await recordWorkflowAudit(
      { user: input.user },
      input.projectId,
      "DCD_CACHE_REUSED",
      "dcd",
      cached.id,
      { version: cached.version, module: input.module || "" }
    );
    return {
      id: cached.id,
      title: cached.title,
      content: cached.content,
      version: cached.version,
      cached: true,
    };
  }
  const prompt = await buildDcdPromptWithChunking(
    generationContext,
    input.module
  );
  const ai = await getWorkflowAiConfig("dcd_generation");
  const streamed = await invokeLLMStream(
    {
      model: ai.model,
      messages: [
        { role: "system", content: ai.systemPrompt },
        { role: "user", content: prompt },
      ],
    },
    input.onDelta
  );
  if (!streamed.content.trim())
    throw new Error("A IA não retornou conteúdo para o DCD");
  const id = nanoid();
  const latest = await wdb.getLatestDcdByModule(
    input.projectId,
    input.module || ""
  );
  const version = (latest?.version || 0) + 1;
  const seriesId = latest?.seriesId || latest?.id || id;
  const title = `DCD - ${input.module || "Geral"} - v${version}`;
  const artifacts = await createDcdArtifacts({
    id,
    projectId: input.projectId,
    module: input.module || "",
    title,
    content: streamed.content,
    version,
    status: "Rascunho",
    author: input.user.name,
    template: generationContext.template,
  });
  await wdb.createDcdDocument({
    id,
    seriesId,
    sourceHash,
    version,
    projectId: input.projectId,
    module: input.module || "",
    title,
    content: streamed.content,
    status: "Rascunho",
    sourceSnapshot: generationContext.sourceSnapshot,
    templateId: generationContext.template?.id || "builtin-v5",
    templateVersion: generationContext.template?.version || 1,
    docxUrl: artifacts.docxUrl,
    pdfUrl: artifacts.pdfUrl,
    versionReason: "generated",
    createdBy: input.user.name,
  });
  await recordWorkflowAudit(
    { user: input.user },
    input.projectId,
    "DCD_GENERATED_STREAM",
    "dcd",
    id,
    {
      version,
      module: input.module || "",
      sourceHash,
      model: streamed.model || ai.model || "",
    }
  );
  return { id, title, content: streamed.content, version, cached: false };
}

function effectiveBdcqTemplates(customTemplates: any[]) {
  const customById = new Map(
    customTemplates.map((template: any) => [template.id, template])
  );
  const builtInIds = new Set(BDCQ_TEMPLATES.map(template => template.id));
  return [
    ...BDCQ_TEMPLATES.map(template => ({
      ...template,
      ...(customById.get(template.id) || {}),
    })),
    ...customTemplates.filter((template: any) => !builtInIds.has(template.id)),
  ].filter((template: any) => template.active !== 0);
}

const projectBdcqMetadata = (template: any) => ({
  questionOriginal: template.questionOriginal || "",
  sapId: template.sapId || "",
  level: template.level || "L3",
  process: template.process || "",
  sscuiReference: template.sscuiReference || "",
  area: template.area || "",
  topic: template.topic || "",
  topicDefinition: template.topicDefinition || "",
  solution: template.solution || "",
  source: template.source || "Standard SAP",
  sourceFile: template.sourceFile || "",
  sourceRelease: template.sourceRelease || "",
  active: template.active === 0 ? 0 : 1,
  metadataInitialized: 1,
});

async function backfillBdcqProjectMetadata(projectId: string) {
  const [questions, customTemplates] = await Promise.all([
    wdb.listBdcqQuestions(projectId),
    wdb.listBdcqTemplateLibrary(),
  ]);
  const byId = new Map(
    effectiveBdcqTemplates(customTemplates).map((template: any) => [
      template.id,
      template,
    ])
  );
  let updated = 0;
  for (const question of questions as any[]) {
    if (
      question.metadataInitialized === 1 ||
      !question.templateId ||
      !byId.has(question.templateId)
    )
      continue;
    await wdb.updateBdcqQuestion(question.id, {
      ...projectBdcqMetadata(byId.get(question.templateId)),
      required: Boolean(
        byId.get(question.templateId)?.required ?? question.required
      ),
    });
    updated++;
  }
  return updated;
}

export async function ensureBdcqTemplates(
  projectId: string,
  modules?: string[]
) {
  const [existing, scopeItems, customTemplates] = await Promise.all([
    wdb.listBdcqQuestions(projectId),
    wdb.listScopeItems(projectId),
    wdb.listBdcqTemplateLibrary(),
  ]);
  const normalize = (value: string) => value.trim().toLocaleLowerCase("pt-BR");
  const normalizeModule = (value: string) =>
    value.trim().toLocaleUpperCase("pt-BR");
  const activeScopeItems = scopeItems.filter((item: any) => item.active !== 0);
  const requestedModules = modules?.length
    ? new Set(modules.map(normalizeModule))
    : new Set(
        activeScopeItems.map((item: any) =>
          normalizeModule(String(item.module || "Geral"))
        )
      );
  const effectiveTemplates = effectiveBdcqTemplates(customTemplates);
  const templates: Array<{
    id?: string;
    module: string;
    category: string;
    question: string;
    required?: boolean;
    scopeItemIds?: string[];
    metadata: ReturnType<typeof projectBdcqMetadata>;
  }> = [];

  for (const template of effectiveTemplates) {
    const templateModules: string[] = [
      ...new Set<string>(
        (template.modules || [])
          .map((module: string) => normalizeModule(module))
          .filter(Boolean)
      ),
    ];
    const scopeKeys = new Set(
      (template.scopeItemKeys || [])
        .flatMap((key: string) => key.split(/[;,]/))
        .map((key: string) => normalize(key))
        .filter(Boolean)
    );

    if (scopeKeys.size) {
      const matchedScope = activeScopeItems.filter((item: any) => {
        const code = normalize(String(item.code || ""));
        const name = normalize(String(item.name || ""));
        return scopeKeys.has(code) || scopeKeys.has(name);
      });
      if (!matchedScope.length) continue;

      if (templateModules.length) {
        for (const module of templateModules)
          templates.push({
            id: template.id,
            module,
            category: template.category || "",
            question: template.question,
            required: Boolean(template.required),
            scopeItemIds: matchedScope.map((item: any) => item.id),
            metadata: projectBdcqMetadata(template),
          });
      } else {
        const scopeByModule = new Map<string, string[]>();
        for (const item of matchedScope) {
          const module = normalizeModule(String(item.module || "Geral"));
          scopeByModule.set(module, [
            ...(scopeByModule.get(module) || []),
            item.id,
          ]);
        }
        for (const [module, scopeItemIds] of scopeByModule)
          templates.push({
            id: template.id,
            module,
            category: template.category || "",
            question: template.question,
            required: Boolean(template.required),
            scopeItemIds,
            metadata: projectBdcqMetadata(template),
          });
      }
      continue;
    }

    const applicableModules = templateModules.length
      ? templateModules.filter(module => requestedModules.has(module))
      : ["GERAL"];
    for (const module of applicableModules)
      templates.push({
        id: template.id,
        module,
        category: template.category || "",
        question: template.question,
        required: Boolean(template.required),
        scopeItemIds: [],
        metadata: projectBdcqMetadata(template),
      });
  }

  let added = 0;
  let updated = 0;
  for (const template of templates) {
    const module = normalizeModule(template.module || "Geral");
    const existingQuestion = existing.find(
      (question: any) =>
        (template.id &&
          question.templateId === template.id &&
          normalizeModule(question.module || "Geral") === module) ||
        (normalizeModule(question.module || "Geral") === module &&
          normalize(question.question) === normalize(template.question))
    );
    if (existingQuestion) {
      const currentScopeIds = existingQuestion.scopeItemIds || [];
      const mergedScopeIds = [
        ...new Set([...currentScopeIds, ...(template.scopeItemIds || [])]),
      ];
      const canUpdateAutomatic =
        existingQuestion.isDefault === 1 ||
        Boolean(existingQuestion.templateId);
      if (
        canUpdateAutomatic &&
        (mergedScopeIds.length !== currentScopeIds.length ||
          (!existingQuestion.templateId && template.id))
      ) {
        await wdb.updateBdcqQuestion(existingQuestion.id, {
          templateId: template.id || existingQuestion.templateId || "",
          scopeItemIds: mergedScopeIds,
        });
        existingQuestion.templateId =
          template.id || existingQuestion.templateId || "";
        existingQuestion.scopeItemIds = mergedScopeIds;
        updated++;
      }
      continue;
    }
    await wdb.createBdcqQuestion({
      id: nanoid(),
      projectId,
      module,
      category: template.category,
      question: template.question,
      templateId: template.id || "",
      required: Boolean(template.required),
      scopeItemIds: template.scopeItemIds || [],
      ...template.metadata,
      isDefault: 1,
      sortOrder: existing.length + added,
    });
    existing.push({
      id: template.id || `${module}:${normalize(template.question)}`,
      module,
      question: template.question,
      templateId: template.id || "",
      scopeItemIds: template.scopeItemIds || [],
      isDefault: 1,
    } as any);
    added++;
  }
  return { added, updated };
}

export async function applyConfigurationTemplates(projectId: string) {
  const [project, scopeItems, templates, existing] = await Promise.all([
    plannerStore.getProjectById(projectId),
    wdb.listScopeItems(projectId),
    wdb.listConfigurationTemplates(),
    wdb.listConfigurations(projectId),
  ]);
  if (!project)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Projeto não encontrado",
    });
  const normalize = (value: string) => value.trim().toLocaleLowerCase("pt-BR");
  const projectModules = new Set([
    ...(project.fronts || []).map(value => value.toUpperCase()),
    ...scopeItems.map((item: any) => String(item.module || "").toUpperCase()),
  ]);
  const known = new Set(
    existing.map(
      (item: any) =>
        `${item.templateId || ""}|${String(item.module || "").toUpperCase()}|${[...(item.scopeItemIds || [])].sort().join(",")}`
    )
  );
  let added = 0;
  let ignored = 0;
  for (const template of templates.filter(
    (item: any) => item.active !== false && item.active !== 0
  )) {
    const modules = (template.modules || []).map((value: string) =>
      value.toUpperCase()
    );
    const keys = new Set(
      (template.scopeItemKeys || []).map((value: string) => normalize(value))
    );
    const matchedScope = scopeItems.filter(
      (item: any) =>
        item.active !== 0 &&
        keys.has(normalize(item.code || item.name || "")) &&
        (!modules.length ||
          modules.includes(String(item.module || "").toUpperCase()))
    );
    if (keys.size && !matchedScope.length) {
      ignored++;
      continue;
    }
    const targetModules = keys.size
      ? [
          ...new Set(
            matchedScope.map((item: any) =>
              String(item.module || "").toUpperCase()
            )
          ),
        ]
      : modules.length
        ? modules.filter((module: string) => projectModules.has(module))
        : [""];
    if (!targetModules.length) {
      ignored++;
      continue;
    }
    for (const module of targetModules) {
      const scopeItemIds = matchedScope
        .filter(
          (item: any) =>
            !module || String(item.module || "").toUpperCase() === module
        )
        .map((item: any) => item.id)
        .sort();
      const key = `${template.id}|${module}|${scopeItemIds.join(",")}`;
      if (known.has(key)) {
        ignored++;
        continue;
      }
      await wdb.createConfiguration({
        id: nanoid(),
        projectId,
        module,
        category: template.category || "Configuração",
        description: template.description,
        responsible: "",
        status: "Pendente",
        notes: "Aplicada a partir do modelo administrativo",
        templateId: template.id,
        bdcqQuestionId: "",
        scopeItemIds,
        source: "template",
      });
      known.add(key);
      added++;
    }
  }
  return { added, ignored };
}

async function recordWorkflowAudit(
  ctx: any,
  projectId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {}
) {
  await wdb.createWorkflowAudit({
    id: nanoid(),
    projectId,
    action,
    entityType,
    entityId,
    details,
    userId: String(
      ctx.user?.id || ctx.user?.openId || ctx.appUser?.id || "unknown"
    ),
    userName:
      ctx.user?.name || ctx.user?.email || ctx.appUser?.name || "Usuário",
  });
}

async function safeWorkflowNotification(
  projectId: string,
  title: string,
  message: string
) {
  try {
    const project = await plannerStore.getProjectById(projectId);
    const context = project
      ? `Projeto: ${project.name}\nCliente: ${project.client || "-"}\nGestor: ${project.manager || "-"}\n\n`
      : "";
    return await notifyOwner({ title, content: `${context}${message}` });
  } catch (error) {
    console.warn("Workflow notification was not delivered", error);
    return false;
  }
}

async function loadFilteredProjectBdcq(
  appUser: any,
  projectId: string,
  filters: any
) {
  await backfillBdcqProjectMetadata(projectId);
  const [rows, answers, scopeItems] = await Promise.all([
    wdb.listBdcqQuestions(projectId),
    wdb.listBdcqAnswers(projectId),
    wdb.listScopeItems(projectId),
  ]);
  const scopeItemSearch = new Map(
    scopeItems.map((item: any) => [
      item.id,
      [item.code, item.name, item.module].filter(Boolean).join(" "),
    ])
  );
  const visible = await visibleBdcqQuestionIds(appUser, projectId, rows);
  const visibleRows = visible
    ? rows.filter((item: any) => visible.has(item.id))
    : rows;
  const answerByQuestionId = new Map(
    answers.map((answer: any) => [answer.questionId, answer])
  );
  const answeredIds = new Set(
    answers
      .filter((answer: any) => String(answer.answer || "").trim())
      .map((answer: any) => answer.questionId)
  );
  const normalize = (value: unknown) =>
    String(value || "")
      .trim()
      .toLocaleLowerCase("pt-BR");
  const term = normalize(filters.search);
  const matches = (selected: string[], value: unknown) =>
    !selected.length ||
    selected.some(item => normalize(item) === normalize(value));
  const filtered = visibleRows.filter((question: any) => {
    const status =
      question.active === 0
        ? "inactive"
        : answeredIds.has(question.id)
          ? "answered"
          : "pending";
    if (!filters.statuses.length && status === "inactive") return false;
    if (filters.statuses.length && !filters.statuses.includes(status))
      return false;
    if (!matches(filters.modules, question.module)) return false;
    if (!matches(filters.levels, question.level)) return false;
    if (!matches(filters.areas, question.area)) return false;
    if (!matches(filters.topics, question.topic)) return false;
    if (!matches(filters.sources, question.source)) return false;
    if (!matches(filters.consultantResourceIds, question.consultantResourceId))
      return false;
    if (!matches(filters.keyUserIds, question.keyUserId)) return false;
    if (
      filters.scopeItemIds.length &&
      !filters.scopeItemIds.some((id: string) =>
        (question.scopeItemIds || []).includes(id)
      )
    )
      return false;
    if (!term) return true;
    return [
      question.question,
      question.questionOriginal,
      question.sapId,
      question.module,
      question.category,
      question.process,
      question.area,
      question.topic,
      question.sscuiReference,
      question.source,
      ...(question.scopeItemIds || []),
      ...(question.scopeItemIds || []).map(
        (id: string) => scopeItemSearch.get(id) || ""
      ),
    ]
      .map(normalize)
      .some(value => value.includes(term));
  });
  return {
    filtered,
    visibleRows,
    answers,
    answerByQuestionId,
    answeredIds,
    scopeItems,
  };
}

async function notifyIfBdcqModuleCompleted(
  projectId: string,
  questionId: string
) {
  const [questions, answers] = await Promise.all([
    wdb.listBdcqQuestions(projectId),
    wdb.listBdcqAnswers(projectId),
  ]);
  const answeredQuestion = questions.find(
    (question: any) => question.id === questionId
  );
  if (!answeredQuestion) return false;
  const moduleQuestions = questions.filter(
    (question: any) => question.module === answeredQuestion.module
  );
  const answeredIds = new Set(
    answers
      .filter((answer: any) => String(answer.answer || "").trim())
      .map((answer: any) => answer.questionId)
  );
  if (
    !moduleQuestions.length ||
    !moduleQuestions.every((question: any) => answeredIds.has(question.id))
  )
    return false;
  return safeWorkflowNotification(
    projectId,
    `BDCQ ${answeredQuestion.module} concluído`,
    `Todas as ${moduleQuestions.length} perguntas do módulo ${answeredQuestion.module} foram respondidas. A etapa está pronta para revisão e continuidade do Workflow.`
  );
}

async function assertEntitiesBelongToProject(
  table: string,
  ids: string[],
  projectId: string
) {
  const projectIds = await Promise.all(
    ids.map(id => wdb.getWorkflowEntityProjectId(table, id))
  );
  if (projectIds.some(value => value !== projectId))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Um ou mais registros não pertencem ao projeto informado",
    });
}

export const workflowRouter = router({
  delivery: deliveryMasterRouter,
  sapLibrary: sapLibraryRouter,
  prompts: router({
    models: adminProcedure.query(async () => {
      try {
        const response = await listLLMModels();
        return response.data.map(model => ({
          id: model.id,
          owner: model.owned_by,
        }));
      } catch (error) {
        console.warn("Unable to list Workflow LLM models", error);
        return [];
      }
    }),
    list: protectedProcedure.query(async () => {
      const stored = new Map(
        (await wdb.listWorkflowPrompts()).map(prompt => [prompt.key, prompt])
      );
      return Object.entries(WORKFLOW_PROMPT_DEFAULTS).map(
        ([key, fallback]) => ({
          key,
          ...fallback,
          ...(stored.get(key) || {}),
          isCustomized: stored.has(key),
        })
      );
    }),
    update: adminProcedure
      .input(
        z.object({
          key: z.enum([
            "agenda_suggestion",
            "minutes_generation",
            "dcd_generation",
            "dcd_refinement",
            "gaps_extraction",
            "configurations_extraction",
          ]),
          systemPrompt: z.string().trim().min(40).max(20_000),
          model: z.string().trim().max(255).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const metadata = WORKFLOW_PROMPT_DEFAULTS[input.key];
        return wdb.upsertWorkflowPrompt({
          key: input.key,
          name: metadata.name,
          description: metadata.description,
          systemPrompt: input.systemPrompt,
          model: input.model || "",
          updatedBy: ctx.appUser.name || ctx.appUser.email,
        });
      }),
    reset: adminProcedure
      .input(
        z.object({
          key: z.enum([
            "agenda_suggestion",
            "minutes_generation",
            "dcd_generation",
            "dcd_refinement",
            "gaps_extraction",
            "configurations_extraction",
          ]),
        })
      )
      .mutation(async ({ input }) => {
        await wdb.deleteWorkflowPrompt(input.key);
        return {
          key: input.key,
          ...WORKFLOW_PROMPT_DEFAULTS[input.key],
          isCustomized: false,
        };
      }),
  }),
  audit: router({
    list: workflowProjectProcedure()
      .input(
        z.object({
          projectId: z.string(),
          limit: z.number().int().min(1).max(500).optional(),
        })
      )
      .query(({ input }) =>
        wdb.listWorkflowAudit(input.projectId, input.limit || 100)
      ),
  }),
  reports: router({
    consolidatedPdf: workflowProjectProcedure()
      .input(z.object({ projectId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const [project, requirements, dcds, gaps, configurations, testCases] =
          await Promise.all([
            plannerStore.getProjectById(input.projectId),
            wdb.listClientRequirements(input.projectId),
            wdb.listDcdDocuments(input.projectId, true),
            wdb.listGaps(input.projectId),
            wdb.listConfigurations(input.projectId),
            wdb.listWorkflowTestCases(input.projectId),
          ]);
        if (!project)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Projeto não encontrado",
          });
        const markdown = buildWorkflowConsolidatedMarkdown({
          project,
          requirements,
          dcds,
          gaps,
          configurations,
          testCases,
        });
        const pdf = generateWorkflowPdf(`TechMove - ${project.name}`, markdown);
        const filename = `workflow-${
          project.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .toLowerCase() || "projeto"
        }.pdf`;
        await recordWorkflowAudit(
          ctx,
          input.projectId,
          "WORKFLOW_REPORT_EXPORTED",
          "project",
          input.projectId,
          {
            filename,
            bytes: pdf.length,
            dcds: dcds.length,
            gaps: gaps.length,
            configurations: configurations.length,
            testCases: testCases.length,
            requirements: requirements.length,
          }
        );
        return {
          filename,
          contentType: "application/pdf" as const,
          base64: pdf.toString("base64"),
        };
      }),
  }),
  search: workflowProjectProcedure()
    .input(
      z.object({
        projectId: z.string(),
        query: z.string().trim().min(2).max(200),
        limit: z.number().int().min(1).max(100).optional(),
      })
    )
    .query(async ({ input }) => {
      const [
        scope,
        questions,
        answers,
        workshops,
        requirements,
        minutes,
        dcds,
        gaps,
        configs,
        testCases,
      ] = await Promise.all([
        wdb.listScopeItems(input.projectId),
        wdb.listBdcqQuestions(input.projectId),
        wdb.listBdcqAnswers(input.projectId),
        wdb.listWorkshops(input.projectId),
        wdb.listClientRequirements(input.projectId),
        wdb.listMinutesByProject(input.projectId),
        wdb.listDcdDocuments(input.projectId, true),
        wdb.listGaps(input.projectId),
        wdb.listConfigurations(input.projectId),
        wdb.listWorkflowTestCases(input.projectId),
      ]);
      const term = input.query.toLocaleLowerCase("pt-BR");
      const limit = input.limit || 50;
      const results: Array<{
        id: string;
        type: string;
        title: string;
        excerpt: string;
        route: string;
      }> = [];
      const add = (
        items: any[],
        type: string,
        route: string,
        title: (item: any) => string,
        text: (item: any) => string
      ) => {
        for (const item of items) {
          const itemTitle = title(item) || type;
          const body = text(item) || "";
          const haystack = `${itemTitle}\n${body}`.toLocaleLowerCase("pt-BR");
          const matchIndex = haystack.indexOf(term);
          if (matchIndex < 0) continue;
          const start = Math.max(0, matchIndex - 60);
          const excerpt = `${start > 0 ? "…" : ""}${`${itemTitle} — ${body}`.slice(start, start + 180)}${haystack.length > start + 180 ? "…" : ""}`;
          results.push({ id: item.id, type, title: itemTitle, excerpt, route });
          if (results.length >= limit) return;
        }
      };
      add(
        scope,
        "Escopo",
        "/techmove/scope-items",
        item => item.name,
        item =>
          `${item.code || ""} ${item.module || ""} ${item.description || ""}`
      );
      add(
        questions,
        "BDCQ",
        "/techmove/bdcq",
        item => item.question,
        item => `${item.module || ""} ${item.category || ""}`
      );
      add(
        answers,
        "Resposta BDCQ",
        "/techmove/bdcq",
        item => `Resposta da pergunta ${item.questionId}`,
        item => item.answer || ""
      );
      add(
        workshops,
        "Workshop",
        "/techmove/workshops",
        item => item.title,
        item =>
          `${item.module || ""} ${item.notes || ""} ${(item.agenda || []).join(" ")}`
      );
      add(
        requirements,
        "Requisito",
        "/techmove/workshops",
        item => item.title,
        item =>
          `${item.description || ""} ${item.acceptanceCriteria || ""} ${item.module || ""}`
      );
      add(
        minutes,
        "Ata",
        "/techmove/workshops",
        item => item.title || "Ata de workshop",
        item => item.content || ""
      );
      add(
        dcds,
        "DCD",
        "/techmove/dcd",
        item => item.title,
        item => `${item.module || ""} ${item.content || ""}`
      );
      add(
        gaps,
        "Gap",
        "/techmove/gaps",
        item => item.description,
        item =>
          `${item.module || ""} ${item.resolution || ""} ${item.responsible || ""}`
      );
      add(
        configs,
        "Configuração",
        "/techmove/configurations",
        item => item.description,
        item =>
          `${item.module || ""} ${item.category || ""} ${item.responsible || ""}`
      );
      add(
        testCases,
        "Caso de teste",
        "/techmove/tests",
        item => item.title,
        item =>
          `${item.type || ""} ${item.code || ""} ${item.module || ""} ${item.expectedResult || ""} ${item.actualResult || ""}`
      );
      return results.slice(0, limit);
    }),
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const projects = await listWorkflowProjects(ctx.appUser);
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const draftCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const stageCounts: Record<string, number> = {
      Escopo: 0,
      BDCQ: 0,
      Workshops: 0,
      DCD: 0,
      Gaps: 0,
      Configurações: 0,
      Testes: 0,
      Concluído: 0,
    };
    let workflowsInProgress = 0;
    let pendingQuestions = 0;
    let dcdsForApproval = 0;
    let unassignedGaps = 0;
    const alerts: Array<{
      type: string;
      label: string;
      projectId: string;
      projectName: string;
      route: string;
    }> = [];
    await Promise.all(
      projects.map(async project => {
        const [
          scope,
          questions,
          answers,
          workshops,
          requirements,
          minutes,
          dcds,
          gaps,
          configs,
          testCases,
        ] = await Promise.all([
          wdb.listScopeItems(project.id),
          wdb.listBdcqQuestions(project.id),
          wdb.listBdcqAnswers(project.id),
          wdb.listWorkshops(project.id),
          wdb.listClientRequirements(project.id),
          wdb.listMinutesByProject(project.id),
          wdb.listDcdDocuments(project.id),
          wdb.listGaps(project.id),
          wdb.listConfigurations(project.id),
          wdb.listWorkflowTestCases(project.id),
        ]);
        if (
          ![
            scope,
            questions,
            workshops,
            requirements,
            dcds,
            gaps,
            configs,
            testCases,
          ].some(items => items.length)
        )
          return;
        workflowsInProgress++;
        const answeredIds = new Set(
          answers.map((answer: any) => answer.questionId)
        );
        const pending = questions.filter(
          (question: any) => !answeredIds.has(question.id)
        );
        const openGaps = gaps.filter(
          (gap: any) => !["Resolvido", "Aceito"].includes(gap.status)
        );
        pendingQuestions += pending.length;
        dcdsForApproval += dcds.filter(
          (dcd: any) => dcd.status === "Em revisão"
        ).length;
        unassignedGaps += openGaps.filter(
          (gap: any) => !gap.responsible
        ).length;
        const stage =
          scope.length === 0
            ? "Escopo"
            : pending.length > 0
              ? "BDCQ"
              : workshops.some(
                    (item: any) =>
                      !["Realizado", "Concluído", "Cancelado"].includes(
                        item.status
                      )
                  )
                ? "Workshops"
                : !dcds.some((item: any) => item.status === "Aprovado")
                  ? "DCD"
                  : openGaps.length
                    ? "Gaps"
                    : configs.some((item: any) => item.status !== "Concluído")
                      ? "Configurações"
                      : !testCases.length ||
                          testCases.some(
                            (item: any) => item.status !== "Aprovado"
                          )
                        ? "Testes"
                        : "Concluído";
        stageCounts[stage]++;
        pending
          .filter(
            (question: any) => new Date(question.createdAt).getTime() < cutoff
          )
          .slice(0, 5)
          .forEach((question: any) =>
            alerts.push({
              type: "BDCQ",
              label: `Pergunta sem resposta: ${question.question}`,
              projectId: project.id,
              projectName: project.name,
              route: "/techmove/bdcq",
            })
          );
        const minuteWorkshopIds = new Set(
          minutes.map((minute: any) => minute.workshopId)
        );
        workshops
          .filter(
            (workshop: any) =>
              ["Realizado", "Concluído"].includes(workshop.status) &&
              !minuteWorkshopIds.has(workshop.id)
          )
          .forEach((workshop: any) =>
            alerts.push({
              type: "Workshop",
              label: `Workshop sem ata: ${workshop.title}`,
              projectId: project.id,
              projectName: project.name,
              route: "/techmove/workshops",
            })
          );
        dcds
          .filter(
            (dcd: any) =>
              dcd.status === "Rascunho" &&
              new Date(dcd.updatedAt).getTime() < draftCutoff
          )
          .forEach((dcd: any) =>
            alerts.push({
              type: "DCD",
              label: `DCD em rascunho há mais de 14 dias: ${dcd.title}`,
              projectId: project.id,
              projectName: project.name,
              route: "/techmove/dcd",
            })
          );
        openGaps
          .filter((gap: any) => !gap.responsible)
          .forEach((gap: any) =>
            alerts.push({
              type: "Gap",
              label: `Gap sem responsável: ${gap.description}`,
              projectId: project.id,
              projectName: project.name,
              route: "/techmove/gaps",
            })
          );
      })
    );
    return {
      workflowsInProgress,
      pendingQuestions,
      dcdsForApproval,
      unassignedGaps,
      stageCounts,
      alerts: alerts.slice(0, 50),
    };
  }),
  projectIndicators: protectedProcedure.query(async ({ ctx }) => {
    const projects = await listWorkflowProjects(ctx.appUser);
    const indicators = await Promise.all(
      projects.map(async project => {
        const [
          scope,
          questions,
          answers,
          workshops,
          dcds,
          gaps,
          configurations,
          testCases,
        ] = await Promise.all([
          wdb.listScopeItems(project.id),
          wdb.listBdcqQuestions(project.id),
          wdb.listBdcqAnswers(project.id),
          wdb.listWorkshops(project.id),
          wdb.listDcdDocuments(project.id),
          wdb.listGaps(project.id),
          wdb.listConfigurations(project.id),
          wdb.listWorkflowTestCases(project.id),
        ]);
        const hasWorkflow = [
          scope,
          questions,
          workshops,
          dcds,
          gaps,
          configurations,
          testCases,
        ].some(items => items.length > 0);
        if (!hasWorkflow) return null;
        const answeredIds = new Set(
          answers
            .filter((answer: any) => String(answer.answer || "").trim())
            .map((answer: any) => answer.questionId)
        );
        const openGaps = gaps.filter(
          (gap: any) => !["Resolvido", "Aceito"].includes(gap.status)
        );
        const stage =
          scope.length === 0
            ? "Escopo"
            : questions.some((question: any) => !answeredIds.has(question.id))
              ? "BDCQ"
              : workshops.some(
                    (item: any) =>
                      !["Realizado", "Concluído", "Cancelado"].includes(
                        item.status
                      )
                  )
                ? "Workshops"
                : !dcds.some((item: any) => item.status === "Aprovado")
                  ? "DCD"
                  : openGaps.length
                    ? "Gaps"
                    : configurations.some(
                          (item: any) => item.status !== "Concluído"
                        )
                      ? "Configurações"
                      : !testCases.length ||
                          testCases.some(
                            (item: any) => item.status !== "Aprovado"
                          )
                        ? "Testes"
                        : "Concluído";
        return { projectId: project.id, stage };
      })
    );
    return indicators.filter(
      (indicator): indicator is NonNullable<typeof indicator> =>
        Boolean(indicator)
    );
  }),
  progress: workflowProjectProcedure()
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const [
        governance,
        scope,
        questions,
        answers,
        workshopList,
        requirements,
        documents,
        gapList,
        configList,
        testCases,
      ] = await Promise.all([
        approvalStore.getGovernanceReadiness(input.projectId),
        wdb.listScopeItems(input.projectId),
        wdb.listBdcqQuestions(input.projectId),
        wdb.listBdcqAnswers(input.projectId),
        wdb.listWorkshops(input.projectId),
        wdb.listClientRequirements(input.projectId),
        wdb.listDcdDocuments(input.projectId),
        wdb.listGaps(input.projectId),
        wdb.listConfigurations(input.projectId),
        wdb.listWorkflowTestCases(input.projectId),
      ]);
      const percent = (done: number, total: number) =>
        total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
      const answeredQuestions = new Set(
        answers.map((item: any) => item.questionId)
      ).size;
      const approvedDcds = documents.filter(
        (item: any) => item.status === "Aprovado"
      ).length;
      const completedWorkshops = workshopList.filter((item: any) =>
        ["Realizado", "Concluído"].includes(item.status)
      ).length;
      const resolvedGaps = gapList.filter((item: any) =>
        ["Resolvido", "Aceito"].includes(item.status)
      ).length;
      const completedConfigs = configList.filter((item: any) =>
        ["Concluído", "Concluída"].includes(item.status)
      ).length;
      const approvedTests = testCases.filter(
        (item: any) => item.status === "Aprovado"
      ).length;
      return {
        steps: [
          {
            id: "governance",
            percent: governance.percent,
            label: governance.label,
            details: {
              policiesEvaluated: governance.policiesEvaluated,
              policiesEnabled: governance.policiesEnabled,
              policiesValid: governance.policiesValid,
              approversAvailable: governance.approversAvailable,
              pending: governance.pending,
              confirmed: governance.confirmed,
            },
          },
          {
            id: "scope-items",
            percent: scope.length ? 100 : 0,
            label: `${scope.length} itens cadastrados`,
          },
          {
            id: "bdcq",
            percent: percent(answeredQuestions, questions.length),
            label: `${answeredQuestions} de ${questions.length} respondidas`,
          },
          {
            id: "workshops",
            percent: percent(completedWorkshops, workshopList.length),
            label: `${completedWorkshops} de ${workshopList.length} realizados · ${requirements.length} requisitos`,
          },
          {
            id: "dcd",
            percent: percent(approvedDcds, documents.length),
            label: `${approvedDcds} de ${documents.length} aprovados`,
          },
          {
            id: "gaps",
            percent: percent(resolvedGaps, gapList.length),
            label: `${resolvedGaps} de ${gapList.length} resolvidos`,
          },
          {
            id: "configurations",
            percent: percent(completedConfigs, configList.length),
            label: `${completedConfigs} de ${configList.length} concluídas`,
          },
          {
            id: "tests",
            percent: percent(approvedTests, testCases.length),
            label: `${approvedTests} de ${testCases.length} aprovados · ${testCases.filter((item: any) => item.type === "Unitário").length} unitários · ${testCases.filter((item: any) => item.type === "Integrado").length} integrados`,
          },
        ],
      };
    }),
  legacy: router({
    preview: workflowProjectProcedure()
      .input(z.object({ projectId: z.string().min(1) }))
      .query(async ({ input }) => {
        const legacy = await plannerStore.getTechMoveData(input.projectId);
        const counts = legacyTechMoveCounts(legacy);
        return {
          counts,
          total: Object.values(counts).reduce((sum, value) => sum + value, 0),
        };
      }),
    import: workflowProjectProcedure(true)
      .input(z.object({ projectId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const legacy = await plannerStore.getTechMoveData(input.projectId);
        const imported = await importLegacyTechMove(input.projectId, legacy);
        await recordWorkflowAudit(
          ctx,
          input.projectId,
          "TECHMOVE_LEGACY_IMPORTED",
          "project",
          input.projectId,
          imported
        );
        return imported;
      }),
  }),
  requirements: router({
    list: workflowProjectProcedure()
      .input(
        z.object({
          projectId: z.string().min(1),
          workshopId: z.string().optional(),
          ...paginationInput,
        })
      )
      .query(({ input }) =>
        wdb.listClientRequirements(input.projectId, input.workshopId, input)
      ),
    create: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string().min(1),
          workshopId: z.string().min(1),
          code: z.string().optional(),
          title: z.string().min(1),
          description: z.string().min(1),
          module: z.string().optional(),
          category: z
            .enum([
              "Funcional",
              "Não funcional",
              "Integração",
              "Relatório",
              "Migração",
            ])
            .optional(),
          priority: z.enum(["Alta", "Média", "Baixa"]).optional(),
          status: z
            .enum(["Identificado", "Em análise", "Validado", "Descartado"])
            .optional(),
          source: z.string().optional(),
          acceptanceCriteria: z.string().optional(),
          responsible: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const workshopProjectId = await wdb.getWorkflowEntityProjectId(
          "workshops",
          input.workshopId
        );
        if (workshopProjectId !== input.projectId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O workshop não pertence ao projeto selecionado",
          });
        }
        const id = nanoid();
        const requirement = await wdb.createClientRequirement({
          id,
          projectId: input.projectId,
          workshopId: input.workshopId,
          code: input.code || "",
          title: input.title,
          description: input.description,
          module: input.module || "",
          category: input.category || "Funcional",
          priority: input.priority || "Média",
          status: input.status || "Identificado",
          source: input.source || "Cliente",
          acceptanceCriteria: input.acceptanceCriteria,
          responsible: input.responsible || "",
        });
        await recordWorkflowAudit(
          ctx,
          input.projectId,
          "created",
          "client_requirement",
          id,
          {
            workshopId: input.workshopId,
            title: input.title,
            priority: input.priority || "Média",
          }
        );
        return requirement;
      }),
    update: workflowEntityProcedure("client_requirements", true)
      .input(
        z.object({
          id: z.string().min(1),
          data: z.object({
            code: z.string().optional(),
            title: z.string().min(1).optional(),
            description: z.string().min(1).optional(),
            module: z.string().optional(),
            category: z
              .enum([
                "Funcional",
                "Não funcional",
                "Integração",
                "Relatório",
                "Migração",
              ])
              .optional(),
            priority: z.enum(["Alta", "Média", "Baixa"]).optional(),
            status: z
              .enum(["Identificado", "Em análise", "Validado", "Descartado"])
              .optional(),
            source: z.string().optional(),
            acceptanceCriteria: z.string().optional(),
            responsible: z.string().optional(),
          }),
        })
      )
      .mutation(({ input }) =>
        wdb.updateClientRequirement(input.id, input.data)
      ),
    delete: workflowEntityProcedure("client_requirements", true)
      .input(z.object({ id: z.string().min(1) }))
      .mutation(({ input }) => wdb.deleteClientRequirement(input.id)),
  }),
  // ===== Scope Items =====
  scopeItems: router({
    list: workflowProjectProcedure(false, "viewProject")
      .input(z.object({ projectId: z.string(), ...paginationInput }))
      .query(({ input }) => wdb.listScopeItems(input.projectId, input)),
    create: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string(),
          module: z.string(),
          code: z.string().optional(),
          name: z.string(),
          processArea: z.string().optional(),
          description: z.string().optional(),
          active: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await assertRegisteredScopeItems([input.code || input.name]);
        const id = nanoid();
        const created = await wdb.createScopeItem({
          id,
          module: input.module,
          name: input.name,
          projectId: input.projectId,
          code: input.code || "",
          processArea: input.processArea || "",
          description: input.description,
          active: input.active ?? 1,
        });
        await ensureBdcqTemplates(input.projectId, [input.module]);
        return created;
      }),
    update: workflowEntityProcedure("scope_items", true)
      .input(
        z.object({
          id: z.string(),
          data: z.record(z.string(), z.any()),
        })
      )
      .mutation(async ({ input }) => {
        if (input.data.code || input.data.name)
          await assertRegisteredScopeItems([
            input.data.code || input.data.name,
          ]);
        return wdb.updateScopeItem(input.id, input.data);
      }),
    delete: workflowEntityProcedure("scope_items", true)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => wdb.deleteScopeItem(input.id)),
    bulkCreate: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string(),
          items: z.array(
            z.object({
              module: z.string(),
              code: z.string().optional(),
              name: z.string(),
              processArea: z.string().optional(),
              description: z.string().optional(),
              active: z.number().optional(),
            })
          ),
        })
      )
      .mutation(async ({ input }) => {
        await assertRegisteredScopeItems(
          input.items.map(item => item.code || item.name)
        );
        const currentScopeItems = await wdb.listScopeItems(input.projectId);
        const scopeKey = (item: {
          module?: string;
          code?: string;
          name?: string;
        }) =>
          [
            String(item.module || "")
              .trim()
              .toLocaleUpperCase("pt-BR"),
            String(item.code || item.name || "")
              .trim()
              .toLocaleLowerCase("pt-BR"),
          ].join("|");
        const currentByKey = new Map(
          currentScopeItems.map((item: any) => [scopeKey(item), item])
        );
        const results = [];
        for (const item of input.items) {
          const current = currentByKey.get(scopeKey(item));
          if (current) {
            await wdb.updateScopeItem(current.id, {
              module: item.module,
              name: item.name,
              code: item.code || "",
              processArea: item.processArea || "",
              description: item.description,
              active: item.active ?? 1,
            });
            results.push({ ...current, ...item, id: current.id });
            continue;
          }
          const id = nanoid();
          await wdb.createScopeItem({
            id,
            projectId: input.projectId,
            module: item.module,
            name: item.name,
            code: item.code || "",
            processArea: item.processArea || "",
            description: item.description,
            active: item.active ?? 1,
          });
          results.push({ id, ...item });
          currentByKey.set(scopeKey(item), { id, ...item });
        }
        const bdcqSync = await ensureBdcqTemplates(input.projectId, [
          ...new Set(input.items.map(item => item.module)),
        ]);
        return {
          items: results,
          bdcqAdded: bdcqSync.added,
          bdcqUpdated: bdcqSync.updated,
        };
      }),
  }),

  // ===== BDCQ =====
  bdcq: router({
    templates: router({
      list: protectedProcedure.query(async () => {
        const custom = await wdb.listBdcqTemplateLibrary();
        const customById = new Map(
          custom.map(template => [template.id, template])
        );
        const builtInIds = new Set(BDCQ_TEMPLATES.map(template => template.id));
        const builtIn = BDCQ_TEMPLATES.map(template => ({
          ...template,
          ...(customById.get(template.id) || {}),
          createdBy: "Sistema",
          builtIn: true,
        }));
        return [
          ...builtIn,
          ...custom
            .filter(template => !builtInIds.has(template.id))
            .map(template => ({ ...template, builtIn: false })),
        ];
      }),
      options: protectedProcedure.query(async () => {
        const scopes = await listRegisteredScopes({ search: "", limit: 500 });
        return scopes.map((scope: any) => ({
          key: scope.code,
          code: scope.code,
          name: scope.name,
          module: scope.module || "Geral",
        }));
      }),
      create: adminProcedure
        .input(
          z.object({
            question: z.string().trim().min(1).max(5000),
            questionOriginal: z.string().trim().max(5000).default(""),
            category: z.string().trim().max(256).optional(),
            modules: z
              .array(z.string().trim().min(1).max(128))
              .max(30)
              .default([]),
            scopeItemKeys: z
              .array(z.string().trim().min(1).max(512))
              .max(200)
              .default([]),
            required: z.boolean().default(false),
            active: z.number().int().min(0).max(1).optional(),
            sapId: z.string().trim().max(64).default(""),
            level: z.string().trim().max(16).default("L3"),
            process: z.string().trim().max(256).default(""),
            sscuiReference: z.string().trim().max(10000).default(""),
            area: z.string().trim().max(256).default(""),
            topic: z.string().trim().max(256).default(""),
            topicDefinition: z.string().trim().max(20000).default(""),
            solution: z.string().trim().max(10000).default(""),
            source: z.string().trim().max(64).default("Personalizado"),
            sourceFile: z.string().trim().max(512).default(""),
            sourceRelease: z.string().trim().max(64).default(""),
          })
        )
        .mutation(async ({ ctx, input }) => {
          await assertRegisteredScopeItems(input.scopeItemKeys);
          return wdb.createBdcqTemplate({
            id: nanoid(),
            ...input,
            category: input.category || "",
            active: input.active ?? 1,
            createdBy: ctx.appUser.name || ctx.appUser.email,
          });
        }),
      update: bdcqStandardsEditorProcedure
        .input(
          z.object({
            id: z.string().min(1),
            data: z.object({
              question: z.string().trim().min(1).max(5000).optional(),
              category: z.string().trim().max(256).optional(),
              modules: z
                .array(z.string().trim().min(1).max(128))
                .max(30)
                .optional(),
              scopeItemKeys: z
                .array(z.string().trim().min(1).max(512))
                .max(200)
                .optional(),
              required: z.boolean().optional(),
              active: z.number().int().min(0).max(1).optional(),
              sapId: z.string().trim().max(64).optional(),
              level: z.string().trim().max(16).optional(),
              process: z.string().trim().max(256).optional(),
              sscuiReference: z.string().trim().max(10000).optional(),
              area: z.string().trim().max(256).optional(),
              topic: z.string().trim().max(256).optional(),
              topicDefinition: z.string().trim().max(20000).optional(),
              solution: z.string().trim().max(10000).optional(),
              source: z.string().trim().max(64).optional(),
              sourceFile: z.string().trim().max(512).optional(),
              sourceRelease: z.string().trim().max(64).optional(),
            }),
          })
        )
        .mutation(async ({ ctx, input }) => {
          if (input.data.scopeItemKeys)
            await assertRegisteredScopeItems(input.data.scopeItemKeys);
          const builtIn = BDCQ_TEMPLATES.find(item => item.id === input.id);
          if (builtIn) {
            const custom = await wdb.listBdcqTemplateLibrary();
            if (!custom.some(item => item.id === input.id)) {
              return wdb.createBdcqTemplate({
                ...builtIn,
                ...input.data,
                id: input.id,
                createdBy: ctx.appUser.name || ctx.appUser.email,
              });
            }
          }
          return wdb.updateBdcqTemplate(input.id, input.data);
        }),
      importLayout: adminProcedure
        .input(
          z.object({
            items: z
              .array(
                z.object({
                  question: z.string().trim().min(1).max(5000),
                  questionOriginal: z.string().trim().max(5000).optional(),
                  category: z.string().trim().max(256).default(""),
                  modules: z.array(z.string().trim().min(1).max(128)).max(30),
                  scopeItemKeys: z
                    .array(z.string().trim().min(1).max(512))
                    .max(200),
                  sapId: z.string().trim().max(64).default(""),
                  level: z.string().trim().max(16).default("L3"),
                  process: z.string().trim().max(256).default(""),
                  sscuiReference: z.string().trim().max(10000).default(""),
                  area: z.string().trim().max(256).default(""),
                  topic: z.string().trim().max(256).default(""),
                  topicDefinition: z.string().trim().max(20000).default(""),
                  solution: z.string().trim().max(10000).default(""),
                  source: z.string().trim().max(64).default("Importado"),
                  sourceFile: z.string().trim().max(512).default(""),
                  sourceRelease: z.string().trim().max(64).default(""),
                  required: z.boolean().default(false),
                  active: z.number().int().min(0).max(1).default(1),
                })
              )
              .min(1)
              .max(5000),
          })
        )
        .mutation(async ({ ctx, input }) => {
          await assertRegisteredScopeItems(
            input.items.flatMap(item => item.scopeItemKeys)
          );
          return wdb.replaceBdcqTemplateLibrary(
            input.items.map(item => ({
              id: nanoid(),
              ...item,
              createdBy: ctx.appUser.name || ctx.appUser.email,
            }))
          );
        }),
      delete: adminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(({ input }) => wdb.deleteBdcqTemplate(input.id)),
      applyToProject: workflowProjectProcedure(true)
        .input(
          z.object({
            projectId: z.string(),
            modules: z.array(z.string()).optional(),
          })
        )
        .mutation(({ input }) =>
          ensureBdcqTemplates(input.projectId, input.modules)
        ),
    }),
    keyUsers: router({
      list: workflowProjectProcedure(false, "viewProject")
        .input(z.object({ projectId: z.string() }))
        .query(async ({ input }) => {
          const memberships = await projectAccess.listProjectMemberships(
            input.projectId
          );
          await wdb.syncProjectKeyUsersFromAccess(input.projectId, memberships);
          return wdb.listProjectKeyUsers(input.projectId);
        }),
      create: workflowProjectProcedure(true)
        .input(
          z.object({
            projectId: z.string(),
            name: z.string().trim().min(1).max(255),
            email: z.string().trim().email().max(320),
            role: z.string().trim().max(255).optional(),
          })
        )
        .mutation(async ({ input }) => {
          const appUser = await plannerStore.getAppUserByEmail(
            input.email.toLowerCase()
          );
          if (!appUser)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cadastre primeiro este e-mail em Gestão de Acesso",
            });
          const membership = await projectAccess.getProjectMembership(
            input.projectId,
            appUser.id
          );
          if (!membership?.active || !membership.capabilities?.fillAssignedBdcq)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Associe o usuário ao projeto com permissão para preencher BDCQ",
            });
          return wdb.createProjectKeyUser({
            id: nanoid(),
            projectId: input.projectId,
            name: input.name,
            email: input.email.toLowerCase(),
            role: input.role || membership.jobTitle || "",
            active: 1,
          });
        }),
      update: workflowEntityProcedure("workflow_project_key_users", true)
        .input(
          z.object({
            id: z.string(),
            data: z.object({
              name: z.string().trim().min(1).max(255).optional(),
              email: z.string().trim().email().max(320).optional(),
              role: z.string().trim().max(255).optional(),
              active: z.number().int().min(0).max(1).optional(),
            }),
          })
        )
        .mutation(({ input }) =>
          wdb.updateProjectKeyUser(input.id, {
            ...input.data,
            email: input.data.email?.toLowerCase(),
          })
        ),
      delete: workflowEntityProcedure("workflow_project_key_users", true)
        .input(z.object({ id: z.string() }))
        .mutation(({ input }) => wdb.deleteProjectKeyUser(input.id)),
    }),
    questions: router({
      list: workflowProjectProcedure(false, "viewProject")
        .input(z.object({ projectId: z.string(), ...paginationInput }))
        .query(async ({ ctx, input }) => {
          await backfillBdcqProjectMetadata(input.projectId);
          const rows = await wdb.listBdcqQuestions(input.projectId, input);
          const visible = await visibleBdcqQuestionIds(
            ctx.appUser,
            input.projectId,
            rows
          );
          return visible
            ? rows.filter((item: any) => visible.has(item.id))
            : rows;
        }),
      search: workflowProjectProcedure(false, "viewProject")
        .input(
          z.object({
            projectId: z.string(),
            offset: z.number().int().min(0).default(0),
            limit: z.number().int().min(1).max(200).default(50),
            ...bdcqProjectFilterInput,
          })
        )
        .query(async ({ ctx, input }) => {
          const { filtered, visibleRows, answeredIds } =
            await loadFilteredProjectBdcq(ctx.appUser, input.projectId, input);
          const unique = (key: string) =>
            [
              ...new Set(
                visibleRows
                  .map((item: any) => String(item[key] || "").trim())
                  .filter(Boolean)
              ),
            ].sort((a, b) => a.localeCompare(b, "pt-BR"));
          return {
            items: filtered.slice(input.offset, input.offset + input.limit),
            total: filtered.length,
            answered: filtered.filter((item: any) => answeredIds.has(item.id))
              .length,
            facets: {
              modules: unique("module"),
              levels: unique("level"),
              areas: unique("area"),
              topics: unique("topic"),
              sources: unique("source"),
            },
          };
        }),
      exportFiltered: workflowProjectProcedure(false, "viewProject")
        .input(
          z.object({
            projectId: z.string(),
            ...bdcqProjectFilterInput,
          })
        )
        .query(async ({ ctx, input }) => {
          const [
            { filtered, answerByQuestionId, scopeItems },
            resources,
            allocations,
            keyUsers,
          ] = await Promise.all([
            loadFilteredProjectBdcq(ctx.appUser, input.projectId, input),
            plannerStore.listResources(),
            plannerStore.listAllocations(),
            wdb.listProjectKeyUsers(input.projectId),
          ]);
          const allocatedIds = new Set(
            allocations
              .filter((item: any) => item.projectId === input.projectId)
              .map((item: any) => item.resourceId)
          );
          const projectResources = resources.filter((item: any) =>
            allocatedIds.has(item.id)
          );
          const resourceById = new Map(
            projectResources.map((item: any) => [item.id, item])
          );
          const keyUserById = new Map(
            keyUsers.map((item: any) => [item.id, item])
          );
          const scopeById = new Map(
            scopeItems.map((item: any) => [item.id, item])
          );
          return {
            items: filtered.map((question: any) => {
              const answer: any = answerByQuestionId.get(question.id);
              const consultant: any = resourceById.get(
                question.consultantResourceId
              );
              const keyUser: any = keyUserById.get(question.keyUserId);
              return {
                ...question,
                technicalKey: question.id,
                scopeItems: (question.scopeItemIds || [])
                  .map((id: string) => scopeById.get(id))
                  .filter(Boolean)
                  .map((item: any) => ({
                    code: item.code || "",
                    name: item.name || "",
                    module: item.module || "",
                  })),
                consultantName: consultant?.name || "",
                consultantEmail: consultant?.email || "",
                keyUserName: keyUser?.name || "",
                keyUserEmail: keyUser?.email || "",
                answer: answer?.answer || "",
                answeredBy: answer?.answeredBy || "",
              };
            }),
            references: {
              scopeItems: scopeItems.map((item: any) => ({
                code: item.code || "",
                name: item.name || "",
                module: item.module || "",
              })),
              consultants: projectResources.map((item: any) => ({
                name: item.name || "",
                email: item.email || "",
              })),
              keyUsers: keyUsers.map((item: any) => ({
                name: item.name || "",
                email: item.email || "",
              })),
            },
          };
        }),
      create: workflowProjectProcedure(true)
        .input(
          z.object({
            projectId: z.string(),
            module: z.string(),
            category: z.string().optional(),
            question: z.string(),
            scopeItemIds: z.array(z.string()).max(200).optional(),
            consultantResourceId: z.string().max(64).optional(),
            keyUserId: z.string().max(64).optional(),
            isDefault: z.number().optional(),
            sortOrder: z.number().optional(),
            ...bdcqProjectMetadataInput,
          })
        )
        .mutation(async ({ ctx, input }) => {
          if (input.consultantResourceId) {
            const [resource, allocations] = await Promise.all([
              plannerStore.getResourceById(input.consultantResourceId),
              plannerStore.listAllocations(),
            ]);
            if (!resource)
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Consultor responsável não encontrado",
              });
            if (
              !allocations.some(
                item =>
                  item.projectId === input.projectId &&
                  item.resourceId === input.consultantResourceId
              )
            )
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  "O consultor responsável precisa estar alocado no projeto pelo Planner",
              });
          }
          if (
            input.keyUserId &&
            (await wdb.getWorkflowEntityProjectId(
              "workflow_project_key_users",
              input.keyUserId
            )) !== input.projectId
          )
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Key user não pertence ao projeto",
            });
          if (input.scopeItemIds?.length)
            await assertEntitiesBelongToProject(
              "scope_items",
              input.scopeItemIds,
              input.projectId
            );
          const id = nanoid();
          return wdb.createBdcqQuestion({
            id,
            projectId: input.projectId,
            module: input.module,
            question: input.question,
            category: input.category || "",
            scopeItemIds: input.scopeItemIds || [],
            consultantResourceId: input.consultantResourceId || "",
            keyUserId: input.keyUserId || "",
            questionOriginal: input.questionOriginal || "",
            sapId: input.sapId || "",
            level: input.level || "L3",
            process: input.process || "",
            sscuiReference: input.sscuiReference || "",
            area: input.area || "",
            topic: input.topic || "",
            topicDefinition: input.topicDefinition || "",
            solution: input.solution || "",
            source: input.source || "manual",
            sourceFile: input.sourceFile || "",
            sourceRelease: input.sourceRelease || "",
            required: Boolean(input.required),
            active: input.active ?? 1,
            metadataInitialized: 1,
            isDefault: input.isDefault ?? 0,
            sortOrder: input.sortOrder ?? 0,
          });
        }),
      update: workflowEntityProcedure("bdcq_questions", true)
        .input(
          z.object({
            id: z.string(),
            data: z.object({
              module: z.string().optional(),
              category: z.string().optional(),
              question: z.string().optional(),
              scopeItemIds: z.array(z.string()).max(200).optional(),
              consultantResourceId: z.string().max(64).optional(),
              keyUserId: z.string().max(64).optional(),
              sortOrder: z.number().optional(),
              ...bdcqProjectMetadataInput,
            }),
          })
        )
        .mutation(async ({ ctx, input }) => {
          if (input.data.consultantResourceId) {
            const questionProjectId = await wdb.getWorkflowEntityProjectId(
              "bdcq_questions",
              input.id
            );
            const [resource, allocations] = await Promise.all([
              plannerStore.getResourceById(input.data.consultantResourceId),
              plannerStore.listAllocations(),
            ]);
            if (!resource)
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Consultor responsável não encontrado",
              });
            if (
              !questionProjectId ||
              !allocations.some(
                item =>
                  item.projectId === questionProjectId &&
                  item.resourceId === input.data.consultantResourceId
              )
            )
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  "O consultor responsável precisa estar alocado no projeto pelo Planner",
              });
          }
          if (input.data.keyUserId) {
            const [questionProjectId, keyUserProjectId] = await Promise.all([
              wdb.getWorkflowEntityProjectId("bdcq_questions", input.id),
              wdb.getWorkflowEntityProjectId(
                "workflow_project_key_users",
                input.data.keyUserId
              ),
            ]);
            if (!questionProjectId || keyUserProjectId !== questionProjectId)
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Key user não pertence ao projeto",
              });
          }
          return wdb.updateBdcqQuestion(input.id, {
            ...input.data,
            metadataInitialized: 1,
          });
        }),
      delete: workflowEntityProcedure("bdcq_questions", true)
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
          if (
            ctx.appUser.role !== "admin" &&
            (await wdb.isDeliveryMaterializationTarget(input.id))
          )
            throw new TRPCError({
              code: "FORBIDDEN",
              message:
                "Itens originados em Configurações do Tech não podem ser excluídos no projeto",
            });
          return wdb.deleteBdcqQuestion(input.id);
        }),
      bulkCreate: workflowProjectProcedure(true)
        .input(
          z.object({
            projectId: z.string(),
            questions: z
              .array(
                z.object({
                  id: z.string().optional(),
                  technicalKey: z.string().optional(),
                  rowNumber: z.number().int().positive().optional(),
                  module: z.string().optional(),
                  category: z.string().optional(),
                  question: z.string().optional(),
                  consultantResourceId: z.string().optional(),
                  consultantEmail: z.string().optional(),
                  keyUserId: z.string().optional(),
                  keyUserEmail: z.string().optional(),
                  scopeItemIds: z.array(z.string()).max(200).optional(),
                  scopeItemRefs: z.array(z.string()).max(200).optional(),
                  answer: z.string().optional(),
                  answeredBy: z.string().optional(),
                  ...bdcqProjectMetadataInput,
                })
              )
              .min(1)
              .max(2000),
          })
        )
        .mutation(async ({ ctx, input }) => {
          const [
            existing,
            existingAnswers,
            resources,
            allocations,
            keyUsers,
            scopeItems,
          ] = await Promise.all([
            wdb.listBdcqQuestions(input.projectId),
            wdb.listBdcqAnswers(input.projectId),
            plannerStore.listResources(),
            plannerStore.listAllocations(),
            wdb.listProjectKeyUsers(input.projectId),
            wdb.listScopeItems(input.projectId),
          ]);
          const normalize = (value: unknown) =>
            String(value || "")
              .trim()
              .toLocaleLowerCase("pt-BR");
          const allocatedIds = new Set(
            allocations
              .filter((item: any) => item.projectId === input.projectId)
              .map((item: any) => item.resourceId)
          );
          const resourceById = new Map(
            resources
              .filter((item: any) => allocatedIds.has(item.id))
              .map((item: any) => [item.id, item])
          );
          const resourceByEmail = new Map(
            [...resourceById.values()]
              .filter((item: any) => normalize(item.email))
              .map((item: any) => [normalize(item.email), item])
          );
          const keyUserById = new Map(
            keyUsers.map((item: any) => [item.id, item])
          );
          const keyUserByEmail = new Map(
            keyUsers
              .filter((item: any) => normalize(item.email))
              .map((item: any) => [normalize(item.email), item])
          );
          const scopeById = new Map(
            scopeItems.map((item: any) => [item.id, item])
          );
          const scopeByCode = new Map(
            scopeItems
              .filter((item: any) => normalize(item.code))
              .map((item: any) => [normalize(item.code), item])
          );
          const scopeByName = new Map(
            scopeItems
              .filter((item: any) => normalize(item.name))
              .map((item: any) => [normalize(item.name), item])
          );
          const byId = new Map(
            existing.map((question: any) => [question.id, question])
          );
          const byQuestion = new Map(
            existing.map((question: any) => [
              normalize(question.question),
              question,
            ])
          );
          const bySapId = new Map<string, any[]>();
          for (const item of existing) {
            const key = normalize(item.sapId);
            if (!key) continue;
            bySapId.set(key, [...(bySapId.get(key) || []), item]);
          }
          const answerByQuestionId = new Map(
            existingAnswers.map((answer: any) => [answer.questionId, answer])
          );
          let added = 0;
          let updated = 0;
          let answersUpdated = 0;
          let answersIgnored = 0;
          let warningCount = 0;
          const warnings: Array<{ row: number; message: string }> = [];
          const warn = (row: number, message: string) => {
            warningCount++;
            if (warnings.length < 500) warnings.push({ row, message });
          };
          for (const question of input.questions) {
            const row = question.rowNumber || added + updated + 2;
            const sapCandidates = question.sapId
              ? bySapId.get(normalize(question.sapId)) || []
              : [];
            let current: any;
            if (sapCandidates.length === 1) {
              current = sapCandidates[0];
            } else if (sapCandidates.length > 1) {
              const technicalKey = question.technicalKey || question.id;
              current =
                sapCandidates.find(item => item.id === technicalKey) ||
                sapCandidates.find(
                  item =>
                    normalize(item.question) === normalize(question.question)
                );
              if (!current) {
                warn(
                  row,
                  `SAP ID ${question.sapId} corresponde a mais de uma pergunta; linha não processada`
                );
                continue;
              }
            } else {
              const technicalKey = question.technicalKey || question.id;
              current =
                (technicalKey && byId.get(technicalKey)) ||
                (!question.sapId && question.question
                  ? byQuestion.get(normalize(question.question))
                  : undefined);
            }

            let consultantResourceId = "";
            if (question.consultantEmail?.trim()) {
              const resource: any = resourceByEmail.get(
                normalize(question.consultantEmail)
              );
              if (resource) consultantResourceId = resource.id;
              else
                warn(
                  row,
                  `Consultor ${question.consultantEmail} não está alocado no projeto; vínculo removido`
                );
            } else if (question.consultantResourceId?.trim()) {
              if (resourceById.has(question.consultantResourceId))
                consultantResourceId = question.consultantResourceId;
              else warn(row, "ID de consultor inválido; vínculo removido");
            }

            let keyUserId = "";
            if (question.keyUserEmail?.trim()) {
              const keyUser: any = keyUserByEmail.get(
                normalize(question.keyUserEmail)
              );
              if (keyUser) keyUserId = keyUser.id;
              else
                warn(
                  row,
                  `Key user ${question.keyUserEmail} não pertence ao projeto; vínculo removido`
                );
            } else if (question.keyUserId?.trim()) {
              if (keyUserById.has(question.keyUserId))
                keyUserId = question.keyUserId;
              else warn(row, "ID de key user inválido; vínculo removido");
            }

            const scopeRefs =
              question.scopeItemRefs || question.scopeItemIds || [];
            const resolvedScopeIds: string[] = [];
            for (const reference of scopeRefs) {
              const item: any =
                scopeById.get(reference) ||
                scopeByCode.get(normalize(reference)) ||
                scopeByName.get(normalize(reference));
              if (item) {
                if (!resolvedScopeIds.includes(item.id))
                  resolvedScopeIds.push(item.id);
              } else {
                warn(
                  row,
                  `Scope item “${reference}” não encontrado; vínculo ignorado`
                );
              }
            }

            const text = (incoming: unknown, previous = "") =>
              String(incoming || "").trim() || previous || "";
            let questionId: string;
            if (current) {
              await wdb.updateBdcqQuestion(current.id, {
                module: text(question.module, current.module),
                category: text(question.category, current.category),
                question: text(question.question, current.question),
                consultantResourceId,
                keyUserId,
                scopeItemIds: resolvedScopeIds,
                questionOriginal: text(
                  question.questionOriginal,
                  current.questionOriginal
                ),
                sapId: text(question.sapId, current.sapId),
                level: text(question.level, current.level || "L3"),
                process: text(question.process, current.process),
                sscuiReference: text(
                  question.sscuiReference,
                  current.sscuiReference
                ),
                area: text(question.area, current.area),
                topic: text(question.topic, current.topic),
                topicDefinition: text(
                  question.topicDefinition,
                  current.topicDefinition
                ),
                solution: text(question.solution, current.solution),
                source: text(question.source, current.source || "manual"),
                sourceFile: text(question.sourceFile, current.sourceFile),
                sourceRelease: text(
                  question.sourceRelease,
                  current.sourceRelease
                ),
                required: question.required ?? Boolean(current.required),
                active: question.active ?? current.active ?? 1,
                metadataInitialized: 1,
              });
              questionId = current.id;
              updated++;
            } else {
              if (!question.question?.trim()) {
                warn(row, "Pergunta vazia; linha não processada");
                continue;
              }
              questionId = nanoid();
              const created = {
                id: questionId,
                projectId: input.projectId,
                module: text(question.module, "Geral"),
                category: text(question.category),
                question: question.question.trim(),
                consultantResourceId,
                keyUserId,
                scopeItemIds: resolvedScopeIds,
                questionOriginal: text(question.questionOriginal),
                sapId: text(question.sapId),
                level: text(question.level, "L3"),
                process: text(question.process),
                sscuiReference: text(question.sscuiReference),
                area: text(question.area),
                topic: text(question.topic),
                topicDefinition: text(question.topicDefinition),
                solution: text(question.solution),
                source: text(question.source, "manual"),
                sourceFile: text(question.sourceFile),
                sourceRelease: text(question.sourceRelease),
                required: question.required ?? false,
                active: question.active ?? 1,
                metadataInitialized: 1,
                isDefault: 0,
                sortOrder: existing.length + added,
              };
              await wdb.createBdcqQuestion(created);
              byId.set(questionId, created);
              byQuestion.set(normalize(created.question), created);
              if (created.sapId) {
                const key = normalize(created.sapId);
                bySapId.set(key, [...(bySapId.get(key) || []), created]);
              }
              added++;
            }

            if (question.answer?.trim()) {
              const existingAnswer: any = answerByQuestionId.get(questionId);
              try {
                if (existingAnswer) {
                  await approvalStore.assertEntityEditable(
                    "bdcq_answer",
                    existingAnswer.id
                  );
                  const changed = await wdb.updateBdcqAnswerWithHistory(
                    existingAnswer.id,
                    {
                      answer: question.answer,
                      answeredBy:
                        question.answeredBy?.trim() ||
                        existingAnswer.answeredBy ||
                        "",
                    },
                    nanoid(),
                    ctx.user.name || ctx.user.email || "Importação Excel"
                  );
                  answerByQuestionId.set(questionId, {
                    ...existingAnswer,
                    ...changed,
                    answer: question.answer,
                  });
                } else {
                  const createdAnswer = await wdb.createBdcqAnswer({
                    id: nanoid(),
                    projectId: input.projectId,
                    questionId,
                    answer: question.answer,
                    answeredBy: question.answeredBy?.trim() || "",
                    attachments: [],
                  });
                  answerByQuestionId.set(questionId, createdAnswer);
                }
                answersUpdated++;
              } catch (error) {
                answersIgnored++;
                warn(
                  row,
                  error instanceof Error
                    ? `Resposta não alterada: ${error.message}`
                    : "Resposta bloqueada não foi alterada"
                );
              }
            }
          }
          return {
            added,
            updated,
            answersUpdated,
            answersIgnored,
            warnings,
            warningCount,
          };
        }),
      seedDefaults: workflowProjectProcedure(true)
        .input(z.object({ projectId: z.string() }))
        .mutation(({ input }) => ensureBdcqTemplates(input.projectId)),
    }),
    answers: router({
      list: workflowProjectProcedure(false, "viewProject")
        .input(
          z.object({
            projectId: z.string(),
            questionIds: z.array(z.string()).max(500).optional(),
            ...paginationInput,
          })
        )
        .query(async ({ ctx, input }) => {
          const visible = await visibleBdcqQuestionIds(
            ctx.appUser,
            input.projectId
          );
          const requestedIds = input.questionIds
            ? input.questionIds.filter(id => !visible || visible.has(id))
            : undefined;
          const rows = requestedIds
            ? await wdb.listBdcqAnswersForQuestions(
                input.projectId,
                requestedIds
              )
            : await wdb.listBdcqAnswers(input.projectId, input);
          return visible
            ? rows.filter((item: any) => visible.has(item.questionId))
            : rows;
        }),
      create: workflowProjectProcedure(true, "fillAssignedBdcq")
        .input(
          z.object({
            questionId: z.string(),
            projectId: z.string(),
            answer: z.string(),
            answeredBy: z.string().optional(),
            attachments: z.array(z.string()).optional(),
          })
        )
        .mutation(async ({ ctx, input }) => {
          const questionProjectId = await wdb.getWorkflowEntityProjectId(
            "bdcq_questions",
            input.questionId
          );
          if (questionProjectId !== input.projectId)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "A pergunta não pertence ao projeto selecionado",
            });
          await assertCanAnswerBdcq(
            ctx.appUser,
            input.projectId,
            input.questionId
          );
          const existing = await wdb.getBdcqAnswerByQuestion(
            input.projectId,
            input.questionId
          );
          if (existing) {
            await approvalStore.assertEntityEditable(
              "bdcq_answer",
              existing.id
            );
            return wdb.updateBdcqAnswerWithHistory(
              existing.id,
              {
                answer: input.answer,
                answeredBy: input.answeredBy || "",
                attachments: input.attachments || [],
              },
              nanoid(),
              "Auto-save"
            );
          }
          const id = nanoid();
          const created = await wdb.createBdcqAnswer({
            id,
            projectId: input.projectId,
            questionId: input.questionId,
            answer: input.answer,
            answeredBy: input.answeredBy || "",
            attachments: input.attachments || [],
          });
          await notifyIfBdcqModuleCompleted(input.projectId, input.questionId);
          return created;
        }),
      update: workflowEntityProcedure(
        "bdcq_answers",
        true,
        "id",
        "fillAssignedBdcq"
      )
        .input(
          z.object({
            id: z.string(),
            data: z.object({
              answer: z.string().min(1).optional(),
              answeredBy: z.string().optional(),
              attachments: z.array(z.string()).optional(),
            }),
          })
        )
        .mutation(async ({ ctx, input }) => {
          const existing = await wdb.getBdcqAnswerById(input.id);
          if (!existing)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Resposta não encontrada",
            });
          await assertCanAnswerBdcq(
            ctx.appUser,
            existing.projectId,
            existing.questionId
          );
          await approvalStore.assertEntityEditable("bdcq_answer", input.id);
          return wdb.updateBdcqAnswerWithHistory(
            input.id,
            input.data,
            nanoid(),
            ctx.user.name || ctx.user.email || "Usuário"
          );
        }),
      history: workflowEntityProcedure(
        "bdcq_answers",
        false,
        "answerId",
        "viewProject"
      )
        .input(z.object({ answerId: z.string() }))
        .query(async ({ ctx, input }) => {
          const answer = await wdb.getBdcqAnswerById(input.answerId);
          if (!answer)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Resposta não encontrada",
            });
          await assertCanViewBdcqQuestion(
            ctx.appUser,
            answer.projectId,
            answer.questionId
          );
          return wdb.listBdcqAnswerHistory(input.answerId);
        }),
      restoreVersion: workflowEntityProcedure(
        "bdcq_answers",
        true,
        "answerId",
        "fillAssignedBdcq"
      )
        .input(
          z.object({
            answerId: z.string(),
            historyId: z.string(),
          })
        )
        .mutation(async ({ ctx, input }) => {
          const answer = await wdb.getBdcqAnswerById(input.answerId);
          if (!answer)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Resposta não encontrada",
            });
          await assertCanAnswerBdcq(
            ctx.appUser,
            answer.projectId,
            answer.questionId
          );
          await approvalStore.assertEntityEditable(
            "bdcq_answer",
            input.answerId
          );
          const version = await wdb.getBdcqAnswerHistoryVersion(
            input.answerId,
            input.historyId
          );
          if (!version)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Versão do histórico não encontrada",
            });
          return wdb.updateBdcqAnswerWithHistory(
            input.answerId,
            {
              answer: version.answer,
              answeredBy: version.answeredBy || "",
            },
            nanoid(),
            `Restaurado por ${ctx.user.name || ctx.user.email || "Usuário"}`
          );
        }),
      restoreOriginal: workflowEntityProcedure(
        "bdcq_answers",
        true,
        "answerId",
        "fillAssignedBdcq"
      )
        .input(z.object({ answerId: z.string() }))
        .mutation(async ({ ctx, input }) => {
          const answer = await wdb.getBdcqAnswerById(input.answerId);
          if (!answer)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Resposta não encontrada",
            });
          await assertCanAnswerBdcq(
            ctx.appUser,
            answer.projectId,
            answer.questionId
          );
          await approvalStore.assertEntityEditable(
            "bdcq_answer",
            input.answerId
          );
          return wdb.updateBdcqAnswerWithHistory(
            input.answerId,
            {
              answer: "",
              answeredBy: "",
            },
            nanoid(),
            `Retornado ao original por ${ctx.user.name || ctx.user.email || "Usuário"}`
          );
        }),
      delete: workflowEntityProcedure("bdcq_answers", true)
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input }) => {
          await approvalStore.assertEntityEditable("bdcq_answer", input.id);
          return wdb.deleteBdcqAnswer(input.id);
        }),
    }),
  }),

  // ===== Workshops =====
  workshops: router({
    templates: router({
      listAll: protectedProcedure.query(() => wdb.listWorkshopTemplates()),
      list: workflowProjectProcedure()
        .input(z.object({ projectId: z.string().min(1) }))
        .query(async ({ ctx, input }) => {
          const templates = await wdb.listWorkshopTemplates();
          if (ctx.appUser.role === "admin") return templates;
          return templates.filter(
            (template: any) =>
              template.active &&
              (!template.projectIds?.length ||
                template.projectIds.includes(input.projectId))
          );
        }),
      create: adminProcedure
        .input(workshopTemplateDataSchema)
        .mutation(async ({ ctx, input }) => {
          await assertRegisteredScopeItems(input.scopeItemKeys);
          return wdb.createWorkshopTemplate({
            id: nanoid(),
            ...input,
            createdBy: ctx.appUser.name || ctx.appUser.email,
          });
        }),
      update: adminProcedure
        .input(
          z.object({
            id: z.string().min(1),
            data: workshopTemplateDataSchema.partial(),
          })
        )
        .mutation(async ({ input }) => {
          if (input.data.scopeItemKeys)
            await assertRegisteredScopeItems(input.data.scopeItemKeys);
          return wdb.updateWorkshopTemplate(input.id, input.data);
        }),
      delete: adminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(({ input }) => wdb.deleteWorkshopTemplate(input.id)),
      applyToProject: workflowProjectProcedure(true)
        .input(
          z.object({
            projectId: z.string().min(1),
            templateIds: z.array(z.string().min(1)).max(200).optional(),
          })
        )
        .mutation(({ input }) =>
          applyWorkshopTemplates(input.projectId, input.templateIds)
        ),
    }),
    list: workflowProjectProcedure()
      .input(z.object({ projectId: z.string(), ...paginationInput }))
      .query(({ input }) => wdb.listWorkshops(input.projectId, input)),
    create: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string(),
          title: z.string(),
          module: z.string().optional(),
          modules: z.array(z.string()).max(30).optional(),
          scopeItemIds: z.array(z.string()).max(200).optional(),
          objective: z.string().max(10000).optional(),
          content: z.string().max(20000).optional(),
          scheduledDate: z.string().optional(),
          duration: z.string().optional(),
          participants: z.array(z.string()).optional(),
          participantEmails: z.array(z.string().email()).max(500).optional(),
          consultantResourceId: z.string().max(64).optional(),
          responsible: z.string().max(255).optional(),
          agenda: z.array(z.string()).optional(),
          expectedOutcomes: z.array(z.string()).max(100).optional(),
          prerequisites: z.array(z.string()).max(100).optional(),
          requiredRoles: z.array(z.string()).max(100).optional(),
          presentationFiles: z.array(workshopFileSchema).max(20).optional(),
          status: workshopStatusSchema.optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        if (input.scopeItemIds?.length)
          await assertEntitiesBelongToProject(
            "scope_items",
            input.scopeItemIds,
            input.projectId
          );
        const id = nanoid();
        return wdb.createWorkshop({
          id,
          projectId: input.projectId,
          title: input.title,
          module: input.module || "",
          modules: input.modules || (input.module ? [input.module] : []),
          scopeItemIds: input.scopeItemIds || [],
          objective: input.objective || "",
          content: input.content || "",
          scheduledDate: input.scheduledDate || "",
          duration: input.duration || "",
          participants: input.participants || [],
          participantEmails: input.participantEmails || [],
          consultantResourceId: input.consultantResourceId || "",
          responsible: input.responsible || "",
          agenda: input.agenda || [],
          expectedOutcomes: input.expectedOutcomes || [],
          prerequisites: input.prerequisites || [],
          requiredRoles: input.requiredRoles || [],
          presentationFiles: input.presentationFiles || [],
          templateId: "",
          source: "manual",
          status: input.status || "Planejado",
          notes: input.notes,
        });
      }),
    update: workflowEntityProcedure("workshops", true)
      .input(
        z.object({
          id: z.string(),
          data: z.object({
            title: z.string().min(1).optional(),
            module: z.string().optional(),
            modules: z.array(z.string()).max(30).optional(),
            scopeItemIds: z.array(z.string()).max(200).optional(),
            objective: z.string().max(10000).optional(),
            content: z.string().max(20000).optional(),
            scheduledDate: z.string().optional(),
            duration: z.string().optional(),
            participants: z.array(z.string()).optional(),
            participantEmails: z.array(z.string().email()).max(500).optional(),
            consultantResourceId: z.string().max(64).optional(),
            responsible: z.string().max(255).optional(),
            agenda: z.array(z.string()).optional(),
            expectedOutcomes: z.array(z.string()).max(100).optional(),
            prerequisites: z.array(z.string()).max(100).optional(),
            requiredRoles: z.array(z.string()).max(100).optional(),
            presentationFiles: z.array(workshopFileSchema).max(20).optional(),
            status: workshopStatusSchema.optional(),
            notes: z.string().optional(),
          }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const current: any = await wdb.getWorkshopById(input.id);
        if (input.data.scopeItemIds?.length) {
          const projectId = await wdb.getWorkflowEntityProjectId(
            "workshops",
            input.id
          );
          if (!projectId)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Workshop não encontrado",
            });
          await assertEntitiesBelongToProject(
            "scope_items",
            input.data.scopeItemIds,
            projectId
          );
        }
        await wdb.updateWorkshop(input.id, input.data);
        const updated: any = { ...current, ...input.data };
        if (
          ["manual", "ai_suggestion"].includes(current?.source) &&
          input.data.status &&
          input.data.status !== "Rascunho"
        ) {
          const editedFields = [
            "title",
            "module",
            "modules",
            "scopeItemIds",
            "objective",
            "content",
            "duration",
            "participants",
            "agenda",
            "expectedOutcomes",
            "prerequisites",
            "requiredRoles",
            "consultantResourceId",
            "responsible",
          ];
          const edited = editedFields.some(
            key => input.data[key as keyof typeof input.data] !== undefined
          );
          await recordWorkshopLearning(
            updated,
            edited ? "edited" : "confirmed",
            ctx.appUser.id
          );
        }
        return updated;
      }),
    delete: workflowEntityProcedure("workshops", true)
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const workshop: any = await wdb.getWorkshopById(input.id);
        if (
          ctx.appUser.role !== "admin" &&
          (workshop?.templateId || workshop?.source === "delivery_template")
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Workshops originados em Configurações do Tech não podem ser excluídos no projeto; inative o padrão ou personalize a cópia",
          });
        if (workshop?.source === "ai_suggestion")
          await recordWorkshopLearning(workshop, "discarded", ctx.appUser.id);
        return wdb.deleteWorkshop(input.id);
      }),
    uploadPresentation: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string().min(1),
          fileName: z.string().trim().min(1).max(255),
          contentType: z.string().trim().max(255),
          fileData: z.string().max(20_000_000),
        })
      )
      .mutation(async ({ input }) => {
        if (!/\.(ppt|pptx|pdf)$/i.test(input.fileName))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Envie um arquivo PPT, PPTX ou PDF",
          });
        const buffer = Buffer.from(
          input.fileData.replace(/^data:[^;]+;base64,/, ""),
          "base64"
        );
        if (buffer.length > 15 * 1024 * 1024)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O arquivo deve ter no máximo 15 MB",
          });
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const stored = await storagePut(
          `workflow/${input.projectId}/workshop-presentations/${nanoid()}-${safeName}`,
          buffer,
          input.contentType
        );
        return {
          name: input.fileName,
          url: stored.url,
          contentType: input.contentType,
        };
      }),
    suggestAgenda: workflowProjectProcedure(true)
      .input(z.object({ projectId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const centralApplied =
          await deliveryPublisher.applyPublishedWorkshopTemplates(
            input.projectId
          );
        const legacyApplied = await applyWorkshopTemplates(input.projectId);
        const [
          project,
          scopeItemsList,
          questions,
          answers,
          requirements,
          currentWorkshops,
          resources,
          allocations,
          keyUsers,
        ] = await Promise.all([
          plannerStore.getProjectById(input.projectId),
          wdb.listScopeItems(input.projectId),
          wdb.listBdcqQuestions(input.projectId),
          wdb.listBdcqAnswers(input.projectId),
          wdb.listClientRequirements(input.projectId),
          wdb.listWorkshops(input.projectId),
          plannerStore.listResources(),
          plannerStore.listAllocations(),
          wdb.listProjectKeyUsers(input.projectId),
        ]);
        if (!project)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Projeto não encontrado",
          });
        if (!scopeItemsList.length)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Selecione os scope items do projeto antes de sugerir workshops",
          });
        const projectModules = [
          ...new Set(
            scopeItemsList.map((item: any) => item.module).filter(Boolean)
          ),
        ] as string[];
        const learnedPatterns =
          await wdb.listWorkshopLearningPatterns(projectModules);
        const answeredIds = new Set(
          answers.map((answer: any) => answer.questionId)
        );
        const pendingQuestions = questions.filter(
          (question: any) => !answeredIds.has(question.id)
        );
        const coveredScopeIds = new Set(
          currentWorkshops.flatMap(
            (workshop: any) => workshop.scopeItemIds || []
          )
        );
        const uncoveredScopes = scopeItemsList.filter(
          (item: any) => !coveredScopeIds.has(item.id)
        );
        const prompt = `Planeje workshops SAP S/4HANA Cloud Public Edition e retorne SOMENTE um array JSON.

Regras:
- Os padrões oficiais já foram aplicados e têm prioridade. Não repita workshops existentes.
- Cubra todos os scope items ainda descobertos, agrupando itens relacionados quando fizer sentido.
- Considere também workshops transversais ainda ausentes: Navegação/Fiori, SAP Cloud ALM, governança, integrações, extensibilidade, migração, testes e cutover.
- Por módulo, considere visão geral, dados mestre, processo ponta a ponta, exceções, aprovações, relatórios e requisitos legais.
- Não invente conteúdo específico do cliente. Use somente os dados abaixo.
- Não proponha datas. Preencha a duração.

Todos os scope items do projeto (${scopeItemsList.length}):
${scopeItemsList.map((item: any) => `- ${item.code || item.id} | ${item.module || "Geral"} | ${item.name}`).join("\n")}

Scope items ainda sem workshop (${uncoveredScopes.length}):
${uncoveredScopes.map((item: any) => `- ${item.code || item.id} | ${item.module || "Geral"} | ${item.name}`).join("\n")}

Workshops já existentes:
${currentWorkshops.map((item: any) => `- ${item.title} | ${item.module || "Geral"} | ${(item.scopeItemIds || []).join(",")}`).join("\n")}

BDCQ pendente:
${pendingQuestions
  .slice(0, 100)
  .map(
    (item: any) =>
      `- ${item.module || "Geral"} | ${item.category || ""} | ${item.question}`
  )
  .join("\n")}

Requisitos identificados:
${requirements
  .slice(0, 100)
  .map(
    (item: any) =>
      `- ${item.module || "Geral"} | ${item.title}: ${item.description}`
  )
  .join("\n")}

Aprendizados aprovados de projetos anteriores (use como referência, sem copiar dados de cliente):
${learnedPatterns
  .slice(0, 80)
  .map(
    (item: any) =>
      `- ${item.module || "Geral"} | ${item.title} | scopes ${(item.scopeItemCodes || []).join(",")} | duração ${item.duration || "a definir"} | confiança ${item.confidence}`
  )
  .join("\n")}

Formato obrigatório de cada objeto:
{"title":"...","module":"... ou Geral","scopeItemCodes":["códigos existentes"],"objective":"...","content":"...","duration":"ex.: 2h","agenda":["..."],"expectedOutcomes":["..."],"prerequisites":["..."],"requiredRoles":["..."],"reason":"por que é necessário"}

Retorne no máximo 100 workshops e somente JSON válido.`;
        const ai = await getWorkflowAiConfig("agenda_suggestion");
        const suggestionSchema = z
          .array(
            z.object({
              title: z.string().trim().min(1).max(512),
              module: z.string().trim().max(128).default("Geral"),
              scopeItemCodes: z
                .array(z.string().trim().min(1).max(128))
                .max(100)
                .default([]),
              objective: z.string().trim().max(10000).default(""),
              content: z.string().trim().max(20000).default(""),
              duration: z.string().trim().max(64).default(""),
              agenda: z
                .array(z.string().trim().min(1).max(2000))
                .max(100)
                .default([]),
              expectedOutcomes: z
                .array(z.string().trim().min(1).max(2000))
                .max(100)
                .default([]),
              prerequisites: z
                .array(z.string().trim().min(1).max(2000))
                .max(100)
                .default([]),
              requiredRoles: z
                .array(z.string().trim().min(1).max(255))
                .max(100)
                .default([]),
              reason: z.string().trim().max(4000).default(""),
            })
          )
          .max(100);
        let suggestions: z.infer<typeof suggestionSchema> | null = null;
        let lastOutput = "";
        for (let attempt = 0; attempt < 2 && !suggestions; attempt++) {
          const result = await invokeWorkflowLLM({
            model: ai.model,
            messages: [
              { role: "system", content: ai.systemPrompt },
              {
                role: "user",
                content:
                  prompt +
                  (attempt
                    ? `\n\nA resposta anterior não era JSON válido. Corrija e devolva somente o array:\n${lastOutput.slice(0, 3000)}`
                    : ""),
              },
            ],
          });
          lastOutput =
            typeof result.choices?.[0]?.message?.content === "string"
              ? result.choices[0].message.content
              : "";
          try {
            const match = lastOutput.match(/\[[\s\S]*\]/);
            suggestions = match
              ? suggestionSchema.parse(JSON.parse(match[0]))
              : null;
          } catch {
            suggestions = null;
          }
        }
        if (!suggestions)
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message:
              "A IA não retornou workshops estruturados após nova tentativa",
          });

        const normalize = (value: unknown) =>
          String(value || "")
            .trim()
            .toLocaleUpperCase("pt-BR");
        const scopeByCode = new Map<string, any>();
        for (const item of scopeItemsList)
          for (const key of [item.id, item.code, item.name])
            if (key) scopeByCode.set(normalize(key), item);
        const resourceById = new Map(
          resources.map((resource: any) => [resource.id, resource])
        );
        const projectAllocations = allocations.filter(
          (allocation: any) => allocation.projectId === input.projectId
        );
        const existingKeys = new Set(
          currentWorkshops
            .map((workshop: any) => workshop.learningKey)
            .filter(Boolean)
        );
        const existingTitles = new Set(
          currentWorkshops.map(
            (workshop: any) =>
              `${normalize(workshop.module)}|${normalize(workshop.title)}`
          )
        );
        const created: any[] = [];
        let skipped = 0;
        for (const suggestion of suggestions) {
          const matchedScopes = [
            ...new Map(
              suggestion.scopeItemCodes
                .map(code => scopeByCode.get(normalize(code)))
                .filter(Boolean)
                .map((item: any) => [item.id, item])
            ).values(),
          ] as any[];
          const module =
            suggestion.module && normalize(suggestion.module) !== "GERAL"
              ? suggestion.module
              : matchedScopes[0]?.module || "";
          const titleKey = `${normalize(module)}|${normalize(suggestion.title)}`;
          const learningKey = createHash("sha256")
            .update(
              `${input.projectId}|${normalize(module)}|${matchedScopes
                .map(item => item.id)
                .sort()
                .join(",")}|${normalize(suggestion.title)}`
            )
            .digest("hex")
            .slice(0, 40);
          if (existingKeys.has(learningKey) || existingTitles.has(titleKey)) {
            skipped++;
            continue;
          }
          const matchingAllocations = projectAllocations.filter(
            (allocation: any) =>
              !module || normalize(allocation.front) === normalize(module)
          );
          const candidates = matchingAllocations
            .map((allocation: any) => {
              const resource: any = resourceById.get(allocation.resourceId);
              if (!resource || resource.status !== "Ativo") return null;
              const busyHours = allocations
                .filter((item: any) => item.resourceId === resource.id)
                .reduce(
                  (sum: number, item: any) =>
                    sum + Number(item.hoursPerDay || 0),
                  0
                );
              return {
                resource,
                availability: Number(resource.dailyCapacity || 8) - busyHours,
              };
            })
            .filter(Boolean)
            .sort((a: any, b: any) => b.availability - a.availability);
          const consultant = candidates[0]?.resource;
          const participantNames = new Set(
            matchingAllocations
              .map(
                (allocation: any) =>
                  (resourceById.get(allocation.resourceId) as any)?.name
              )
              .filter(Boolean)
          );
          const moduleQuestionKeyUserIds = new Set(
            questions
              .filter(
                (question: any) =>
                  !module || normalize(question.module) === normalize(module)
              )
              .map((question: any) => question.keyUserId)
              .filter(Boolean)
          );
          for (const keyUser of keyUsers as any[])
            if (
              keyUser.active &&
              (!moduleQuestionKeyUserIds.size ||
                moduleQuestionKeyUserIds.has(keyUser.id))
            )
              participantNames.add(keyUser.name);
          const row: any = await wdb.createWorkshop({
            id: `ws_${nanoid(20)}`,
            projectId: input.projectId,
            title: suggestion.title,
            module,
            modules: module ? [module] : [],
            scopeItemIds: matchedScopes.map(item => item.id),
            objective: suggestion.objective,
            content: suggestion.content,
            scheduledDate: "",
            duration: suggestion.duration,
            participants: [...participantNames],
            consultantResourceId: consultant?.id || "",
            responsible: consultant?.name || "",
            agenda: suggestion.agenda,
            expectedOutcomes: suggestion.expectedOutcomes,
            prerequisites: suggestion.prerequisites,
            requiredRoles: suggestion.requiredRoles,
            presentationFiles: [],
            templateId: "",
            templateVersion: 0,
            occurrenceKey: "",
            learningKey,
            source: "ai_suggestion",
            status: "Rascunho",
            notes: suggestion.reason
              ? `Justificativa da IA: ${suggestion.reason}`
              : "Workshop sugerido pela IA para cobrir o escopo do projeto.",
          });
          existingKeys.add(learningKey);
          existingTitles.add(titleKey);
          created.push(row);
        }
        return {
          appliedTemplates: centralApplied.created + legacyApplied.added,
          updatedTemplates: centralApplied.updated,
          created: created.length,
          skipped,
          totalScopeItems: scopeItemsList.length,
          previouslyCovered: coveredScopeIds.size,
          workshops: created,
          learnedPatternsUsed: learnedPatterns.length,
          generatedBy: ctx.appUser.id,
        };
      }),
    transcripts: router({
      list: workflowEntityProcedure("workshops", false, "workshopId")
        .input(z.object({ workshopId: z.string(), ...paginationInput }))
        .query(({ input }) => wdb.listTranscripts(input.workshopId, input)),
      create: workflowEntityProcedure("workshops", true, "workshopId")
        .input(
          z.object({
            workshopId: z.string(),
            content: z.string(),
            fileUrl: z.string().optional(),
            uploadedBy: z.string().optional(),
          })
        )
        .mutation(async ({ input }) => {
          const id = nanoid();
          return wdb.createTranscript({
            id,
            workshopId: input.workshopId,
            content: input.content,
            fileUrl: input.fileUrl || "",
            uploadedBy: input.uploadedBy || "",
          });
        }),
      transcribe: workflowEntityProcedure("workshops", true, "workshopId")
        .input(
          z.object({
            workshopId: z.string(),
            fileName: z.string().trim().min(1).max(255),
            contentType: z.enum([
              "audio/mpeg",
              "audio/mp3",
              "audio/wav",
              "audio/wave",
              "audio/webm",
              "audio/ogg",
              "audio/mp4",
              "audio/m4a",
            ]),
            base64: z.string().min(1),
            language: z.string().max(10).optional(),
          })
        )
        .mutation(async ({ ctx, input }) => {
          const buffer = Buffer.from(input.base64, "base64");
          if (!buffer.length)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Arquivo de áudio vazio ou inválido",
            });
          if (buffer.length > 16 * 1024 * 1024)
            throw new TRPCError({
              code: "PAYLOAD_TOO_LARGE",
              message: "O áudio deve ter no máximo 16 MB",
            });
          const safeName = input.fileName
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9._-]+/g, "-");
          const stored = await storagePut(
            `workflow/workshops/${input.workshopId}/${safeName}`,
            buffer,
            input.contentType
          );
          const audioUrl = await storageGetSignedUrl(stored.key);
          const result = await transcribeAudio({
            audioUrl,
            language: input.language || "pt",
            prompt:
              "Transcreva integralmente este workshop SAP em português, preservando nomes, módulos, decisões e responsáveis.",
          });
          if ("error" in result)
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `${result.error}${result.details ? `: ${result.details}` : ""}`,
            });
          const id = nanoid();
          const transcript = await wdb.createTranscript({
            id,
            workshopId: input.workshopId,
            content: result.text,
            fileUrl: stored.url,
            uploadedBy: ctx.user.name || ctx.user.email || "Usuário",
          });
          const projectId = await wdb.getWorkflowEntityProjectId(
            "workshops",
            input.workshopId
          );
          if (projectId)
            await recordWorkflowAudit(
              ctx,
              projectId,
              "WORKSHOP_AUDIO_TRANSCRIBED",
              "workshop",
              input.workshopId,
              {
                transcriptId: id,
                fileName: input.fileName,
                duration: result.duration,
                language: result.language,
              }
            );
          return {
            transcript,
            language: result.language,
            duration: result.duration,
          };
        }),
      delete: workflowEntityProcedure("workshop_transcripts", true)
        .input(z.object({ id: z.string() }))
        .mutation(({ input }) => wdb.deleteTranscript(input.id)),
    }),
    minutes: router({
      get: workflowEntityProcedure("workshops", false, "workshopId")
        .input(z.object({ workshopId: z.string() }))
        .query(({ input }) => wdb.getMinutesByWorkshop(input.workshopId)),
      generate: workflowEntityProcedure("workshops", true, "workshopId")
        .input(
          z.object({
            workshopId: z.string(),
          })
        )
        .mutation(async ({ input }) => {
          const transcripts = await wdb.listTranscripts(input.workshopId);
          if (transcripts.length === 0) {
            return { error: "Nenhuma transcrição encontrada para gerar ata." };
          }
          const allContent = transcripts
            .map((t: any) => t.content || "")
            .filter(Boolean)
            .join("\n\n---\n\n");
          const prompt = `Você é um consultor SAP especialista. Gere uma ata de reunião profissional a partir das transcrições abaixo.

A ata deve conter:
1. Resumo executivo
2. Participantes mencionados
3. Tópicos discutidos
4. Decisões tomadas (com responsável quando mencionado)
5. Próximos passos / ações pendentes

Transcrições:
${allContent.slice(0, 8000)}

Retorne em formato markdown.`;
          const ai = await getWorkflowAiConfig("minutes_generation");
          const result = await invokeWorkflowLLM({
            model: ai.model,
            messages: [
              { role: "system", content: ai.systemPrompt },
              { role: "user", content: prompt },
            ],
          });
          const content =
            (typeof result.choices?.[0]?.message?.content === "string"
              ? result.choices[0].message.content
              : "") || "";
          const existing = await wdb.getMinutesByWorkshop(input.workshopId);
          if (existing) {
            await wdb.updateMinutes(existing.id, { content });
            return { id: existing.id, content };
          }
          const id = nanoid();
          await wdb.createMinutes({
            id,
            workshopId: input.workshopId,
            content,
          });
          return { id, content };
        }),
    }),
  }),

  // ===== DCD Documents =====
  dcd: router({
    templates: router({
      list: adminProcedure.query(() => wdb.listDcdTemplates()),
      upload: adminProcedure
        .input(
          z.object({
            name: z.string().trim().min(3).max(255),
            filename: z
              .string()
              .trim()
              .regex(/\.docx$/i),
            base64: z.string().min(100).max(30_000_000),
            activate: z.boolean().optional(),
          })
        )
        .mutation(async ({ ctx, input }) => {
          const bytes = Buffer.from(input.base64, "base64");
          if (bytes.length < 100 || bytes[0] !== 0x50 || bytes[1] !== 0x4b)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "O arquivo não é um DOCX válido",
            });
          const hash = createHash("sha256").update(bytes).digest("hex");
          const existing = await wdb.listDcdTemplates();
          const version =
            Math.max(
              0,
              ...existing
                .filter((item: any) => item.name === input.name)
                .map((item: any) => item.version || 0)
            ) + 1;
          const id = nanoid();
          const stored = await storagePut(
            `workflow/dcd/templates/${id}-v${version}.docx`,
            bytes,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          );
          await wdb.createDcdTemplate({
            id,
            name: input.name,
            version,
            fileUrl: stored.url,
            fileHash: hash,
            active: false,
            structure: {
              archetype: "DCD V5",
              validated: true,
              originalFilename: input.filename,
            },
            createdBy: ctx.user.name || ctx.user.email,
          });
          if (input.activate) await wdb.activateDcdTemplate(id);
          return {
            id,
            version,
            fileUrl: stored.url,
            active: Boolean(input.activate),
          };
        }),
      activate: adminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(async ({ input }) => {
          await wdb.activateDcdTemplate(input.id);
          return { activated: true };
        }),
    }),
    list: workflowProjectProcedure()
      .input(z.object({ projectId: z.string(), ...paginationInput }))
      .query(({ input }) =>
        wdb.listDcdDocuments(input.projectId, false, input)
      ),
    get: workflowEntityProcedure("dcd_documents")
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input }) => {
        const document = await wdb.getDcdDocument(input.id);
        if (!document)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "DCD não encontrado",
          });
        return document;
      }),
    exportPdf: workflowEntityProcedure("dcd_documents")
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const document = await wdb.getDcdDocument(input.id);
        if (!document)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "DCD não encontrado",
          });
        const project = await plannerStore.getProjectById(document.projectId);
        const pdf = await generateDcdPdf(
          {
            projectName: project?.name || document.projectId,
            module: document.module || "Geral",
            title: document.title,
            version: document.version || 1,
            status: document.status,
            author: document.createdBy || ctx.user.name || ctx.user.email,
            generatedAt: document.createdAt || new Date(),
            templateName: document.templateId || "DCD V5",
          },
          document.content
        );
        const filename = `${
          document.title
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .toLowerCase() || "dcd"
        }.pdf`;
        await recordWorkflowAudit(
          ctx,
          document.projectId,
          "DCD_EXPORTED_PDF",
          "dcd",
          document.id,
          { filename, bytes: pdf.length }
        );
        return {
          filename,
          contentType: "application/pdf" as const,
          base64: pdf.toString("base64"),
        };
      }),
    exportDocx: workflowEntityProcedure("dcd_documents")
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const document = await wdb.getDcdDocument(input.id);
        if (!document)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "DCD não encontrado",
          });
        const project = await plannerStore.getProjectById(document.projectId);
        const docx = await generateDcdDocx(
          {
            projectName: project?.name || document.projectId,
            module: document.module || "Geral",
            title: document.title,
            version: document.version || 1,
            status: document.status,
            author: document.createdBy || ctx.user.name || ctx.user.email,
            generatedAt: document.createdAt || new Date(),
            templateName: document.templateId || "DCD V5",
          },
          document.content
        );
        const filename = `${
          document.title
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .toLowerCase() || "dcd"
        }.docx`;
        await recordWorkflowAudit(
          ctx,
          document.projectId,
          "DCD_EXPORTED_DOCX",
          "dcd",
          document.id,
          { filename, bytes: docx.length }
        );
        return {
          filename,
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const,
          base64: docx.toString("base64"),
        };
      }),
    create: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string(),
          module: z.string().optional(),
          title: z.string(),
          content: z.string().optional(),
          status: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const id = nanoid();
        return wdb.createDcdDocument({
          id,
          seriesId: id,
          projectId: input.projectId,
          title: input.title,
          content: input.content || "",
          module: input.module || "",
          status: input.status || "Rascunho",
        });
      }),
    update: workflowEntityProcedure("dcd_documents", true)
      .input(
        z.object({
          id: z.string(),
          data: z.object({
            title: z.string().min(1).optional(),
            content: z.string().optional(),
            status: dcdStatusSchema.optional(),
          }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await approvalStore.assertEntityEditable("dcd", input.id);
        const before = await wdb.getDcdDocument(input.id);
        if (!before)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "DCD não encontrado",
          });
        const projectId =
          before?.projectId ||
          (await wdb.getWorkflowEntityProjectId("dcd_documents", input.id));
        const contentChanged =
          (typeof input.data.content === "string" &&
            input.data.content !== before.content) ||
          (typeof input.data.title === "string" &&
            input.data.title !== before.title);
        let targetId = input.id;
        if (contentChanged) {
          const latest = await wdb.getLatestDcdByModule(
            before.projectId,
            before.module || ""
          );
          const version =
            Math.max(before.version || 1, latest?.version || 0) + 1;
          targetId = nanoid();
          const titleBase = (input.data.title || before.title).replace(
            /\s+-\s+v\d+$/i,
            ""
          );
          const title = `${titleBase} - v${version}`;
          const content = input.data.content ?? before.content;
          const status = input.data.status || "Rascunho";
          const artifacts = await createDcdArtifacts({
            id: targetId,
            projectId: before.projectId,
            module: before.module || "",
            title,
            content,
            version,
            status,
            author: ctx.user.name || ctx.user.email,
          });
          await wdb.createDcdDocument({
            id: targetId,
            projectId: before.projectId,
            seriesId: before.seriesId || before.id,
            sourceHash: "",
            sourceSnapshot: before.sourceSnapshot || {},
            module: before.module || "",
            title,
            content,
            version,
            status,
            templateId: before.templateId || "builtin-v5",
            templateVersion: before.templateVersion || 1,
            versionReason: "manual_edit",
            createdBy: ctx.user.name || ctx.user.email,
            ...artifacts,
          });
        } else {
          await wdb.updateDcdDocument(input.id, input.data);
        }
        if (projectId)
          await recordWorkflowAudit(
            ctx,
            projectId,
            input.data.status === "Aprovado" ? "DCD_APPROVED" : "DCD_UPDATED",
            "dcd",
            targetId,
            {
              sourceId: input.id,
              fields: Object.keys(input.data),
              status: input.data.status,
              createdVersion: contentChanged,
            }
          );
        if (
          projectId &&
          !contentChanged &&
          input.data.status === "Aprovado" &&
          before?.status !== "Aprovado"
        ) {
          await safeWorkflowNotification(
            projectId,
            "DCD aprovado",
            `${input.data.title || before?.title || "DCD"} foi aprovado por ${ctx.user.name || ctx.user.email || "um usuário"}.`
          );
        }
        return { id: targetId, createdVersion: contentChanged };
      }),
    bulkUpdate: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string(),
          ids: z.array(z.string()).min(1).max(500),
          data: z.object({ status: dcdStatusSchema }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await Promise.all(
          input.ids.map(id => approvalStore.assertEntityEditable("dcd", id))
        );
        await assertEntitiesBelongToProject(
          "dcd_documents",
          input.ids,
          input.projectId
        );
        const updated = await wdb.bulkUpdateDcdDocuments(input.ids, input.data);
        await recordWorkflowAudit(
          ctx,
          input.projectId,
          input.data.status === "Aprovado"
            ? "DCDS_BULK_APPROVED"
            : "DCDS_BULK_UPDATED",
          "dcd",
          input.ids[0],
          { ids: input.ids, status: input.data.status, updated }
        );
        if (input.data.status === "Aprovado")
          await safeWorkflowNotification(
            input.projectId,
            "DCDs aprovados em lote",
            `${updated} DCD(s) foram aprovados por ${ctx.user.name || ctx.user.email || "um usuário"}.`
          );
        return { updated };
      }),
    delete: workflowEntityProcedure("dcd_documents", true)
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (
          ctx.appUser.role !== "admin" &&
          (await wdb.isDeliveryMaterializationTarget(input.id))
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Itens originados em Configurações do Tech não podem ser excluídos no projeto",
          });
        await approvalStore.assertEntityEditable("dcd", input.id);
        return wdb.deleteDcdDocument(input.id);
      }),
    preflight: workflowProjectProcedure()
      .input(z.object({ projectId: z.string(), module: z.string().min(1) }))
      .query(async ({ input }) => {
        const context = await getDcdGenerationContext(
          input.projectId,
          input.module
        );
        const required = context.filteredQuestions.filter(
          (question: any) => question.required
        );
        const pendingRequired = required.filter((question: any) => {
          const answer = context.answerMap.get(question.id) as any;
          return !String(answer?.answer || "").trim();
        });
        const workshopWarnings = context.filteredWorkshops
          .filter(
            (workshop: any) =>
              !(context.transcriptMap.get(workshop.id) as any[])?.length ||
              !context.minuteMap.get(workshop.id)
          )
          .map((workshop: any) => ({
            id: workshop.id,
            title: workshop.title,
            missingTranscript: !(
              context.transcriptMap.get(workshop.id) as any[]
            )?.length,
            missingMinutes: !context.minuteMap.get(workshop.id),
          }));
        return {
          module: input.module,
          counts: {
            scopeItems: context.filteredScope.length,
            bdcqQuestions: context.filteredQuestions.length,
            requiredQuestions: required.length,
            pendingRequired: pendingRequired.length,
            workshops: context.filteredWorkshops.length,
            requirements: context.filteredRequirements.length,
            gaps: context.filteredGaps.length,
          },
          pendingRequired: pendingRequired.map((question: any) => ({
            id: question.id,
            question: question.question,
          })),
          workshopWarnings,
          template: context.template
            ? {
                id: context.template.id,
                name: context.template.name,
                version: context.template.version,
              }
            : { id: "builtin-v5", name: "DCD V5", version: 1 },
        };
      }),
    history: workflowProjectProcedure()
      .input(z.object({ projectId: z.string(), seriesId: z.string().min(1) }))
      .query(({ input }) => wdb.listDcdSeries(input.projectId, input.seriesId)),
    restore: workflowEntityProcedure("dcd_documents", true)
      .input(
        z.object({
          id: z.string().min(1),
          note: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const source = await wdb.getDcdDocument(input.id);
        if (!source)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Versão não encontrada",
          });
        const latest = await wdb.getLatestDcdByModule(
          source.projectId,
          source.module || ""
        );
        const version = Math.max(source.version || 1, latest?.version || 0) + 1;
        const id = nanoid();
        const title = `${source.title.replace(/\s+-\s+v\d+$/i, "")} - v${version}`;
        const artifacts = await createDcdArtifacts({
          id,
          projectId: source.projectId,
          module: source.module || "",
          title,
          content: source.content,
          version,
          status: "Rascunho",
          author: ctx.user.name || ctx.user.email,
        });
        await wdb.createDcdDocument({
          id,
          projectId: source.projectId,
          seriesId: source.seriesId || source.id,
          sourceHash: "",
          sourceSnapshot: source.sourceSnapshot || {},
          module: source.module || "",
          title,
          content: source.content,
          version,
          status: "Rascunho",
          templateId: source.templateId || "builtin-v5",
          templateVersion: source.templateVersion || 1,
          restoredFromId: source.id,
          versionReason: input.note ? `restored: ${input.note}` : "restored",
          createdBy: ctx.user.name || ctx.user.email,
          ...artifacts,
        });
        await recordWorkflowAudit(
          ctx,
          source.projectId,
          "DCD_RESTORED",
          "dcd",
          id,
          { sourceId: source.id, version, note: input.note || "" }
        );
        return { id, version, title };
      }),
    generationStatus: workflowProjectProcedure()
      .input(
        z.object({
          projectId: z.string(),
          module: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        const { sourceHash } = await getDcdGenerationContext(
          input.projectId,
          input.module
        );
        const [cached, latest] = await Promise.all([
          wdb.findDcdBySourceHash(input.projectId, sourceHash),
          wdb.getLatestDcdByModule(input.projectId, input.module || ""),
        ]);
        return {
          sourceHash,
          cached: cached
            ? {
                id: cached.id,
                title: cached.title,
                version: cached.version,
                updatedAt: cached.updatedAt,
              }
            : null,
          nextVersion: (latest?.version || 0) + 1,
        };
      }),
    generate: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string(),
          module: z.string().optional(),
          forceRegenerate: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const generationContext = await getDcdGenerationContext(
          input.projectId,
          input.module
        );
        const { sourceHash } = generationContext;
        const cached = await wdb.findDcdBySourceHash(
          input.projectId,
          sourceHash
        );
        if (cached && !input.forceRegenerate) {
          await recordWorkflowAudit(
            ctx,
            input.projectId,
            "DCD_CACHE_REUSED",
            "dcd",
            cached.id,
            { version: cached.version, module: input.module || "" }
          );
          return {
            id: cached.id,
            title: cached.title,
            content: cached.content,
            version: cached.version,
            cached: true,
          };
        }
        const prompt = await buildDcdPromptWithChunking(
          generationContext,
          input.module
        );
        const ai = await getWorkflowAiConfig("dcd_generation");
        const result = await invokeWorkflowLLM({
          model: ai.model,
          messages: [
            { role: "system", content: ai.systemPrompt },
            { role: "user", content: prompt },
          ],
        });
        const content =
          (typeof result.choices?.[0]?.message?.content === "string"
            ? result.choices[0].message.content
            : "") || "";
        const id = nanoid();
        const latest = await wdb.getLatestDcdByModule(
          input.projectId,
          input.module || ""
        );
        const version = (latest?.version || 0) + 1;
        const seriesId = latest?.seriesId || latest?.id || id;
        const title = `DCD - ${input.module || "Geral"} - v${version}`;
        const artifacts = await createDcdArtifacts({
          id,
          projectId: input.projectId,
          module: input.module || "",
          title,
          content,
          version,
          status: "Rascunho",
          author: ctx.user.name || ctx.user.email,
          template: generationContext.template,
        });
        await wdb.createDcdDocument({
          id,
          seriesId,
          sourceHash,
          version,
          projectId: input.projectId,
          module: input.module || "",
          title,
          content,
          status: "Rascunho",
          sourceSnapshot: generationContext.sourceSnapshot,
          templateId: generationContext.template?.id || "builtin-v5",
          templateVersion: generationContext.template?.version || 1,
          docxUrl: artifacts.docxUrl,
          pdfUrl: artifacts.pdfUrl,
          versionReason: "generated",
          createdBy: ctx.user.name || ctx.user.email,
        });
        await recordWorkflowAudit(
          ctx,
          input.projectId,
          "DCD_GENERATED",
          "dcd",
          id,
          { version, module: input.module || "", sourceHash }
        );
        return { id, title, content, version, cached: false };
      }),
    refine: workflowEntityProcedure("dcd_documents", true)
      .input(
        z.object({
          id: z.string().min(1),
          feedback: z.string().trim().min(10).max(8_000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const document = await wdb.getDcdDocument(input.id);
        if (!document)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "DCD não encontrado",
          });
        const ai = await getWorkflowAiConfig("dcd_refinement");
        const prompt = `Refine o DCD completo abaixo conforme o feedback do consultor. Preserve as seções e informações corretas, aplique as mudanças solicitadas e retorne o documento completo em Markdown.\n\nFeedback:\n${input.feedback}\n\nDCD atual:\n${document.content}`;
        const result = await invokeWorkflowLLM({
          model: ai.model,
          messages: [
            { role: "system", content: ai.systemPrompt },
            { role: "user", content: prompt },
          ],
        });
        const content =
          typeof result.choices?.[0]?.message?.content === "string"
            ? result.choices[0].message.content
            : "";
        if (!content.trim())
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "A IA não retornou conteúdo refinado",
          });
        const latest = await wdb.getLatestDcdByModule(
          document.projectId,
          document.module || ""
        );
        const version =
          Math.max(document.version || 1, latest?.version || 0) + 1;
        const id = nanoid();
        const titleBase = document.title.replace(/\s+-\s+v\d+$/i, "");
        const title = `${titleBase} - v${version}`;
        const artifacts = await createDcdArtifacts({
          id,
          projectId: document.projectId,
          module: document.module || "",
          title,
          content,
          version,
          status: "Rascunho",
          author: ctx.user.name || ctx.user.email,
        });
        await wdb.createDcdDocument({
          id,
          projectId: document.projectId,
          seriesId: document.seriesId || document.id,
          sourceHash: "",
          sourceSnapshot: document.sourceSnapshot || {},
          module: document.module || "",
          title,
          content,
          version,
          status: "Rascunho",
          templateId: document.templateId || "builtin-v5",
          templateVersion: document.templateVersion || 1,
          versionReason: "ai_refinement",
          createdBy: ctx.user.name || ctx.user.email,
          ...artifacts,
        });
        await recordWorkflowAudit(
          ctx,
          document.projectId,
          "DCD_REFINED",
          "dcd",
          id,
          {
            sourceId: document.id,
            version,
            feedback: input.feedback.slice(0, 500),
          }
        );
        return { id, title, content, version };
      }),
  }),

  // ===== Gaps =====
  gaps: router({
    list: workflowProjectProcedure()
      .input(z.object({ projectId: z.string(), ...paginationInput }))
      .query(({ input }) => wdb.listGaps(input.projectId, input)),
    create: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string(),
          dcdId: z.string().optional(),
          module: z.string().optional(),
          modules: z.array(z.string()).max(30).optional(),
          description: z.string(),
          impact: gapImpactSchema.optional(),
          responsible: z.string().optional(),
          abapHours: z.number().int().min(0).max(100000).optional(),
          technicalHours: z.number().int().min(0).max(100000).optional(),
          attachments: z.array(z.string()).max(50).optional(),
          resolution: z.string().optional(),
          status: gapStatusSchema.optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const id = nanoid();
        const created = await wdb.createGap({
          id,
          projectId: input.projectId,
          description: input.description,
          dcdId: input.dcdId || "",
          module: input.modules?.[0] || input.module || "",
          modules: input.modules || (input.module ? [input.module] : []),
          impact: input.impact || "Médio",
          responsible: input.responsible || "",
          abapHours: input.abapHours || 0,
          technicalHours: input.technicalHours || 0,
          attachments: input.attachments || [],
          resolution: input.resolution,
          status: input.status || "Aberto",
        });
        await recordWorkflowAudit(
          ctx,
          input.projectId,
          "GAP_CREATED",
          "gap",
          id,
          { module: input.module || "", impact: input.impact || "Médio" }
        );
        return created;
      }),
    update: workflowEntityProcedure("gaps", true)
      .input(
        z.object({
          id: z.string(),
          data: z.object({
            dcdId: z.string().optional(),
            module: z.string().optional(),
            modules: z.array(z.string()).max(30).optional(),
            description: z.string().min(1).optional(),
            impact: gapImpactSchema.optional(),
            responsible: z.string().optional(),
            abapHours: z.number().int().min(0).max(100000).optional(),
            technicalHours: z.number().int().min(0).max(100000).optional(),
            attachments: z.array(z.string()).max(50).optional(),
            resolution: z.string().optional(),
            status: gapStatusSchema.optional(),
          }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await approvalStore.assertEntityEditable("gap", input.id);
        const projectId = await wdb.getWorkflowEntityProjectId(
          "gaps",
          input.id
        );
        await wdb.updateGap(input.id, input.data);
        if (projectId)
          await recordWorkflowAudit(
            ctx,
            projectId,
            "GAP_UPDATED",
            "gap",
            input.id,
            { fields: Object.keys(input.data), ...input.data }
          );
      }),
    bulkUpdate: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string(),
          ids: z.array(z.string()).min(1).max(500),
          data: z.object({
            responsible: z.string().optional(),
            status: gapStatusSchema.optional(),
            impact: gapImpactSchema.optional(),
          }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await Promise.all(
          input.ids.map(id => approvalStore.assertEntityEditable("gap", id))
        );
        await assertEntitiesBelongToProject("gaps", input.ids, input.projectId);
        const updated = await wdb.bulkUpdateGaps(input.ids, input.data);
        await recordWorkflowAudit(
          ctx,
          input.projectId,
          "GAPS_BULK_UPDATED",
          "gap",
          input.ids[0],
          { ids: input.ids, data: input.data, updated }
        );
        return { updated };
      }),
    uploadAttachment: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string().min(1),
          fileName: z.string().min(1).max(255),
          fileData: z.string().max(14_000_000),
          contentType: z.string().max(255),
        })
      )
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.fileData, "base64");
        if (buffer.byteLength > 10 * 1024 * 1024)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O anexo deve ter no máximo 10 MB",
          });
        const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const stored = await storagePut(
          `workflow/${input.projectId}/gaps/${nanoid()}-${safeName}`,
          buffer,
          input.contentType
        );
        return { url: stored.url, key: stored.key };
      }),
    delete: workflowEntityProcedure("gaps", true)
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (
          ctx.appUser.role !== "admin" &&
          (await wdb.isDeliveryMaterializationTarget(input.id))
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Itens originados em Configurações do Tech não podem ser excluídos no projeto",
          });
        await approvalStore.assertEntityEditable("gap", input.id);
        return wdb.deleteGap(input.id);
      }),
    extractFromDcd: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string(),
          dcdId: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const document = await wdb.getDcdDocument(input.dcdId);
        if (!document || document.projectId !== input.projectId)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "DCD não encontrado no projeto selecionado",
          });
        const prompt = `Analise o DCD abaixo e extraia uma lista de gaps (funcionalidades não cobertas pelo padrão SAP que precisam de desenvolvimento/extensão).

DCD:
${document.content.slice(0, 16000)}

Retorne APENAS um JSON array com objetos no formato:
[{"description": "...", "impact": "Alto|Médio|Baixo", "module": "SD|MM|FI|CO|..."}]`;
        const ai = await getWorkflowAiConfig("gaps_extraction");
        const schema = z
          .array(
            z.object({
              description: z.string().min(1),
              impact: z.enum(["Alto", "Médio", "Baixo"]),
              module: z.string().default(""),
            })
          )
          .max(500);
        let gapsList: z.infer<typeof schema> | null = null;
        let lastOutput = "";
        for (let attempt = 0; attempt < 2 && !gapsList; attempt++) {
          const correction = attempt
            ? `\n\nA resposta anterior era inválida. Corrija e retorne somente o array JSON válido:\n${lastOutput.slice(0, 3000)}`
            : "";
          const result = await invokeWorkflowLLM({
            model: ai.model,
            messages: [
              { role: "system", content: ai.systemPrompt },
              { role: "user", content: prompt + correction },
            ],
          });
          lastOutput =
            typeof result.choices?.[0]?.message?.content === "string"
              ? result.choices[0].message.content
              : "";
          try {
            const match = lastOutput.match(/\[[\s\S]*\]/);
            gapsList = match ? schema.parse(JSON.parse(match[0])) : null;
          } catch {
            gapsList = null;
          }
        }
        if (!gapsList)
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message:
              "A IA não retornou uma lista de gaps válida após nova tentativa",
          });
        const existing = await wdb.listGaps(input.projectId);
        const known = new Set(
          existing.map((gap: any) => legacyKey(gap.module, gap.description))
        );
        const created = [];
        for (const g of gapsList) {
          const key = legacyKey(g.module, g.description);
          if (known.has(key)) continue;
          const id = nanoid();
          await wdb.createGap({
            id,
            projectId: input.projectId,
            dcdId: input.dcdId,
            description: g.description || "Gap sem descrição",
            impact: g.impact || "Médio",
            module: g.module || "",
            status: "Aberto",
          });
          known.add(key);
          created.push({ id, ...g });
        }
        await recordWorkflowAudit(
          ctx,
          input.projectId,
          "GAPS_EXTRACTED",
          "dcd",
          document.id,
          {
            extracted: created.length,
            ignored: gapsList.length - created.length,
          }
        );
        return { extracted: created.length, gaps: created };
      }),
  }),

  // ===== Configurations =====
  configurations: router({
    templates: router({
      list: protectedProcedure.query(() => wdb.listConfigurationTemplates()),
      create: adminProcedure
        .input(
          z.object({
            description: z.string().trim().min(1).max(5000),
            category: z.string().trim().max(256).default("Configuração"),
            modules: z
              .array(z.string().trim().min(1).max(128))
              .max(30)
              .default([]),
            scopeItemKeys: z
              .array(z.string().trim().min(1).max(512))
              .max(200)
              .default([]),
            active: z.boolean().default(true),
          })
        )
        .mutation(async ({ ctx, input }) => {
          await assertRegisteredScopeItems(input.scopeItemKeys);
          return wdb.createConfigurationTemplate({
            id: nanoid(),
            ...input,
            createdBy: ctx.appUser.name || ctx.appUser.email,
          });
        }),
      update: adminProcedure
        .input(
          z.object({
            id: z.string().min(1),
            data: z.object({
              description: z.string().trim().min(1).max(5000).optional(),
              category: z.string().trim().max(256).optional(),
              modules: z
                .array(z.string().trim().min(1).max(128))
                .max(30)
                .optional(),
              scopeItemKeys: z
                .array(z.string().trim().min(1).max(512))
                .max(200)
                .optional(),
              active: z.boolean().optional(),
            }),
          })
        )
        .mutation(async ({ input }) => {
          if (input.data.scopeItemKeys)
            await assertRegisteredScopeItems(input.data.scopeItemKeys);
          return wdb.updateConfigurationTemplate(input.id, input.data);
        }),
      delete: adminProcedure
        .input(z.object({ id: z.string().min(1) }))
        .mutation(({ input }) => wdb.deleteConfigurationTemplate(input.id)),
      applyToProject: workflowProjectProcedure(true)
        .input(z.object({ projectId: z.string().min(1) }))
        .mutation(({ input }) => applyConfigurationTemplates(input.projectId)),
    }),
    list: workflowProjectProcedure()
      .input(z.object({ projectId: z.string(), ...paginationInput }))
      .query(({ input }) => wdb.listConfigurations(input.projectId, input)),
    create: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string(),
          module: z.string().optional(),
          category: z.string().optional(),
          description: z.string(),
          responsible: z.string().optional(),
          status: z.string().optional(),
          notes: z.string().optional(),
          scopeItemIds: z.array(z.string()).max(200).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const id = nanoid();
        return wdb.createConfiguration({
          id,
          projectId: input.projectId,
          description: input.description,
          module: input.module || "",
          category: input.category || "",
          responsible: input.responsible || "",
          status: input.status || "Pendente",
          notes: input.notes,
          templateId: "",
          bdcqQuestionId: "",
          scopeItemIds: input.scopeItemIds || [],
          source: "manual",
        });
      }),
    update: workflowEntityProcedure("configurations", true)
      .input(
        z.object({
          id: z.string(),
          data: z.record(z.string(), z.any()),
        })
      )
      .mutation(({ input }) => wdb.updateConfiguration(input.id, input.data)),
    bulkUpdate: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string(),
          ids: z.array(z.string()).min(1).max(500),
          data: z.object({
            responsible: z.string().optional(),
            status: z.string().optional(),
          }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await assertEntitiesBelongToProject(
          "configurations",
          input.ids,
          input.projectId
        );
        const updated = await wdb.bulkUpdateConfigurations(
          input.ids,
          input.data
        );
        await recordWorkflowAudit(
          ctx,
          input.projectId,
          "CONFIGURATIONS_BULK_UPDATED",
          "configuration",
          input.ids[0],
          { ids: input.ids, data: input.data, updated }
        );
        return { updated };
      }),
    generateFromDcd: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string().min(1),
          dcdId: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const document = await wdb.getDcdDocument(input.dcdId);
        if (!document || document.projectId !== input.projectId)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "DCD não encontrado no projeto selecionado",
          });
        const schema = z
          .array(
            z.object({
              description: z.string().min(1),
              module: z.string().default(""),
              category: z
                .enum(["Configuração", "Customizing", "Extensão", "Migração"])
                .default("Configuração"),
            })
          )
          .max(500);
        const prompt = `Extraia do DCD abaixo um checklist executável de configurações SAP. Retorne APENAS JSON no formato [{"description":"...","module":"FI","category":"Configuração|Customizing|Extensão|Migração"}].\n\nDCD:\n${document.content.slice(0, 16000)}`;
        const ai = await getWorkflowAiConfig("configurations_extraction");
        let parsed: z.infer<typeof schema> | null = null;
        let lastOutput = "";
        for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
          const correction = attempt
            ? `\n\nA resposta anterior era inválida. Corrija e devolva somente o array JSON válido:\n${lastOutput.slice(0, 3000)}`
            : "";
          const result = await invokeWorkflowLLM({
            model: ai.model,
            messages: [
              { role: "system", content: ai.systemPrompt },
              { role: "user", content: prompt + correction },
            ],
          });
          lastOutput =
            typeof result.choices?.[0]?.message?.content === "string"
              ? result.choices[0].message.content
              : "";
          try {
            const match = lastOutput.match(/\[[\s\S]*\]/);
            parsed = match ? schema.parse(JSON.parse(match[0])) : null;
          } catch {
            parsed = null;
          }
        }
        if (!parsed)
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message:
              "A IA não retornou uma lista de configurações válida após nova tentativa",
          });
        const existing = await wdb.listConfigurations(input.projectId);
        const known = new Set(
          existing.map((item: any) => legacyKey(item.module, item.description))
        );
        let added = 0;
        let ignored = 0;
        for (const item of parsed) {
          const key = legacyKey(item.module, item.description);
          if (known.has(key)) {
            ignored++;
            continue;
          }
          await wdb.createConfiguration({
            id: nanoid(),
            projectId: input.projectId,
            module: item.module,
            category: item.category,
            description: item.description,
            responsible: "",
            status: "Pendente",
            notes: `Extraída de ${document.title}`,
            templateId: "",
            bdcqQuestionId: "",
            scopeItemIds: [],
            source: "dcd",
          });
          known.add(key);
          added++;
        }
        await recordWorkflowAudit(
          ctx,
          input.projectId,
          "CONFIGURATIONS_EXTRACTED",
          "dcd",
          document.id,
          { added, ignored }
        );
        return { added, ignored };
      }),
    generateFromBdcq: workflowProjectProcedure(true)
      .input(z.object({ projectId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const [questions, answers, existing] = await Promise.all([
          wdb.listBdcqQuestions(input.projectId),
          wdb.listBdcqAnswers(input.projectId),
          wdb.listConfigurations(input.projectId),
        ]);
        const answersByQuestion = new Map(
          answers
            .filter((item: any) => String(item.answer || "").trim())
            .map((item: any) => [item.questionId, item])
        );
        const known = new Set(
          existing.map((item: any) => item.bdcqQuestionId).filter(Boolean)
        );
        let added = 0;
        let ignored = 0;
        for (const question of questions as any[]) {
          const answer = answersByQuestion.get(question.id) as any;
          if (!answer || known.has(question.id)) {
            if (answer) ignored++;
            continue;
          }
          await wdb.createConfiguration({
            id: nanoid(),
            projectId: input.projectId,
            module: question.module || "",
            category: question.category || "Configuração",
            description: `Configurar conforme BDCQ: ${question.question}`,
            responsible: "",
            status: "Pendente",
            notes: `Resposta BDCQ: ${answer.answer}`,
            templateId: "",
            bdcqQuestionId: question.id,
            scopeItemIds: question.scopeItemIds || [],
            source: "bdcq",
          });
          known.add(question.id);
          added++;
        }
        await recordWorkflowAudit(
          ctx,
          input.projectId,
          "CONFIGURATIONS_FROM_BDCQ",
          "configuration",
          input.projectId,
          { added, ignored }
        );
        return { added, ignored };
      }),
    delete: workflowEntityProcedure("configurations", true)
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (
          ctx.appUser.role !== "admin" &&
          (await wdb.isDeliveryMaterializationTarget(input.id))
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Itens originados em Configurações do Tech não podem ser excluídos no projeto",
          });
        return wdb.deleteConfiguration(input.id);
      }),
  }),

  tests: router({
    exportData: workflowProjectProcedure()
      .input(z.object({ projectId: z.string() }))
      .query(async ({ input }) => {
        const [scenarios, steps] = await Promise.all([
          wdb.listWorkflowTestCases(input.projectId),
          wdb.listWorkflowTestStepsByProject(input.projectId),
        ]);
        return {
          scenarios: scenarios.filter(item =>
            ["Ciclo 1", "Ciclo 2", "Integrado"].includes(item.type)
          ),
          steps,
        };
      }),
    importData: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string(),
          rows: z
            .array(
              z.object({
                scenarioType: testTypeSchema.default("Ciclo 1"),
                scenarioCode: z.string(),
                scenarioTitle: z.string().trim().min(1),
                scenarioDescription: z.string().optional(),
                module: z.string().optional(),
                preconditions: z.string().optional(),
                scenarioLeader: z.string().optional(),
                stepPosition: z.number().int().min(1),
                stepTitle: z.string().trim().min(1),
                instruction: z.string().optional(),
                expectedResult: z.string().optional(),
                keyUser: z.string().optional(),
                status: testStatusSchema.optional(),
                actualResult: z.string().optional(),
                executedAt: z.string().optional(),
              })
            )
            .min(1)
            .max(2000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const existing = await wdb.listWorkflowTestCases(input.projectId);
        const byCode = new Map<string, any>(
          existing
            .filter(
              item =>
                ["Ciclo 1", "Ciclo 2", "Integrado"].includes(item.type) &&
                item.code
            )
            .map(item => [
              `${item.type}|${item.code.trim().toLocaleLowerCase("pt-BR")}`,
              item,
            ])
        );
        let scenariosCreated = 0;
        let stepsCreated = 0;
        for (const row of input.rows) {
          const key = `${row.scenarioType}|${(
            row.scenarioCode || row.scenarioTitle
          )
            .trim()
            .toLocaleLowerCase("pt-BR")}`;
          let scenario = byCode.get(key);
          if (!scenario) {
            scenario = await wdb.createWorkflowTestCase({
              id: nanoid(),
              projectId: input.projectId,
              type:
                row.scenarioType === "Integrado" ? "Ciclo 1" : row.scenarioType,
              code: row.scenarioCode,
              title: row.scenarioTitle,
              description: row.scenarioDescription,
              module: row.module || "",
              preconditions: row.preconditions,
              responsible: row.scenarioLeader || "",
              status: "Não iniciado",
            });
            byCode.set(key, scenario);
            scenariosCreated++;
          }
          await wdb.createWorkflowTestStep({
            id: nanoid(),
            testCaseId: scenario.id,
            position: row.stepPosition,
            title: row.stepTitle,
            instruction: row.instruction,
            expectedResult: row.expectedResult,
            responsible: row.keyUser || "",
            status: row.status || "Não iniciado",
            actualResult: row.actualResult,
            executedAt: row.executedAt || "",
          });
          stepsCreated++;
        }
        await recordWorkflowAudit(
          ctx,
          input.projectId,
          "TEST_DATA_IMPORTED",
          "test_cases",
          input.projectId,
          { scenariosCreated, stepsCreated }
        );
        return { scenariosCreated, stepsCreated };
      }),
    list: workflowProjectProcedure(false, "executeAssignedTests")
      .input(
        z.object({
          projectId: z.string(),
          type: testTypeSchema.optional(),
          ...paginationInput,
        })
      )
      .query(async ({ ctx, input }) => {
        const rows = await wdb.listWorkflowTestCases(input.projectId, input);
        const typed = input.type
          ? rows.filter((item: any) => item.type === input.type)
          : rows;
        if (await canViewAllWorkflowTests(ctx.appUser, input.projectId))
          return typed;
        const steps = await wdb.listWorkflowTestStepsByProject(input.projectId);
        const ownCaseIds = new Set(
          steps
            .filter((step: any) =>
              responsibleMatches(ctx.appUser, step.responsible)
            )
            .map((step: any) => step.testCaseId)
        );
        return typed.filter(
          (item: any) =>
            responsibleMatches(ctx.appUser, item.responsible) ||
            ownCaseIds.has(item.id)
        );
      }),
    create: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string(),
          type: testTypeSchema,
          code: z.string().optional(),
          title: z.string().trim().min(1),
          description: z.string().optional(),
          module: z.string().optional(),
          requirementId: z.string().optional(),
          scopeItemId: z.string().optional(),
          dcdId: z.string().optional(),
          preconditions: z.string().optional(),
          steps: z.string().optional(),
          expectedResult: z.string().optional(),
          responsible: z.string().optional(),
          status: testStatusSchema.optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        for (const [table, id] of [
          ["client_requirements", input.requirementId],
          ["scope_items", input.scopeItemId],
          ["dcd_documents", input.dcdId],
        ] as const) {
          if (
            id &&
            (await wdb.getWorkflowEntityProjectId(table, id)) !==
              input.projectId
          )
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Um vínculo do caso de teste não pertence ao projeto selecionado",
            });
        }
        const id = nanoid();
        const created = await wdb.createWorkflowTestCase({
          id,
          projectId: input.projectId,
          type: input.type,
          code: input.code || "",
          title: input.title,
          description: input.description,
          module: input.module || "",
          requirementId: input.requirementId || "",
          scopeItemId: input.scopeItemId || "",
          dcdId: input.dcdId || "",
          preconditions: input.preconditions,
          steps: input.steps,
          expectedResult: input.expectedResult,
          responsible: input.responsible || "",
          status: input.status || "Não iniciado",
        });
        await recordWorkflowAudit(
          ctx,
          input.projectId,
          "TEST_CASE_CREATED",
          "test_case",
          id,
          { type: input.type, title: input.title }
        );
        return created;
      }),
    update: workflowEntityProcedure(
      "workflow_test_cases",
      true,
      "id",
      "executeAssignedTests"
    )
      .input(
        z.object({
          id: z.string(),
          data: z.object({
            type: testTypeSchema.optional(),
            code: z.string().optional(),
            title: z.string().min(1).optional(),
            description: z.string().optional(),
            module: z.string().optional(),
            preconditions: z.string().optional(),
            steps: z.string().optional(),
            expectedResult: z.string().optional(),
            actualResult: z.string().optional(),
            responsible: z.string().optional(),
            evidence: z.string().optional(),
            status: testStatusSchema.optional(),
            executedAt: z.string().optional(),
          }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await approvalStore.assertEntityEditable("test_case", input.id);
        const testCase = await wdb.getWorkflowTestCaseById(input.id);
        if (!testCase)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Teste não encontrado",
          });
        await assertCanExecuteTestCase(ctx.appUser, testCase);
        const projectId = await wdb.getWorkflowEntityProjectId(
          "workflow_test_cases",
          input.id
        );
        await wdb.updateWorkflowTestCase(input.id, input.data);
        if (projectId)
          await recordWorkflowAudit(
            ctx,
            projectId,
            "TEST_CASE_UPDATED",
            "test_case",
            input.id,
            { fields: Object.keys(input.data), status: input.data.status }
          );
      }),
    bulkUpdate: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string(),
          ids: z.array(z.string()).min(1).max(500),
          data: z.object({
            responsible: z.string().optional(),
            status: testStatusSchema.optional(),
            executedAt: z.string().optional(),
          }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await Promise.all(
          input.ids.map(id =>
            approvalStore.assertEntityEditable("test_case", id)
          )
        );
        await assertEntitiesBelongToProject(
          "workflow_test_cases",
          input.ids,
          input.projectId
        );
        const updated = await wdb.bulkUpdateWorkflowTestCases(
          input.ids,
          input.data
        );
        await recordWorkflowAudit(
          ctx,
          input.projectId,
          "TEST_CASES_BULK_UPDATED",
          "test_cases",
          input.ids[0],
          { ids: input.ids, data: input.data, updated }
        );
        return { updated };
      }),
    delete: workflowEntityProcedure("workflow_test_cases", true)
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        if (await wdb.isDeliveryMaterializationTarget(input.id))
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Itens originados em Configurações do Tech não podem ser excluídos no projeto",
          });
        await approvalStore.assertEntityEditable("test_case", input.id);
        return wdb.deleteWorkflowTestCase(input.id);
      }),
    steps: router({
      list: workflowEntityProcedure(
        "workflow_test_cases",
        false,
        "testCaseId",
        "executeAssignedTests"
      )
        .input(z.object({ testCaseId: z.string() }))
        .query(async ({ ctx, input }) => {
          const testCase = await wdb.getWorkflowTestCaseById(input.testCaseId);
          if (!testCase)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Teste não encontrado",
            });
          const rows = await wdb.listWorkflowTestSteps(input.testCaseId);
          if (await canViewAllWorkflowTests(ctx.appUser, testCase.projectId))
            return rows;
          return rows.filter((step: any) =>
            responsibleMatches(ctx.appUser, step.responsible)
          );
        }),
      create: workflowEntityProcedure("workflow_test_cases", true, "testCaseId")
        .input(
          z.object({
            testCaseId: z.string(),
            position: z.number().int().min(1),
            title: z.string().trim().min(1),
            instruction: z.string().optional(),
            expectedResult: z.string().optional(),
            responsible: z.string().optional(),
          })
        )
        .mutation(async ({ ctx, input }) => {
          const projectId = await wdb.getWorkflowEntityProjectId(
            "workflow_test_cases",
            input.testCaseId
          );
          const id = nanoid();
          const created = await wdb.createWorkflowTestStep({
            id,
            testCaseId: input.testCaseId,
            position: input.position,
            title: input.title,
            instruction: input.instruction,
            expectedResult: input.expectedResult,
            responsible: input.responsible || "",
          });
          if (projectId)
            await recordWorkflowAudit(
              ctx,
              projectId,
              "TEST_STEP_CREATED",
              "test_step",
              id,
              { testCaseId: input.testCaseId, title: input.title }
            );
          return created;
        }),
      update: workflowEntityProcedure(
        "workflow_test_steps",
        true,
        "id",
        "executeAssignedTests"
      )
        .input(
          z.object({
            id: z.string(),
            data: z.object({
              position: z.number().int().min(1).optional(),
              title: z.string().trim().min(1).optional(),
              instruction: z.string().optional(),
              expectedResult: z.string().optional(),
              actualResult: z.string().optional(),
              responsible: z.string().optional(),
              status: testStatusSchema.optional(),
              evidences: z
                .array(
                  z.object({
                    name: z.string(),
                    url: z.string(),
                    contentType: z.string(),
                  })
                )
                .optional(),
              executedAt: z.string().optional(),
            }),
          })
        )
        .mutation(async ({ ctx, input }) => {
          const step = await wdb.getWorkflowTestStepById(input.id);
          if (!step)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Etapa não encontrada",
            });
          const testCase = await wdb.getWorkflowTestCaseById(step.testCaseId);
          if (!testCase)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Teste não encontrado",
            });
          if (
            !(await canViewAllWorkflowTests(ctx.appUser, testCase.projectId)) &&
            !responsibleMatches(ctx.appUser, step.responsible)
          )
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Esta etapa está atribuída a outro usuário",
            });
          const projectId = await wdb.getWorkflowEntityProjectId(
            "workflow_test_steps",
            input.id
          );
          await wdb.updateWorkflowTestStep(input.id, input.data);
          if (projectId)
            await recordWorkflowAudit(
              ctx,
              projectId,
              "TEST_STEP_UPDATED",
              "test_step",
              input.id,
              { status: input.data.status }
            );
        }),
      delete: workflowEntityProcedure("workflow_test_steps", true)
        .input(z.object({ id: z.string() }))
        .mutation(({ input }) => wdb.deleteWorkflowTestStep(input.id)),
    }),
  }),

  // ===== File Upload =====
  upload: workflowProjectProcedure(true, "fillAssignedBdcq")
    .input(
      z.object({
        projectId: z.string().min(1),
        fileName: z.string(),
        fileData: z.string(), // base64
        contentType: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileData, "base64");
      const fileKey = `workflow/${nanoid()}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, input.contentType);
      return { url, key: fileKey };
    }),
});
