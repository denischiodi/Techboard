import { expect, test } from "@playwright/test";
import { requireSafeE2eDatabaseUrl } from "./database-guard";

test("proteção do banco E2E aceita ausência de configuração", () => {
  const previous = process.env.E2E_DATABASE_URL;
  delete process.env.E2E_DATABASE_URL;
  expect(requireSafeE2eDatabaseUrl()).toBeNull();
  if (previous) process.env.E2E_DATABASE_URL = previous;
});

test("proteção recusa banco remoto sem nome de teste", () => {
  const previous = process.env.E2E_DATABASE_URL;
  process.env.E2E_DATABASE_URL = "postgresql://user:pass@db.example.com/production";
  expect(() => requireSafeE2eDatabaseUrl()).toThrow(/recusada/i);
  if (previous) process.env.E2E_DATABASE_URL = previous;
  else delete process.env.E2E_DATABASE_URL;
});
