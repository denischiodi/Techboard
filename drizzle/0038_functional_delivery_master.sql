WITH catalog AS (
  SELECT *
  FROM jsonb_to_recordset($catalog$
  [
    {"id":"fd-disc-01","phase":"Discover","stage":"governance","workstream":"Escopo e venda","title":"Ler proposta comercial e técnica","owner":"consultant","offset":0,"evidence":"Checklist de leitura e resumo funcional"},
    {"id":"fd-disc-02","phase":"Discover","stage":"governance","workstream":"Escopo e venda","title":"Identificar premissas, exclusões e responsabilidades","owner":"consultant","offset":1,"evidence":"Matriz contratado × não contratado"},
    {"id":"fd-disc-03","phase":"Discover","stage":"governance","workstream":"Escopo e venda","title":"Mapear riscos, dúvidas e inconsistências iniciais","owner":"consultant","offset":2,"evidence":"Registro inicial de riscos e dúvidas"},
    {"id":"fd-disc-04","phase":"Discover","stage":"governance","workstream":"Handover","title":"Participar do handover comercial para delivery","owner":"manager","offset":3,"evidence":"Ata de handover e plano de ações"},

    {"id":"fd-prep-01","phase":"Prepare","stage":"scope-items","workstream":"DDA","title":"Receber e validar a versão vigente do DDA","owner":"consultant","offset":4,"evidence":"DDA controlado"},
    {"id":"fd-prep-02","phase":"Prepare","stage":"scope-items","workstream":"DDA","title":"Identificar scope items da frente","owner":"consultant","offset":5,"evidence":"Lista de scope items por frente"},
    {"id":"fd-prep-03","phase":"Prepare","stage":"scope-items","workstream":"DDA","title":"Conciliar proposta, DDA e scope items","owner":"consultant","offset":6,"evidence":"Matriz Proposta × DDA × Scope Item"},
    {"id":"fd-prep-04","phase":"Prepare","stage":"scope-items","workstream":"Dependências","title":"Mapear módulos, dados, integrações, IAM e relatórios","owner":"consultant","offset":7,"evidence":"Mapa de dependências"},
    {"id":"fd-prep-05","phase":"Prepare","stage":"bdcq","workstream":"BDCQ","title":"Baixar catálogo BDCQ aplicável à release","owner":"consultant","offset":8,"evidence":"BDCQ original controlado"},
    {"id":"fd-prep-06","phase":"Prepare","stage":"bdcq","workstream":"BDCQ","title":"Filtrar perguntas L2 destinadas ao cliente","owner":"consultant","offset":9,"evidence":"Pacote BDCQ L2"},
    {"id":"fd-prep-07","phase":"Prepare","stage":"bdcq","workstream":"BDCQ","title":"Separar perguntas L3 e técnicas do consultor","owner":"consultant","offset":10,"evidence":"Lista L3 do consultor"},
    {"id":"fd-prep-08","phase":"Prepare","stage":"bdcq","workstream":"BDCQ","title":"Definir responsáveis, instruções e prazos do BDCQ","owner":"consultant","offset":11,"evidence":"Controle de responsáveis e prazos"},
    {"id":"fd-prep-09","phase":"Prepare","stage":"bdcq","workstream":"BDCQ","title":"Enviar BDCQ ao cliente e acompanhar retorno","owner":"consultant","offset":12,"evidence":"Envio e controle de pendências"},
    {"id":"fd-prep-10","phase":"Prepare","stage":"bdcq","workstream":"BDCQ","title":"Revisar, esclarecer e aprovar respostas do BDCQ","owner":"consultant","offset":15,"evidence":"BDCQ revisado e aprovado"},
    {"id":"fd-prep-11","phase":"Prepare","stage":"workshops","workstream":"Workshops","title":"Criar plano geral de workshops por cenário","owner":"consultant","offset":10,"evidence":"Plano geral de workshops"},
    {"id":"fd-prep-12","phase":"Prepare","stage":"workshops","workstream":"Workshops","title":"Preparar agenda, apresentação e roteiro Fit-to-Standard","owner":"consultant","offset":14,"evidence":"Agenda e material do workshop"},
    {"id":"fd-prep-13","phase":"Prepare","stage":"workshops","workstream":"Workshops","title":"Preparar ambiente, acessos e massa de demonstração","owner":"consultant","offset":15,"evidence":"Ambiente validado e massa pronta"},
    {"id":"fd-prep-14","phase":"Prepare","stage":"governance","workstream":"Governança","title":"Confirmar participantes, aprovadores e repositório","owner":"manager","offset":8,"evidence":"Lista de participantes e governança"},
    {"id":"fd-prep-15","phase":"Prepare","stage":"governance","workstream":"Quality Gate","title":"Realizar Quality Gate de Prepare","owner":"manager","offset":18,"evidence":"Aceite do Gate Prepare"},

    {"id":"fd-expl-01","phase":"Explore","stage":"workshops","workstream":"Workshop","title":"Executar workshop Fit-to-Standard por cenário","owner":"consultant","offset":20,"evidence":"Evidências e decisões do workshop"},
    {"id":"fd-expl-02","phase":"Explore","stage":"workshops","workstream":"Workshop","title":"Gravar reunião com autorização","owner":"consultant","offset":20,"evidence":"Gravação autorizada e armazenada"},
    {"id":"fd-expl-03","phase":"Explore","stage":"workshops","workstream":"Workshop","title":"Gerar e revisar transcrição","owner":"consultant","offset":21,"evidence":"Transcrição revisada"},
    {"id":"fd-expl-04","phase":"Explore","stage":"workshops","workstream":"Workshop","title":"Elaborar, enviar e aprovar ata","owner":"consultant","offset":22,"evidence":"Ata de workshop aprovada"},
    {"id":"fd-expl-05","phase":"Explore","stage":"workshops","workstream":"Requisitos","title":"Levantar requisitos e regras de negócio","owner":"consultant","offset":23,"evidence":"Catálogo de requisitos"},
    {"id":"fd-expl-06","phase":"Explore","stage":"workshops","workstream":"Requisitos","title":"Criar histórias de usuário e critérios de aceite","owner":"consultant","offset":24,"evidence":"Histórias e critérios de aceite"},
    {"id":"fd-expl-07","phase":"Explore","stage":"dcd","workstream":"Requisitos","title":"Classificar Fit, configuração, gap ou fora do escopo","owner":"consultant","offset":25,"evidence":"Matriz Fit-to-Standard"},
    {"id":"fd-expl-08","phase":"Explore","stage":"dcd","workstream":"DCD","title":"Consolidar proposta, DDA, BDCQ, atas e requisitos","owner":"consultant","offset":26,"evidence":"Base de rastreabilidade do DCD"},
    {"id":"fd-expl-09","phase":"Explore","stage":"dcd","workstream":"DCD","title":"Elaborar DCD com processo TO-BE e configuração","owner":"consultant","offset":30,"evidence":"DCD preliminar"},
    {"id":"fd-expl-10","phase":"Explore","stage":"dcd","workstream":"DCD","title":"Revisar DCD com frentes e arquitetura","owner":"consultant","offset":32,"evidence":"DCD revisado"},
    {"id":"fd-expl-11","phase":"Explore","stage":"dcd","workstream":"DCD","title":"Apresentar e obter aprovação do DCD","owner":"consultant","offset":35,"evidence":"DCD aprovado e baseline"},
    {"id":"fd-expl-12","phase":"Explore","stage":"gaps","workstream":"Gaps","title":"Criar e consolidar Fit-Gap List","owner":"consultant","offset":32,"evidence":"Fit-Gap List"},
    {"id":"fd-expl-13","phase":"Explore","stage":"gaps","workstream":"Gaps","title":"Avaliar alternativas standard e Clean Core","owner":"consultant","offset":33,"evidence":"Decisão de solução"},
    {"id":"fd-expl-14","phase":"Explore","stage":"gaps","workstream":"Gaps","title":"Obter estimativas funcional e técnica","owner":"consultant","offset":34,"evidence":"Estimativas do gap"},
    {"id":"fd-expl-15","phase":"Explore","stage":"gaps","workstream":"Gaps","title":"Aprovar gap e Change Request quando necessário","owner":"manager","offset":36,"evidence":"Aprovação do gap ou Change Request"},
    {"id":"fd-expl-16","phase":"Explore","stage":"gaps","workstream":"SMD","title":"Elaborar SMD — documento de mudança do gap","owner":"consultant","offset":37,"evidence":"SMD do gap"},
    {"id":"fd-expl-17","phase":"Explore","stage":"gaps","workstream":"SMD","title":"Revisar impactos do SMD em testes, dados, segurança e cutover","owner":"technical_lead","offset":38,"evidence":"Análise de impactos do SMD"},
    {"id":"fd-expl-18","phase":"Explore","stage":"gaps","workstream":"SMD","title":"Obter aprovação funcional, técnica e comercial do SMD","owner":"manager","offset":40,"evidence":"SMD aprovado"},
    {"id":"fd-expl-19","phase":"Explore","stage":"governance","workstream":"Planejamento","title":"Planejar testes, dados, IAM e treinamento","owner":"manager","offset":38,"evidence":"Planos transversais"},
    {"id":"fd-expl-20","phase":"Explore","stage":"governance","workstream":"Quality Gate","title":"Realizar Quality Gate de Explore","owner":"manager","offset":42,"evidence":"Aceite do Gate Explore"},

    {"id":"fd-real-01","phase":"Realize","stage":"configurations","workstream":"Sprint","title":"Montar e priorizar backlog a partir do DCD, BDCQ e SMD","owner":"manager","offset":43,"evidence":"Backlog priorizado"},
    {"id":"fd-real-02","phase":"Realize","stage":"configurations","workstream":"Sprint","title":"Planejar sprints e dependências","owner":"manager","offset":44,"evidence":"Plano de sprints"},
    {"id":"fd-real-03","phase":"Realize","stage":"configurations","workstream":"Configuração","title":"Executar configurações aprovadas","owner":"consultant","offset":45,"evidence":"Configuração realizada"},
    {"id":"fd-real-04","phase":"Realize","stage":"configurations","workstream":"Configuração","title":"Registrar parâmetros, evidências e transportes","owner":"consultant","offset":46,"evidence":"Workbook e log de transportes"},
    {"id":"fd-real-05","phase":"Realize","stage":"gaps","workstream":"Desenvolvimento","title":"Elaborar especificação funcional dos gaps","owner":"consultant","offset":45,"evidence":"Especificação funcional aprovada"},
    {"id":"fd-real-06","phase":"Realize","stage":"gaps","workstream":"Desenvolvimento","title":"Apoiar construção e esclarecer dúvidas técnicas","owner":"consultant","offset":48,"evidence":"Registro de dúvidas e decisões"},
    {"id":"fd-real-07","phase":"Realize","stage":"unit-tests","workstream":"Teste unitário","title":"Preparar casos e massa de teste unitário","owner":"consultant","offset":49,"evidence":"Casos de teste unitário"},
    {"id":"fd-real-08","phase":"Realize","stage":"unit-tests","workstream":"Teste unitário","title":"Executar teste unitário e registrar evidências","owner":"consultant","offset":50,"evidence":"Evidências e aceite unitário"},
    {"id":"fd-real-09","phase":"Realize","stage":"cycle-1","workstream":"Teste integrado","title":"Preparar roteiro end-to-end","owner":"consultant","offset":51,"evidence":"Roteiro integrado"},
    {"id":"fd-real-10","phase":"Realize","stage":"cycle-1","workstream":"Teste integrado","title":"Executar e acompanhar testes integrados","owner":"consultant","offset":53,"evidence":"Evidências integradas"},
    {"id":"fd-real-11","phase":"Realize","stage":"cycle-2","workstream":"UAT","title":"Preparar e apoiar UAT do cliente","owner":"consultant","offset":56,"evidence":"Termo de aceite do UAT"},
    {"id":"fd-real-12","phase":"Realize","stage":"cycle-1","workstream":"Defeitos","title":"Registrar, classificar e fazer triagem dos defeitos","owner":"consultant","offset":53,"evidence":"Registro de defeitos"},
    {"id":"fd-real-13","phase":"Realize","stage":"cycle-1","workstream":"Defeitos","title":"Corrigir configuração e apoiar causa-raiz","owner":"consultant","offset":54,"evidence":"Correção ou workaround"},
    {"id":"fd-real-14","phase":"Realize","stage":"cycle-2","workstream":"Defeitos","title":"Executar reteste e regressão","owner":"consultant","offset":57,"evidence":"Evidência de reteste"},
    {"id":"fd-real-15","phase":"Realize","stage":"cutover","workstream":"Cutover","title":"Elaborar plano e runbook de cutover","owner":"manager","offset":55,"evidence":"Plano e runbook de cutover"},
    {"id":"fd-real-16","phase":"Realize","stage":"cutover","workstream":"Cutover","title":"Executar mock cutover e medir tempos","owner":"manager","offset":60,"evidence":"Relatório do mock cutover"},
    {"id":"fd-real-17","phase":"Realize","stage":"go-live","workstream":"Treinamento","title":"Preparar e entregar treinamento","owner":"consultant","offset":58,"evidence":"Materiais e lista de presença"},
    {"id":"fd-real-18","phase":"Realize","stage":"go-live","workstream":"Suporte","title":"Preparar base de conhecimento e handover","owner":"consultant","offset":60,"evidence":"Plano de suporte e base de conhecimento"},
    {"id":"fd-real-19","phase":"Realize","stage":"governance","workstream":"Quality Gate","title":"Realizar Quality Gate de Realize","owner":"manager","offset":62,"evidence":"Aceite do Gate Realize"},

    {"id":"fd-depl-01","phase":"Deploy","stage":"cutover","workstream":"Go/No-Go","title":"Consolidar prontidão, riscos e recomendação funcional","owner":"manager","offset":63,"evidence":"Checklist de prontidão"},
    {"id":"fd-depl-02","phase":"Deploy","stage":"cutover","workstream":"Go/No-Go","title":"Participar da reunião e formalizar Go/No-Go","owner":"manager","offset":64,"evidence":"Ata de Go/No-Go"},
    {"id":"fd-depl-03","phase":"Deploy","stage":"cutover","workstream":"Cutover","title":"Executar atividades funcionais do cutover","owner":"consultant","offset":65,"evidence":"Checklist de cutover executado"},
    {"id":"fd-depl-04","phase":"Deploy","stage":"cutover","workstream":"Cutover","title":"Validar cargas, reconciliações e transportes","owner":"consultant","offset":65,"evidence":"Evidências e reconciliações"},
    {"id":"fd-depl-05","phase":"Deploy","stage":"go-live","workstream":"Go-live","title":"Executar smoke tests em produção","owner":"consultant","offset":66,"evidence":"Evidências de smoke test"},
    {"id":"fd-depl-06","phase":"Deploy","stage":"go-live","workstream":"Go-live","title":"Formalizar aceite de início da operação","owner":"manager","offset":67,"evidence":"Aceite do go-live"},
    {"id":"fd-depl-07","phase":"Deploy","stage":"governance","workstream":"Quality Gate","title":"Realizar Quality Gate de Deploy","owner":"manager","offset":68,"evidence":"Aceite do Gate Deploy"},

    {"id":"fd-run-01","phase":"Run","stage":"go-live","workstream":"Hypercare","title":"Monitorar processos críticos e incidentes","owner":"consultant","offset":69,"evidence":"Relatório diário de hypercare"},
    {"id":"fd-run-02","phase":"Run","stage":"go-live","workstream":"Hypercare","title":"Classificar e tratar incidentes P1 a P4","owner":"consultant","offset":69,"evidence":"Soluções e workarounds"},
    {"id":"fd-run-03","phase":"Run","stage":"go-live","workstream":"Hypercare","title":"Executar correções, retestes e causa-raiz","owner":"consultant","offset":70,"evidence":"Evidências e análise de causa-raiz"},
    {"id":"fd-run-04","phase":"Run","stage":"closure","workstream":"Transição","title":"Atualizar base de conhecimento e transferir pendências","owner":"consultant","offset":72,"evidence":"Handover para suporte"},
    {"id":"fd-run-05","phase":"Run","stage":"closure","workstream":"Encerramento","title":"Atualizar DCD e SMD as built","owner":"consultant","offset":73,"evidence":"DCD e SMD finais"},
    {"id":"fd-run-06","phase":"Run","stage":"closure","workstream":"Encerramento","title":"Consolidar configurações, testes e rastreabilidade","owner":"consultant","offset":74,"evidence":"Pacote final de evidências"},
    {"id":"fd-run-07","phase":"Run","stage":"closure","workstream":"Encerramento","title":"Registrar lições aprendidas","owner":"manager","offset":75,"evidence":"Lições aprendidas"},
    {"id":"fd-run-08","phase":"Run","stage":"closure","workstream":"Encerramento","title":"Obter aceite final e encerrar a frente","owner":"manager","offset":76,"evidence":"Termo de encerramento"}
  ]
  $catalog$::jsonb) AS x(
    id text,
    phase text,
    stage text,
    workstream text,
    title text,
    owner text,
    "offset" integer,
    evidence text
  )
)
INSERT INTO "delivery_templates" (
  "id","type","title","description","instructions","phase","stage",
  "modules","scopeItemKeys","projectIds","required","sortOrder",
  "dependencyTemplateIds","ownerRole","dueOffsetDays","evidenceRequirements",
  "approvalPolicy","completionCriteria","payload","version","active","createdBy"
)
SELECT
  id,
  'activity',
  title,
  workstream,
  'Executar a atividade conforme o processo funcional e registrar as evidências no Kanban.',
  phase,
  stage,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  true,
  row_number() OVER (ORDER BY
    CASE phase
      WHEN 'Discover' THEN 1 WHEN 'Prepare' THEN 2 WHEN 'Explore' THEN 3
      WHEN 'Realize' THEN 4 WHEN 'Deploy' THEN 5 ELSE 6
    END,
    "offset",
    id
  ) * 10,
  '[]'::jsonb,
  owner,
  "offset",
  jsonb_build_array(evidence),
  CASE WHEN workstream = 'Quality Gate'
    THEN '{"mode":"all","minimumApprovals":1}'::jsonb
    ELSE '{"mode":"none","minimumApprovals":1}'::jsonb
  END,
  CASE WHEN workstream = 'Quality Gate'
    THEN 'Todos os itens obrigatórios da fase concluídos, evidências anexadas e aceite registrado.'
    ELSE 'Atividade concluída com a evidência obrigatória registrada.'
  END,
  jsonb_build_object(
    'workstream', workstream,
    'priority', CASE WHEN workstream IN ('Quality Gate','Go/No-Go') THEN 'Alta' ELSE 'Média' END,
    'standardProcess', 'consultor_funcional_v1'
  ),
  1,
  true,
  'system:functional-delivery-master'
FROM catalog
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

UPDATE "delivery_templates" gate
SET "dependencyTemplateIds" = dependencies.ids
FROM (
  SELECT
    gate_phase.phase,
    jsonb_agg(candidate."id" ORDER BY candidate."sortOrder") AS ids
  FROM (
    SELECT DISTINCT "phase"
    FROM "delivery_templates"
    WHERE "id" LIKE 'fd-%' AND "payload"->>'workstream' = 'Quality Gate'
  ) gate_phase
  JOIN "delivery_templates" candidate
    ON candidate."phase" = gate_phase.phase
   AND candidate."id" LIKE 'fd-%'
   AND candidate."payload"->>'workstream' <> 'Quality Gate'
  GROUP BY gate_phase.phase
) dependencies
WHERE gate."phase" = dependencies.phase
  AND gate."id" LIKE 'fd-%'
  AND gate."payload"->>'workstream' = 'Quality Gate'
  AND gate."dependencyTemplateIds" = '[]'::jsonb;--> statement-breakpoint

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
WHERE "id" LIKE 'fd-%'
ON CONFLICT ("templateId","version") DO NOTHING;
