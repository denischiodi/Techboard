INSERT INTO "delivery_templates" (
  "id","type","title","description","instructions","phase","stage",
  "modules","scopeItemKeys","projectIds","required","sortOrder",
  "dependencyTemplateIds","ownerRole","dueOffsetDays","evidenceRequirements",
  "approvalPolicy","completionCriteria","payload","version","active","createdBy"
) VALUES (
  'fd-disc-00',
  'activity',
  'Consultar o Manual Detalhado do Consultor Funcional',
  'Orientação inicial obrigatória com o processo completo, entregáveis, responsabilidades e critérios de conclusão.',
  'Abra a TechEduca, leia o manual completo e use-o como referência durante todas as fases do projeto.',
  'Discover',
  'governance',
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  true,
  0,
  '[]'::jsonb,
  'consultant',
  0,
  '["Confirmação de leitura do manual e alinhamento das responsabilidades"]'::jsonb,
  '{"mode":"none","minimumApprovals":1}'::jsonb,
  'Consultor confirmou a leitura e compreendeu atividades, documentos, dependências, aprovações e uso do Kanban.',
  '{"workstream":"Onboarding","priority":"Alta","standardProcess":"consultor_funcional_v1","helpUrl":"/techdemais/techeduca/?lesson=consultor-functional-manual"}'::jsonb,
  1,
  true,
  'system:functional-delivery-master'
) ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "delivery_template_versions" (
  "id","templateId","version","snapshot","changedBy"
)
SELECT
  'dtv_' || md5("id" || ':1'),
  "id",
  1,
  to_jsonb(t),
  'system:functional-delivery-master'
FROM "delivery_templates" t
WHERE "id"='fd-disc-00'
ON CONFLICT ("templateId","version") DO NOTHING;
