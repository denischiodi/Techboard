export type ScheduleTask = {
  uid: number;
  name: string;
  start: Date;
  finish: Date;
  parentUid?: number;
  outlineLevel?: number;
  percentComplete?: number;
};

export function summarizeSchedule(tasks: ScheduleTask[], manager = "") {
  const dated = tasks.filter(
    task =>
      task.name.trim() &&
      Number.isFinite(task.start?.getTime()) &&
      Number.isFinite(task.finish?.getTime())
  );
  if (!dated.length)
    throw new Error("O arquivo não contém tarefas com datas válidas.");
  const phaseName = (name: string) =>
    /^(?:\d+[.\s-]*)?(Prepare|Explore|Realize|Deploy|Run)(?:\s*[-–:(]|$)/i.exec(
      name.trim()
    )?.[1];
  // Prefer SAP phase summaries; otherwise expose the first branching level of the plan.
  let phases = dated.filter(
    task =>
      phaseName(task.name) ||
      /^encerramento(?: do projeto)?$/i.test(task.name.trim())
  );
  if (!phases.length) {
    const candidates = dated.filter(task => task.uid !== 0);
    const level = Math.min(...candidates.map(task => task.outlineLevel ?? 1));
    phases = candidates.filter(task => (task.outlineLevel ?? 1) === level);
    const visited = new Set<number>();
    while (phases.length === 1 && !visited.has(phases[0].uid)) {
      visited.add(phases[0].uid);
      const children = dated.filter(
        task => task.parentUid === phases[0].uid && task.uid !== phases[0].uid
      );
      if (!children.length) break;
      phases = children;
    }
  }
  if (!phases.length) throw new Error("Nenhuma fase encontrada no cronograma.");
  if (phases.length > 200)
    throw new Error(
      "O cronograma possui mais de 200 fases. Organize as tarefas em fases de resumo no Project."
    );
  const day = (date: Date) => date.toISOString().slice(0, 10);
  const rows = phases
    .map(task => {
      if (task.start > task.finish)
        throw new Error(`A fase ${task.name} possui início posterior ao fim.`);
      const matched = phaseName(task.name);
      const phase = matched
        ? matched[0].toUpperCase() + matched.slice(1).toLowerCase()
        : task.name.trim();
      const completionPercent = Math.max(
        0,
        Math.min(100, Math.round(task.percentComplete ?? 0))
      );
      return {
        phase,
        startDate: day(task.start),
        endDate: day(task.finish),
        responsible: manager,
        completionPercent,
        status:
          completionPercent === 100
            ? "Concluído"
            : completionPercent > 0
              ? "Em andamento"
              : "Planejado",
        notes:
          task.name.trim() === phase ||
          task.name.trim().toLowerCase() === phase.toLowerCase()
            ? ""
            : task.name.trim(),
      };
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return {
    startDate: dated.map(task => day(task.start)).sort()[0],
    endDate: dated
      .map(task => day(task.finish))
      .sort()
      .at(-1)!,
    rows,
  };
}

export async function readSchedule(file: File, manager: string) {
  if (!file.name.toLowerCase().endsWith(".mpp"))
    throw new Error("Selecione um arquivo Microsoft Project (.mpp).");
  if (file.size > 20 * 1024 * 1024)
    throw new Error("O cronograma deve ter no máximo 20 MB.");
  const { readProject } = await import("mppwriter");
  let tasks: ScheduleTask[];
  try {
    tasks = readProject(new Uint8Array(await file.arrayBuffer())).tasks;
  } catch {
    throw new Error(
      "Não foi possível ler o MPP. Use um arquivo válido do Project 2010 ou posterior, sem senha."
    );
  }
  return summarizeSchedule(tasks, manager);
}
