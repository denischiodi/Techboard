import * as M from "mppwriter";
import { expectedProgress } from "./scheduleProgress";
import { readMppText } from "./mppText";

export type ScheduleViewTask = {
  uid: number;
  name: string;
  start: string;
  finish: string;
  level: number;
  summary: boolean;
  complete: number | null;
  workComplete: number | null;
  expected: string | null;
  custom: Record<string, string>;
};

export type ProjectScheduleView = {
  fileName: string;
  statusDate: string | null;
  summary: ScheduleViewTask | null;
  tasks: ScheduleViewTask[];
};

/** MPP dates are wall-clock dates encoded as UTC. Preserve the file's day. */
export const scheduleDay = (value: Date | null | undefined) =>
  value && Number.isFinite(value.getTime())
    ? value.toISOString().slice(0, 10)
    : "";

export function parseProjectSchedule(
  bytes: Uint8Array,
  fileName: string
): ProjectScheduleView {
  const project = M.readProject(bytes);
  const tree = M.readCfb(bytes);
  const props = M.parseProps(tree.get(`${M.PRJ}/Props`)!).values;
  const map = M.parseFieldMap(props.get(M.PROPS_TASK_FIELD_MAP)!);
  const fields = new Map(
    map.filter(item => item.inFixed).map(item => [item.fieldId, item])
  );
  const taskPath = `${M.PRJ}/TBkndTask`;
  const records = (suffix: string, metaSize: number) => {
    const meta = tree.get(`${taskPath}/${suffix}Meta`);
    const data = tree.get(`${taskPath}/${suffix}Data`);
    return meta && data
      ? M.splitFixedData(data, M.parseFixedMetaAuto(meta, metaSize).items)
      : [];
  };
  const fixed = records("Fixed", M.TASK_META_SIZE);
  const fixed2 = records("Fixed2", M.TASK_META2_SIZE);
  const varMeta = tree.get(`${taskPath}/VarMeta`);
  const varData = tree.get(`${taskPath}/Var2Data`);
  const variables = varMeta
    ? M.parseVarMeta(varMeta).table
    : new Map<number, Map<number, number>>();
  const variable = (uid: number, id: number) => {
    const offset = variables.get(uid)?.get(id);
    return offset !== undefined && varData ? M.readVar(varData, offset) : null;
  };
  const fixedValue = (row: number, id: number, type: "u16" | "u32" | "f64") => {
    const field = fields.get(id);
    if (!field) return null;
    const record = (field.block === 0 ? fixed : fixed2)[row];
    const size = type === "u16" ? 2 : type === "u32" ? 4 : 8;
    if (!record || field.offset < 0 || field.offset + size > record.length)
      return null;
    const view = new DataView(
      record.buffer,
      record.byteOffset,
      record.byteLength
    );
    const result =
      type === "u16"
        ? view.getUint16(field.offset, true)
        : type === "u32"
          ? view.getUint32(field.offset, true)
          : view.getFloat64(field.offset, true);
    return Number.isFinite(result) ? result : null;
  };
  // Task Props stores custom-field aliases as (field id, relative string offset).
  const aliases = new Map<number, string>();
  const taskProps = tree.get(`${taskPath}/Props`);
  const definitions = taskProps
    ? M.parseProps(taskProps).values.get(71303169)
    : null;
  if (definitions && definitions.length >= 12) {
    const view = new DataView(
      definitions.buffer,
      definitions.byteOffset,
      definitions.byteLength
    );
    const count = view.getUint32(8, true);
    if (count <= 1000 && 12 + count * 8 <= definitions.length) {
      for (let i = 0; i < count; i++) {
        const id = view.getUint32(12 + i * 8, true) & 0xffff;
        const offset = view.getUint32(16 + i * 8, true) + 4;
        if (
          offset < 12 + count * 8 ||
          offset >= definitions.length ||
          offset % 2
        )
          continue;
        let end = offset;
        while (end + 1 < definitions.length && view.getUint16(end, true))
          end += 2;
        const alias = new TextDecoder("utf-16le").decode(
          definitions.slice(offset, end)
        );
        if (alias) aliases.set(id, alias);
      }
    }
  }
  const sourceTasks = new Map(project.tasks.map(task => [task.uid, task]));
  const parents = new Set(project.tasks.map(task => task.parentUid));
  const percent = (value: number | null) =>
    value !== null && value >= 0 && value <= 100 ? value : null;
  const taskByUid = new Map<number, ScheduleViewTask>();
  const displayIds = new Map<number, number>();
  fixed.forEach((record, row) => {
    if (record.length <= 100) return;
    const uid = fixedValue(row, M.NATIVE.UNIQUE_ID, "u32");
    if (uid === null || (uid !== 0 && !sourceTasks.has(uid))) return;
    const source = sourceTasks.get(uid);
    const timestamp = (id: number) => {
      const field = fields.get(id);
      const data = field ? (field.block === 0 ? fixed : fixed2)[row] : null;
      return field && data && field.offset + 4 <= data.length
        ? M.decodeTimestamp(data, field.offset)
        : null;
    };
    const custom: Record<string, string> = {};
    M.TEXT_IDS.forEach((id, index) => {
      const raw = variable(uid, id);
      if (!raw) return;
      const text = readMppText(raw);
      if (text) custom[aliases.get(id) || `Texto${index + 1}`] = text;
    });
    displayIds.set(uid, fixedValue(row, M.NATIVE.ID, "u32") ?? row);
    taskByUid.set(uid, {
      uid,
      name:
        source?.name ||
        M.decodeUnicode(variable(uid, M.NATIVE.NAME) || new Uint8Array()),
      start: scheduleDay(source?.start || timestamp(M.NATIVE.START)),
      finish: scheduleDay(source?.finish || timestamp(M.NATIVE.FINISH)),
      level: uid === 0 ? 0 : source?.outlineLevel || 1,
      summary: uid === 0 || parents.has(uid),
      complete: percent(fixedValue(row, M.NATIVE.PERCENT_COMPLETE, "u16")),
      workComplete: percent(
        fixedValue(row, M.NATIVE.PERCENT_WORK_COMPLETE, "u16")
      ),
      expected: expectedProgress(custom),
      custom,
    });
  });
  // Project can retain older fixed records for the same UID after edits.
  const tasks = [...taskByUid.values()].sort(
    (a, b) => (displayIds.get(a.uid) || 0) - (displayIds.get(b.uid) || 0)
  );
  const status = props.get(M.PROPS_STATUS_DATE);
  return {
    fileName,
    statusDate:
      status && status.length >= 4
        ? scheduleDay(M.decodeTimestamp(status, 0)) || null
        : null,
    summary: tasks.find(task => task.uid === 0) || null,
    tasks: tasks.filter(task => task.uid !== 0 && task.name.trim()),
  };
}
