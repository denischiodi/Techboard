CREATE TABLE IF NOT EXISTS "activity_templates" (
  "id" varchar(64) PRIMARY KEY,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "priority" varchar(16) DEFAULT 'Média' NOT NULL,
  "recurrence" varchar(16) DEFAULT 'none' NOT NULL,
  "weekday" integer DEFAULT 1 NOT NULL,
  "monthDay" integer DEFAULT 1 NOT NULL,
  "dueOffsetDays" integer DEFAULT 0 NOT NULL,
  "ownerRole" varchar(32) DEFAULT 'manager' NOT NULL,
  "appliesToAllProjects" boolean DEFAULT true NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "createdByUserId" varchar(64) NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "activity_templates_priority_check" CHECK ("priority" IN ('Baixa', 'Média', 'Alta', 'Crítica')),
  CONSTRAINT "activity_templates_recurrence_check" CHECK ("recurrence" IN ('none', 'weekly', 'monthly')),
  CONSTRAINT "activity_templates_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
  CONSTRAINT "activity_templates_month_day_check" CHECK ("monthDay" BETWEEN 1 AND 31),
  CONSTRAINT "activity_templates_due_offset_check" CHECK ("dueOffsetDays" BETWEEN 0 AND 3650),
  CONSTRAINT "activity_templates_owner_role_check" CHECK ("ownerRole" IN ('manager', 'technical_lead', 'consultant'))
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "activity_template_projects" (
  "templateId" varchar(64) NOT NULL REFERENCES "activity_templates"("id") ON DELETE CASCADE,
  "projectId" varchar(64) NOT NULL,
  "assigneeUserId" varchar(64) DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("templateId", "projectId")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_template_projects_project_idx" ON "activity_template_projects" ("projectId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_templates_active_idx" ON "activity_templates" ("active");--> statement-breakpoint

ALTER TABLE "workflow_bdcq_templates" ADD COLUMN IF NOT EXISTS "required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "required" boolean DEFAULT false NOT NULL;--> statement-breakpoint

INSERT INTO "workflow_bdcq_templates" ("id", "question", "category", "modules", "scopeItemKeys", "active", "required", "createdBy") VALUES
  ('sap-sd-pricing', 'Quais tipos de condição de preço são utilizados?', 'Pricing', '["SD"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-sd-sales-order', 'Quais tipos de pedido de venda e fluxos de aprovação são necessários?', 'Sales Order', '["SD"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-sd-delivery', 'Como funciona o processo de expedição e quais exceções existem?', 'Delivery', '["SD"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-sd-billing', 'Quais tipos de faturamento e regras de cancelamento são utilizados?', 'Billing', '["SD"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-mm-purchasing-types', 'Quais tipos de pedido de compra são utilizados?', 'Purchasing', '["MM"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-mm-purchasing-release', 'Quais alçadas e estratégias de liberação de compras são necessárias?', 'Purchasing', '["MM"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-mm-inventory', 'Quais movimentos, depósitos e controles de estoque são utilizados?', 'Inventory', '["MM"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-mm-invoice', 'Como funciona a verificação de faturas e suas tolerâncias?', 'Invoice Verification', '["MM"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-fi-gl', 'Qual plano de contas e quais princípios contábeis serão utilizados?', 'General Ledger', '["FI"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-fi-ap', 'Quais condições e métodos de pagamento são praticados?', 'Accounts Payable', '["FI"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-fi-ar', 'Como funcionam cobrança, crédito e conciliação de clientes?', 'Accounts Receivable', '["FI"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-fi-tax', 'Quais impostos e motores fiscais incidem nas operações?', 'Tax', '["FI"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-co-cost-center', 'Qual a estrutura de centros de custo e ciclos de rateio?', 'Cost Center', '["CO"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-co-profit-center', 'Qual a estrutura de centros de lucro e segmentação gerencial?', 'Profit Center', '["CO"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-co-controlling', 'Quais fechamentos, alocações e relatórios gerenciais são necessários?', 'Controlling', '["CO"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-pp-planning', 'Como são executados previsão, MRP e planejamento de capacidade?', 'Planning', '["PP"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-pp-production', 'Quais tipos de ordem e estratégias de produção são utilizados?', 'Production', '["PP"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-pp-master-data', 'Como serão mantidas listas técnicas, roteiros e versões de produção?', 'Master Data', '["PP"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-wm-warehouse', 'Quais estruturas de depósito, estratégias de entrada e retirada são necessárias?', 'Warehouse', '["WM"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-ewm-warehouse', 'Quais processos inbound, outbound e internos serão executados no EWM?', 'Warehouse', '["EWM"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-qm-quality', 'Quais tipos de inspeção e planos de controle de qualidade são necessários?', 'Quality', '["QM"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-pm-maintenance', 'Quais estratégias, planos e ordens de manutenção são utilizados?', 'Maintenance', '["PM"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-ps-projects', 'Como serão estruturados projetos, EAP, redes, orçamento e apropriações?', 'Projects', '["PS"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-hcm-people', 'Quais estruturas organizacionais e integrações de dados de pessoas são necessárias?', 'People', '["HCM"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema'),
  ('sap-basis-technical', 'Quais ambientes, integrações, perfis e requisitos não funcionais devem ser atendidos?', 'Technical', '["BASIS"]'::jsonb, '[]'::jsonb, 1, false, 'Sistema')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "bdcq_questions" q
SET "templateId" = t."id", "required" = t."required", "updatedAt" = now()
FROM "workflow_bdcq_templates" t
WHERE q."templateId" = ''
  AND q."question" = t."question"
  AND t."modules" ? q."module";
