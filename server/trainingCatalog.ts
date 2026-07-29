export type TrainingLessonSeed = {
  id: string;
  title: string;
  summary: string;
  route: string;
  keywords: string[];
  audiences: string[];
  content: string;
};

export type TrainingModuleSeed = {
  id: string;
  title: string;
  description: string;
  lessons: TrainingLessonSeed[];
};

export type TrainingCourseSeed = {
  id: string;
  title: string;
  description: string;
  category: string;
  color: string;
  modules: TrainingModuleSeed[];
};

const VALIDATIONS_BY_ROUTE: Record<string, string[]> = {
  "/": [
    "A sessão precisa estar válida; código expirado, já utilizado ou associado a outro e-mail não autentica o usuário.",
    "O usuário deve estar ativo e possuir ao menos permissão de visualização para que produtos, indicadores e resultados sejam exibidos.",
    "Projeto e período selecionados limitam os dados consultados; resultados fora desse contexto não são considerados erro de pesquisa.",
  ],
  "/techboard": [
    "Os indicadores consideram somente registros visíveis ao usuário e compatíveis com o período e os filtros ativos.",
    "Sobrealocação existe quando as horas planejadas superam a capacidade disponível após considerar férias e ausências.",
    "Alertas só desaparecem quando o cadastro ou a alocação que os originou deixa de atender à condição de exceção.",
  ],
  "/techboard/resources": [
    "Nome, situação e dados funcionais obrigatórios devem ser informados; e-mail, quando preenchido, precisa ter formato válido.",
    "Vínculos de grupo, frente, contrato, férias e saída precisam usar opções ativas dos cadastros gerais.",
    "A importação valida cabeçalhos, tipos, datas, valores permitidos e duplicidades antes de confirmar cada linha.",
    "A exclusão é bloqueada quando o recurso possui usuário, alocação, ausência ou outro histórico dependente.",
  ],
  "/techboard/projects": [
    "Nome, cliente, período e responsáveis obrigatórios devem estar preenchidos, e a data final não pode anteceder a inicial.",
    "Gestores, patrocinadores, frentes e OIs precisam existir e estar compatíveis com o projeto.",
    "Marcos devem permanecer dentro de uma sequência cronológica coerente; regenerar o cronograma pode substituir ajustes ainda não consolidados.",
    "A exclusão é bloqueada enquanto existirem fases, alocações, entregáveis ou demais dependências do projeto.",
  ],
  "/techboard/absences": [
    "Recurso, tipo, início e fim são obrigatórios, e a data final não pode anteceder a inicial.",
    "Períodos coincidentes para o mesmo recurso são sinalizados para evitar redução duplicada de capacidade.",
    "A importação valida identificação do recurso, tipo de ausência, formato das datas e consistência do período linha a linha.",
    "Alterar ou excluir uma ausência recalcula a disponibilidade e pode mudar alertas e sobrealocações no Planner.",
  ],
  "/techboard/planner": [
    "Recurso, projeto, período, horas e situação da alocação são validados antes de salvar.",
    "A data final não pode anteceder a inicial; fase ou marco selecionado deve pertencer ao mesmo projeto.",
    "Horas negativas ou inválidas são recusadas; horas acima da capacidade geram sobrealocação e exigem confirmação ou correção conforme a permissão.",
    "Arrastar ou redimensionar executa as mesmas validações do formulário e pode ser recusado quando cria período inválido ou conflito protegido.",
    "Ausências, data de saída e limites do projeto são recalculados após cada alteração.",
  ],
  "/techboard/org-chart": [
    "A estrutura exibe apenas recursos, grupos, frentes e projetos visíveis e corretamente vinculados.",
    "Itens sem liderança, gestor, grupo ou alocação válida aparecem incompletos até a correção do cadastro de origem.",
  ],
  "/techlead": [
    "Indicadores são calculados somente com projetos e equipes permitidos ao usuário e dentro dos filtros selecionados.",
    "Atalhos respeitam a permissão da tela de destino; visualizar um indicador não concede permissão para modificar sua origem.",
  ],
  "/techlead/teams": [
    "A composição depende de recursos ativos, frentes existentes e alocações vigentes no projeto.",
    "Capacidade e situação são recalculadas a partir do TechBoard; inconsistências devem ser corrigidas no cadastro ou Planner de origem.",
  ],
  "/techlead/gp-track": [
    "Projeto, fase, atividade, responsável, papel e status precisam ser compatíveis com a Trilha do GP aplicada.",
    "Prazos inválidos ou anteriores a dependências obrigatórias são sinalizados antes da conclusão.",
    "Atividades obrigatórias sem evidência, responsável ou requisito previsto não podem ser concluídas quando o modelo exigir esses dados.",
    "Modelos Word aceitam somente arquivos e tamanhos permitidos; substituir ou remover modelo exige permissão administrativa.",
  ],
  "/techmove": [
    "O funil considera a etapa e o status efetivos de cada projeto permitido ao usuário.",
    "Alertas permanecem ativos enquanto entregáveis, responsáveis, prazos ou aprovações obrigatórias estiverem pendentes.",
  ],
  "/techmove/projects": [
    "Somente etapas pertencentes ao projeto ativo podem ser atualizadas.",
    "Entregáveis bloqueados por padrão, dependência ou aprovação não aceitam conclusão até que a condição seja atendida.",
    "Incorporar versão anterior exige confirmação e evita sobrescrever silenciosamente conteúdo já produzido.",
    "O relatório consolidado inclui apenas dados persistidos e visíveis no momento da geração.",
  ],
  "/techmove/scope-items": [
    "Código, nome, processo, módulo e demais campos obrigatórios são validados na criação e na importação.",
    "O importador verifica tipo do arquivo, cabeçalhos, linhas vazias, códigos repetidos e valores inválidos antes da confirmação.",
    "Itens já relacionados a BDCQ, workshops, configurações ou modelos não podem ser excluídos sem resolver as dependências.",
  ],
  "/techmove/bdcq": [
    "Pergunta, nível, módulo e identificação precisam ser válidos; perguntas L2 e L3 seguem responsabilidades e detalhamento diferentes.",
    "Consultor e key user devem estar ativos e vinculados ao projeto para receber responsabilidade ou aprovar.",
    "Envio para aprovação exige resposta e campos obrigatórios; anexos passam por validação de formato e tamanho.",
    "Somente aprovadores autorizados podem aprovar ou rejeitar; rejeição exige justificativa e reabertura preserva o histórico.",
    "Uma nova edição não apaga a versão anterior da resposta.",
  ],
  "/techmove/workshops": [
    "Objetivo, data, duração, módulos e responsáveis obrigatórios devem estar preenchidos antes de salvar.",
    "Horário, duração e agenda precisam formar um período válido; convidados devem possuir e-mail utilizável.",
    "Transcrição automática exige mídia em formato e tamanho suportados; a ata só deve ser finalizada após revisão do conteúdo gerado.",
    "Requisitos exigem descrição, critério de aceite, prioridade, categoria e responsável quando marcados como confirmados.",
  ],
  "/techmove/dcd": [
    "A geração exige projeto, módulo e fontes mínimas disponíveis; ausência de BDCQ, escopo ou conteúdo relacionado é informada.",
    "Conteúdo em cache só é reutilizado quando corresponde ao projeto, módulo e versão esperados.",
    "Cada edição, refinamento, restauração ou geração cria uma versão rastreável; restaurar não apaga versões posteriores.",
    "Aprovação em lote considera somente documentos elegíveis e não aprovados; documentos bloqueados ou incompletos são ignorados ou recusados.",
    "Exportação e publicação de modelo validam conteúdo, arquivo Word, situação e permissão administrativa.",
  ],
  "/techmove/gaps": [
    "Descrição, módulo, impacto, responsável e status obrigatórios são verificados antes de salvar.",
    "Extração por IA apresenta sugestões para seleção; nenhum gap deve ser persistido sem confirmação do usuário.",
    "Atualização em lote só afeta itens selecionados e elegíveis para a transição de status.",
    "Exclusão pode ser bloqueada por dependências e exige confirmação para preservar rastreabilidade.",
  ],
  "/techmove/configurations": [
    "Categoria, descrição, responsável, status e dependências obrigatórias precisam ser válidos.",
    "Geração por BDCQ ou DCD usa somente fontes elegíveis do projeto e evita duplicações identificáveis.",
    "Dependências devem apontar para registros existentes; conclusão pode ser impedida enquanto pré-requisitos estiverem pendentes.",
    "Prompt personalizado é validado antes de ativar; restaurar retorna ao modelo padrão publicado.",
  ],
  "/techmove/tests": [
    "Cenário exige código, tipo, processo, módulo, descrição e responsável válidos; códigos repetidos são sinalizados.",
    "Cada etapa E2E deve ter ordem, ação e resultado esperado; a execução deve registrar status e resultado obtido.",
    "Evidências passam por validação de arquivo, e uma etapa não pode ser aprovada quando o resultado obrigatório estiver ausente.",
    "Importação valida estrutura, valores permitidos e relacionamento entre cenário e etapas antes de persistir.",
  ],
  "/techmove/governance": [
    "Uma política só pode ser ativada com tipo de entregável, aprovadores e regra de decisão válidos.",
    "Na regra Todos, cada aprovador precisa decidir; em Mínimo N, o número deve ser maior que zero e não superar a quantidade de aprovadores.",
    "A submissão exige versão elegível do entregável; rejeição exige justificativa e a correção cria nova versão quando aplicável.",
    "A preparação só pode ser concluída quando todas as verificações obrigatórias estiverem atendidas; reabrir preserva decisões anteriores.",
  ],
  "/techmove/raid": [
    "Issue e risco possuem campos e cálculos distintos; probabilidade é obrigatória para risco e o código de rastreamento não pode ser duplicado.",
    "Título, categoria, severidade ou impacto, responsável, prazo e plano de ação são validados conforme o tipo.",
    "Transições de status incompatíveis com pendências obrigatórias são recusadas.",
    "Exclusão exige justificativa e confirmação e mantém o evento no histórico de auditoria.",
  ],
  "/techtask": [
    "Indicadores consideram somente atividades visíveis, não arquivadas e compatíveis com projeto, responsável e filtros.",
    "Atrasos, bloqueios e prioridades são derivados dos dados atuais; alterar a atividade de origem recalcula os alertas.",
  ],
  "/techtask/board": [
    "Título, projeto ou contexto, prioridade, responsável e status são validados conforme o tipo de atividade.",
    "Atividades integradas preservam código e origem; campos protegidos só podem ser alterados pelas permissões administrativas previstas.",
    "Movimentar o cartão executa as mesmas validações da edição, inclusive checklist obrigatório, bloqueios e exigências de conclusão.",
    "Importação valida colunas, valores permitidos, usuários, projetos e códigos duplicados antes de confirmar as linhas.",
  ],
  "/techtask/my-work": [
    "Somente responsável ou participantes autorizados podem alterar a atividade; participação voluntária não substitui o responsável principal.",
    "Checklist obrigatório deve ser concluído antes do encerramento, respeitando responsáveis e prazos dos itens.",
    "Comentários, anexos, prazo e status são auditados; anexos passam por validação de formato e tamanho.",
    "Desfazer restaura apenas a última alteração elegível e não remove eventos já consolidados na origem.",
  ],
  "/admin": [
    "Indicadores administrativos são restritos a administradores e refletem vínculos inválidos, usuários inativos e projetos sem gestor.",
    "O diagnóstico não corrige registros automaticamente; cada exceção precisa ser tratada no cadastro indicado.",
  ],
  "/admin/users": [
    "E-mail deve ser válido e único; perfil, situação e vínculo com recurso precisam ser coerentes.",
    "Permissões de visualizar, criar e modificar são independentes, mas criar ou modificar não deve existir sem acesso à tela correspondente.",
    "Vínculos por projeto, grupos e funções específicas limitam o alcance dos dados mesmo quando a tela está liberada.",
    "Inativação bloqueia novos acessos sem apagar histórico; exclusão é impedida quando existem vínculos ou registros auditáveis.",
  ],
  "/admin/registrations": [
    "Nome e situação são obrigatórios e duplicidades no mesmo tipo de cadastro são recusadas ou sinalizadas.",
    "A exclusão é bloqueada enquanto o valor estiver sendo usado por projetos, recursos, atividades, filtros ou modelos.",
    "Inativar preserva o histórico e retira a opção de novos preenchimentos sem alterar registros antigos.",
  ],
  "/admin/standards": [
    "Pacotes, modelos e anexos passam por validação de tipo, release, estrutura, tamanho, versão e duplicidade.",
    "Somente versões processadas sem erro podem ser ativadas ou publicadas.",
    "Reprocessamento e reconciliação preservam histórico e registram falhas; publicação automática exige modelo ativo e elegível.",
    "Arquivamento é recuperável e não remove aplicações já realizadas nos projetos.",
  ],
};

function validationRulesFor(route: string) {
  return (
    VALIDATIONS_BY_ROUTE[route] ?? [
      "O sistema confirma sessão ativa, permissão para a ação e acesso ao projeto antes de processar a solicitação.",
      "Campos obrigatórios, formatos, valores permitidos e relacionamentos são validados antes da gravação.",
      "Ações com dependências, perda de informação ou mudança de estado exigem confirmação e podem ser bloqueadas.",
    ]
  );
}

const AUTOMATIONS_BY_ROUTE: Record<string, string[]> = {
  "/": [
    "Ao autenticar, o Portal carrega perfil, grupos, permissões por produto e tela e vínculos de projeto para montar a navegação.",
    "A troca de projeto atualiza o contexto usado pelos módulos integrados e pelos resultados da pesquisa.",
  ],
  "/techboard": [
    "Indicadores e alertas são recalculados a partir de recursos, projetos, ausências e alocações.",
    "Ao abrir um alerta de capacidade, o sistema leva o contexto do recurso ou projeto para o Planner.",
  ],
  "/techboard/resources": [
    "Capacidade, grupo, frentes, contrato, férias e saída passam a alimentar Planner, organograma e indicadores.",
    "Quando o recurso é vinculado a um usuário, esse vínculo é reutilizado em responsáveis, participantes e regras de acesso.",
  ],
  "/techboard/projects": [
    "O projeto criado torna-se disponível para alocações, trilhas, entregáveis, atividades e vínculos de acesso.",
    "Ao gerar fases e marcos, o sistema monta o cronograma-base; aplicar o gerente replica a responsabilidade nas fases elegíveis.",
  ],
  "/techboard/absences": [
    "Salvar, editar ou excluir uma ausência recalcula a capacidade do recurso no período.",
    "O novo saldo aparece no Planner e pode criar ou remover alertas de disponibilidade e sobrealocação.",
  ],
  "/techboard/planner": [
    "Salvar ou mover uma alocação atualiza carga, disponibilidade, ociosidade e sobrealocação.",
    "Quando a alocação referencia fase ou marco, o sistema mantém o vínculo para navegação e análise do projeto.",
  ],
  "/techboard/org-chart": [
    "A árvore é montada automaticamente a partir de diretoria, lideranças, grupos, frentes, projetos e alocações vigentes.",
  ],
  "/techlead": [
    "Os indicadores consolidam equipes, atividades e estados dos projetos e oferecem atalhos para o registro que exige ação.",
  ],
  "/techlead/teams": [
    "A composição do time e a distribuição por frente são derivadas dos cadastros e alocações do TechBoard.",
  ],
  "/techlead/gp-track": [
    "Aplicar um padrão cria as atividades da Trilha do GP com fase, workstream, papel, recorrência e requisitos definidos no modelo.",
    "Evidências, responsáveis, prazos e status alimentam o acompanhamento de liderança e podem originar atividades integradas.",
  ],
  "/techmove": [
    "O funil posiciona o projeto conforme o estado de suas etapas e consolida pendências, alertas e entregáveis.",
  ],
  "/techmove/projects": [
    "Padrões publicados automaticamente criam entregáveis elegíveis na Trilha Mestre sem duplicar aplicações já registradas.",
    "Alterações de responsável e status atualizam o acompanhamento da jornada e podem refletir no TechTask.",
    "O relatório consolidado reúne os dados atuais das etapas e entregáveis em um único PDF.",
  ],
  "/techmove/scope-items": [
    "Ao importar o DDA, cada linha válida cria ou atualiza um Scope Item do projeto; linhas sem correspondência na release SAP ficam pendentes para reprocessamento.",
    "Depois da importação, o sistema identifica os módulos efetivamente processados e cria automaticamente as perguntas BDCQ dos modelos padrão e administrativos aplicáveis.",
    "As perguntas automáticas são relacionadas aos Scope Items compatíveis por código ou nome e não são duplicadas quando a mesma pergunta já existe no módulo.",
    "Quando uma release SAP posterior resolve um item pendente, o reprocessamento cria ou atualiza o Scope Item e registra a resolução no histórico da importação.",
    "Os Scope Items importados passam a ser usados na seleção de BDCQ, workshops, configurações e demais modelos do projeto.",
  ],
  "/techmove/bdcq": [
    "Aplicar a biblioteca cria somente perguntas compatíveis com módulos e Scope Items do projeto e ignora duplicidades por módulo e texto.",
    "Responder novamente preserva a resposta anterior no histórico antes de gravar a nova versão.",
    "Ao concluir as perguntas de um módulo, o sistema verifica a completude e pode gerar a notificação prevista para o fluxo.",
    "Perguntas, respostas e responsáveis alimentam DCD, configurações, relatórios e governança.",
  ],
  "/techmove/workshops": [
    "Aplicar padrões cria apenas workshops ativos compatíveis com projeto, módulos e Scope Items e evita reaplicar o mesmo modelo.",
    "A transcrição transforma o áudio em texto-base; a geração de ata estrutura esse conteúdo para revisão.",
    "Requisitos confirmados na ata são registrados como requisitos do cliente e passam a alimentar desenho, gaps e acompanhamento.",
  ],
  "/techmove/dcd": [
    "A geração consolida Scope Items, perguntas e respostas BDCQ, requisitos, workshops, atas e gaps do módulo selecionado.",
    "Cada geração, edição, refinamento ou restauração cria uma versão e registra contexto, motivo, autor e arquivos gerados.",
    "A exportação gera artefatos Word e PDF; conteúdo aprovado fica disponível para governança e extrações posteriores.",
    "A extração de DCD pode sugerir gaps e configurações, mas a persistência depende da seleção ou confirmação do usuário.",
  ],
  "/techmove/gaps": [
    "A extração por IA analisa o DCD e apresenta candidatos com módulo, descrição e impacto para revisão.",
    "Gaps confirmados alimentam indicadores, decisões, atividades e o contexto de futuras gerações do DCD.",
  ],
  "/techmove/configurations": [
    "Gerar a partir do BDCQ transforma respostas elegíveis em itens de configuração vinculados à pergunta de origem.",
    "Extrair do DCD propõe configurações com base no documento selecionado; aplicar modelos cruza módulos e Scope Items ativos.",
    "Aplicações repetidas são comparadas por modelo, módulo e Scope Items para evitar duplicação.",
  ],
  "/techmove/tests": [
    "A importação cria cenários e respectivas etapas E2E mantendo o relacionamento e a ordem informados.",
    "Execuções atualizam o estado do cenário e consolidam resultados e evidências para acompanhamento e governança.",
  ],
  "/techmove/governance": [
    "Ao submeter, o sistema congela a referência da versão avaliada e cria as decisões pendentes para os aprovadores.",
    "As decisões são consolidadas conforme Qualquer um, Todos ou Mínimo N; rejeição devolve o item para correção sem apagar o histórico.",
  ],
  "/techmove/raid": [
    "O sistema gera o código de rastreamento e registra alterações de status e decisões no histórico.",
    "Responsável, prazo, severidade, probabilidade e impacto alimentam alertas e indicadores do projeto.",
  ],
  "/techtask": [
    "Atividades originadas em outros módulos são consolidadas com código, origem, projeto, etapa, responsável e estado atual.",
  ],
  "/techtask/board": [
    "Entregáveis e ações integradas podem criar ou sincronizar cartões mantendo o vínculo com o registro de origem.",
    "Mover um cartão atualiza o status e recalcula indicadores, prioridades, atrasos e bloqueios.",
    "Visões salvas reaplicam automaticamente filtros, agrupamentos e escopo definidos pelo usuário.",
  ],
  "/techtask/my-work": [
    "Comentários, anexos, checklist e participação são incorporados ao histórico da atividade.",
    "Abrir a origem navega para o registro integrado que criou a atividade; desfazer restaura a última mudança elegível.",
  ],
  "/admin": [
    "O diagnóstico cruza usuários, recursos, projetos, perfis e serviços para listar inconsistências funcionais.",
  ],
  "/admin/users": [
    "Salvar permissões recompõe imediatamente os produtos, telas e ações disponíveis na próxima verificação de sessão.",
    "Inativar preserva autoria e histórico, mas impede novos acessos; vínculos por projeto limitam automaticamente o alcance dos dados.",
  ],
  "/admin/registrations": [
    "Novos valores ativos passam a aparecer nas listas e filtros dos módulos consumidores.",
    "Inativação remove a opção de novos registros sem alterar os dados históricos que já a utilizam.",
  ],
  "/admin/standards": [
    "Processar um pacote SAP atualiza a biblioteca da release e pode reprocessar imports DDA que estavam pendentes por código desconhecido.",
    "Publicar um padrão o torna elegível para aplicação automática ou manual nos projetos conforme módulo, Scope Item, papel e recorrência.",
    "Reprocessamento, reconciliação, versionamento e arquivamento geram histórico editorial e operacional recuperável.",
  ],
};

function automationsFor(route: string) {
  return (
    AUTOMATIONS_BY_ROUTE[route] ?? [
      "Após salvar, o sistema atualiza os registros relacionados, indicadores e histórico conforme as integrações da tela.",
    ]
  );
}

const lesson = (
  id: string,
  title: string,
  summary: string,
  route: string,
  keywords: string[],
  audiences: string[],
  steps: string[],
  rules: string[] = []
): TrainingLessonSeed => ({
  id,
  title,
  summary,
  route,
  keywords,
  audiences,
  content: [
    `## Objetivo\n${summary}`,
    `## Permissões necessárias\n${audiences.join(", ")}.`,
    `## Caminho\nPortal Tech → ${route === "/" ? "Página inicial" : route}`,
    `## Passo a passo\n${steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`,
    rules.length
      ? `## Regras e cuidados\n${rules.map(rule => `- ${rule}`).join("\n")}`
      : "",
    `## Validações realizadas pelo sistema\n${validationRulesFor(route)
      .map(
        (validation, index) =>
          `${index + 1}. **Validação ${index + 1}:** ${validation}`
      )
      .join("\n")}`,
    `## O que o sistema faz automaticamente\n${automationsFor(route)
      .map((automation, index) => `${index + 1}. ${automation}`)
      .join("\n")}`,
    `## Como confirmar a automação\nApós concluir o procedimento, verifique o registro criado ou atualizado, o histórico da operação e os módulos relacionados citados acima. Quando houver processamento parcial, consulte os itens ignorados ou pendentes antes de repetir a ação.`,
    `## Quando a etapa é bloqueada\nA operação não avança quando uma validação obrigatória falha. Corrija o campo ou a dependência indicada, salve novamente e confirme se o status, o histórico e os módulos relacionados foram atualizados.`,
    `## Resultado esperado\nA operação é concluída e as informações relacionadas são atualizadas no sistema.`,
    `## Em caso de erro\nConfirme suas permissões, os campos obrigatórios e o projeto selecionado. Se o problema continuar, registre a mensagem exibida e procure o administrador funcional.`,
  ]
    .filter(Boolean)
    .join("\n\n"),
});

const commonAudiences = [
  "Administrador",
  "Gestor",
  "Líder técnico",
  "Consultor",
  "Visualizador",
];

export const TRAINING_CATALOG: TrainingCourseSeed[] = [
  {
    id: "training-portal-tech",
    title: "Primeiros passos no Portal Tech",
    description:
      "Acesso, navegação, pesquisa, contexto de projeto e permissões.",
    category: "Portal Tech",
    color: "#2563eb",
    modules: [
      {
        id: "portal-foundations",
        title: "Acesso e navegação",
        description: "Fundamentos comuns a todas as ferramentas.",
        lessons: [
          lesson(
            "portal-access",
            "Entrar com e-mail e código",
            "Acessar o Portal Tech com o e-mail cadastrado.",
            "/",
            ["login", "código", "acesso", "e-mail"],
            commonAudiences,
            [
              "Informe o e-mail cadastrado e selecione Enviar código.",
              "Digite o código de seis números recebido por e-mail.",
              "Selecione Entrar e aguarde a abertura da página inicial.",
              "Se o acesso for recusado, confirme com o administrador se o usuário está ativo.",
            ],
            [
              "O código é pessoal e temporário.",
              "O e-mail precisa estar ativo em Usuários e permissões.",
            ]
          ),
          lesson(
            "portal-home",
            "Usar a página inicial e a pesquisa global",
            "Interpretar a visão executiva e localizar informações em todas as ferramentas.",
            "/",
            ["pesquisa global", "indicadores", "alertas", "filtros"],
            commonAudiences,
            [
              "Defina o período e, quando necessário, o projeto.",
              "Leia os indicadores de portfólio, atividades, bloqueios e exceções.",
              "Digite um termo na Pesquisa global para localizar projetos, atividades, responsáveis ou códigos.",
              "Abra o resultado desejado; o Portal preservará o contexto do projeto.",
            ]
          ),
          lesson(
            "portal-navigation",
            "Navegar entre ferramentas e projetos",
            "Alternar entre produtos sem perder o projeto em uso.",
            "/",
            ["menu", "ferramentas", "projeto", "notificações"],
            commonAudiences,
            [
              "Use Todas as ferramentas para voltar ao lançador.",
              "Abra TechBoard, TechLead, TechMove, TechTask ou Administração.",
              "Expanda o produto no menu lateral e escolha uma tela.",
              "Use o sino para ler notificações e abrir a atividade relacionada.",
              "Use o menu do perfil para encerrar a sessão.",
            ]
          ),
          lesson(
            "portal-permissions",
            "Entender perfis e permissões",
            "Diferenciar acesso de visualização, criação e modificação.",
            "/admin/users",
            ["perfil", "permissão", "restrito", "grupo"],
            ["Administrador", "Gestor"],
            [
              "Identifique o perfil funcional do usuário.",
              "Confira os produtos e telas liberados.",
              "Valide as ações de visualizar, criar e modificar.",
              "Quando aparecer Acesso restrito, solicite ajuste ao administrador funcional.",
            ]
          ),
        ],
      },
    ],
  },
  {
    id: "training-techboard",
    title: "TechBoard completo",
    description:
      "Recursos, projetos, ausências, alocações, capacidade e organograma.",
    category: "TechBoard",
    color: "#0284c7",
    modules: [
      {
        id: "techboard-overview",
        title: "Visão geral",
        description: "Indicadores e alertas de capacidade.",
        lessons: [
          lesson(
            "techboard-dashboard",
            "Analisar o dashboard do TechBoard",
            "Usar métricas, filtros, alertas e detalhamentos do portfólio.",
            "/techboard",
            ["dashboard", "capacidade", "sobrealocação", "ociosidade"],
            ["Administrador", "Gestor", "Visualizador"],
            [
              "Ajuste período, projetos e recursos nos filtros.",
              "Selecione uma métrica para abrir seu detalhamento.",
              "Revise alertas de capacidade, projetos sem cobertura e saídas próximas.",
              "Abra uma linha do detalhamento para ir ao cadastro ou ao Planner.",
            ]
          ),
        ],
      },
      {
        id: "techboard-registers",
        title: "Recursos, projetos e ausências",
        description: "Cadastros que alimentam o planejamento.",
        lessons: [
          lesson(
            "techboard-resources",
            "Cadastrar e manter recursos",
            "Criar, editar, pesquisar, importar e validar recursos.",
            "/techboard/resources",
            ["recurso", "consultor", "capacidade", "foto", "importação"],
            ["Administrador", "Gestor", "Líder técnico"],
            [
              "Use filtros para localizar o recurso antes de criar um novo cadastro.",
              "Selecione Novo recurso e preencha nome, e-mail, perfil, grupo e frentes.",
              "Informe capacidade, contrato, datas e observações aplicáveis.",
              "Salve e confirme o recurso na lista.",
              "Para carga em massa, baixe o modelo, preencha-o e use Importar.",
            ],
            [
              "Recursos vinculados a alocações ou ausências não podem ser excluídos.",
              "O e-mail deve representar corretamente o vínculo com o usuário.",
            ]
          ),
          lesson(
            "techboard-projects",
            "Cadastrar projetos, OIs e cronograma",
            "Manter os dados centrais de um projeto e seus marcos.",
            "/techboard/projects",
            ["projeto", "OI", "fase", "cronograma", "logotipo"],
            ["Administrador", "Gestor"],
            [
              "Selecione Novo projeto e informe cliente, gestores, patrocinador, período e frentes.",
              "Inclua um logotipo e códigos de controle de custo quando aplicável.",
              "Salve o projeto.",
              "Abra Gerenciar fases para gerar ou incluir marcos.",
              "Ajuste datas, status, conclusão e responsáveis e salve o cronograma.",
            ],
            [
              "A data inicial não pode ser posterior à final.",
              "Projetos com fases ou alocações não podem ser excluídos.",
            ]
          ),
          lesson(
            "techboard-absences",
            "Registrar férias e ausências",
            "Manter períodos que reduzem a capacidade disponível.",
            "/techboard/absences",
            ["férias", "ausência", "capacidade", "importação"],
            ["Administrador", "Gestor", "Líder técnico", "Consultor"],
            [
              "Pesquise o recurso para evitar duplicidade.",
              "Selecione Nova ausência e informe recurso, tipo e período.",
              "Salve e confira o registro.",
              "Use o modelo e a importação para cadastrar vários períodos.",
              "Valide o impacto no Planner.",
            ]
          ),
        ],
      },
      {
        id: "techboard-planning",
        title: "Planejamento e estrutura",
        description: "Alocação, capacidade e organograma.",
        lessons: [
          lesson(
            "techboard-planner",
            "Planejar alocações no Gantt",
            "Criar, mover e analisar alocações nas visões diária e semanal.",
            "/techboard/planner",
            ["gantt", "alocação", "capacidade", "horas", "filtros"],
            [
              "Administrador",
              "Gestor",
              "Líder técnico",
              "Consultor",
              "Visualizador",
            ],
            [
              "Escolha a visão diária ou semanal.",
              "Aplique filtros de recurso, projeto, gestor, grupo, frente e situação.",
              "Selecione Nova alocação ou abra um alerta para iniciar o preenchimento.",
              "Informe recurso, projeto, fase, período, horas diárias, frente e status.",
              "Salve e confira a barra no Gantt.",
              "Quando autorizado, arraste a barra para mover ou use as bordas para redimensionar.",
              "Revise sobrealocações, ausências e recursos sem cobertura.",
            ],
            [
              "A soma de horas não deve ultrapassar a capacidade diária.",
              "Mudanças de período podem afetar fases e alertas do projeto.",
            ]
          ),
          lesson(
            "techboard-orgchart",
            "Consultar o organograma",
            "Visualizar a estrutura por time, grupo ou projeto.",
            "/techboard/org-chart",
            ["organograma", "time", "grupo", "projeto"],
            commonAudiences,
            [
              "Escolha a visão Time, Grupo ou Projeto.",
              "Selecione o grupo ou projeto quando o filtro for exibido.",
              "Expanda ou minimize os grupos.",
              "Revise diretoria, liderança, gestores e consultores.",
            ]
          ),
        ],
      },
    ],
  },
  {
    id: "training-techlead",
    title: "TechLead completo",
    description: "Liderança, equipes, indicadores e Trilha do GP.",
    category: "TechLead",
    color: "#7c3aed",
    modules: [
      {
        id: "techlead-analytics",
        title: "Liderança e equipes",
        description: "Indicadores e composição dos times.",
        lessons: [
          lesson(
            "techlead-dashboard",
            "Usar a central analítica",
            "Interpretar indicadores e abrir atalhos operacionais.",
            "/techlead",
            ["liderança", "indicadores", "status"],
            ["Administrador", "Gestor"],
            [
              "Aplique os filtros disponíveis.",
              "Analise a distribuição por status e os pontos de atenção.",
              "Use os atalhos para abrir a Trilha do GP, equipes ou indicadores.",
            ]
          ),
          lesson(
            "techlead-teams",
            "Consultar times, frentes e indicadores",
            "Entender composição, capacidade e governança das equipes.",
            "/techlead/teams",
            ["time", "frente", "capacidade", "governança"],
            ["Administrador", "Gestor", "Líder técnico"],
            [
              "Escolha a equipe ou frente.",
              "Revise papéis, recursos e situação de alocação.",
              "Abra Indicadores para analisar distribuição e exceções.",
            ]
          ),
        ],
      },
      {
        id: "techlead-gp",
        title: "Trilha do GP",
        description: "Atividades, evidências e ciclos Fit-to-Standard.",
        lessons: [
          lesson(
            "techlead-gp-track",
            "Conduzir a Trilha do GP",
            "Planejar e acompanhar atividades do gerente de projeto.",
            "/techlead/gp-track",
            ["trilha do GP", "workstream", "evidência", "Fit-to-Standard"],
            ["Administrador", "Gestor"],
            [
              "Selecione o projeto e a fase da trilha.",
              "Use a busca e o filtro de workstream.",
              "Abra uma atividade para definir responsável, prazo, status, observações e evidência.",
              "Aplique o modelo de documentação ou anexe um modelo Word quando necessário.",
              "Crie atividades adicionais para necessidades específicas.",
              "Adicione ciclos Fit-to-Standard e acompanhe suas etapas.",
            ]
          ),
        ],
      },
    ],
  },
  {
    id: "training-techmove",
    title: "TechMove completo",
    description:
      "Jornada de implementação, entregáveis, decisões, testes e governança.",
    category: "TechMove",
    color: "#059669",
    modules: [
      {
        id: "techmove-journey",
        title: "Jornada e escopo",
        description: "Portfólio, trilha e DDA.",
        lessons: [
          lesson(
            "techmove-dashboard",
            "Acompanhar o controle da jornada",
            "Interpretar funil, portfólio, indicadores e alertas.",
            "/techmove",
            ["jornada", "funil", "portfólio"],
            ["Administrador", "Gestor", "Líder técnico", "Consultor"],
            [
              "Aplique os filtros do dashboard.",
              "Analise o funil da jornada e a distribuição do portfólio.",
              "Abra o projeto que exige ação.",
            ]
          ),
          lesson(
            "techmove-project-trail",
            "Usar a Trilha Mestre do projeto",
            "Executar e acompanhar os entregáveis do projeto.",
            "/techmove/projects",
            ["trilha mestre", "entregável", "relatório", "padrão"],
            ["Administrador", "Gestor", "Líder técnico", "Consultor"],
            [
              "Selecione o projeto.",
              "Revise padrões publicados e confirme os itens bloqueados quando aplicável.",
              "Use a busca para localizar um entregável.",
              "Abra a etapa e atualize responsável, status e observações.",
              "Incorpore dados legados apenas quando o aviso for apresentado.",
              "Exporte o relatório consolidado quando necessário.",
            ]
          ),
          lesson(
            "techmove-scope",
            "Importar e manter itens de escopo",
            "Formar a base de escopo usada pelos demais entregáveis.",
            "/techmove/scope-items",
            ["DDA", "scope item", "importação", "escopo"],
            ["Administrador", "Gestor", "Líder técnico"],
            [
              "Selecione o projeto correto.",
              "Use Importar DDA para carregar Excel, CSV ou texto.",
              "Revise códigos, módulos, processos e descrições.",
              "Crie manualmente os itens que não vieram no arquivo.",
              "Use a busca e a paginação para validar a carga.",
            ]
          ),
        ],
      },
      {
        id: "techmove-discovery",
        title: "Descoberta e desenho",
        description: "BDCQ, workshops e DCD.",
        lessons: [
          lesson(
            "techmove-bdcq",
            "Preparar, responder e aprovar o BDCQ",
            "Gerenciar perguntas Standard SAP e personalizadas com responsáveis e histórico.",
            "/techmove/bdcq",
            ["BDCQ", "L2", "L3", "key user", "aprovação"],
            [
              "Administrador",
              "Gestor",
              "Líder técnico",
              "Consultor",
              "Key user",
            ],
            [
              "Importe perguntas ou aplique a biblioteca padrão ao projeto.",
              "Associe consultor, key user, módulo e scope items.",
              "Abra a pergunta e registre resposta e anexos.",
              "Consulte o histórico antes de substituir uma decisão.",
              "Envie a resposta para aprovação quando a política exigir.",
              "Aprove, rejeite ou reabra conforme sua permissão.",
            ]
          ),
          lesson(
            "techmove-workshops",
            "Planejar e registrar workshops",
            "Organizar agenda, participantes, atas e requisitos.",
            "/techmove/workshops",
            ["workshop", "agenda", "ata", "transcrição", "requisito"],
            [
              "Administrador",
              "Gestor",
              "Líder técnico",
              "Consultor",
              "Key user",
            ],
            [
              "Crie o workshop manualmente ou aplique um padrão.",
              "Defina objetivo, conteúdo, módulos, scope items, data, agenda e participantes.",
              "Anexe a apresentação e materiais.",
              "Após a reunião, inclua ou transcreva o áudio.",
              "Gere a ata e revise seu conteúdo.",
              "Registre requisitos, critérios de aceite, prioridade e responsável.",
              "Baixe a ata em Word ou PDF.",
            ]
          ),
          lesson(
            "techmove-dcd",
            "Gerar, refinar e versionar DCDs",
            "Criar o desenho detalhado e controlar suas versões.",
            "/techmove/dcd",
            ["DCD", "IA", "Markdown", "versão", "Word", "PDF"],
            ["Administrador", "Gestor", "Líder técnico", "Consultor"],
            [
              "Escolha o módulo e inicie a geração por IA.",
              "Use a versão em cache somente quando ela representar o conteúdo esperado.",
              "Visualize e edite o documento.",
              "Use a barra de formatação para títulos, listas, destaque e tabelas.",
              "Solicite refinamento por IA quando necessário.",
              "Compare versões e restaure uma versão anterior como nova versão.",
              "Exporte para Word ou PDF e aprove quando o conteúdo estiver pronto.",
            ]
          ),
        ],
      },
      {
        id: "techmove-realization",
        title: "Realização, testes e governança",
        description: "Gaps, configurações, testes, aprovações e RAID.",
        lessons: [
          lesson(
            "techmove-gaps",
            "Controlar gaps",
            "Registrar, priorizar e resolver necessidades não atendidas pelo padrão.",
            "/techmove/gaps",
            ["gap", "kanban", "DCD", "anexo"],
            ["Administrador", "Gestor", "Líder técnico", "Consultor"],
            [
              "Extraia gaps do DCD ou crie um novo registro.",
              "Informe módulo, impacto, responsável e descrição.",
              "Anexe evidências e registre a solução ou decisão.",
              "Use kanban, tabela, pesquisa e filtros para acompanhar o fluxo.",
              "Aplique mudanças em lote quando os gaps tiverem o mesmo destino.",
            ]
          ),
          lesson(
            "techmove-configurations",
            "Planejar configurações",
            "Gerar, atribuir e acompanhar passos de configuração.",
            "/techmove/configurations",
            ["configuração", "BDCQ", "DCD", "prompt"],
            ["Administrador", "Gestor", "Líder técnico", "Consultor"],
            [
              "Gere configurações a partir do BDCQ, do DCD ou aplique os modelos.",
              "Revise categoria, responsável, status e dependências.",
              "Crie manualmente os passos ausentes.",
              "Use seleção em lote para atribuições e status repetidos.",
              "Administradores podem revisar e restaurar prompts de IA.",
            ]
          ),
          lesson(
            "techmove-tests",
            "Planejar e executar testes",
            "Criar cenários, etapas E2E e evidências de execução.",
            "/techmove/tests",
            ["teste", "E2E", "evidência", "execução"],
            [
              "Administrador",
              "Gestor",
              "Líder técnico",
              "Consultor",
              "Key user",
            ],
            [
              "Importe o plano de testes ou crie um cenário.",
              "Informe código, tipo, processo, módulo, descrição e responsável.",
              "Adicione etapas com dados e resultado esperado.",
              "Execute cada etapa e registre status, resultado obtido e evidências.",
              "Exporte a estrutura para acompanhamento externo quando necessário.",
            ]
          ),
          lesson(
            "techmove-governance",
            "Configurar governança e aprovações",
            "Definir marcos formais de decisão e seus aprovadores.",
            "/techmove/governance",
            ["governança", "aprovação", "quórum", "reabrir"],
            ["Administrador", "Gestor", "Aprovador"],
            [
              "Revise a preparação do projeto.",
              "Ative os tipos de entregável sujeitos à aprovação.",
              "Escolha aprovadores e a regra Qualquer um, Todos ou Mínimo N.",
              "Salve cada política.",
              "Conclua a preparação quando todos os requisitos estiverem atendidos.",
              "Reabra a preparação somente quando novas alterações forem necessárias.",
            ]
          ),
          lesson(
            "techmove-raid",
            "Gerenciar issues e riscos",
            "Registrar eventos, planos de ação e histórico de decisões.",
            "/techmove/raid",
            ["issue", "risco", "RAID", "plano de ação"],
            ["Administrador", "Gestor", "Líder técnico", "Consultor"],
            [
              "Escolha Issue ou Risco e crie o registro.",
              "Informe título, categoria, módulo, severidade, probabilidade, impacto, responsável e prazo.",
              "Descreva o evento e o plano de ação.",
              "Atualize status e ações durante o acompanhamento.",
              "Para excluir, informe justificativa e confirme o código solicitado.",
            ]
          ),
        ],
      },
    ],
  },
  {
    id: "training-techtask",
    title: "TechTask completo",
    description: "Kanban, atividades integradas, colaboração e administração.",
    category: "TechTask",
    color: "#ea580c",
    modules: [
      {
        id: "techtask-execution",
        title: "Controle da execução",
        description: "Indicadores, kanban e trabalho pessoal.",
        lessons: [
          lesson(
            "techtask-dashboard",
            "Analisar o controle da execução",
            "Usar indicadores, fluxo por status e distribuição por projeto.",
            "/techtask",
            ["execução", "indicadores", "prioridade"],
            ["Administrador", "Gestor", "Líder técnico", "Consultor"],
            [
              "Aplique os filtros.",
              "Analise o fluxo por status, projetos e prioridades.",
              "Abra o quadro ou Meu trabalho a partir dos indicadores.",
            ]
          ),
          lesson(
            "techtask-board",
            "Usar o Kanban e as visões salvas",
            "Criar, localizar, importar e movimentar atividades.",
            "/techtask/board",
            ["kanban", "atividade", "visão salva", "Excel"],
            ["Administrador", "Gestor", "Líder técnico", "Consultor"],
            [
              "Escolha Minhas, Projetos ou Operação interna.",
              "Aplique filtros de projeto, responsável, prazo, status e prioridade.",
              "Crie uma atividade manual ou importe a planilha.",
              "Mova o cartão entre A fazer, Em andamento, Bloqueada, Em validação e Concluída.",
              "Salve a combinação de filtros como uma visão.",
              "Exporte a lista para Excel quando necessário.",
            ]
          ),
          lesson(
            "techtask-details",
            "Colaborar nos detalhes de uma atividade",
            "Manter conteúdo, responsáveis, checklist, comentários e anexos.",
            "/techtask/my-work",
            ["checklist", "comentário", "anexo", "responsável", "desfazer"],
            ["Administrador", "Gestor", "Líder técnico", "Consultor"],
            [
              "Abra o cartão.",
              "Revise a origem e, quando necessário, abra o registro que gerou a atividade.",
              "Defina responsável, participantes, prazo, prioridade e status.",
              "Crie e reordene itens do checklist.",
              "Adicione comentários e anexos.",
              "Use Desfazer quando precisar reverter a última alteração disponível.",
            ]
          ),
          lesson(
            "techtask-admin",
            "Administrar atividades e modelos",
            "Arquivar, restaurar, auditar e sincronizar padrões.",
            "/techtask/board",
            ["arquivar", "restaurar", "auditoria", "modelo"],
            ["Administrador"],
            [
              "Abra Arquivados e auditoria.",
              "Informe uma justificativa para arquivar um item.",
              "Restaure itens quando necessário, registrando o motivo.",
              "Consulte o log administrativo.",
              "Em Configurações do Tech, mantenha recorrência, papel, obrigatoriedade e aplicação dos modelos.",
            ]
          ),
        ],
      },
    ],
  },
  {
    id: "training-admin",
    title: "Administração funcional",
    description: "Usuários, permissões, cadastros e bibliotecas globais.",
    category: "Administração",
    color: "#475569",
    modules: [
      {
        id: "admin-access",
        title: "Acesso e qualidade cadastral",
        description: "Usuários, grupos e cadastros.",
        lessons: [
          lesson(
            "admin-overview",
            "Analisar a visão administrativa",
            "Identificar usuários e projetos que exigem correção cadastral.",
            "/admin",
            ["administração", "usuário sem recurso", "projeto sem gestor"],
            ["Administrador"],
            [
              "Aplique os filtros.",
              "Revise usuários ativos, inativos e sem recurso válido.",
              "Identifique projetos sem gestor.",
              "Abra o detalhamento para corrigir o cadastro correspondente.",
            ]
          ),
          lesson(
            "admin-users",
            "Gerenciar usuários, grupos e permissões",
            "Controlar acesso por perfil, produto, tela e projeto.",
            "/admin/users",
            ["usuário", "grupo", "permissão", "projeto", "key user"],
            ["Administrador"],
            [
              "Pesquise o usuário antes de criar um novo.",
              "Informe nome, e-mail, perfil e recurso vinculado.",
              "Associe projetos, função e perfil de participação.",
              "Salve e valide o acesso.",
              "Abra o grupo para ajustar permissões de visualizar, criar e modificar.",
              "Inative usuários que não devem mais acessar o sistema.",
            ],
            [
              "Evite excluir usuários com histórico; prefira inativar.",
              "O menor acesso necessário deve ser aplicado.",
            ]
          ),
          lesson(
            "admin-registers",
            "Manter cadastros gerais",
            "Atualizar listas auxiliares usadas em formulários e filtros.",
            "/admin/registrations",
            ["cadastro", "lista", "categoria"],
            ["Administrador"],
            [
              "Escolha a categoria.",
              "Confirme se o valor já existe.",
              "Crie ou edite o item.",
              "Antes de excluir, avalie onde o valor é usado.",
            ]
          ),
        ],
      },
      {
        id: "admin-standards",
        title: "Configurações do Tech",
        description: "Bibliotecas, Trilha Mestre e publicação.",
        lessons: [
          lesson(
            "admin-standards",
            "Administrar padrões e a Trilha Mestre",
            "Versionar modelos globais e controlar sua publicação nos projetos.",
            "/admin/standards",
            ["padrão", "trilha mestre", "SAP", "publicação", "reconciliação"],
            ["Administrador", "Líder técnico autorizado"],
            [
              "Escolha a biblioteca: escopo, BDCQ, workshops, DCD, configurações, gaps, testes, governança ou Trilha do GP.",
              "Crie ou edite o padrão, definindo módulos, scope items, obrigatoriedade, papéis e projetos.",
              "Inclua anexos quando necessário.",
              "Publique a nova versão e acompanhe o histórico.",
              "Reprocesse falhas ou execute a reconciliação quando solicitado.",
              "Na biblioteca SAP, carregue a release, aguarde o processamento e ative a versão pronta.",
            ],
            [
              "Alterações em padrões podem gerar ou atualizar itens em vários projetos.",
              "Arquivamentos preservam itens já materializados nos projetos.",
            ]
          ),
        ],
      },
    ],
  },
  {
    id: "training-integrated",
    title: "Fluxos integrados de ponta a ponta",
    description: "Cenários completos que atravessam várias ferramentas.",
    category: "Fluxos",
    color: "#0f766e",
    modules: [
      {
        id: "integrated-project",
        title: "Do cadastro à execução",
        description: "Sequências operacionais recomendadas.",
        lessons: [
          lesson(
            "flow-project-start",
            "Iniciar um projeto completo",
            "Cadastrar projeto, equipe, cronograma, padrões e atividades iniciais.",
            "/techboard/projects",
            ["projeto", "equipe", "início", "fluxo"],
            ["Administrador", "Gestor"],
            [
              "Cadastre o projeto, OIs, período, frentes e gestores no TechBoard.",
              "Crie os marcos do cronograma.",
              "Cadastre ou vincule os recursos e usuários.",
              "Crie as alocações no Planner.",
              "Importe o DDA e aplique a Trilha Mestre no TechMove.",
              "Revise as atividades geradas no TechTask e a Trilha do GP.",
            ]
          ),
          lesson(
            "flow-discovery-design",
            "Executar descoberta e desenho",
            "Conectar DDA, BDCQ, workshops, DCD, gaps e configurações.",
            "/techmove/projects",
            ["descoberta", "desenho", "BDCQ", "DCD"],
            ["Gestor", "Líder técnico", "Consultor", "Key user"],
            [
              "Valide o DDA e aplique as perguntas BDCQ.",
              "Defina responsáveis e conclua as respostas.",
              "Realize workshops e registre atas e requisitos.",
              "Gere e refine o DCD.",
              "Extraia gaps e configurações.",
              "Submeta os entregáveis à governança quando configurada.",
            ]
          ),
          lesson(
            "flow-test-go-live",
            "Preparar testes e governança",
            "Planejar execução, tratar riscos e formalizar decisões.",
            "/techmove/tests",
            ["teste", "risco", "go-live", "governança"],
            [
              "Administrador",
              "Gestor",
              "Líder técnico",
              "Consultor",
              "Aprovador",
            ],
            [
              "Crie ou importe os cenários e etapas de teste.",
              "Atribua responsáveis e registre evidências.",
              "Trate bloqueios como atividades, issues ou riscos.",
              "Revise as políticas de aprovação.",
              "Conclua a preparação somente quando os critérios estiverem atendidos.",
            ]
          ),
        ],
      },
    ],
  },
  {
    id: "training-help",
    title: "Solução de problemas e perguntas frequentes",
    description: "Orientações rápidas para erros e dúvidas recorrentes.",
    category: "Ajuda",
    color: "#b45309",
    modules: [
      {
        id: "help-common",
        title: "Problemas comuns",
        description: "Acesso, dados, importações e permissões.",
        lessons: [
          lesson(
            "help-access",
            "Resolver problemas de acesso",
            "Diagnosticar login, tela restrita e conteúdo indisponível.",
            "/",
            ["erro", "acesso", "restrito", "login"],
            commonAudiences,
            [
              "Confirme se o e-mail usado é o mesmo cadastrado no sistema.",
              "Solicite um novo código se o anterior tiver expirado.",
              "Se apenas uma ferramenta estiver bloqueada, peça ao administrador para conferir produto, tela e ação.",
              "Saia e entre novamente após uma alteração de permissão.",
            ]
          ),
          lesson(
            "help-data-import",
            "Resolver erros de cadastro e importação",
            "Identificar campos inválidos, dependências e arquivos incompatíveis.",
            "/admin/registrations",
            ["erro", "importação", "planilha", "exclusão"],
            ["Administrador", "Gestor", "Líder técnico"],
            [
              "Baixe sempre o modelo mais recente da tela.",
              "Não altere os nomes das colunas obrigatórias.",
              "Revise datas, números e valores das listas.",
              "Leia o resumo de importação e corrija apenas as linhas rejeitadas.",
              "Antes de excluir, remova ou ajuste as dependências indicadas pela mensagem.",
            ]
          ),
        ],
      },
    ],
  },
];

export const TRAINING_COVERAGE = TRAINING_CATALOG.flatMap(course =>
  course.modules.flatMap(module =>
    module.lessons.map(item => ({
      courseId: course.id,
      course: course.title,
      moduleId: module.id,
      module: module.title,
      lessonId: item.id,
      lesson: item.title,
      route: item.route,
      audiences: item.audiences,
      keywords: item.keywords,
    }))
  )
);
