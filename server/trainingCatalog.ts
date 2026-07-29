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
