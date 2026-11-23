import { useMemo, useRef, useState } from "react";
import { BarChart3, Download, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { readScheduleView, scheduleFileData } from "@/lib/scheduleImport";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Project, Phase } from "@shared/types";
import type {
  ProjectScheduleView,
  ScheduleViewTask,
} from "@shared/projectSchedule";

const day = (value: string | null | undefined) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "Não informada";
const percent = (value: number | null | undefined) =>
  value == null ? "Não disponível" : `${value}%`;

export function savedPhasesSchedule(phases: Phase[]): ScheduleViewTask[] {
  return phases.map((phase, index) => ({
    uid: index + 1,
    name: phase.notes?.trim() ? `${phase.phase} — ${phase.notes}` : phase.phase,
    start: phase.startDate,
    finish: phase.endDate,
    level: 1,
    summary: false,
    complete: phase.completionPercent ?? null,
    workComplete: null,
    expected: null,
    custom: {},
  }));
}

export function ScheduleContent({
  schedule,
  legacyTasks = [],
}: {
  schedule: ProjectScheduleView | null;
  legacyTasks?: ScheduleViewTask[];
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<ScheduleViewTask | null>(null);
  const tasks = schedule?.tasks || legacyTasks;
  const filtered = useMemo(
    () =>
      tasks.filter(
        task =>
          task.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
          (filter === "all" ||
            (filter === "pending" &&
              task.complete != null &&
              task.complete < 100) ||
            (filter === "done" && task.complete === 100) ||
            (filter === "summary" && task.summary))
      ),
    [tasks, search, filter]
  );
  const dated = tasks.filter(
    task =>
      /^\d{4}-\d{2}-\d{2}$/.test(task.start) &&
      /^\d{4}-\d{2}-\d{2}$/.test(task.finish)
  );
  const min = dated.length
    ? Math.min(...dated.map(task => Date.parse(task.start)))
    : 0;
  const max = dated.length
    ? Math.max(...dated.map(task => Date.parse(task.finish)))
    : 0;
  const span = Math.max(max - min, 86400000);
  const summary = schedule?.summary;
  const exportCsv = () => {
    const cell = (value: unknown) =>
      `"${String(value ?? "")
        .replace(/^[=+@-]/, "'")
        .replaceAll('"', '""')}"`;
    const rows = [
      [
        "Atividade",
        "Início",
        "Término",
        "Realizado duração (%)",
        "Realizado trabalho (%)",
        "Previsto",
        "Data de status",
      ],
      ...filtered.map(task => [
        task.name,
        task.start,
        task.finish,
        task.complete,
        task.workComplete,
        task.expected,
        schedule?.statusDate,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\ufeff" + rows.map(row => row.map(cell).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8" }
      )
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cronograma.csv";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="space-y-4">
      {!schedule && (
        <p className="rounded-md border bg-muted/30 p-3 text-sm">
          Exibindo as fases e os marcos salvos no TechDelivery. O arquivo MPP
          completo não foi preservado nesta importação. Importe-o novamente para
          disponibilizar todas as tarefas, os percentuais de trabalho e a
          data-base.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Realizado · duração", percent(summary?.complete)],
          ["Realizado · trabalho", percent(summary?.workComplete)],
          ["Previsto", summary?.expected || "Não disponível"],
          ["Data de status", day(schedule?.statusDate)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border p-3">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Buscar no cronograma"
            placeholder="Buscar atividade"
            className="pl-9"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
        <select
          aria-label="Filtrar cronograma"
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={filter}
          onChange={event => setFilter(event.target.value)}
        >
          <option value="all">Todas as tarefas</option>
          <option value="pending">Pendentes</option>
          <option value="done">Concluídas</option>
          <option value="summary">Fases / resumos</option>
        </select>
        <Button
          variant="outline"
          onClick={exportCsv}
          disabled={!filtered.length}
        >
          <Download className="mr-2 h-4 w-4" />
          CSV
        </Button>
        <span className="text-sm text-muted-foreground">
          {filtered.length} tarefas
        </span>
      </div>
      {dated.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Período do Gantt: {day(new Date(min).toISOString())} a{" "}
          {day(new Date(max).toISOString())}. Role a tabela para o lado para ver
          o gráfico completo.
        </p>
      )}
      <div className="max-h-[48vh] overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              {[
                "Atividade",
                "Início",
                "Término",
                "% concluído",
                "% trabalho",
                "% previsto",
                "Gantt",
              ].map(label => (
                <th
                  key={label}
                  className="whitespace-nowrap p-3 text-left font-medium"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(task => {
              const start = Date.parse(task.start),
                finish = Date.parse(task.finish);
              const valid =
                Number.isFinite(start) &&
                Number.isFinite(finish) &&
                finish >= start;
              return (
                <tr
                  key={task.uid}
                  className={`border-t ${task.summary ? "bg-muted/30 font-semibold" : ""}`}
                >
                  <td
                    className="min-w-72 max-w-lg p-3"
                    style={{
                      paddingLeft:
                        12 + Math.min(10, Math.max(0, task.level - 1)) * 14,
                    }}
                  >
                    <button
                      className="text-left hover:underline"
                      onClick={() => setSelected(task)}
                    >
                      {task.name}
                    </button>
                  </td>
                  <td className="whitespace-nowrap p-3">{day(task.start)}</td>
                  <td className="whitespace-nowrap p-3">{day(task.finish)}</td>
                  <td className="p-3">{percent(task.complete)}</td>
                  <td className="p-3">{percent(task.workComplete)}</td>
                  <td className="p-3">{task.expected || "Não disponível"}</td>
                  <td className="p-3">
                    <div
                      className="relative h-6 w-72 rounded bg-muted"
                      title={`${day(task.start)} a ${day(task.finish)}`}
                    >
                      {valid && (
                        <div
                          className={`absolute top-1 h-4 overflow-hidden rounded ${task.summary ? "bg-slate-300" : "bg-blue-200"}`}
                          style={{
                            left: `${((start - min) / span) * 100}%`,
                            width: `${Math.max(0.8, ((finish - start) / span) * 100)}%`,
                          }}
                        >
                          <div
                            className={`h-full ${task.summary ? "bg-slate-600" : "bg-blue-600"}`}
                            style={{ width: `${task.complete || 0}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr>
                <td
                  colSpan={7}
                  className="p-6 text-center text-muted-foreground"
                >
                  Nenhuma tarefa encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="rounded-md border p-3">
          <p className="mb-2 font-medium">{selected.name}</p>
          {Object.entries(selected.custom).length ? (
            <dl className="grid grid-cols-[minmax(130px,1fr)_2fr] gap-2 text-sm">
              {Object.entries(selected.custom).map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem campos personalizados disponíveis.
            </p>
          )}
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Valores conforme salvos na fonte, sem recálculo. Concluído mede duração;
        trabalho mede esforço. Previsto corresponde a “% Esperado Previsto”,
        quando identificado no arquivo. A data de status não garante a
        atualização de todas as atividades.
      </p>
    </div>
  );
}

export default function ProjectScheduleViewer({
  project,
  phases,
  preview = null,
}: {
  project: Project;
  phases: Phase[];
  preview?: ProjectScheduleView | null;
}) {
  const [open, setOpen] = useState(false);
  const [filePreview, setFilePreview] = useState<ProjectScheduleView | null>(
    null
  );
  const [reading, setReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedFile = useRef<File | null>(null);
  const utils = trpc.useUtils();
  const save = trpc.projects.schedule.save.useMutation();
  const busy = reading || save.isPending;
  const activePreview = filePreview || preview;
  const selectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setReading(true);
    try {
      const data = await readScheduleView(file);
      selectedFile.current = file;
      setFilePreview(data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao abrir cronograma"
      );
    } finally {
      setReading(false);
    }
  };
  const saveFile = async () => {
    const file = selectedFile.current;
    if (!file) return;
    try {
      await save.mutateAsync({
        projectId: project.id,
        fileName: file.name,
        fileData: await scheduleFileData(file),
      });
      await utils.projects.schedule.get.invalidate({ projectId: project.id });
      await query.refetch();
      selectedFile.current = null;
      setFilePreview(null);
      toast.success(
        "Cronograma completo salvo. Os marcos cadastrados foram preservados."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao salvar cronograma"
      );
    }
  };
  const query = trpc.projects.schedule.get.useQuery(
    { projectId: project.id },
    { enabled: open && !preview, staleTime: 0 }
  );
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title="Abrir cronograma"
      >
        <BarChart3 className="mr-1 h-4 w-4" />
        Visualizar cronograma
      </Button>
      <Dialog
        open={open}
        onOpenChange={value => {
          if (!busy) {
            setOpen(value);
            if (!value) {
              setFilePreview(null);
              selectedFile.current = null;
            }
          }
        }}
      >
        <DialogContent className="flex max-h-[94vh] w-[96vw] flex-col overflow-hidden sm:max-w-[1500px]">
          <DialogHeader>
            <DialogTitle>Cronograma — {project.name}</DialogTitle>
          </DialogHeader>
          {!preview && (
            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept=".mpp"
                  className="hidden"
                  aria-label="Arquivo MPP completo"
                  onChange={selectFile}
                  disabled={busy}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {reading ? "Lendo arquivo…" : "Importar MPP completo"}
                </Button>
                {filePreview && (
                  <>
                    <Button type="button" disabled={busy} onClick={saveFile}>
                      {save.isPending
                        ? "Salvando…"
                        : "Salvar arquivo no projeto"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        selectedFile.current = null;
                        setFilePreview(null);
                      }}
                    >
                      Descartar prévia
                    </Button>
                  </>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Abra todas as tarefas do arquivo original. Salvar aqui preserva
                as fases e os marcos já cadastrados.
              </p>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {activePreview ? (
              <>
                <p className="mb-3 text-sm text-muted-foreground">
                  Prévia de {activePreview.fileName}. Salve o cronograma para
                  consultá-lo novamente.
                </p>
                <ScheduleContent
                  key={activePreview.fileName}
                  schedule={activePreview}
                />
              </>
            ) : query.isLoading ? (
              <p role="status">Carregando cronograma…</p>
            ) : query.error ? (
              <div role="alert">
                <p>{query.error.message}</p>
                <Button variant="outline" onClick={() => query.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted-foreground">
                  {query.data
                    ? `${query.data.fileName} · Salvo em ${day(query.data.savedAt)}`
                    : "Marcos salvos no projeto"}
                </p>
                <ScheduleContent
                  schedule={query.data || null}
                  legacyTasks={savedPhasesSchedule(phases)}
                />
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
