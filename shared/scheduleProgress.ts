import type { ProjectScheduleView } from "./projectSchedule";

/** Read the saved text percentage; do not infer progress from elapsed dates. */
export function expectedProgress(
  custom: Record<string, string>
): string | null {
  for (const [alias, value] of Object.entries(custom)) {
    const name = alias
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    if (
      !/^%\s*esperado\s+previsto(?:\s+empresa)?(?:\s*\(\s*texto\s*\d+\s*\))?$/i.test(
        name
      )
    )
      continue;
    const text = value.trim();
    if (!/^\d+(?:[.,]\d+)?\s*%?$/.test(text)) continue;
    const number = Number(text.replace(/\s*%$/, "").replace(",", "."));
    if (!Number.isFinite(number) || number < 0 || number > 100) continue;
    // These are display percentages (e.g. 2.5 means 2.5%), not fractions.
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 }).format(number)}%`;
  }
  return null;
}

/** Old snapshots already contain the custom text, even when expected was null. */
export function withExpectedProgress<T extends ProjectScheduleView>(
  snapshot: T
): T {
  const resolve = (task: NonNullable<ProjectScheduleView["summary"]>) => ({
    ...task,
    expected: expectedProgress(task.custom),
  });
  return {
    ...snapshot,
    summary: snapshot.summary ? resolve(snapshot.summary) : null,
    tasks: snapshot.tasks.map(resolve),
  };
}
