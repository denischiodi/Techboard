# Área de aprendizado do TechEduca

Entre pelo Portal Tech e abra `/techeduca/`. A opção **Meu aprendizado** mostra o progresso individual e, para administradores, os alunos com atividade registrada.

## Preparar a trilha

A trilha **Trilha do consultor — Educação** contém uma estrutura inicial de duas aulas. Em **Editar conteúdos**, adicione os vídeos e anexos reais da formação. Dentro de cada aula, administradores podem selecionar **Publicar prova para os alunos**. Alunos usam **Enviar minha resposta** no mesmo local. São aceitos PDF, DOCX, XLSX, PNG, JPEG e TXT de até 10 MB por envio. As respostas ficam disponíveis para consulta da equipe; não há correção ou nota automática.

## Progresso e acesso

Vídeos reproduzidos no player registram o tempo assistido e são considerados concluídos a partir de 90%. Saltos na reprodução não acrescentam tempo. Links para players externos não registram progresso. Esse acompanhamento não representa certificação de presença e pode contar trechos revistos.

Cada aluno acessa suas próprias respostas. Administradores visualizam os registros de todos os alunos. Arquivos de prova são acessíveis aos alunos com acesso à aula. Arquivos de vídeo exigem sessão e acesso ao conteúdo, não aparecem na lista de materiais e o player oculta a opção de download. Isso não impede captura de tela ou cópia por ferramentas externas; proteção DRM não está implementada.

Com PostgreSQL configurado, os registros e avaliações usam a tabela `techeduca_learning`, criada na inicialização. Sem banco, os novos registros e avaliações ficam em `.local/techeduca-learning.json`, ignorado pelo Git. Faça backup desse arquivo se usar o modo local. O cadastro de cursos e upload de vídeos/anexos mantém a dependência de PostgreSQL do portal existente para persistência; o modo sem banco mantém o catálogo em memória.

## Cadastro e matrícula do time

Administradores acessam **Alunos e matrículas** para cadastrar uma pessoa por nome e e-mail, selecionar os cursos, definir uma validade opcional por curso e ativar ou bloquear o acesso. O painel lista também os alunos que ainda não começaram e exibe os vídeos assistidos e as respostas por curso. Matrículas podem ser alteradas ou removidas desmarcando o curso, sem apagar o histórico.

O cadastro reutiliza uma conta existente pelo e-mail sem alterar suas permissões. Para novas pessoas, cria uma conta de consulta sem acesso aos produtos operacionais do Portal Tech. A pessoa entra pelo login já existente do portal com código por e-mail e depois abre TechEduca. O botão **Copiar orientações de acesso** gera instruções para compartilhar manualmente; não envia mensagens. O serviço de envio de códigos deve estar configurado no ambiente.

Alunos acessam apenas cursos publicados com matrícula ativa e dentro da validade. Isso também é verificado ao abrir arquivos, provas e registrar progresso. Administradores mantêm o acesso de gestão; líderes técnicos mantêm o acesso editorial aos cursos sob sua responsabilidade. Bloquear um aluno aqui bloqueia apenas a formação, preservando os acessos do portal que a pessoa já possuía. Novas matrículas não concedem permissão de edição. Cursos antes acessíveis apenas por permissão geral agora exigem matrícula para alunos.

Os novos cadastros e matrículas usam a tabela `techeduca_students` no PostgreSQL, criada na inicialização. Sem banco, as matrículas ficam em `.local/techeduca-students.json`; as contas do portal continuam com a limitação existente de armazenamento em memória. Para uso real com o time e persistência completa de contas, cursos e vídeos, configure PostgreSQL e o envio de e-mails.

Ainda não há acesso público, notas automáticas ou certificados.

## Validação das matrículas

Execute `node --test scripts/test-techeduca-access.mjs` em Node 24 ou superior para verificar matrícula, validade, bloqueio, persistência local e no banco e apresentação do painel.
