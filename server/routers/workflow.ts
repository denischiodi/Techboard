import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import * as wdb from "./workflowDb";

export const workflowRouter = router({
  // ===== Scope Items =====
  scopeItems: router({
    list: protectedProcedure.input(z.object({ projectId: z.string() })).query(({ input }) =>
      wdb.listScopeItems(input.projectId)
    ),
    create: protectedProcedure.input(z.object({
      projectId: z.string(),
      module: z.string(),
      code: z.string().optional(),
      name: z.string(),
      processArea: z.string().optional(),
      description: z.string().optional(),
      active: z.number().optional(),
    })).mutation(async ({ input }) => {
      const id = nanoid();
      return wdb.createScopeItem({ id, module: input.module, name: input.name, projectId: input.projectId, code: input.code || "", processArea: input.processArea || "", description: input.description, active: input.active ?? 1 });
    }),
    update: protectedProcedure.input(z.object({
      id: z.string(),
      data: z.record(z.string(), z.any()),
    })).mutation(({ input }) => wdb.updateScopeItem(input.id, input.data)),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) =>
      wdb.deleteScopeItem(input.id)
    ),
    bulkCreate: protectedProcedure.input(z.object({
      projectId: z.string(),
      items: z.array(z.object({
        module: z.string(),
        code: z.string().optional(),
        name: z.string(),
        processArea: z.string().optional(),
        description: z.string().optional(),
        active: z.number().optional(),
      })),
    })).mutation(async ({ input }) => {
      const results = [];
      for (const item of input.items) {
        const id = nanoid();
        await wdb.createScopeItem({ id, projectId: input.projectId, module: item.module, name: item.name, code: item.code || "", processArea: item.processArea || "", description: item.description, active: item.active ?? 1 });
        results.push({ id, ...item });
      }
      return results;
    }),
  }),

  // ===== BDCQ =====
  bdcq: router({
    questions: router({
      list: protectedProcedure.input(z.object({ projectId: z.string() })).query(({ input }) =>
        wdb.listBdcqQuestions(input.projectId)
      ),
      create: protectedProcedure.input(z.object({
        projectId: z.string(),
        module: z.string(),
        category: z.string().optional(),
        question: z.string(),
        isDefault: z.number().optional(),
        sortOrder: z.number().optional(),
      })).mutation(async ({ input }) => {
        const id = nanoid();
        return wdb.createBdcqQuestion({ id, projectId: input.projectId, module: input.module, question: input.question, category: input.category || "", isDefault: input.isDefault ?? 0, sortOrder: input.sortOrder ?? 0 });
      }),
      update: protectedProcedure.input(z.object({
        id: z.string(),
        data: z.record(z.string(), z.any()),
      })).mutation(({ input }) => wdb.updateBdcqQuestion(input.id, input.data)),
      delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) =>
        wdb.deleteBdcqQuestion(input.id)
      ),
      seedDefaults: protectedProcedure.input(z.object({ projectId: z.string() })).mutation(async ({ input }) => {
        const existing = await wdb.listBdcqQuestions(input.projectId);
        const existingQuestions = new Set(existing.map((q: any) => q.question));
        const defaultQuestions = [
          { module: "SD", category: "Pricing", question: "Quais tipos de condição de preço são utilizados?" },
          { module: "SD", category: "Pricing", question: "Existe política de descontos? Quais regras?" },
          { module: "SD", category: "Sales Order", question: "Quais tipos de pedido de venda são utilizados?" },
          { module: "SD", category: "Delivery", question: "Como funciona o processo de expedição?" },
          { module: "SD", category: "Billing", question: "Quais tipos de faturamento são utilizados?" },
          { module: "MM", category: "Purchasing", question: "Quais tipos de pedido de compra são utilizados?" },
          { module: "MM", category: "Purchasing", question: "Existe processo de aprovação de compras? Quais alçadas?" },
          { module: "MM", category: "Inventory", question: "Quais tipos de movimento de estoque são utilizados?" },
          { module: "MM", category: "Invoice Verification", question: "Como funciona a verificação de faturas?" },
          { module: "FI", category: "General Ledger", question: "Qual o plano de contas utilizado?" },
          { module: "FI", category: "Accounts Payable", question: "Quais condições de pagamento são praticadas?" },
          { module: "FI", category: "Accounts Receivable", question: "Como funciona o processo de cobrança?" },
          { module: "FI", category: "Tax", question: "Quais impostos incidem nas operações? (ICMS, IPI, PIS, COFINS, ISS)" },
          { module: "FI", category: "Tax", question: "Utiliza motor fiscal externo? Qual?" },
          { module: "CO", category: "Cost Center", question: "Qual a estrutura de centros de custo?" },
          { module: "CO", category: "Profit Center", question: "Qual a estrutura de centros de lucro?" },
        ];
        let count = 0;
        for (const q of defaultQuestions) {
          if (!existingQuestions.has(q.question)) {
            await wdb.createBdcqQuestion({
              id: nanoid(),
              projectId: input.projectId,
              module: q.module,
              category: q.category,
              question: q.question,
              isDefault: 1,
              sortOrder: count,
            });
            count++;
          }
        }
        return { added: count };
      }),
    }),
    answers: router({
      list: protectedProcedure.input(z.object({ projectId: z.string() })).query(({ input }) =>
        wdb.listBdcqAnswers(input.projectId)
      ),
      create: protectedProcedure.input(z.object({
        questionId: z.string(),
        projectId: z.string(),
        answer: z.string(),
        answeredBy: z.string().optional(),
        attachments: z.array(z.string()).optional(),
      })).mutation(async ({ input }) => {
        const id = nanoid();
        return wdb.createBdcqAnswer({ id, projectId: input.projectId, questionId: input.questionId, answer: input.answer, answeredBy: input.answeredBy || "", attachments: input.attachments || [] });
      }),
      update: protectedProcedure.input(z.object({
        id: z.string(),
        data: z.record(z.string(), z.any()),
      })).mutation(({ input }) => wdb.updateBdcqAnswer(input.id, input.data)),
      delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) =>
        wdb.deleteBdcqAnswer(input.id)
      ),
    }),
  }),

  // ===== Workshops =====
  workshops: router({
    list: protectedProcedure.input(z.object({ projectId: z.string() })).query(({ input }) =>
      wdb.listWorkshops(input.projectId)
    ),
    create: protectedProcedure.input(z.object({
      projectId: z.string(),
      title: z.string(),
      module: z.string().optional(),
      scheduledDate: z.string().optional(),
      duration: z.string().optional(),
      participants: z.array(z.string()).optional(),
      agenda: z.array(z.string()).optional(),
      status: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ input }) => {
      const id = nanoid();
      return wdb.createWorkshop({ id, projectId: input.projectId, title: input.title, module: input.module || "", scheduledDate: input.scheduledDate || "", duration: input.duration || "", participants: input.participants || [], agenda: input.agenda || [], status: input.status || "Planejado", notes: input.notes });
    }),
    update: protectedProcedure.input(z.object({
      id: z.string(),
      data: z.record(z.string(), z.any()),
    })).mutation(({ input }) => wdb.updateWorkshop(input.id, input.data)),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) =>
      wdb.deleteWorkshop(input.id)
    ),
    suggestAgenda: protectedProcedure.input(z.object({ projectId: z.string() })).mutation(async ({ input }) => {
      const scopeItemsList = await wdb.listScopeItems(input.projectId);
      const questions = await wdb.listBdcqQuestions(input.projectId);
      const answers = await wdb.listBdcqAnswers(input.projectId);
      const answeredIds = new Set(answers.map((a: any) => a.questionId));
      const pendingQuestions = questions.filter((q: any) => !answeredIds.has(q.id));
      const prompt = `Você é um consultor SAP especialista em workshops de implementação S/4HANA.
Com base nos scope items e perguntas BDCQ pendentes abaixo, sugira uma agenda de workshops organizada por tema/módulo.

Scope Items (${scopeItemsList.length} total):
${scopeItemsList.slice(0, 20).map((s: any) => `- ${s.name} (${s.module})`).join('\n')}

Perguntas BDCQ Pendentes (${pendingQuestions.length} total):
${pendingQuestions.slice(0, 20).map((q: any) => `- [${q.module}/${q.category}] ${q.question}`).join('\n')}

Retorne a sugestão em formato markdown com workshops sugeridos, duração estimada e temas a cobrir.`;
      const result = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
      return { suggestion: (result.choices?.[0]?.message?.content as string) || "Não foi possível gerar sugestão." };
    }),
    transcripts: router({
      list: protectedProcedure.input(z.object({ workshopId: z.string() })).query(({ input }) =>
        wdb.listTranscripts(input.workshopId)
      ),
      create: protectedProcedure.input(z.object({
        workshopId: z.string(),
        content: z.string(),
        fileUrl: z.string().optional(),
        uploadedBy: z.string().optional(),
      })).mutation(async ({ input }) => {
        const id = nanoid();
        return wdb.createTranscript({ id, workshopId: input.workshopId, content: input.content, fileUrl: input.fileUrl || "", uploadedBy: input.uploadedBy || "" });
      }),
      delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) =>
        wdb.deleteTranscript(input.id)
      ),
    }),
    minutes: router({
      get: protectedProcedure.input(z.object({ workshopId: z.string() })).query(({ input }) =>
        wdb.getMinutesByWorkshop(input.workshopId)
      ),
      generate: protectedProcedure.input(z.object({
        workshopId: z.string(),
      })).mutation(async ({ input }) => {
        const transcripts = await wdb.listTranscripts(input.workshopId);
        if (transcripts.length === 0) {
          return { error: "Nenhuma transcrição encontrada para gerar ata." };
        }
        const allContent = transcripts.map((t: any) => t.content || "").filter(Boolean).join("\n\n---\n\n");
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
        const result = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
        const content = (typeof result.choices?.[0]?.message?.content === 'string' ? result.choices[0].message.content : '') || "";
        const existing = await wdb.getMinutesByWorkshop(input.workshopId);
        if (existing) {
          await wdb.updateMinutes(existing.id, { content });
          return { id: existing.id, content };
        }
        const id = nanoid();
        await wdb.createMinutes({ id, workshopId: input.workshopId, content });
        return { id, content };
      }),
    }),
  }),

  // ===== DCD Documents =====
  dcd: router({
    list: protectedProcedure.input(z.object({ projectId: z.string() })).query(({ input }) =>
      wdb.listDcdDocuments(input.projectId)
    ),
    create: protectedProcedure.input(z.object({
      projectId: z.string(),
      module: z.string().optional(),
      title: z.string(),
      content: z.string().optional(),
      status: z.string().optional(),
    })).mutation(async ({ input }) => {
      const id = nanoid();
      return wdb.createDcdDocument({ id, projectId: input.projectId, title: input.title, content: input.content || "", module: input.module || "", status: input.status || "Rascunho" });
    }),
    update: protectedProcedure.input(z.object({
      id: z.string(),
      data: z.record(z.string(), z.any()),
    })).mutation(({ input }) => wdb.updateDcdDocument(input.id, input.data)),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) =>
      wdb.deleteDcdDocument(input.id)
    ),
    generate: protectedProcedure.input(z.object({
      projectId: z.string(),
      module: z.string().optional(),
    })).mutation(async ({ input }) => {
      const scopeItemsList = await wdb.listScopeItems(input.projectId);
      const questions = await wdb.listBdcqQuestions(input.projectId);
      const answers = await wdb.listBdcqAnswers(input.projectId);
      const answerMap = new Map(answers.map((a: any) => [a.questionId, a]));
      const filteredScope = input.module
        ? scopeItemsList.filter((s: any) => s.module === input.module)
        : scopeItemsList;
      const filteredQuestions = input.module
        ? questions.filter((q: any) => q.module === input.module)
        : questions;
      const prompt = `Você é um consultor SAP sênior. Gere um documento DCD (Design de Configuração Detalhada) para o módulo "${input.module || 'Geral'}".

Scope Items relevantes (${filteredScope.length}):
${filteredScope.slice(0, 15).map((s: any) => `- ${s.code || ''} ${s.name}`).join('\n')}

Perguntas e Respostas BDCQ:
${filteredQuestions.slice(0, 15).map((q: any) => {
  const ans = answerMap.get(q.id);
  return `Q: ${q.question}\nA: ${ans ? (ans as any).answer || 'Sem resposta' : 'Sem resposta'}`;
}).join('\n\n')}

O DCD deve conter:
1. Visão geral do processo
2. Configurações necessárias (transações, tabelas, campos)
3. Decisões de design
4. Gaps identificados (se houver)
5. Dependências e integrações

Retorne em formato markdown profissional.`;
      const result = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
      const content = (typeof result.choices?.[0]?.message?.content === 'string' ? result.choices[0].message.content : '') || "";
      const id = nanoid();
      const title = `DCD - ${input.module || 'Geral'} - ${new Date().toLocaleDateString('pt-BR')}`;
      await wdb.createDcdDocument({ id, projectId: input.projectId, module: input.module || "", title, content, status: "Rascunho" });
      return { id, title, content };
    }),
  }),

  // ===== Gaps =====
  gaps: router({
    list: protectedProcedure.input(z.object({ projectId: z.string() })).query(({ input }) =>
      wdb.listGaps(input.projectId)
    ),
    create: protectedProcedure.input(z.object({
      projectId: z.string(),
      dcdId: z.string().optional(),
      module: z.string().optional(),
      description: z.string(),
      impact: z.string().optional(),
      resolution: z.string().optional(),
      status: z.string().optional(),
    })).mutation(async ({ input }) => {
      const id = nanoid();
      return wdb.createGap({ id, projectId: input.projectId, description: input.description, dcdId: input.dcdId || "", module: input.module || "", impact: input.impact || "Médio", resolution: input.resolution, status: input.status || "Aberto" });
    }),
    update: protectedProcedure.input(z.object({
      id: z.string(),
      data: z.record(z.string(), z.any()),
    })).mutation(({ input }) => wdb.updateGap(input.id, input.data)),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) =>
      wdb.deleteGap(input.id)
    ),
    extractFromDcd: protectedProcedure.input(z.object({
      projectId: z.string(),
      dcdId: z.string(),
      dcdContent: z.string(),
    })).mutation(async ({ input }) => {
      const prompt = `Analise o DCD abaixo e extraia uma lista de gaps (funcionalidades não cobertas pelo padrão SAP que precisam de desenvolvimento/extensão).

DCD:
${input.dcdContent.slice(0, 6000)}

Retorne APENAS um JSON array com objetos no formato:
[{"description": "...", "impact": "Alto|Médio|Baixo", "module": "SD|MM|FI|CO|..."}]`;
      const result = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
      const rawContent = result.choices?.[0]?.message?.content || "[]";
      const content = typeof rawContent === 'string' ? rawContent : '';
      let gapsList: any[] = [];
      try {
        const match = content.match(/\[[\s\S]*\]/);
        if (match) gapsList = JSON.parse(match[0]);
      } catch { gapsList = []; }
      const created = [];
      for (const g of gapsList) {
        const id = nanoid();
        await wdb.createGap({
          id, projectId: input.projectId, dcdId: input.dcdId,
          description: g.description || "Gap sem descrição",
          impact: g.impact || "Médio",
          module: g.module || "",
          status: "Aberto",
        });
        created.push({ id, ...g });
      }
      return { extracted: created.length, gaps: created };
    }),
  }),

  // ===== Configurations =====
  configurations: router({
    list: protectedProcedure.input(z.object({ projectId: z.string() })).query(({ input }) =>
      wdb.listConfigurations(input.projectId)
    ),
    create: protectedProcedure.input(z.object({
      projectId: z.string(),
      module: z.string().optional(),
      category: z.string().optional(),
      description: z.string(),
      responsible: z.string().optional(),
      status: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ input }) => {
      const id = nanoid();
      return wdb.createConfiguration({ id, projectId: input.projectId, description: input.description, module: input.module || "", category: input.category || "", responsible: input.responsible || "", status: input.status || "Pendente", notes: input.notes });
    }),
    update: protectedProcedure.input(z.object({
      id: z.string(),
      data: z.record(z.string(), z.any()),
    })).mutation(({ input }) => wdb.updateConfiguration(input.id, input.data)),
    delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) =>
      wdb.deleteConfiguration(input.id)
    ),
  }),

  // ===== File Upload =====
  upload: protectedProcedure.input(z.object({
    fileName: z.string(),
    fileData: z.string(), // base64
    contentType: z.string(),
  })).mutation(async ({ input }) => {
    const buffer = Buffer.from(input.fileData, "base64");
    const fileKey = `workflow/${nanoid()}-${input.fileName}`;
    const { url } = await storagePut(fileKey, buffer, input.contentType);
    return { url, key: fileKey };
  }),
});
