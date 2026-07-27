# Suíte E2E

## Execução segura

Os testes destrutivos de TechMove só são habilitados quando
`E2E_DATABASE_URL` está configurada. A proteção recusa bancos remotos cujo nome
não contenha `test`, `e2e` ou `ci`.

```bash
E2E_DATABASE_URL="postgresql://usuario:senha@localhost:5432/delivery_e2e" \
  pnpm test:e2e
```

Sem banco, a suíte ainda executa navegação, responsividade e os CRUDs suportados
pelo armazenamento local do TechBoard. Os cenários que exigem persistência
PostgreSQL aparecem como ignorados com uma justificativa explícita.

## Matriz

- `chromium-desktop`: 1440 × 900
- `chromium-laptop`: 1366 × 768
- `chromium-tablet`: 768 × 1024
- `chromium-mobile`: Pixel 7
- `chromium-mobile-min`: 360 × 800

O relatório HTML é salvo em `playwright-report/`. Screenshots, vídeos e traces
de falhas ficam em `test-results/`.

## Execuções úteis

```bash
pnpm test:e2e
pnpm exec playwright test --project=chromium-desktop
pnpm exec playwright test e2e/techmove.gaps.spec.ts
pnpm exec playwright show-report
```
