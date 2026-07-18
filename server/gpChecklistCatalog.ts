import type { GpChecklistItemType } from "../shared/types";

export const GP_CHECKLIST_TEMPLATE_VERSION = "sap-activate-3sl-v1";

export const GP_PHASES = ["Discover", "Prepare", "Explore", "Realize", "Deploy", "Run"] as const;

export type GpChecklistCatalogItem = {
  key: string;
  phase: (typeof GP_PHASES)[number];
  workstream: string;
  title: string;
  description: string;
  ownerRole: string;
  itemType?: GpChecklistItemType;
};

const item = (
  key: string,
  phase: GpChecklistCatalogItem["phase"],
  workstream: string,
  title: string,
  ownerRole: string,
  description = "",
  itemType: GpChecklistItemType = "Atividade",
): GpChecklistCatalogItem => ({ key, phase, workstream, title, ownerRole, description, itemType });

export const GP_CHECKLIST_CATALOG: GpChecklistCatalogItem[] = [
  item("discover-cloud-trial", "Discover", "Customer Team Enablement", "Disponibilizar e validar o Cloud Trial", "Equipe do cliente"),
  item("discover-assessment", "Discover", "Application Design and Configuration", "Concluir Discovery Assessment", "Arquiteto de solução"),
  item("discover-value-scope", "Discover", "Application Design and Configuration", "Definir valor da aplicação e escopo inicial", "GP / Arquiteto de solução"),
  item("discover-cloud-mindset", "Discover", "Solution Adoption", "Realizar Cloud Mindset Assessment", "Líder de adoção"),

  item("prepare-onboarding", "Prepare", "Project Management", "Concluir Getting Started e Onboarding", "GP"),
  item("prepare-governance", "Prepare", "Project Management", "Definir iniciação e governança do projeto", "GP"),
  item("prepare-kickoff", "Prepare", "Project Management", "Definir padrões do projeto e realizar kick-off", "GP"),
  item("prepare-team-enablement", "Prepare", "Customer Team Enablement", "Concluir auto-capacitação da equipe e acesso às ferramentas", "Líder do cliente"),
  item("prepare-cloud-alm", "Prepare", "Technical Architecture and Infrastructure", "Solicitar e validar acesso inicial ao SAP Cloud ALM", "Arquiteto técnico"),
  item("prepare-cbc", "Prepare", "Technical Architecture and Infrastructure", "Solicitar e validar acesso inicial ao SAP Central Business Configuration", "Arquiteto técnico"),
  item("prepare-starter", "Prepare", "Technical Architecture and Infrastructure", "Solicitar e validar acesso inicial ao Starter System", "Arquiteto técnico"),
  item("prepare-bdcq", "Prepare", "Application Design and Configuration", "Concluir Business Driven Configuration Assessment", "Consultores funcionais"),
  item("prepare-solution-scope", "Prepare", "Application Design and Configuration", "Confirmar o escopo da solução", "GP / Arquiteto de solução"),
  item("prepare-fit-analysis", "Prepare", "Application Design and Configuration", "Preparar a análise Fit-to-Standard e o sistema", "Líder funcional"),
  item("prepare-integration", "Prepare", "Integration", "Preparar o setup de integração", "Arquiteto de integração"),
  item("prepare-data", "Prepare", "Data Management", "Definir abordagem e plano de dados", "Líder de dados"),
  item("prepare-enablement", "Prepare", "Solution Adoption", "Definir estratégia de enablement", "Líder de adoção"),
  item("prepare-analytics", "Prepare", "Analytics", "Definir abordagem e plano de analytics", "Líder de analytics"),
  item("qg-prepare", "Prepare", "Project Management", "Quality Gate de Prepare", "GP", "Validar critérios e aceite antes de avançar para Explore.", "Quality Gate"),

  item("explore-monitoring", "Explore", "Project Management", "Executar e monitorar o projeto", "GP"),
  item("explore-standard-processes", "Explore", "Customer Team Enablement", "Executar processos padrão com a equipe do cliente", "Key Users"),
  item("explore-fit-to-standard", "Explore", "Application Design and Configuration", "Executar análise Fit-to-Standard por cenário", "Consultores / Key Users", "Criar um ciclo repetível abaixo para cada cenário ou item de escopo."),
  item("explore-fit-documentation", "Explore", "Application Design and Configuration", "Concluir documentação Fit-to-Standard", "Líder funcional"),
  item("explore-iam", "Explore", "Application Design and Configuration", "Planejar Identity and Access Management", "Especialista IAM"),
  item("explore-extension", "Explore", "Extensibility", "Planejar e desenhar extensões", "Arquiteto de extensibilidade"),
  item("explore-integration", "Explore", "Integration", "Planejar e desenhar integrações", "Arquiteto de integração"),
  item("explore-testing", "Explore", "Testing", "Concluir planejamento de testes", "Líder de testes"),
  item("explore-data", "Explore", "Data Management", "Preparar cargas e migração de dados", "Líder de dados"),
  item("explore-ocm", "Explore", "Solution Adoption", "Executar Organizational Change Management", "Líder de adoção"),
  item("explore-learning", "Explore", "Solution Adoption", "Concluir análise de necessidades de aprendizagem", "Líder de adoção"),
  item("explore-analytics", "Explore", "Analytics", "Planejar e desenhar analytics", "Líder de analytics"),
  item("qg-explore", "Explore", "Project Management", "Quality Gate de Explore", "GP", "Validar escopo, requisitos, gaps, planos e aceites antes de Realize.", "Quality Gate"),

  item("realize-monitoring", "Realize", "Project Management", "Continuar execução e monitoramento do projeto", "GP"),
  item("realize-sprints", "Realize", "Project Management", "Planejar e executar sprints", "GP / Scrum Master"),
  item("realize-dev-access", "Realize", "Technical Architecture and Infrastructure", "Solicitar e receber acesso inicial ao Development System", "Arquiteto técnico"),
  item("realize-test-access", "Realize", "Technical Architecture and Infrastructure", "Solicitar e receber o Test System", "Arquiteto técnico"),
  item("realize-prod-access", "Realize", "Technical Architecture and Infrastructure", "Solicitar e receber o Production System", "Arquiteto técnico"),
  item("realize-release-cycles", "Realize", "Technical Architecture and Infrastructure", "Planejar ciclos de release e atualização", "Arquiteto técnico"),
  item("realize-required-config", "Realize", "Application Design and Configuration", "Concluir configurações requeridas", "Consultores funcionais"),
  item("realize-solution-config", "Realize", "Application Design and Configuration", "Concluir configuração da solução", "Consultores funcionais"),
  item("realize-iam-config", "Realize", "Application Design and Configuration", "Configurar Identity and Access no Development System", "Especialista IAM"),
  item("realize-new-scope", "Realize", "Application Design and Configuration", "Ativar novo escopo aprovado", "Arquiteto de solução"),
  item("realize-extensions", "Realize", "Extensibility", "Desenvolver e implantar extensões", "Equipe de extensibilidade"),
  item("realize-test-prep", "Realize", "Testing", "Concluir preparação de testes", "Líder de testes"),
  item("realize-test-exec", "Realize", "Testing", "Executar e encerrar testes", "Líder de testes"),
  item("realize-data-dev", "Realize", "Data Management", "Executar migração de dados em Development", "Líder de dados"),
  item("realize-data-test", "Realize", "Data Management", "Executar migração de dados em Test", "Líder de dados"),
  item("realize-cutover-prep", "Realize", "Data Management", "Concluir preparação do cutover", "Líder de cutover"),
  item("realize-handover", "Realize", "Operations and Support", "Definir plano de suporte, operações e handover", "Líder de operações"),
  item("realize-enablement-content", "Realize", "Solution Adoption", "Desenvolver e entregar conteúdo de enablement", "Líder de adoção"),
  item("realize-analytics-dev", "Realize", "Analytics", "Configurar analytics no Development Tenant", "Líder de analytics"),
  item("realize-analytics-test", "Realize", "Analytics", "Configurar e validar analytics no Test System", "Líder de analytics"),
  item("realize-analytics-prod", "Realize", "Analytics", "Preparar configuração de analytics para Production", "Líder de analytics"),
  item("qg-realize", "Realize", "Project Management", "Quality Gate de Realize", "GP", "Validar testes, dados, solução, cutover e prontidão para Deploy.", "Quality Gate"),

  item("deploy-monitoring", "Deploy", "Project Management", "Monitorar preparação e execução do go-live", "GP"),
  item("deploy-go-live", "Deploy", "Technical Architecture and Infrastructure", "Executar System Go-Live", "Arquiteto técnico"),
  item("deploy-production-cutover", "Deploy", "Data Management", "Executar Production Cutover", "Líder de cutover"),
  item("deploy-readiness", "Deploy", "Operations and Support", "Confirmar prontidão de operações", "Líder de operações"),
  item("qg-deploy", "Deploy", "Project Management", "Quality Gate de Deploy", "GP", "Formalizar aceite do go-live e transição para Run.", "Quality Gate"),

  item("run-release-technical", "Run", "Technical Architecture and Infrastructure", "Gerenciar ciclos técnicos de release e atualização", "Arquiteto técnico"),
  item("run-technical-operations", "Run", "Technical Architecture and Infrastructure", "Executar operações técnicas contínuas", "Líder de operações"),
  item("run-improvement", "Run", "Application Design and Configuration", "Gerenciar melhoria contínua", "Product Owner"),
  item("run-release-functional", "Run", "Application Design and Configuration", "Avaliar impactos funcionais de releases e atualizações", "Líder funcional"),
  item("run-new-scope", "Run", "Application Design and Configuration", "Avaliar e ativar novos escopos", "Product Owner"),
  item("run-integration", "Run", "Integration", "Operar e monitorar integrações", "Arquiteto de integração"),
  item("run-support-releases", "Run", "Operations and Support", "Preparar suporte para ciclos de release e atualização", "Líder de suporte"),
  item("run-support-operations", "Run", "Operations and Support", "Executar operações e suporte contínuos", "Líder de suporte"),
  item("run-value", "Run", "Solution Adoption", "Executar gestão de valor e adoção", "Líder de adoção"),
];

export const FIT_TO_STANDARD_STEPS = [
  { key: "review", title: "Revisar o fluxo do processo e as melhores práticas" },
  { key: "demonstrate", title: "Demonstrar o item de escopo e seus conceitos" },
  { key: "discuss", title: "Discutir os processos e requisitos com o cliente" },
  { key: "deltas", title: "Identificar requisitos delta e gaps" },
  { key: "configuration", title: "Identificar a configuração necessária" },
  { key: "customer-execution", title: "Permitir a execução dos cenários padrão pelo cliente" },
] as const;

const catalogKeys = new Set(GP_CHECKLIST_CATALOG.map(catalogItem => catalogItem.key));
if (catalogKeys.size !== GP_CHECKLIST_CATALOG.length) {
  throw new Error("O catálogo da Trilha do GP possui chaves de atividade duplicadas");
}

const fitToStandardStepKeys = new Set(FIT_TO_STANDARD_STEPS.map(step => step.key));
if (fitToStandardStepKeys.size !== FIT_TO_STANDARD_STEPS.length) {
  throw new Error("A trilha Fit-to-Standard possui chaves de etapa duplicadas");
}
