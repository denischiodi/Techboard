# Plano de Testes - TechBoard

Este plano cobre os fluxos principais do TechBoard como ferramenta de gestão de recursos, capacidade e alocação.

## 1. Acesso e permissões

- Admin acessa Dashboard, Cadastros, Recursos, Projetos, Férias/Ausências, Planner e Gestão de Acesso.
- Gestor acessa as abas liberadas no cadastro de acesso.
- Líder técnico visualiza apenas recursos, férias e alocações do próprio time.
- Líder técnico consegue criar férias para recurso do próprio time.
- Líder técnico não consegue criar férias para recurso fora do próprio time.
- Consultor visualiza apenas Planner, próprio cadastro e próprias férias.
- Consultor não vê botões de criar, editar, excluir, importar ou arrastar alocações.
- Usuário inativo não acessa o sistema.
- E-mail sem cadastro ativo não recebe login.

## 2. Recursos

- Criar recurso com nome, perfil, frentes, capacidade, tipo de contratação, início, fim, aniversário e dias de férias.
- Editar recurso sem perder frentes selecionadas.
- Bloquear nome duplicado de colaborador, ignorando maiúsculas/minúsculas.
- Permitir dias de férias igual a zero.
- Exportar recursos com todos os campos relevantes, incluindo tipo de contratação e data de aniversário.
- Importar planilha de recursos e validar linhas com erro.
- Filtrar recursos por perfil, frente, status, tipo, saldo, saída e busca textual.

## 3. Projetos

- Criar projeto com nome, cliente, gerente, período, status e frentes.
- Bloquear nome duplicado de projeto.
- Bloquear projeto com data final menor que data inicial.
- Editar projeto mantendo frentes e observações.
- Importar planilha de projetos.
- Abrir cronograma de marcos do projeto.

## 4. Marcos do projeto

- Gerar marcos automáticos dentro do período do projeto.
- Adicionar linha manual de marco.
- Editar fase/grupo, início, fim, responsável, percentual, status e descrição.
- Bloquear marco fora do início/fim do projeto.
- Bloquear marco com data final menor que data inicial.
- Bloquear sobreposição de marcos.
- Permitir repetir a mesma fase/grupo em períodos diferentes sem sobreposição.
- Salvar cronograma sem erro de chave duplicada.
- Visualizar marcos no Planner.

## 5. Alocações

- Criar alocação pelo Planner.
- Criar alocação rápida a partir de projeto faltando recurso.
- Ao alocar uma frente, sugerir consultores daquela frente/módulo.
- Não listar todos os consultores quando a frente já está definida.
- Permitir alocação acima da capacidade diária com alerta, sem bloquear.
- Bloquear o mesmo consultor no mesmo projeto, mesma frente e período sobreposto.
- Permitir o mesmo consultor no mesmo projeto em períodos diferentes.
- Editar alocação no desktop.
- Editar alocação no celular sem campos sobrepostos.
- Excluir alocação com confirmação.

## 6. Férias e ausências

- Criar férias aprovadas.
- Férias bloqueiam disponibilidade.
- Dias vendidos consomem saldo de férias, mas não bloqueiam disponibilidade.
- Dias vendidos usam data única e quantidade de dias.
- Bloquear férias antes de completar 1 ano de consultoria.
- Não acumular saldo de período anterior.
- Bloquear férias fora do período liberado.
- Bloquear consumo acima do saldo disponível.
- Importar planilha de ausências.
- Exibir saldo correto por CLT/PJ e dias vendidos.

## 7. Dashboard

- Exibir recursos ativos, projetos ativos, horas na semana, sobrealocados, disponíveis e em férias.
- Exibir recursos sem alocação com nome correto.
- Exibir projetos faltando recurso por frente.
- Exibir saída de consultores e impacto nas alocações/projetos.
- Exibir aniversários próximos.
- Cards com rolagem interna quando houver muitos alertas.

## 8. Planner

- Navegar por semana, mês e ano.
- Filtrar por múltiplos recursos.
- Filtrar por múltiplos projetos.
- Filtrar por múltiplos gestores.
- Filtrar por múltiplas frentes.
- Filtrar por status/capacidade.
- Ordenar por nome e frente.
- Usar no celular sem a tela ficar minúscula ou quebrada.
- Consultor vê somente próprias alocações.

## 9. Performance e produção

- Abrir Dashboard em menos de 3 segundos com dados reais.
- Abrir Planner com todas as alocações sem travar.
- Importar planilhas grandes com retorno claro de criados, atualizados e ignorados.
- Não expor erro técnico cru para usuário final.
- Deploy publica automaticamente após push na branch principal.

## 10. Testes automatizados

Executar:

```bash
npm test
```

Cobertura automatizada atual:

- Autenticação e rate limit de código.
- Bloqueio de rotas sem login.
- Permissões de admin, consultor e líder técnico.
- CRUD e validações de recursos.
- CRUD e validações de projetos.
- Marcos/fases com percentual válido.
- Bloqueio de exclusão de marco vinculado.
- Alocações com data inválida.
- Bloqueio de alocação duplicada por consultor/projeto/frente/período.
- Permissão para alocação acima da capacidade.
- Férias antes de 1 ano.
- Dias vendidos como ajuste de saldo.
- Bloqueio de consumo acima do saldo de férias.
- Alertas de projeto faltando recurso e saída de consultor.
