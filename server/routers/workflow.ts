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
import type { TechMoveData } from "../../shared/types";

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

const workflowProjectProcedure = (write = false) =>
  protectedProcedure.use(async ({ ctx, next, getRawInput }) => {
    const input = (await getRawInput()) as { projectId?: string } | null;
    if (!input?.projectId)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Projeto é obrigatório",
      });
    await assertWorkflowProjectAccess(ctx.appUser, input.projectId, write);
    return next();
  });

const workflowEntityProcedure = (
  table: string,
  write = false,
  idField = "id"
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
    await assertWorkflowProjectAccess(ctx.appUser, projectId, write);
    return next();
  });

const gapStatusSchema = z.enum(["Aberto", "Em Análise", "Resolvido", "Aceito"]);
const gapImpactSchema = z.enum(["Alto", "Médio", "Baixo"]);
const workshopStatusSchema = z.enum([
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
const testTypeSchema = z.enum(["Unitário", "Integrado"]);
const testStatusSchema = z.enum([
  "Não iniciado",
  "Em execução",
  "Aprovado",
  "Reprovado",
  "Bloqueado",
]);

async function getDcdGenerationContext(projectId: string, module?: string) {
  const [scopeItemsList, questions, answers, requirements] = await Promise.all([
    wdb.listScopeItems(projectId),
    wdb.listBdcqQuestions(projectId),
    wdb.listBdcqAnswers(projectId),
    wdb.listClientRequirements(projectId),
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
  };
  const sourceHash = createHash("sha256")
    .update(JSON.stringify(hashPayload))
    .digest("hex");
  return {
    filteredScope,
    filteredQuestions,
    filteredRequirements,
    answerMap,
    sourceHash,
  };
}

export async function streamDcdGeneration(input: {
  projectId: string;
  module?: string;
  forceRegenerate?: boolean;
  user: { id: string; name: string };
  onDelta: (text: string) => void | Promise<void>;
}) {
  const {
    filteredScope,
    filteredQuestions,
    filteredRequirements,
    answerMap,
    sourceHash,
  } = await getDcdGenerationContext(input.projectId, input.module);
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
  const answeredCount = filteredQuestions.filter((question: any) =>
    answerMap.has(question.id)
  ).length;
  const completion =
    filteredQuestions.length === 0
      ? 0
      : answeredCount / filteredQuestions.length;
  if (filteredQuestions.length > 0 && completion < 0.7) {
    const pending = filteredQuestions
      .filter((question: any) => !answerMap.has(question.id))
      .slice(0, 10);
    throw new Error(
      `Complete ao menos 70% do BDCQ antes de gerar o DCD. Progresso atual: ${Math.round(completion * 100)}%. Pendentes: ${pending.map((question: any) => question.question).join("; ")}`
    );
  }
  const prompt = `Você é um consultor SAP sênior. Gere um documento DCD (Design de Configuração Detalhada) para o módulo "${input.module || "Geral"}".

Scope Items relevantes (${filteredScope.length}):
${filteredScope
  .slice(0, 15)
  .map((scope: any) => `- ${scope.code || ""} ${scope.name}`)
  .join("\n")}

Perguntas e Respostas BDCQ:
${filteredQuestions
  .slice(0, 15)
  .map(
    (question: any) =>
      `Q: ${question.question}\nA: ${(answerMap.get(question.id) as any)?.answer || "Sem resposta"}`
  )
  .join("\n\n")}

Requisitos do Cliente levantados nos workshops (${filteredRequirements.length}):
${
  filteredRequirements
    .slice(0, 40)
    .map(
      (requirement: any) =>
        `- [${requirement.priority}/${requirement.status}] ${requirement.code ? `${requirement.code} - ` : ""}${requirement.title}: ${requirement.description}${requirement.acceptanceCriteria ? `\n  Critérios de aceite: ${requirement.acceptanceCriteria}` : ""}`
    )
    .join("\n") || "- Nenhum requisito registrado"
}

Contexto SAP de referência:
${getSapKnowledgeContext(input.module)}

${DCD_FEW_SHOT_EXAMPLE}

O DCD deve conter:
1. Visão geral do processo
2. Configurações necessárias (transações, tabelas, campos)
3. Decisões de design
4. Gaps identificados (se houver)
5. Dependências e integrações
6. Cenários e critérios de teste
7. Matriz de rastreabilidade entre requisitos, BDCQ e decisões

Retorne em formato markdown profissional. Não copie os fatos do exemplo e não invente transações ou apps ausentes do contexto.`;
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
  const existingQuestions = new Set(
    existing.map(
      (question: any) =>
        `${normalize(question.module || "Geral")}:${normalize(question.question)}`
    )
  );
  const moduleSet = modules?.length
    ? new Set(modules.map(module => module.trim().toUpperCase()))
    : null;
  const templates: Array<{
    id?: string;
    module: string;
    category: string;
    question: string;
    scopeItemIds?: string[];
  }> = BDCQ_TEMPLATES.filter(
    template => !moduleSet || moduleSet.has(template.module)
  ).map(template => ({ ...template }));
  for (const template of customTemplates.filter(
    (item: any) => item.active !== 0
  )) {
    const templateModules = (template.modules || []).map((module: string) =>
      module.trim().toUpperCase()
    );
    const keys = new Set(
      (template.scopeItemKeys || []).map((key: string) => normalize(key))
    );
    const matchedScope = scopeItems.filter((item: any) =>
      keys.has(normalize(item.code || item.name))
    );
    const relevantModules = new Set<string>();
    templateModules.forEach((module: string) => {
      if (!moduleSet || moduleSet.has(module)) relevantModules.add(module);
    });
    matchedScope.forEach((item: any) => {
      const module = String(item.module || "Geral").toUpperCase();
      if (!moduleSet || moduleSet.has(module)) relevantModules.add(module);
    });
    if (!templateModules.length && !keys.size) relevantModules.add("Geral");
    for (const module of relevantModules)
      templates.push({
        id: template.id,
        module,
        category: template.category || "",
        question: template.question,
        scopeItemIds: matchedScope
          .filter(
            (item: any) =>
              String(item.module || "Geral").toUpperCase() === module ||
              !templateModules.length
          )
          .map((item: any) => item.id),
      });
  }
  let added = 0;
  for (const template of templates) {
    const key = `${normalize(template.module)}:${normalize(template.question)}`;
    if (existingQuestions.has(key)) continue;
    await wdb.createBdcqQuestion({
      id: nanoid(),
      projectId,
      module: template.module,
      category: template.category,
      question: template.question,
      templateId: template.id || "",
      scopeItemIds: template.scopeItemIds || [],
      isDefault: 1,
      sortOrder: existing.length + added,
    });
    existingQuestions.add(key);
    added++;
  }
  return added;
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
    list: workflowProjectProcedure()
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
      .mutation(({ input }) => wdb.updateScopeItem(input.id, input.data)),
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
        const results = [];
        for (const item of input.items) {
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
        }
        await ensureBdcqTemplates(input.projectId, [
          ...new Set(input.items.map(item => item.module)),
        ]);
        return results;
      }),
  }),

  // ===== BDCQ =====
  bdcq: router({
    templates: router({
      list: protectedProcedure.query(async () => {
        const custom = await wdb.listBdcqTemplateLibrary();
        const builtIn = BDCQ_TEMPLATES.map((template, index) => ({
          id: `builtin-${template.module}-${index}`,
          question: template.question,
          category: template.category,
          modules: [template.module],
          scopeItemKeys: [],
          active: 1,
          createdBy: "Sistema",
          builtIn: true,
        }));
        return [
          ...builtIn,
          ...custom.map(template => ({ ...template, builtIn: false })),
        ];
      }),
      create: adminProcedure
        .input(
          z.object({
            question: z.string().trim().min(1).max(5000),
            category: z.string().trim().max(256).optional(),
            modules: z
              .array(z.string().trim().min(1).max(128))
              .max(30)
              .default([]),
            scopeItemKeys: z
              .array(z.string().trim().min(1).max(512))
              .max(200)
              .default([]),
            active: z.number().int().min(0).max(1).optional(),
          })
        )
        .mutation(({ ctx, input }) =>
          wdb.createBdcqTemplate({
            id: nanoid(),
            ...input,
            category: input.category || "",
            active: input.active ?? 1,
            createdBy: ctx.appUser.name || ctx.appUser.email,
          })
        ),
      update: adminProcedure
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
              active: z.number().int().min(0).max(1).optional(),
            }),
          })
        )
        .mutation(({ input }) => wdb.updateBdcqTemplate(input.id, input.data)),
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
        .mutation(async ({ input }) => ({
          added: await ensureBdcqTemplates(input.projectId, input.modules),
        })),
    }),
    questions: router({
      list: workflowProjectProcedure()
        .input(z.object({ projectId: z.string(), ...paginationInput }))
        .query(({ input }) => wdb.listBdcqQuestions(input.projectId, input)),
      create: workflowProjectProcedure(true)
        .input(
          z.object({
            projectId: z.string(),
            module: z.string(),
            category: z.string().optional(),
            question: z.string(),
            scopeItemIds: z.array(z.string()).max(200).optional(),
            isDefault: z.number().optional(),
            sortOrder: z.number().optional(),
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
          return wdb.createBdcqQuestion({
            id,
            projectId: input.projectId,
            module: input.module,
            question: input.question,
            category: input.category || "",
            scopeItemIds: input.scopeItemIds || [],
            isDefault: input.isDefault ?? 0,
            sortOrder: input.sortOrder ?? 0,
          });
        }),
      update: workflowEntityProcedure("bdcq_questions", true)
        .input(
          z.object({
            id: z.string(),
            data: z.record(z.string(), z.any()),
          })
        )
        .mutation(({ input }) => wdb.updateBdcqQuestion(input.id, input.data)),
      delete: workflowEntityProcedure("bdcq_questions", true)
        .input(z.object({ id: z.string() }))
        .mutation(({ input }) => wdb.deleteBdcqQuestion(input.id)),
      bulkCreate: workflowProjectProcedure(true)
        .input(
          z.object({
            projectId: z.string(),
            questions: z
              .array(
                z.object({
                  module: z.string().min(1),
                  category: z.string().optional(),
                  question: z.string().min(1),
                })
              )
              .min(1)
              .max(2000),
          })
        )
        .mutation(async ({ input }) => {
          const existing = await wdb.listBdcqQuestions(input.projectId);
          const normalize = (value: string) =>
            value.trim().toLocaleLowerCase("pt-BR");
          const known = new Set(
            existing.map((question: any) => normalize(question.question))
          );
          let added = 0;
          let ignored = 0;
          for (const question of input.questions) {
            if (known.has(normalize(question.question))) {
              ignored++;
              continue;
            }
            await wdb.createBdcqQuestion({
              id: nanoid(),
              projectId: input.projectId,
              module: question.module,
              category: question.category || "",
              question: question.question,
              isDefault: 0,
              sortOrder: existing.length + added,
            });
            known.add(normalize(question.question));
            added++;
          }
          return { added, ignored };
        }),
      seedDefaults: workflowProjectProcedure(true)
        .input(z.object({ projectId: z.string() }))
        .mutation(async ({ input }) => {
          return { added: await ensureBdcqTemplates(input.projectId) };
        }),
    }),
    answers: router({
      list: workflowProjectProcedure()
        .input(
          z.object({
            projectId: z.string(),
            questionIds: z.array(z.string()).max(500).optional(),
            ...paginationInput,
          })
        )
        .query(({ input }) =>
          input.questionIds
            ? wdb.listBdcqAnswersForQuestions(
                input.projectId,
                input.questionIds
              )
            : wdb.listBdcqAnswers(input.projectId, input)
        ),
      create: workflowProjectProcedure(true)
        .input(
          z.object({
            questionId: z.string(),
            projectId: z.string(),
            answer: z.string(),
            answeredBy: z.string().optional(),
            attachments: z.array(z.string()).optional(),
          })
        )
        .mutation(async ({ input }) => {
          const questionProjectId = await wdb.getWorkflowEntityProjectId(
            "bdcq_questions",
            input.questionId
          );
          if (questionProjectId !== input.projectId)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "A pergunta não pertence ao projeto selecionado",
            });
          const existing = await wdb.getBdcqAnswerByQuestion(
            input.projectId,
            input.questionId
          );
          if (existing)
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
      update: workflowEntityProcedure("bdcq_answers", true)
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
        .mutation(({ ctx, input }) =>
          wdb.updateBdcqAnswerWithHistory(
            input.id,
            input.data,
            nanoid(),
            ctx.user.name || ctx.user.email || "Usuário"
          )
        ),
      history: workflowEntityProcedure("bdcq_answers", false, "answerId")
        .input(z.object({ answerId: z.string() }))
        .query(({ input }) => wdb.listBdcqAnswerHistory(input.answerId)),
      delete: workflowEntityProcedure("bdcq_answers", true)
        .input(z.object({ id: z.string() }))
        .mutation(({ input }) => wdb.deleteBdcqAnswer(input.id)),
    }),
  }),

  // ===== Workshops =====
  workshops: router({
    list: workflowProjectProcedure()
      .input(z.object({ projectId: z.string(), ...paginationInput }))
      .query(({ input }) => wdb.listWorkshops(input.projectId, input)),
    create: workflowProjectProcedure(true)
      .input(
        z.object({
          projectId: z.string(),
          title: z.string(),
          module: z.string().optional(),
          scheduledDate: z.string().optional(),
          duration: z.string().optional(),
          participants: z.array(z.string()).optional(),
          agenda: z.array(z.string()).optional(),
          status: workshopStatusSchema.optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const id = nanoid();
        return wdb.createWorkshop({
          id,
          projectId: input.projectId,
          title: input.title,
          module: input.module || "",
          scheduledDate: input.scheduledDate || "",
          duration: input.duration || "",
          participants: input.participants || [],
          agenda: input.agenda || [],
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
            scheduledDate: z.string().optional(),
            duration: z.string().optional(),
            participants: z.array(z.string()).optional(),
            agenda: z.array(z.string()).optional(),
            status: workshopStatusSchema.optional(),
            notes: z.string().optional(),
          }),
        })
      )
      .mutation(({ input }) => wdb.updateWorkshop(input.id, input.data)),
    delete: workflowEntityProcedure("workshops", true)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => wdb.deleteWorkshop(input.id)),
    suggestAgenda: workflowProjectProcedure(true)
      .input(z.object({ projectId: z.string() }))
      .mutation(async ({ input }) => {
        const scopeItemsList = await wdb.listScopeItems(input.projectId);
        const questions = await wdb.listBdcqQuestions(input.projectId);
        const answers = await wdb.listBdcqAnswers(input.projectId);
        const requirements = await wdb.listClientRequirements(input.projectId);
        const answeredIds = new Set(answers.map((a: any) => a.questionId));
        const pendingQuestions = questions.filter(
          (q: any) => !answeredIds.has(q.id)
        );
        const prompt = `Você é um consultor SAP especialista em workshops de implementação S/4HANA.
Com base nos scope items e perguntas BDCQ pendentes abaixo, sugira uma agenda de workshops organizada por tema/módulo.

Scope Items (${scopeItemsList.length} total):
${scopeItemsList
  .slice(0, 20)
  .map((s: any) => `- ${s.name} (${s.module})`)
  .join("\n")}

Perguntas BDCQ Pendentes (${pendingQuestions.length} total):
${pendingQuestions
  .slice(0, 20)
  .map((q: any) => `- [${q.module}/${q.category}] ${q.question}`)
  .join("\n")}

Retorne a sugestão em formato markdown com workshops sugeridos, duração estimada e temas a cobrir.`;
        const ai = await getWorkflowAiConfig("agenda_suggestion");
        const result = await invokeWorkflowLLM({
          model: ai.model,
          messages: [
            { role: "system", content: ai.systemPrompt },
            { role: "user", content: prompt },
          ],
        });
        return {
          suggestion:
            (result.choices?.[0]?.message?.content as string) ||
            "Não foi possível gerar sugestão.",
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
        if (document.status !== "Aprovado")
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Apenas DCDs aprovados podem ser exportados em PDF",
          });
        const pdf = generateWorkflowPdf(document.title, document.content);
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
        const before = await wdb.getDcdDocument(input.id);
        const projectId =
          before?.projectId ||
          (await wdb.getWorkflowEntityProjectId("dcd_documents", input.id));
        await wdb.updateDcdDocument(input.id, input.data);
        if (projectId)
          await recordWorkflowAudit(
            ctx,
            projectId,
            input.data.status === "Aprovado" ? "DCD_APPROVED" : "DCD_UPDATED",
            "dcd",
            input.id,
            { fields: Object.keys(input.data), status: input.data.status }
          );
        if (
          projectId &&
          input.data.status === "Aprovado" &&
          before?.status !== "Aprovado"
        ) {
          await safeWorkflowNotification(
            projectId,
            "DCD aprovado",
            `${input.data.title || before?.title || "DCD"} foi aprovado por ${ctx.user.name || ctx.user.email || "um usuário"}.`
          );
        }
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
      .mutation(({ input }) => wdb.deleteDcdDocument(input.id)),
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
        const {
          filteredScope,
          filteredQuestions,
          filteredRequirements,
          answerMap,
          sourceHash,
        } = await getDcdGenerationContext(input.projectId, input.module);
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
        const answeredCount = filteredQuestions.filter((q: any) =>
          answerMap.has(q.id)
        ).length;
        const completion =
          filteredQuestions.length === 0
            ? 0
            : answeredCount / filteredQuestions.length;
        if (filteredQuestions.length > 0 && completion < 0.7) {
          const pending = filteredQuestions
            .filter((q: any) => !answerMap.has(q.id))
            .slice(0, 10);
          throw new Error(
            `Complete ao menos 70% do BDCQ antes de gerar o DCD. Progresso atual: ${Math.round(completion * 100)}%. Pendentes: ${pending.map((q: any) => q.question).join("; ")}`
          );
        }
        const prompt = `Você é um consultor SAP sênior. Gere um documento DCD (Design de Configuração Detalhada) para o módulo "${input.module || "Geral"}".

Scope Items relevantes (${filteredScope.length}):
${filteredScope
  .slice(0, 15)
  .map((s: any) => `- ${s.code || ""} ${s.name}`)
  .join("\n")}

Perguntas e Respostas BDCQ:
${filteredQuestions
  .slice(0, 15)
  .map((q: any) => {
    const ans = answerMap.get(q.id);
    return `Q: ${q.question}\nA: ${ans ? (ans as any).answer || "Sem resposta" : "Sem resposta"}`;
  })
  .join("\n\n")}

Requisitos do Cliente levantados nos workshops (${filteredRequirements.length}):
${
  filteredRequirements
    .slice(0, 40)
    .map(
      (requirement: any) =>
        `- [${requirement.priority}/${requirement.status}] ${requirement.code ? requirement.code + " - " : ""}${requirement.title}: ${requirement.description}${requirement.acceptanceCriteria ? `\n  Critérios de aceite: ${requirement.acceptanceCriteria}` : ""}`
    )
    .join("\n") || "- Nenhum requisito registrado"
}

Contexto SAP de referência:
${getSapKnowledgeContext(input.module)}

${DCD_FEW_SHOT_EXAMPLE}

O DCD deve conter:
1. Visão geral do processo
2. Configurações necessárias (transações, tabelas, campos)
3. Decisões de design
4. Gaps identificados (se houver)
5. Dependências e integrações
6. Cenários e critérios de teste
7. Matriz de rastreabilidade entre requisitos, BDCQ e decisões

Retorne em formato markdown profissional. Não copie os fatos do exemplo e não invente transações ou apps ausentes do contexto.`;
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
        await wdb.createDcdDocument({
          id,
          projectId: document.projectId,
          seriesId: document.seriesId || document.id,
          sourceHash: "",
          module: document.module || "",
          title,
          content,
          version,
          status: "Rascunho",
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
          description: z.string(),
          impact: gapImpactSchema.optional(),
          responsible: z.string().optional(),
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
          module: input.module || "",
          impact: input.impact || "Médio",
          responsible: input.responsible || "",
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
            description: z.string().min(1).optional(),
            impact: gapImpactSchema.optional(),
            responsible: z.string().optional(),
            resolution: z.string().optional(),
            status: gapStatusSchema.optional(),
          }),
        })
      )
      .mutation(async ({ ctx, input }) => {
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
    delete: workflowEntityProcedure("gaps", true)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => wdb.deleteGap(input.id)),
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
    delete: workflowEntityProcedure("configurations", true)
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => wdb.deleteConfiguration(input.id)),
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
          scenarios: scenarios.filter(item => item.type === "Integrado"),
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
            .filter(item => item.type === "Integrado" && item.code)
            .map(item => [item.code.trim().toLocaleLowerCase("pt-BR"), item])
        );
        let scenariosCreated = 0;
        let stepsCreated = 0;
        for (const row of input.rows) {
          const key = (row.scenarioCode || row.scenarioTitle)
            .trim()
            .toLocaleLowerCase("pt-BR");
          let scenario = byCode.get(key);
          if (!scenario) {
            scenario = await wdb.createWorkflowTestCase({
              id: nanoid(),
              projectId: input.projectId,
              type: "Integrado",
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
    list: workflowProjectProcedure()
      .input(
        z.object({
          projectId: z.string(),
          type: testTypeSchema.optional(),
          ...paginationInput,
        })
      )
      .query(async ({ input }) => {
        const rows = await wdb.listWorkflowTestCases(input.projectId, input);
        return input.type
          ? rows.filter((item: any) => item.type === input.type)
          : rows;
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
    update: workflowEntityProcedure("workflow_test_cases", true)
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
      .mutation(({ input }) => wdb.deleteWorkflowTestCase(input.id)),
    steps: router({
      list: workflowEntityProcedure("workflow_test_cases")
        .input(z.object({ testCaseId: z.string() }))
        .query(({ input }) => wdb.listWorkflowTestSteps(input.testCaseId)),
      create: workflowEntityProcedure("workflow_test_cases", true)
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
      update: workflowEntityProcedure("workflow_test_steps", true)
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
  upload: workflowProjectProcedure(true)
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
