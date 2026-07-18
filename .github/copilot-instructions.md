# Delivery Resource Planner

- Use TypeScript in strict mode and keep types explicit at API and database boundaries.
- Reuse the existing tRPC, Drizzle, React Query, React Hook Form, and Zod patterns.
- Validate untrusted inputs with Zod before business logic or persistence.
- Prefer focused changes and preserve Portuguese product copy.
- Run `pnpm validate` before proposing a completed change.
- Add Vitest coverage for server/domain behavior and Playwright coverage for critical user flows.
- Never commit credentials, tokens, DSNs, or populated `.env` files.
