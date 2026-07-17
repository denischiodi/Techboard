# Delivery Resource Planner

Sistema para planejamento de projetos SAP, alocacao de consultores, ausencias, capacidade semanal e controle de acesso.

## Status de producao

Este pacote esta preparado para deploy como aplicacao Node unica: frontend Vite + API Express/tRPC no mesmo servico.

Validacoes locais:

- TypeScript: `pnpm run check`
- Testes: `pnpm run test`
- Build: `pnpm run build`
- Health/liveness leve: `/health`
- Readiness com banco: `/ready`

Importante: em producao, a aplicacao exige PostgreSQL, segredo JWT e OAuth configurados. As entidades principais do planner (`resources`, `projects`, `phases`, `absences`, `allocations`, `lookups` e `app_users`) possuem tabelas no PostgreSQL. Sem `DATABASE_URL`, o fallback em memoria deve ser usado apenas para desenvolvimento/teste local.

As migrations aplicam integridade referencial entre projetos, fases, recursos, ausencias e alocacoes. `allocations.phaseId` e opcional no app e fica como `NULL` no banco quando nenhuma fase e escolhida.

Atencao para variaveis `VITE_*`: elas sao gravadas no bundle do frontend durante o build. Configure `VITE_APP_ID` e `VITE_OAUTH_PORTAL_URL` antes do primeiro deploy/build da imagem, nao apenas no runtime.

## Variaveis de ambiente

Copie `.env.example` para `.env` no ambiente local e configure as variaveis no Railway em cada ambiente.

Obrigatorias para producao:

- `DATABASE_URL`: URL PostgreSQL. No Railway, vem do servico Postgres conectado.
- `JWT_SECRET`: segredo longo e aleatorio para assinar a sessao.
- `VITE_APP_ID`: identificador do app no provedor OAuth atual.
- `VITE_OAUTH_PORTAL_URL`: portal de login usado pelo frontend.
- `OAUTH_SERVER_URL`: servidor OAuth usado pelo backend.
- `OWNER_OPEN_ID`: usuario que sera tratado como admin inicial.

Opcionais:

- `PG_POOL_MAX`: limite maximo de conexoes PostgreSQL por processo. Padrao: `10`.
- `PG_CONNECTION_TIMEOUT_MS`: timeout para abrir conexao com PostgreSQL. Padrao: `5000`.
- `PG_IDLE_TIMEOUT_MS`: tempo para encerrar conexoes ociosas do pool. Padrao: `30000`.
- `PG_STATEMENT_TIMEOUT_MS`: timeout de statements no PostgreSQL. Padrao: `10000`.
- `BUILT_IN_FORGE_API_URL`
- `BUILT_IN_FORGE_API_KEY`
- `VITE_FRONTEND_FORGE_API_URL`
- `VITE_FRONTEND_FORGE_API_KEY`
- `VITE_ANALYTICS_ENDPOINT`
- `VITE_ANALYTICS_WEBSITE_ID`

## Rodar localmente

```bash
pnpm install
pnpm run check
pnpm run test
pnpm run build
PORT=3000 NODE_ENV=production pnpm start
```

Acesse:

- App: `http://localhost:3000`
- Health/liveness: `http://localhost:3000/health`
- Readiness/banco: `http://localhost:3000/ready`

## Deploy recomendado no Railway

1. Suba o projeto para um repositorio GitHub.
2. No Railway, crie um novo Project.
3. Adicione um servico PostgreSQL.
4. Adicione um servico a partir do repositorio GitHub.
5. Conecte o servico da aplicacao ao PostgreSQL para receber `DATABASE_URL`.
6. Configure as demais variaveis de ambiente no servico da aplicacao.
7. Railway detectara `railway.json` e usara o `Dockerfile`.

Configuracao esperada:

- Build: Dockerfile
- Start command: `node dist/index.js`
- Health check path: `/ready`
- Porta: usar `PORT` injetado pelo Railway
- HTTPS: automatico no dominio Railway

## Deploy automatico pelo GitHub

O projeto possui o workflow `.github/workflows/deploy-railway.yml`.

Com ele, todo push na branch `main` faz:

1. Instala as dependencias com `pnpm`.
2. Valida TypeScript com `pnpm run check`.
3. Gera build de producao com `pnpm run build`.
4. Se tudo passar, publica no Railway.

Para ativar o deploy automatico:

1. No Railway, mantenha o servico da aplicacao criado e funcionando com o `railway.json`.
2. No GitHub, abra `Settings > Secrets and variables > Actions`.
3. Em `Secrets`, crie:
   - `RAILWAY_TOKEN`: token gerado no Railway.
4. Em `Variables`, crie:
   - `RAILWAY_SERVICE_ID`: ID do servico da aplicacao no Railway.
5. Confirme que a branch principal do repositorio e `main`.

Depois disso, qualquer alteracao enviada para `main` dispara o deploy automaticamente, sem depender da sua maquina.

Tambem e possivel disparar manualmente pelo GitHub:

1. Abra `Actions`.
2. Selecione `Deploy Railway`.
3. Clique em `Run workflow`.

Se `RAILWAY_TOKEN` ou `RAILWAY_SERVICE_ID` nao estiver configurado, o workflow ainda valida o build, mas nao executa a publicacao.

O `Dockerfile` declara argumentos de build para as variaveis publicas do frontend:

- `VITE_APP_ID`
- `VITE_OAUTH_PORTAL_URL`
- `VITE_ANALYTICS_ENDPOINT`
- `VITE_ANALYTICS_WEBSITE_ID`
- `VITE_FRONTEND_FORGE_API_URL`
- `VITE_FRONTEND_FORGE_API_KEY`

No Railway, mantenha essas variaveis no servico da aplicacao antes de disparar o deploy. Se alguma delas mudar, faca novo deploy para gerar um novo bundle frontend.

## Deploy alternativo no Render

Use como alternativa caso o Railway nao esteja disponivel:

1. Crie um PostgreSQL no Render.
2. Crie um Web Service a partir do repositorio.
3. Escolha ambiente Docker.
4. Configure as variaveis obrigatorias no servico.
5. Use o mesmo health check path: `/ready`.
6. Use o dominio gerado pelo Render para teste e depois adicione o dominio proprio em Settings > Custom Domains.

Se optar por build nativo em vez de Docker no Render:

- Build command: `pnpm install --frozen-lockfile && pnpm run build`
- Start command: `pnpm start`
- Health check path: `/ready`

## Migracoes do banco

Para criar ou aplicar schema:

```bash
pnpm run db:generate
pnpm run db:migrate
```

Em producao, rode migracoes como etapa manual/controlada antes de promover uma versao. Evite rodar migracao automaticamente no start do servidor.

Tabelas esperadas na versao atual:

- `users`
- `resources`
- `projects`
- `phases`
- `absences`
- `allocations`
- `lookups`
- `app_users`

O primeiro admin real vem de `OWNER_OPEN_ID`: quando esse usuario autenticar, ele recebe papel `admin` na tabela `users`.

## Regras de integridade aplicadas pela API

A API valida as principais regras antes de gravar dados:

- Datas devem estar no formato `YYYY-MM-DD`.
- Data inicial nao pode ser maior que data final.
- Horas por dia e capacidade diaria devem ser maiores que zero e no maximo 24.
- Percentual de conclusao da fase deve ficar entre 0 e 100.
- Alocacoes exigem recurso/projeto existentes e fase existente quando informada.
- Ausencias exigem recurso existente.
- Fases exigem projeto existente.
- Recurso com alocacoes ou ausencias nao pode ser excluido.
- Projeto com fases ou alocacoes nao pode ser excluido.
- Fase com alocacoes nao pode ser excluida.
- Usuarios de acesso exigem e-mail valido e unico.

## Ambientes separados

Crie dois ambientes no Railway:

- `staging`: homologacao, ligado ao branch `develop` ou `staging`.
- `production`: producao, ligado ao branch `main`.

Cada ambiente deve ter:

- Banco PostgreSQL proprio.
- `JWT_SECRET` proprio.
- Configuracoes OAuth proprias, com redirect URI apontando para o dominio do ambiente.
- Dominios separados, por exemplo:
  - Homologacao: `planner-staging.techd.com.br`
  - Producao: `planner.techd.com.br`

## Dominio proprio

No servico Railway:

1. Abra Settings > Networking.
2. Gere um dominio Railway gratuito para teste.
3. Para dominio proprio, adicione `planner.techd.com.br`.
4. No DNS do dominio, crie o registro CNAME informado pelo Railway.
5. Aguarde a emissao automatica de HTTPS.

## Backup automatico

Para PostgreSQL no Railway:

- Use backups/snapshots gerenciados do Railway se o plano contratado oferecer.
- Para uma rotina independente, configure job diario com `pg_dump` para S3/R2.
- Teste restauracao periodicamente em `staging`.

## Login Google/Microsoft

O projeto atual usa o fluxo OAuth do template. Para produto profissional com Google/Microsoft direto:

- Configurar Google OAuth e Microsoft Entra ID.
- Salvar provedores e usuarios no PostgreSQL.
- Mapear dominios permitidos, por exemplo `@techd.com.br`.
- Ligar permissoes reais da API aos papeis `admin`, `manager`, `consultant` e `viewer`.

## Checklist antes de publicar

```bash
pnpm install
pnpm run check
pnpm run test
pnpm run build
```

Depois:

1. Aplicar migracoes no banco do ambiente.
2. Conferir `/health` e `/ready`.
3. Testar login.
4. Criar/editar dados principais.
5. Validar dominio e HTTPS.

Observacao: se `NODE_ENV=production` e alguma variavel obrigatoria estiver ausente, o servidor deve falhar no boot. Isso e intencional para evitar uma publicacao sem seguranca ou sem persistencia.
