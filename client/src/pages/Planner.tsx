import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronDown, ChevronLeft, ChevronRight, Download, AlertTriangle, Upload, Calendar, CalendarDays, CalendarRange, ArrowUpDown, ArrowUp, ArrowDown, FolderSearch, UserX, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { format, addDays, startOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, differenceInDays, getDay, startOfYear, addMonths, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { Allocation, Resource, Project, Phase, Absence, ResourceFront, AllocationType, AllocationStatus, ProjectFrontGap, ProjectMissingFrontsAlert, ResourceEndDateImpact } from "../../../shared/types";
import * as XLSX from "xlsx";

const FRONTS_FALLBACK: ResourceFront[] = ['FI', 'CO', 'MM', 'SD', 'PP', 'QM', 'EWM', 'BTP', 'Integrações', 'Dados', 'Testes', 'PMO'];
const ALLOCATION_TYPES: AllocationType[] = ['Projeto', 'Interna', 'Suporte', 'Treinamento'];
const ALLOCATION_STATUSES: AllocationStatus[] = ['Planejado', 'Confirmado', 'Em risco', 'Concluído'];

const PROJECT_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500',
];

const PROJECT_COLORS_HEX = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#f43f5e', '#06b6d4', '#f97316', '#14b8a6'];
const ALLOCATION_FILTER_OPTIONS = [
  { value: 'withalloc', label: 'Com Alocação' },
  { value: 'noalloc', label: 'Sem Alocação' },
  { value: 'over', label: 'Sobrealocados' },
  { value: 'ok', label: 'Dentro da Capacidade' },
];

type MultiFilterOption = {
  value: string;
  label: string;
};

type AnnualWeek = {
  start: Date;
  end: Date;
  label: string;
  monthIdx: number;
};

function getUnallocatedResourceName(item: string | { id: string; name: string }, resources: Resource[]) {
  if (typeof item !== 'string') return item.name || item.id;
  const resource = resources.find(res => res.id === item);
  return resource ? resource.name : item;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?';
}

function ResourcePlannerLabel({ resource, compact = false }: { resource: Resource; compact?: boolean }) {
  const group = resource.group?.trim();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar className={compact ? "h-7 w-7 shrink-0 border" : "h-8 w-8 shrink-0 border"}>
        <AvatarImage src={resource.photoUrl || ""} alt={resource.name} className="object-cover" />
        <AvatarFallback className="text-[10px] font-semibold">{initials(resource.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="break-words text-xs font-medium leading-tight sm:text-sm">{resource.name}</div>
        <div className="text-[10px] text-muted-foreground">{resource.front} - {resource.dailyCapacity}h/dia</div>
        {group ? <div className="truncate text-[10px] text-muted-foreground">Lider/Grupo: {group}</div> : null}
      </div>
    </div>
  );
}

function formatDisplayDate(date?: string) {
  if (!date) return '';
  const [year, month, day] = date.split('-');
  return year && month && day ? `${day}/${month}/${year}` : date;
}

function maxIsoDate(...dates: Array<string | undefined>) {
  return dates.filter(Boolean).reduce((max, date) => !max || (date as string) > max ? date as string : max, '');
}

function minIsoDate(...dates: Array<string | undefined>) {
  return dates.filter(Boolean).reduce((min, date) => !min || (date as string) < min ? date as string : min, '');
}

function shouldExtendGapToProjectEnd(reason?: string) {
  const normalized = (reason || '').toLowerCase();
  return normalized.includes('fim do projeto') || normalized.includes('sai da consultoria');
}

function MultiFilter({
  label,
  allLabel,
  selected,
  options,
  onChange,
  className = "sm:w-[150px]",
}: {
  label: string;
  allLabel: string;
  selected: string[];
  options: MultiFilterOption[];
  onChange: (values: string[]) => void;
  className?: string;
}) {
  const selectedLabels = selected
    .map(value => options.find(option => option.value === value)?.label)
    .filter(Boolean) as string[];
  const triggerLabel = selectedLabels.length === 0
    ? allLabel
    : selectedLabels.length === 1
    ? selectedLabels[0]
    : `${selectedLabels.length} selecionados`;

  const toggle = (value: string) => {
    onChange(selected.includes(value)
      ? selected.filter(item => item !== value)
      : [...selected, value]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`h-8 w-full justify-between gap-2 px-3 text-xs font-normal ${className}`}
        >
          <span className="min-w-0 truncate">{triggerLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <p className="text-xs font-medium">{label}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onChange([])}
            disabled={selected.length === 0}
          >
            Limpar
          </Button>
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {options.map(option => {
            const checked = selected.includes(option.value);
            return (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(option.value)}
                />
                <span className="min-w-0 truncate">{option.label}</span>
              </label>
            );
          })}
        </div>
        {options.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">Nenhuma opção disponível</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function isBlockingAbsence(absence: Absence) {
  const normalizedType = absence.type.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return normalizedType !== 'dias vendidos';
}

function getProjectColor(projectId: string, projects: Project[]): string {
  const idx = projects.findIndex(p => p.id === projectId);
  return PROJECT_COLORS[idx % PROJECT_COLORS.length];
}

function getProjectColorHex(projectId: string, projects: Project[]): string {
  const idx = projects.findIndex(p => p.id === projectId);
  return PROJECT_COLORS_HEX[idx % PROJECT_COLORS_HEX.length];
}

function getActiveProjectPhase(projectId: string, phases: Phase[], referenceDate: string) {
  return phases
    .filter(phase => phase.projectId === projectId && phase.startDate <= referenceDate && phase.endDate >= referenceDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] || null;
}

function getPhaseDisplayName(phase: Phase | null) {
  if (!phase) return '';
  return phase.notes?.trim() ? `${phase.phase} · ${phase.notes.trim()}` : phase.phase;
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA <= endB && endA >= startB;
}

function getPhaseStatusClass(status: string) {
  const normalized = status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (normalized.includes('concluido')) return 'border-emerald-200 bg-emerald-100 text-emerald-900';
  if (normalized.includes('risco')) return 'border-red-200 bg-red-100 text-red-900';
  if (normalized.includes('andamento')) return 'border-blue-200 bg-blue-100 text-blue-900';
  return 'border-slate-200 bg-slate-100 text-slate-800';
}

function getProjectTimelineItems(project: Project, phases: Phase[], days: Date[]) {
  if (days.length === 0) return { projectBar: null, phaseBars: [] as any[] };
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const firstDate = format(firstDay, 'yyyy-MM-dd');
  const lastDate = format(lastDay, 'yyyy-MM-dd');
  const totalDays = days.length;

  const toVisibleRange = (startDate: string, endDate: string) => {
    const itemStart = parseISO(startDate);
    const itemEnd = parseISO(endDate);
    const visibleStart = itemStart < firstDay ? firstDay : itemStart;
    const visibleEnd = itemEnd > lastDay ? lastDay : itemEnd;
    const startIdx = days.findIndex(day => format(day, 'yyyy-MM-dd') === format(visibleStart, 'yyyy-MM-dd'));
    const endIdx = days.findIndex(day => format(day, 'yyyy-MM-dd') === format(visibleEnd, 'yyyy-MM-dd'));
    if (startIdx === -1 || endIdx === -1) return null;
    return {
      startIdx,
      endIdx,
      left: `${(startIdx / totalDays) * 100}%`,
      width: `${((endIdx - startIdx + 1) / totalDays) * 100}%`,
      endLeft: `${((endIdx + 1) / totalDays) * 100}%`,
      startsBeforeView: itemStart < firstDay,
      endsAfterView: itemEnd > lastDay,
    };
  };

  const projectBar = rangesOverlap(project.startDate, project.endDate, firstDate, lastDate)
    ? toVisibleRange(project.startDate, project.endDate)
    : null;

  const phaseBars = phases
    .filter(phase => phase.projectId === project.id && rangesOverlap(phase.startDate, phase.endDate, firstDate, lastDate))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .flatMap(phase => {
      const range = toVisibleRange(phase.startDate, phase.endDate);
      if (!range) return [];
      return [{ phase, range }];
    });

  return { projectBar, phaseBars };
}

function ProjectTimelineRow({ project, phases, days, projects }: {
  project: Project;
  phases: Phase[];
  days: Date[];
  projects: Project[];
}) {
  const { projectBar, phaseBars } = getProjectTimelineItems(project, phases, days);
  const totalDays = days.length;
  const projectColor = getProjectColorHex(project.id, projects);
  const rowHeight = Math.max(58, phaseBars.length > 1 ? 72 : 58);

  if (!projectBar && phaseBars.length === 0) return null;

  return (
    <tr className="border-b bg-slate-50/70">
      <td className="sticky left-0 z-10 min-w-[132px] border-r bg-slate-50 p-2 sm:min-w-[180px]">
        <div className="text-xs font-semibold leading-tight text-slate-900 sm:text-sm">{project.name}</div>
        <div className="text-[10px] text-muted-foreground">Projeto · {project.startDate} a {project.endDate}</div>
      </td>
      <td className="relative p-0" colSpan={totalDays}>
        <div className="flex w-full" style={{ minHeight: `${rowHeight}px` }}>
          {days.map(day => (
            <div
              key={day.toISOString()}
              className="flex-1 border-r border-border/30 last:border-r-0"
              style={{ minWidth: '24px' }}
            />
          ))}
        </div>

        {projectBar && (
          <div
            className="absolute top-2 h-3 rounded-full opacity-25"
            style={{
              left: projectBar.left,
              width: projectBar.width,
              backgroundColor: projectColor,
              borderRadius: projectBar.startsBeforeView ? '0 999px 999px 0' : projectBar.endsAfterView ? '999px 0 0 999px' : '999px',
            }}
            title={`${project.name} | ${project.startDate} → ${project.endDate}`}
          />
        )}

        {phaseBars.map(({ phase, range }, idx) => {
          const label = phase.notes?.trim() || phase.phase;
          const top = 20 + (idx % 2) * 24;
          return (
            <div key={phase.id}>
              <div
                className={`absolute flex h-[20px] items-center overflow-hidden truncate rounded border px-2 text-[10px] font-medium shadow-sm ${getPhaseStatusClass(phase.status)}`}
                style={{
                  left: range.left,
                  width: range.width,
                  top: `${top}px`,
                  minWidth: '36px',
                }}
                title={`${project.name} | ${phase.phase}: ${label} | ${phase.startDate} → ${phase.endDate} | ${phase.status} | ${phase.completionPercent}%`}
              >
                <span className="truncate">{label}</span>
                <span className="ml-1 shrink-0 opacity-70">({phase.phase})</span>
              </div>
              <div
                className="absolute bottom-1 top-1 w-[2px] bg-red-500"
                style={{ left: `calc(${range.endLeft} - 1px)` }}
                title={`Fim do marco: ${label} - ${phase.endDate}`}
              />
              <div
                className="absolute rounded bg-red-600 px-1 py-0.5 text-[9px] font-semibold text-white shadow-sm"
                style={{ left: `calc(${range.endLeft} + 3px)`, top: `${top + 1}px`, maxWidth: '120px' }}
                title={`Fim do marco: ${label} - ${phase.endDate}`}
              >
                <span className="block truncate">{label}</span>
              </div>
            </div>
          );
        })}
      </td>
    </tr>
  );
}

// ===== Droppable Day Cell (Weekly View) =====
function DayCell({ resourceId, date, totalHours, capacity, isAbsent, isPastEndDate, allocCount, onClickEmpty, children }: {
  resourceId: string; date: string; totalHours: number; capacity: number;
  isAbsent: boolean; isPastEndDate: boolean; allocCount: number; onClickEmpty: () => void; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${resourceId}-${date}` });
  const isOverallocated = totalHours > capacity;

  let bgClass = 'bg-white';
  if (isPastEndDate) bgClass = 'bg-gray-100/90';
  else if (isAbsent) bgClass = 'bg-blue-50/80';
  else if (isOverallocated) bgClass = 'bg-red-50/60';
  else if (totalHours >= capacity && totalHours > 0) bgClass = 'bg-amber-50/50';

  return (
    <div
      ref={setNodeRef}
      className={`p-1 border-r last:border-r-0 relative ${bgClass} ${isOver ? 'ring-2 ring-primary/40' : ''}`}
      style={{ minHeight: `${Math.max(70, allocCount > 2 ? allocCount * 30 + 18 : 70)}px` }}
      onClick={(e) => { if ((e.target as HTMLElement).closest('[data-alloc-card]')) return; onClickEmpty(); }}
    >
      {/* Hours indicator */}
      <div className={`text-[9px] text-right mb-0.5 font-medium ${isOverallocated ? 'text-red-600' : totalHours > 0 ? 'text-muted-foreground' : 'text-transparent'}`}>
        {totalHours > 0 && `${totalHours}/${capacity}h`}
        {isOverallocated && ' ⚠️'}
      </div>
      {isPastEndDate && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-[9px] text-gray-500 font-medium">Indisponível</span></div>}
      {isAbsent && !isPastEndDate && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-[9px] text-blue-500 font-medium">Ausente</span></div>}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

// ===== Draggable Allocation Card with Resize (Weekly View) =====
function AllocationCard({ allocation, projects, phases, referenceDate, onEdit, onResizeEnd, isDragging }: {
  allocation: Allocation; projects: Project[]; phases: Phase[]; referenceDate: string; onEdit: (a: Allocation) => void;
  onResizeEnd: (id: string, direction: 'left' | 'right', daysDelta: number) => void;
  isDragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: allocation.id,
    data: { allocation },
  });

  const project = projects.find(p => p.id === allocation.projectId);
  const activePhase = getActiveProjectPhase(allocation.projectId, phases, referenceDate);
  const phaseName = getPhaseDisplayName(activePhase);
  const colorClass = getProjectColor(allocation.projectId, projects);
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;

  const handleResizeStart = (e: React.MouseEvent, direction: 'left' | 'right') => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const cellWidth = (e.currentTarget.closest('td') as HTMLElement)?.offsetWidth || 140;

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const daysDelta = Math.round(delta / cellWidth);
      if (daysDelta !== 0) {
        onResizeEnd(allocation.id, direction, daysDelta);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      ref={setNodeRef}
      data-alloc-card
      className={`group relative rounded px-1.5 py-0.5 text-[10px] text-white cursor-grab active:cursor-grabbing transition-all ${colorClass} ${isDragging ? 'opacity-50 scale-95' : 'hover:brightness-110'}`}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); onEdit(allocation); }}
    >
      {/* Left resize handle */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 bg-white/30 rounded-l" onMouseDown={(e) => handleResizeStart(e, 'left')} />
      {/* Right resize handle */}
      <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize opacity-0 group-hover:opacity-100 bg-white/30 rounded-r" onMouseDown={(e) => handleResizeStart(e, 'right')} />
      <div className="truncate font-medium">{project?.name?.substring(0, 15)}</div>
      {phaseName && <div className="truncate text-[8px] opacity-85">Marco: {phaseName}</div>}
      <div className="text-[9px] opacity-80">{allocation.hoursPerDay}h</div>
      {allocation.notes && <div className="text-[8px] opacity-70 truncate italic">{allocation.notes}</div>}
    </div>
  );
}

// ===== Monthly Gantt Row with Drag and Resize =====
function MonthlyGanttRow({ resource, allocations, projects, phases, absences, days, onClickAllocation, onClickDay, onMoveAllocation, onResizeAllocation }: {
  resource: Resource;
  allocations: Allocation[];
  projects: Project[];
  phases: Phase[];
  absences: Absence[];
  days: Date[];
  onClickAllocation: (a: Allocation) => void;
  onClickDay: (resourceId: string, date: string) => void;
  onMoveAllocation: (id: string, daysDelta: number) => void;
  onResizeAllocation: (id: string, direction: 'left' | 'right', daysDelta: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const resourceAllocations = allocations.filter(a => a.resourceId === resource.id);

  const isAbsent = (day: Date) => {
    return absences.some(abs => {
      if (abs.resourceId !== resource.id) return false;
      if (!isBlockingAbsence(abs)) return false;
      const start = parseISO(abs.startDate);
      const end = parseISO(abs.endDate);
      return day >= start && day <= end;
    });
  };

  const getTotalHoursForDay = (day: Date) => {
    return resourceAllocations.reduce((sum, a) => {
      const start = parseISO(a.startDate);
      const end = parseISO(a.endDate);
      if (day >= start && day <= end) return sum + a.hoursPerDay;
      return sum;
    }, 0);
  };

  const bars = resourceAllocations.map(alloc => {
    const allocStart = parseISO(alloc.startDate);
    const allocEnd = parseISO(alloc.endDate);
    const firstDay = days[0];
    const lastDay = days[days.length - 1];
    const visibleStart = allocStart < firstDay ? firstDay : allocStart;
    const visibleEnd = allocEnd > lastDay ? lastDay : allocEnd;
    const startIdx = days.findIndex(d => format(d, 'yyyy-MM-dd') === format(visibleStart, 'yyyy-MM-dd'));
    const endIdx = days.findIndex(d => format(d, 'yyyy-MM-dd') === format(visibleEnd, 'yyyy-MM-dd'));
    if (startIdx === -1 || endIdx === -1) return null;
    return {
      alloc, startIdx, endIdx,
      startsBeforeView: allocStart < firstDay,
      endsAfterView: allocEnd > lastDay,
    };
  }).filter(Boolean) as { alloc: Allocation; startIdx: number; endIdx: number; startsBeforeView: boolean; endsAfterView: boolean }[];

  // Stack bars
  const barRows: typeof bars[] = [];
  bars.forEach(bar => {
    let placed = false;
    for (const row of barRows) {
      const overlaps = row.some(existing => !(bar.endIdx < existing.startIdx || bar.startIdx > existing.endIdx));
      if (!overlaps) { row.push(bar); placed = true; break; }
    }
    if (!placed) barRows.push([bar]);
  });

  const totalDays = days.length;

  const handleBarMouseDown = (e: React.MouseEvent, bar: typeof bars[0], action: 'move' | 'resize-left' | 'resize-right') => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const containerWidth = containerRef.current?.offsetWidth || 800;
    const dayWidth = containerWidth / totalDays;

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const daysDelta = Math.round(delta / dayWidth);
      if (daysDelta !== 0) {
        if (action === 'move') {
          onMoveAllocation(bar.alloc.id, daysDelta);
        } else {
          onResizeAllocation(bar.alloc.id, action === 'resize-left' ? 'left' : 'right', daysDelta);
        }
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <tr className="border-b last:border-b-0">
      <td className="p-2 border-r sticky left-0 bg-white z-10 min-w-[190px]">
        <ResourcePlannerLabel resource={resource} />
      </td>
      <td className="p-0 relative" colSpan={totalDays}>
        <div ref={containerRef} className="flex w-full" style={{ minHeight: `${Math.max(32, barRows.length * 22 + 10)}px` }}>
          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const absent = isAbsent(day);
            const totalHours = getTotalHoursForDay(day);
            const isOverallocated = totalHours > resource.dailyCapacity;

            let bgClass = '';
            if (absent) bgClass = 'bg-blue-50';
            else if (isOverallocated) bgClass = 'bg-red-50';

            return (
              <div
                key={dateStr}
                className={`flex-1 border-r border-border/30 last:border-r-0 ${bgClass} cursor-pointer hover:bg-gray-100/50 transition-colors`}
                style={{ minWidth: '24px' }}
                onClick={() => onClickDay(resource.id, dateStr)}
                title={`${format(day, 'dd/MM/yyyy')}${absent ? ' (Ausente)' : ''}${isOverallocated ? ` ⚠️ ${totalHours}/${resource.dailyCapacity}h` : totalHours > 0 ? ` ${totalHours}/${resource.dailyCapacity}h` : ''}`}
              >
                {isOverallocated && (
                  <div className="flex justify-center pt-0.5">
                    <AlertTriangle className="h-2.5 w-2.5 text-red-500" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Allocation bars overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ padding: '2px 0' }}>
          {barRows.map((row, rowIdx) =>
            row.map(bar => {
              const left = `${(bar.startIdx / totalDays) * 100}%`;
              const width = `${((bar.endIdx - bar.startIdx + 1) / totalDays) * 100}%`;
              const top = `${rowIdx * 22 + 4}px`;
              const project = projects.find(p => p.id === bar.alloc.projectId);
              const referenceDate = format(days[bar.startIdx], 'yyyy-MM-dd');
              const activePhase = getActiveProjectPhase(bar.alloc.projectId, phases, referenceDate);
              const phaseName = getPhaseDisplayName(activePhase);
              const color = getProjectColorHex(bar.alloc.projectId, projects);
              const barLabel = `${project?.name?.substring(0, 20)}${phaseName ? ` · ${phaseName}` : ''}`;

              return (
                <div
                  key={bar.alloc.id}
                  className="absolute h-[18px] flex items-center text-[9px] text-white font-medium truncate shadow-sm pointer-events-auto group/bar"
                  style={{
                    left, width, top, backgroundColor: color,
                    borderRadius: bar.startsBeforeView ? '0 3px 3px 0' : bar.endsAfterView ? '3px 0 0 3px' : '3px',
                  }}
                  title={`${project?.name}${phaseName ? ` | Marco: ${phaseName}` : ''} | ${bar.alloc.hoursPerDay}h/dia | ${bar.alloc.startDate} → ${bar.alloc.endDate}${bar.alloc.notes ? `\n📝 ${bar.alloc.notes}` : ''}\n🖱️ Arraste para mover, use as bordas para redimensionar`}
                >
                  {/* Left resize handle */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize opacity-0 group-hover/bar:opacity-100 bg-white/40 rounded-l z-10"
                    onMouseDown={(e) => handleBarMouseDown(e, bar, 'resize-left')}
                  />
                  {/* Move area */}
                  <div
                    className="flex-1 px-1 cursor-grab active:cursor-grabbing truncate"
                    onMouseDown={(e) => handleBarMouseDown(e, bar, 'move')}
                    onClick={(e) => { e.stopPropagation(); onClickAllocation(bar.alloc); }}
                  >
                    {barLabel} {bar.alloc.hoursPerDay}h
                  </div>
                  {/* Right resize handle */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize opacity-0 group-hover/bar:opacity-100 bg-white/40 rounded-r z-10"
                    onMouseDown={(e) => handleBarMouseDown(e, bar, 'resize-right')}
                  />
                </div>
              );
            })
          )}
        </div>
      </td>
    </tr>
  );
}

function getAnnualWeekRange(startDate: string, endDate: string, weeks: AnnualWeek[]) {
  const startIdx = weeks.findIndex(week =>
    rangesOverlap(startDate, endDate, format(week.start, 'yyyy-MM-dd'), format(week.end, 'yyyy-MM-dd'))
  );
  if (startIdx < 0) return null;

  let endIdx = startIdx;
  for (let i = weeks.length - 1; i >= startIdx; i--) {
    if (rangesOverlap(startDate, endDate, format(weeks[i].start, 'yyyy-MM-dd'), format(weeks[i].end, 'yyyy-MM-dd'))) {
      endIdx = i;
      break;
    }
  }

  const total = Math.max(weeks.length, 1);
  return {
    startIdx,
    endIdx,
    left: (startIdx / total) * 100,
    width: ((endIdx - startIdx + 1) / total) * 100,
    endLeft: ((endIdx + 1) / total) * 100,
  };
}

function AnnualProjectTimelineRow({ project, phases, weeks }: {
  project: Project;
  phases: Phase[];
  weeks: AnnualWeek[];
}) {
  const projectPhases = phases
    .filter(phase => phase.projectId === project.id)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const projectSpan = getAnnualWeekRange(project.startDate, project.endDate, weeks);
  const phaseItems = projectPhases
    .map(phase => ({ phase, span: getAnnualWeekRange(phase.startDate, phase.endDate, weeks) }))
    .filter((item): item is { phase: Phase; span: NonNullable<ReturnType<typeof getAnnualWeekRange>> } => Boolean(item.span));
  const phaseRows: typeof phaseItems[] = [];
  phaseItems
    .sort((a, b) => a.span.startIdx - b.span.startIdx || a.span.endIdx - b.span.endIdx)
    .forEach(item => {
      const row = phaseRows.find(rowItems =>
        rowItems.every(existing => existing.span.endIdx < item.span.startIdx || existing.span.startIdx > item.span.endIdx)
      );
      if (row) row.push(item);
      else phaseRows.push([item]);
    });
  const minHeight = Math.max(58, 32 + phaseRows.length * 24);

  return (
    <tr className="border-b bg-slate-50/70">
      <td className="sticky left-0 z-20 min-w-[180px] border-r bg-slate-50 p-2">
        <div className="text-sm font-semibold text-slate-900">{project.name}</div>
        <div className="text-[10px] text-muted-foreground">Projeto · {project.startDate} a {project.endDate}</div>
      </td>
      <td colSpan={weeks.length} className="relative p-0">
        <div className="relative" style={{ minHeight }}>
          <div className="absolute inset-0 flex">
            {weeks.map((week, idx) => {
              const weekStart = format(week.start, 'yyyy-MM-dd');
              const weekEnd = format(week.end, 'yyyy-MM-dd');
              const active = rangesOverlap(project.startDate, project.endDate, weekStart, weekEnd);
              return (
                <button
                  key={idx}
                  type="button"
                  className={`min-w-[42px] flex-1 border-r ${active ? 'bg-slate-100/70' : 'bg-white'} hover:bg-slate-100`}
                  title={`${project.name} - semana ${week.label} a ${format(week.end, 'dd/MM')}`}
                />
              );
            })}
          </div>
          {projectSpan && (
            <div
              className="absolute top-2 h-3 rounded-full bg-slate-300"
              style={{ left: `${projectSpan.left}%`, width: `${projectSpan.width}%` }}
              title={`${project.name}: ${project.startDate} a ${project.endDate}`}
            />
          )}
          {phaseRows.map((row, rowIdx) => row.map(({ phase, span }) => {
            const label = phase.notes?.trim() || phase.phase;
            return (
              <div
                key={phase.id}
                className={`absolute h-5 truncate rounded border px-2 py-0.5 text-[10px] font-medium shadow-sm ${getPhaseStatusClass(phase.status)}`}
                style={{ left: `${span.left}%`, width: `${span.width}%`, top: `${22 + rowIdx * 22}px` }}
                title={`${project.name} | ${phase.phase}: ${label} | ${phase.startDate} a ${phase.endDate} | ${phase.status} | ${phase.completionPercent}%`}
              >
                <span className="block truncate">{label} ({phase.phase})</span>
                <span
                  className="absolute -right-px top-[-4px] h-8 w-[3px] bg-red-600"
                  title={`Fim do marco: ${label} - ${phase.endDate}`}
                />
              </div>
            );
          }))}
        </div>
      </td>
    </tr>
  );
}

// ===== Annual View Row =====
function AnnualResourceGanttRow({ resource, allocations, projects, absences, weeks, onClickWeek, onClickAllocation }: {
  resource: Resource;
  allocations: Allocation[];
  projects: Project[];
  absences: Absence[];
  weeks: AnnualWeek[];
  onClickWeek: (resourceId: string, date: string) => void;
  onClickAllocation: (allocation: Allocation) => void;
}) {
  const projectIds = new Set(projects.map(project => project.id));
  const resourceAllocations = allocations.filter(a => a.resourceId === resource.id && projectIds.has(a.projectId));
  const bars = resourceAllocations
    .map(allocation => {
      const span = getAnnualWeekRange(allocation.startDate, allocation.endDate, weeks);
      if (!span) return null;
      const project = projects.find(p => p.id === allocation.projectId);
      return { allocation, project, span };
    })
    .filter((item): item is { allocation: Allocation; project?: Project; span: NonNullable<ReturnType<typeof getAnnualWeekRange>> } => Boolean(item));

  const rows: typeof bars[] = [];
  bars
    .sort((a, b) => a.span.startIdx - b.span.startIdx || a.span.endIdx - b.span.endIdx)
    .forEach(item => {
      const row = rows.find(rowItems => rowItems.every(existing => existing.span.endIdx < item.span.startIdx || existing.span.startIdx > item.span.endIdx));
      if (row) row.push(item);
      else rows.push([item]);
    });

  const getWeekData = (week: AnnualWeek) => {
    const weekdays = eachDayOfInterval({ start: week.start, end: week.end }).filter(d => {
      const day = getDay(d);
      return day !== 0 && day !== 6;
    });
    let totalHours = 0;
    weekdays.forEach(day => {
      let dayHours = 0;
      resourceAllocations.forEach(a => {
        const start = parseISO(a.startDate);
        const end = parseISO(a.endDate);
        if (day >= start && day <= end) {
          dayHours += a.hoursPerDay;
        }
      });
      totalHours += dayHours;
    });

    let absentDays = 0;
    weekdays.forEach(day => {
      const isAbs = absences.some(abs => {
        if (abs.resourceId !== resource.id) return false;
        if (!isBlockingAbsence(abs)) return false;
        const start = parseISO(abs.startDate);
        const end = parseISO(abs.endDate);
        return day >= start && day <= end;
      });
      if (isAbs) absentDays++;
    });

    const maxCapacity = weekdays.length * resource.dailyCapacity;
    const utilizationPct = maxCapacity > 0 ? Math.round((totalHours / maxCapacity) * 100) : 0;
    return { totalHours, absentDays, utilizationPct, maxCapacity };
  };
  const minHeight = Math.max(58, rows.length * 24 + 18);

  return (
    <tr className="border-b last:border-b-0">
      <td className="sticky left-0 z-20 min-w-[220px] border-r bg-white p-2">
        <ResourcePlannerLabel resource={resource} />
      </td>
      <td colSpan={weeks.length} className="relative p-0">
        <div className="relative" style={{ minHeight }}>
          <div className="absolute inset-0 flex">
            {weeks.map((week, idx) => {
              const data = getWeekData(week);
              const bgClass = data.absentDays > 0
                ? 'bg-blue-50'
                : data.utilizationPct > 100
                  ? 'bg-red-50'
                  : data.utilizationPct >= 80
                    ? 'bg-amber-50'
                    : data.utilizationPct > 0
                      ? 'bg-green-50/50'
                      : 'bg-white';
              return (
                <button
                  key={idx}
                  type="button"
                  className={`min-w-[42px] flex-1 border-r transition-colors hover:bg-slate-100 ${bgClass}`}
                  onClick={() => onClickWeek(resource.id, format(week.start, 'yyyy-MM-dd'))}
                  title={`${resource.name} - ${week.label} a ${format(week.end, 'dd/MM')}\nUtilização: ${data.utilizationPct}% (${data.totalHours}/${data.maxCapacity}h)\nDias ausentes: ${data.absentDays}`}
                />
              );
            })}
          </div>
          {rows.map((row, rowIdx) => row.map(({ allocation, project, span }) => (
            <button
              key={allocation.id}
              type="button"
              className="absolute h-5 truncate rounded px-2 py-0.5 text-left text-[10px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              style={{
                left: `${span.left}%`,
                width: `${span.width}%`,
                top: `${10 + rowIdx * 24}px`,
                backgroundColor: getProjectColorHex(allocation.projectId, projects),
              }}
              onClick={(event) => {
                event.stopPropagation();
                onClickAllocation(allocation);
              }}
              title={`${resource.name} | ${project?.name || 'Projeto'} (${allocation.front}) | ${allocation.startDate} a ${allocation.endDate} | ${allocation.hoursPerDay}h/dia`}
            >
              <span className="block truncate">{project?.name || 'Projeto'} · {allocation.front} · {allocation.hoursPerDay}h</span>
            </button>
          )))}
        </div>
      </td>
    </tr>
  );
}

// ===== MAIN PLANNER COMPONENT =====
export default function Planner() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: resources = [] } = trpc.resources.list.useQuery();
  const { data: projects = [] } = trpc.projects.list.useQuery();
  const { data: phases = [] } = trpc.phases.list.useQuery();
  const { data: absences = [] } = trpc.absences.list.useQuery();
  const { data: allAllocations = [] } = trpc.allocations.list.useQuery();
  const { data: lookups } = trpc.settings.getLookups.useQuery();
  const FRONTS = (lookups?.fronts?.filter((i: any) => i.active).map((i: any) => i.value) || FRONTS_FALLBACK) as ResourceFront[];
  const { data: appUser } = trpc.access.getByEmail.useQuery(
    { email: user?.email || '' },
    { enabled: !!user?.email }
  );

  // Role-based: deny edit by default until access data loads
  // Owner (first user / project creator) always has admin access
  const isOwner = user?.email === 'defechi@gmail.com' || user?.role === 'admin';
  const userRole = appUser ? appUser.role : (isOwner ? 'admin' : 'viewer');
  const isConsultant = userRole === 'consultant' || userRole === 'viewer';
  const canEdit = userRole === 'admin' || userRole === 'manager';
  const { data: dashStats } = trpc.dashboard.stats.useQuery(undefined, { enabled: canEdit });
  const linkedResource = useMemo(() => {
    if (!isConsultant || !user) return null;
    if (appUser?.resourceId) {
      return resources.find(r => r.id === appUser.resourceId) || null;
    }
    return resources.find(r =>
      r.email?.toLowerCase() === user.email?.toLowerCase() ||
      r.name.toLowerCase() === (user.name || '').toLowerCase()
    ) || null;
  }, [appUser?.resourceId, isConsultant, user, resources]);

  const updateAllocation = trpc.allocations.update.useMutation({ onSuccess: () => utils.allocations.list.invalidate() });
  const createAllocation = trpc.allocations.create.useMutation({ onSuccess: () => utils.allocations.list.invalidate() });
  const deleteAllocation = trpc.allocations.delete.useMutation({ onSuccess: () => utils.allocations.list.invalidate() });

  // Bulk import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkImportMutation = trpc.allocations.bulkImport.useMutation({ onSuccess: () => utils.allocations.list.invalidate() });

  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);
      const normalized = (value: unknown) => String(value || '').trim().toLowerCase();
      const normalizeImportDate = (value: unknown) => {
        if (value instanceof Date && !Number.isNaN(value.getTime())) return format(value, 'yyyy-MM-dd');
        if (typeof value === 'number') {
          const parsed = XLSX.SSF.parse_date_code(value);
          if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
        }
        const text = String(value || '').trim();
        const brDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (brDate) return `${brDate[3]}-${brDate[2]}-${brDate[1]}`;
        return text;
      };
      const isValidImportDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('1900-01-00');
      const findResourceId = (row: any) => {
        const resourceId = String(row['Recurso ID'] || row['resourceId'] || '').trim();
        if (resourceId && resources.some((resource: Resource) => resource.id === resourceId)) return resourceId;
        const resourceName = normalized(row['Recurso'] || row['resource'] || row['Consultor'] || row['consultant']);
        return resources.find((resource: Resource) => normalized(resource.name) === resourceName)?.id || '';
      };
      const findProjectId = (row: any) => {
        const projectId = String(row['Projeto ID'] || row['projectId'] || '').trim();
        if (projectId && projects.some((project: Project) => project.id === projectId)) return projectId;
        const projectName = normalized(row['Projeto'] || row['project'] || row['Projeto Nome']);
        return projects.find((project: Project) => normalized(project.name) === projectName)?.id || '';
      };
      const findPhaseId = (row: any, projectId: string) => {
        const phaseValue = String(row['Fase ID'] || row['phaseId'] || row['Fase'] || row['phase'] || '').trim();
        if (!phaseValue) return '';
        if (phases.some((phase: any) => phase.id === phaseValue)) return phaseValue;
        return phases.find((phase: any) =>
          phase.projectId === projectId && normalized(phase.phase) === normalized(phaseValue)
        )?.id || '';
      };
      let skipped = 0;
      const items = rows.flatMap(row => {
        const resourceId = findResourceId(row);
        const projectId = findProjectId(row);
        const startDate = normalizeImportDate(row['Data Início'] || row['startDate']);
        const endDate = normalizeImportDate(row['Data Fim'] || row['endDate']);
        if (!resourceId || !projectId || !isValidImportDate(startDate) || !isValidImportDate(endDate)) {
          skipped += 1;
          return [];
        }
        return [{
          resourceId,
          projectId,
          phaseId: findPhaseId(row, projectId),
          front: String(row['Frente'] || row['front'] || 'FI').trim(),
          startDate,
          endDate,
          hoursPerDay: Number(row['Horas/Dia'] || row['hoursPerDay'] || 4),
          allocationType: String(row['Tipo'] || row['allocationType'] || 'Projeto').trim(),
          status: String(row['Status'] || row['status'] || 'Planejado').trim(),
          notes: String(row['Observações'] || row['notes'] || '').trim(),
        }];
      });
      if (items.length === 0) {
        toast.error("Nenhum registro válido encontrado. Confira se recursos/projetos já estão cadastrados.");
        return;
      }
      const result = await bulkImportMutation.mutateAsync(items);
      const msg = (result as any).updated > 0
        ? `${(result as any).created} criadas, ${(result as any).updated} atualizadas`
        : `${items.length} alocações importadas`;
      toast.success(msg);
      if (skipped > 0) toast.warning(`${skipped} linhas ignoradas por recurso/projeto inexistente ou data inválida`);
    } catch (error: any) {
      toast.error(error?.message || "Erro ao importar arquivo. Verifique o formato.");
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadTemplate = () => {
    const exportData = allAllocations.length > 0
      ? allAllocations.map((a: any) => {
          const res = resources.find((r: any) => r.id === a.resourceId);
          const proj = projects.find((p: any) => p.id === a.projectId);
          return {
            'ID': a.id,
            'Recurso ID': a.resourceId,
            'Recurso': res?.name || '',
            'Projeto ID': a.projectId,
            'Projeto': proj?.name || '',
            'Fase ID': a.phaseId || '',
            'Frente': a.front || '',
            'Data Início': a.startDate,
            'Data Fim': a.endDate,
            'Horas/Dia': a.hoursPerDay,
            'Tipo': a.allocationType || 'Projeto',
            'Status': a.status || 'Confirmada',
            'Observações': a.notes || '',
          };
        })
      : [{ 'ID': '', 'Recurso ID': 'r1', 'Recurso': '', 'Projeto ID': 'p1', 'Projeto': '', 'Fase ID': '', 'Frente': 'FI', 'Data Início': '2025-07-01', 'Data Fim': '2025-07-15', 'Horas/Dia': 4, 'Tipo': 'Projeto', 'Status': 'Planejado', 'Observações': '' }];
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Alocações');
    XLSX.writeFile(wb, 'alocacoes.xlsx');
    toast.success("Dados exportados");
  };

  // View mode
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'year'>('week');
  const [timelineMode, setTimelineMode] = useState<'resources' | 'combined' | 'projects'>('combined');

  // Filters
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [yearOffset, setYearOffset] = useState(0);
  const [filterResources, setFilterResources] = useState<string[]>([]);
  const [filterProjects, setFilterProjects] = useState<string[]>([]);
  const [filterManagers, setFilterManagers] = useState<string[]>([]);
  const [filterGroups, setFilterGroups] = useState<string[]>([]);
  const [filterFronts, setFilterFronts] = useState<string[]>([]);
  const [filterAllocationStatuses, setFilterAllocationStatuses] = useState<string[]>([]);
  const [sortPlanner, setSortPlanner] = useState<'name' | 'front'>('name');
  const [sortPlannerDir, setSortPlannerDir] = useState<'asc' | 'desc'>('asc');
  const [alertCardsExpanded, setAlertCardsExpanded] = useState({
    missing: false,
    unallocated: false,
    departures: false,
  });
  const annualScrollRef = useRef<HTMLDivElement | null>(null);

  // Quick allocation modal (from gap cards)
  const [quickAllocModalOpen, setQuickAllocModalOpen] = useState(false);
  const [quickAllocProject, setQuickAllocProject] = useState<ProjectMissingFrontsAlert | null>(null);
  const [quickAllocForm, setQuickAllocForm] = useState({ resourceId: '', front: '' as string, startDate: '', endDate: '', hoursPerDay: 8 });

  const getProjectEndForQuickAllocation = (projectId: string) => {
    return projects.find(project => project.id === projectId)?.endDate || '';
  };

  const getResolvedGapEnd = (item: ProjectMissingFrontsAlert, gap: ProjectFrontGap) => {
    const projectEnd = getProjectEndForQuickAllocation(item.projectId);
    if (projectEnd && shouldExtendGapToProjectEnd(gap.reason)) return maxIsoDate(gap.gapEnd, projectEnd);
    return gap.gapEnd;
  };

  const getQuickGapLabel = (item: ProjectMissingFrontsAlert, gap: ProjectFrontGap) => {
    const resolvedEnd = getResolvedGapEnd(item, gap);
    const period = `${formatDisplayDate(gap.gapStart)} até ${formatDisplayDate(resolvedEnd)}`;
    return `${gap.front}: cobertura necessária de ${period}. ${gap.reason}`;
  };

  const getQuickAllocationRange = (item: ProjectMissingFrontsAlert, front: string, selectedGap?: ProjectFrontGap) => {
    const frontGaps = (item.gaps || []).filter(gap => gap.front === front);
    const gaps = selectedGap ? [selectedGap] : frontGaps;
    if (gaps.length === 0) return { startDate: '', endDate: '' };
    return {
      startDate: gaps.reduce((min, gap) => gap.gapStart < min ? gap.gapStart : min, gaps[0].gapStart),
      endDate: gaps.reduce((max, gap) => {
        const resolvedEnd = getResolvedGapEnd(item, gap);
        return resolvedEnd > max ? resolvedEnd : max;
      }, getResolvedGapEnd(item, gaps[0])),
    };
  };

  const resourceMatchesQuickFront = (resource: Resource, front: string) => {
    const fronts = Array.isArray(resource.fronts) ? resource.fronts : (resource.front ? [resource.front] : []);
    return fronts.includes(front as ResourceFront);
  };

  const resourceHasQuickConflict = (resourceId: string, projectId: string, front: string, startDate: string, endDate: string) => {
    if (!resourceId || !projectId || !front || !startDate || !endDate) return false;
    if (resources.find(resource => resource.id === resourceId)?.skipAllocationCheck) return false;
    return allAllocations.some(allocation =>
      allocation.resourceId === resourceId &&
      allocation.projectId === projectId &&
      allocation.front === front &&
      rangesOverlap(allocation.startDate, allocation.endDate, startDate, endDate)
    );
  };

  const findSuggestedQuickResourceId = (projectId: string, front: string, startDate: string, endDate: string) => {
    return resources.find(resource =>
      resource.status === 'Ativo' &&
      resourceMatchesQuickFront(resource, front) &&
      !resourceHasQuickConflict(resource.id, projectId, front, startDate, endDate)
    )?.id || '';
  };

  const openQuickAllocModal = (item: ProjectMissingFrontsAlert, gapInfo?: ProjectFrontGap | ResourceEndDateImpact) => {
    setQuickAllocProject(item);
    const firstGap = gapInfo || item.gaps?.[0];
    if (firstGap) {
      const frontRange = 'gapStart' in firstGap ? getQuickAllocationRange(item, firstGap.front, firstGap) : null;
      const impactEnd = 'impactEnd' in firstGap
        ? maxIsoDate(firstGap.impactEnd, firstGap.projectEnd, getProjectEndForQuickAllocation(item.projectId))
        : '';
      const front = firstGap.front;
      const startDate = frontRange?.startDate || ('gapStart' in firstGap ? firstGap.gapStart : firstGap.impactStart);
      const endDate = frontRange?.endDate || ('gapEnd' in firstGap ? getResolvedGapEnd(item, firstGap) : impactEnd);
      setQuickAllocForm({
        resourceId: findSuggestedQuickResourceId(item.projectId, front, startDate, endDate),
        front,
        startDate,
        endDate,
        hoursPerDay: 8,
      });
    } else {
      const today = new Date();
      const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 7);
      setQuickAllocForm({ resourceId: '', front: item.missingFronts[0] || '', startDate: today.toISOString().split('T')[0], endDate: nextWeek.toISOString().split('T')[0], hoursPerDay: 4 });
    }
    setQuickAllocModalOpen(true);
  };

  const handleQuickAllocate = () => {
    if (!quickAllocProject || !quickAllocForm.resourceId || !quickAllocForm.front || !quickAllocForm.startDate || !quickAllocForm.endDate) {
      toast.error("Preencha todos os campos obrigat\u00f3rios"); return;
    }
    createAllocation.mutate({
      resourceId: quickAllocForm.resourceId, projectId: quickAllocProject.projectId, phaseId: '',
      front: quickAllocForm.front as any, startDate: quickAllocForm.startDate, endDate: quickAllocForm.endDate,
      hoursPerDay: quickAllocForm.hoursPerDay, allocationType: 'Projeto', status: 'Planejado',
      notes: `Aloca\u00e7\u00e3o r\u00e1pida via Planner - frente ${quickAllocForm.front}`,
    }, {
      onSuccess: () => {
        setQuickAllocModalOpen(false);
        toast.success('Aloca\u00e7\u00e3o criada!');
        utils.allocations.list.invalidate();
        utils.dashboard.stats.invalidate();
      },
      onError: (error: any) => {
        toast.error(error?.message || 'Erro ao criar aloca\u00e7\u00e3o');
      },
    });
  };

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAllocation, setEditingAllocation] = useState<Allocation | null>(null);
  const [modalForm, setModalForm] = useState({
    resourceId: '', projectId: '', phaseId: '', front: 'FI' as string,
    startDate: '', endDate: '', hoursPerDay: 4,
    allocationType: 'Projeto' as string, status: 'Planejado' as string, notes: ''
  });

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Week calculation
  const currentWeekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    return addDays(base, weekOffset * 7);
  }, [weekOffset]);

  const weekDays = useMemo(() => {
    return eachDayOfInterval({ start: currentWeekStart, end: addDays(currentWeekStart, 4) });
  }, [currentWeekStart]);

  // Month calculation
  const currentMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  }, [monthOffset]);

  const monthDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end }).filter(d => {
      const day = getDay(d);
      return day !== 0 && day !== 6;
    });
  }, [currentMonth]);

  // Year calculation
  const currentYear = useMemo(() => {
    return new Date().getFullYear() + yearOffset;
  }, [yearOffset]);

  const yearWeeks = useMemo<AnnualWeek[]>(() => {
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31);
    const weeks: AnnualWeek[] = [];
    let cursor = startOfWeek(yearStart, { weekStartsOn: 1 });

    while (cursor <= yearEnd) {
      const rawWeekEnd = addDays(cursor, 4);
      const start = cursor < yearStart ? yearStart : cursor;
      const end = rawWeekEnd > yearEnd ? yearEnd : rawWeekEnd;

      if (start <= end) {
        weeks.push({
          start,
          end,
          label: format(start, 'dd/MM'),
          monthIdx: start.getMonth(),
        });
      }

      cursor = addDays(cursor, 7);
    }

    return weeks;
  }, [currentYear]);

  const yearMonthGroups = useMemo(() => {
    const groups: { monthIdx: number; count: number }[] = [];
    yearWeeks.forEach(week => {
      const last = groups[groups.length - 1];
      if (last && last.monthIdx === week.monthIdx) {
        last.count += 1;
      } else {
        groups.push({ monthIdx: week.monthIdx, count: 1 });
      }
    });
    return groups;
  }, [yearWeeks]);

  // Active days based on view mode
  const activeDays = viewMode === 'week' ? weekDays : viewMode === 'month' ? monthDays : [];

  const visiblePlannerDays = useMemo(() => {
    if (viewMode !== 'year') return activeDays;
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31);
    return eachDayOfInterval({ start: yearStart, end: yearEnd }).filter(d => {
      const day = getDay(d);
      return day !== 0 && day !== 6;
    });
  }, [activeDays, currentYear, viewMode]);

  const allocatedResourceIdsInView = useMemo(() => {
    const ids = new Set<string>();
    allAllocations.forEach(a => {
      const start = parseISO(a.startDate);
      const end = parseISO(a.endDate);
      if (visiblePlannerDays.some(day => day >= start && day <= end)) {
        ids.add(a.resourceId);
      }
    });
    return ids;
  }, [allAllocations, visiblePlannerDays]);

  // Compute overallocated resource IDs
  const overallocatedResourceIds = useMemo(() => {
    const ids = new Set<string>();
    if (viewMode === 'year') {
      // For annual view, check entire year
      const yearStart = new Date(currentYear, 0, 1);
      const yearEnd = new Date(currentYear, 11, 31);
      const allDays = eachDayOfInterval({ start: yearStart, end: yearEnd }).filter(d => {
        const day = getDay(d);
        return day !== 0 && day !== 6;
      });
      resources.forEach((r: any) => {
        for (const day of allDays) {
          let totalHours = 0;
          allAllocations.forEach(a => {
            if (a.resourceId === r.id) {
              const start = parseISO(a.startDate);
              const end = parseISO(a.endDate);
              if (day >= start && day <= end) totalHours += a.hoursPerDay;
            }
          });
          if (totalHours > r.dailyCapacity) { ids.add(r.id); break; }
        }
      });
    } else {
      resources.forEach((r: any) => {
        activeDays.forEach(day => {
          let totalHours = 0;
          allAllocations.forEach(a => {
            if (a.resourceId === r.id) {
              const start = parseISO(a.startDate);
              const end = parseISO(a.endDate);
              if (day >= start && day <= end) totalHours += a.hoursPerDay;
            }
          });
          if (totalHours > r.dailyCapacity) ids.add(r.id);
        });
      });
    }
    return ids;
  }, [resources, allAllocations, activeDays, viewMode, currentYear]);

  const selectedGroupResourceIds = useMemo(() => {
    if (filterGroups.length === 0) return null;
    return new Set(
      resources
        .filter((resource: Resource) => filterGroups.includes(resource.group?.trim() || 'Sem grupo'))
        .map((resource: Resource) => resource.id)
    );
  }, [resources, filterGroups]);

  // Filter resources (consultants only see themselves)
  const filteredResources = useMemo(() => {
    // Get resource IDs that have allocations in the selected project
    const selectedProjectIds = filterProjects.length > 0 ? new Set(filterProjects) : null;
    const selectedManagers = filterManagers.length > 0 ? new Set(filterManagers) : null;
    const resourceIdsInProject = selectedProjectIds
      ? new Set(allAllocations.filter(a => selectedProjectIds.has(a.projectId)).map(a => a.resourceId))
      : null;
    // Get resource IDs that have allocations in projects managed by the selected manager
    const managerProjectIds = selectedManagers
      ? new Set(projects.filter((p: any) => selectedManagers.has(p.manager)).map((p: any) => p.id))
      : null;
    const resourceIdsInManagerProjects = managerProjectIds
      ? new Set(allAllocations.filter(a => managerProjectIds.has(a.projectId)).map(a => a.resourceId))
      : null;
    // Allocation status filter uses only the period visible on screen.
    const resourceIdsWithAllocations = allocatedResourceIdsInView;

    let result = resources.filter((r: any) => {
      if (r.status === 'Inativo') return false;
      if (isConsultant && linkedResource && r.id !== linkedResource.id) return false;
      if (filterResources.length > 0 && !filterResources.includes(r.id)) return false;
      if (selectedGroupResourceIds && !selectedGroupResourceIds.has(r.id)) return false;
      // Filter by project: only show resources allocated to that project
      if (resourceIdsInProject && !resourceIdsInProject.has(r.id)) return false;
      // Filter by manager: only show resources allocated to projects of that manager
      if (resourceIdsInManagerProjects && !resourceIdsInManagerProjects.has(r.id)) return false;
      // Filter by front: check fronts array
      if (filterFronts.length > 0) {
        const rFronts = Array.isArray(r.fronts) ? r.fronts : (r.front ? [r.front] : []);
        if (!filterFronts.some(front => rFronts.includes(front))) return false;
      }
      if (filterAllocationStatuses.length > 0) {
        const hasAllocationInView = resourceIdsWithAllocations.has(r.id);
        const isOverallocated = overallocatedResourceIds.has(r.id);
        const matchesStatus = filterAllocationStatuses.some(status => {
          if (status === 'withalloc') return hasAllocationInView;
          if (status === 'noalloc') return !hasAllocationInView;
          if (status === 'over') return isOverallocated;
          if (status === 'ok') return !isOverallocated;
          return true;
        });
        if (!matchesStatus) return false;
      }
      return true;
    });
    // Sort
    result.sort((a: any, b: any) => {
      let cmp = 0;
      if (sortPlanner === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortPlanner === 'front') cmp = ((a.fronts || [])[0] || '').localeCompare((b.fronts || [])[0] || '');
      return sortPlannerDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [resources, filterResources, selectedGroupResourceIds, filterProjects, filterManagers, filterFronts, filterAllocationStatuses, overallocatedResourceIds, isConsultant, linkedResource, allAllocations, projects, sortPlanner, sortPlannerDir, allocatedResourceIdsInView]);

  // Filter allocations
  const filteredAllocations = useMemo(() => {
    const selectedManagers = filterManagers.length > 0 ? new Set(filterManagers) : null;
    const managerProjIds = selectedManagers
      ? new Set(projects.filter((p: any) => selectedManagers.has(p.manager)).map((p: any) => p.id))
      : null;
    return allAllocations.filter(a => {
      if (filterProjects.length > 0 && !filterProjects.includes(a.projectId)) return false;
      if (selectedGroupResourceIds && !selectedGroupResourceIds.has(a.resourceId)) return false;
      if (managerProjIds && !managerProjIds.has(a.projectId)) return false;
      if (filterFronts.length > 0 && !filterFronts.includes(a.front)) return false;
      return true;
    });
  }, [allAllocations, filterProjects, selectedGroupResourceIds, filterManagers, filterFronts, projects]);

  const plannerUnallocatedResources = useMemo(() => {
    if (visiblePlannerDays.length === 0) return [];

    return filteredResources
      .filter((resource: Resource) => {
        if (resource.status === 'Inativo') return false;
        const resourceStart = resource.startDate && resource.startDate > '1900-01-01' && isValid(parseISO(resource.startDate))
          ? parseISO(resource.startDate)
          : null;
        const resourceEnd = resource.endDate && resource.endDate > '1900-01-01' && isValid(parseISO(resource.endDate))
          ? parseISO(resource.endDate)
          : null;
        const eligibleDays = visiblePlannerDays.filter(day =>
          (!resourceStart || day >= resourceStart) &&
          (!resourceEnd || day <= resourceEnd)
        );

        if (eligibleDays.length === 0) return false;

        const hasBlockingAbsence = eligibleDays.some(day =>
          absences.some(absence => {
            if (absence.resourceId !== resource.id) return false;
            if (!isBlockingAbsence(absence)) return false;

            const start = parseISO(absence.startDate);
            const end = parseISO(absence.endDate);
            return day >= start && day <= end;
          })
        );

        if (hasBlockingAbsence) return false;

        const hasAllocationInView = eligibleDays.some(day =>
          filteredAllocations.some(allocation => {
            if (allocation.resourceId !== resource.id) return false;

            const start = parseISO(allocation.startDate);
            const end = parseISO(allocation.endDate);
            return day >= start && day <= end;
          })
        );

        return !hasAllocationInView;
      })
      .map((resource: Resource) => ({ id: resource.id, name: resource.name }));
  }, [filteredResources, filteredAllocations, visiblePlannerDays, absences]);

  const filteredTimelineProjects = useMemo(() => {
    const selectedManagers = filterManagers.length > 0 ? new Set(filterManagers) : null;
    const visibleStart = format(visiblePlannerDays[0] || new Date(), 'yyyy-MM-dd');
    const visibleEnd = format(visiblePlannerDays[visiblePlannerDays.length - 1] || new Date(), 'yyyy-MM-dd');
    const projectIdsWithVisibleAllocations = new Set(filteredAllocations.map(allocation => allocation.projectId));

    return projects
      .filter(project => {
        if (filterProjects.length > 0 && !filterProjects.includes(project.id)) return false;
        if (selectedGroupResourceIds && !projectIdsWithVisibleAllocations.has(project.id)) return false;
        if (selectedManagers && !selectedManagers.has(project.manager)) return false;
        if (filterFronts.length > 0 && !filterFronts.some(front => project.fronts?.includes(front))) return false;
        if (!rangesOverlap(project.startDate, project.endDate, visibleStart, visibleEnd) && !projectIdsWithVisibleAllocations.has(project.id)) return false;
        return true;
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name));
  }, [projects, filterProjects, selectedGroupResourceIds, filterManagers, filterFronts, visiblePlannerDays, filteredAllocations]);

  const showProjectTimeline = timelineMode === 'combined' || timelineMode === 'projects';
  const showResourceTimeline = timelineMode === 'combined' || timelineMode === 'resources';

  const annualFocusDate = useMemo(() => {
    if (viewMode !== 'year') return '';
    const yearStart = `${currentYear}-01-01`;
    const yearEnd = `${currentYear}-12-31`;
    const dates: string[] = [];

    if (showProjectTimeline) {
      filteredTimelineProjects.forEach(project => {
        if (rangesOverlap(project.startDate, project.endDate, yearStart, yearEnd)) {
          dates.push(maxIsoDate(project.startDate, yearStart));
        }
        phases
          .filter(phase => phase.projectId === project.id && rangesOverlap(phase.startDate, phase.endDate, yearStart, yearEnd))
          .forEach(phase => dates.push(maxIsoDate(phase.startDate, yearStart)));
      });
    }

    if (showResourceTimeline) {
      filteredAllocations.forEach(allocation => {
        if (filterResources.length > 0 && !filterResources.includes(allocation.resourceId)) return;
        if (!rangesOverlap(allocation.startDate, allocation.endDate, yearStart, yearEnd)) return;
        dates.push(maxIsoDate(allocation.startDate, yearStart));
      });
    }

    const currentYearValue = new Date().getFullYear();
    if (dates.length === 0) return currentYear === currentYearValue ? format(new Date(), 'yyyy-MM-dd') : yearStart;
    return minIsoDate(...dates);
  }, [
    viewMode,
    currentYear,
    showProjectTimeline,
    showResourceTimeline,
    filteredTimelineProjects,
    filteredAllocations,
    phases,
    filterResources,
  ]);

  useEffect(() => {
    if (viewMode !== 'year' || !annualFocusDate || !annualScrollRef.current) return;
    const targetIndex = yearWeeks.findIndex(week =>
      rangesOverlap(annualFocusDate, annualFocusDate, format(week.start, 'yyyy-MM-dd'), format(week.end, 'yyyy-MM-dd'))
    );
    if (targetIndex < 0) return;

    const weekWidth = 42;
    const leftColumnWidth = 180;
    const targetLeft = Math.max(0, leftColumnWidth + targetIndex * weekWidth - 260);
    window.requestAnimationFrame(() => {
      annualScrollRef.current?.scrollTo({ left: targetLeft, behavior: 'smooth' });
    });
  }, [viewMode, currentYear, timelineMode, annualFocusDate, yearWeeks]);

  // Get allocations for a specific resource and day
  const getAllocationsForCell = useCallback((resourceId: string, date: Date) => {
    return filteredAllocations.filter(a => {
      if (a.resourceId !== resourceId) return false;
      const start = parseISO(a.startDate);
      const end = parseISO(a.endDate);
      return date >= start && date <= end;
    });
  }, [filteredAllocations]);

  // Check if resource is absent on a date
  const isResourceAbsent = useCallback((resourceId: string, date: Date) => {
    return absences.some(abs => {
      if (abs.resourceId !== resourceId) return false;
      if (!isBlockingAbsence(abs)) return false;
      const start = parseISO(abs.startDate);
      const end = parseISO(abs.endDate);
      return date >= start && date <= end;
    });
  }, [absences]);

  // Get total hours for resource on a day
  const getTotalHours = useCallback((resourceId: string, date: Date) => {
    const dayAllocations = getAllocationsForCell(resourceId, date);
    return dayAllocations.reduce((sum, a) => sum + a.hoursPerDay, 0);
  }, [getAllocationsForCell]);

  // Drag handlers (weekly)
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    if (!canEdit) { toast.error('Sem permissão para editar alocações'); return; }
    const { active, over } = event;
    if (!over) return;

    const allocation = active.data.current?.allocation as Allocation;
    if (!allocation) return;

    const dropId = over.id as string;
    const parts = dropId.split('-');
    const resId = parts[0];
    const targetDate = parts.slice(1).join('-');

    if (!resId || !targetDate) return;

    const originalStart = parseISO(allocation.startDate);
    const originalEnd = parseISO(allocation.endDate);
    const newStart = parseISO(targetDate);
    const daysDiff = differenceInDays(newStart, originalStart);
    const newEnd = addDays(originalEnd, daysDiff);

    const newStartStr = format(newStart, 'yyyy-MM-dd');
    const newEndStr = format(newEnd, 'yyyy-MM-dd');

    // Validate before moving
    const blockErrors = getBlockingErrors(resId, newStartStr, newEndStr);
    if (blockErrors.length > 0) {
      toast.error(blockErrors[0]);
      return;
    }

    updateAllocation.mutate({
      id: allocation.id,
      resourceId: resId,
      projectId: allocation.projectId,
      phaseId: allocation.phaseId || '',
      front: allocation.front || '',
      hoursPerDay: allocation.hoursPerDay,
      allocationType: allocation.allocationType || 'Projeto',
      status: allocation.status || 'Confirmada',
      notes: allocation.notes || '',
      startDate: newStartStr,
      endDate: newEndStr,
    });
    toast.success("Alocação movida");
  };

  // Resize handler (weekly)
  const handleResizeEnd = (allocationId: string, direction: 'left' | 'right', daysDelta: number) => {
    if (!canEdit) { toast.error('Sem permissão para editar alocações'); return; }
    const allocation = allAllocations.find(a => a.id === allocationId);
    if (!allocation) return;

    const start = parseISO(allocation.startDate);
    const end = parseISO(allocation.endDate);

    let newStart = start;
    let newEnd = end;

    if (direction === 'left') {
      newStart = addDays(start, daysDelta);
      if (newStart > end) newStart = end;
    } else {
      newEnd = addDays(end, daysDelta);
      if (newEnd < start) newEnd = start;
    }

    const newStartStr = format(newStart, 'yyyy-MM-dd');
    const newEndStr = format(newEnd, 'yyyy-MM-dd');

    // Validate before resize
    const blockErrors = getBlockingErrors(allocation.resourceId, newStartStr, newEndStr);
    if (blockErrors.length > 0) {
      toast.error(blockErrors[0]);
      return;
    }

    updateAllocation.mutate({
      id: allocationId,
      resourceId: allocation.resourceId,
      projectId: allocation.projectId,
      phaseId: allocation.phaseId || '',
      front: allocation.front || '',
      hoursPerDay: allocation.hoursPerDay,
      allocationType: allocation.allocationType || 'Projeto',
      status: allocation.status || 'Confirmada',
      notes: allocation.notes || '',
      startDate: newStartStr,
      endDate: newEndStr,
    });
    toast.success("Período ajustado");
  };

  // Helper: add N business days (skip weekends)
  const addBusinessDays = (date: Date, n: number): Date => {
    let result = new Date(date);
    let remaining = Math.abs(n);
    const direction = n >= 0 ? 1 : -1;
    while (remaining > 0) {
      result = addDays(result, direction);
      const dow = getDay(result);
      if (dow !== 0 && dow !== 6) remaining--;
    }
    return result;
  };

  // Monthly drag/resize handlers (using business days)
  const handleMonthlyMove = (allocationId: string, daysDelta: number) => {
    if (!canEdit) { toast.error('Sem permissão para editar alocações'); return; }
    const allocation = allAllocations.find(a => a.id === allocationId);
    if (!allocation) return;
    const start = parseISO(allocation.startDate);
    const end = parseISO(allocation.endDate);
    const newStart = addBusinessDays(start, daysDelta);
    const newEnd = addBusinessDays(end, daysDelta);
    const newStartStr = format(newStart, 'yyyy-MM-dd');
    const newEndStr = format(newEnd, 'yyyy-MM-dd');

    // Validate before moving
    const blockErrors = getBlockingErrors(allocation.resourceId, newStartStr, newEndStr);
    if (blockErrors.length > 0) {
      toast.error(blockErrors[0]);
      return;
    }

    updateAllocation.mutate({
      id: allocationId,
      resourceId: allocation.resourceId,
      projectId: allocation.projectId,
      phaseId: allocation.phaseId || '',
      front: allocation.front || '',
      hoursPerDay: allocation.hoursPerDay,
      allocationType: allocation.allocationType || 'Projeto',
      status: allocation.status || 'Confirmada',
      notes: allocation.notes || '',
      startDate: newStartStr,
      endDate: newEndStr,
    });
    toast.success("Alocação movida");
  };

  const handleMonthlyResize = (allocationId: string, direction: 'left' | 'right', daysDelta: number) => {
    if (!canEdit) { toast.error('Sem permissão para editar alocações'); return; }
    const allocation = allAllocations.find(a => a.id === allocationId);
    if (!allocation) return;
    const start = parseISO(allocation.startDate);
    const end = parseISO(allocation.endDate);
    let newStart = start;
    let newEnd = end;
    if (direction === 'left') {
      newStart = addBusinessDays(start, daysDelta);
      if (newStart > end) newStart = end;
    } else {
      newEnd = addBusinessDays(end, daysDelta);
      if (newEnd < start) newEnd = start;
    }
    const newStartStr = format(newStart, 'yyyy-MM-dd');
    const newEndStr = format(newEnd, 'yyyy-MM-dd');

    // Validate before resize
    const blockErrors = getBlockingErrors(allocation.resourceId, newStartStr, newEndStr);
    if (blockErrors.length > 0) {
      toast.error(blockErrors[0]);
      return;
    }

    updateAllocation.mutate({
      id: allocationId,
      resourceId: allocation.resourceId,
      projectId: allocation.projectId,
      phaseId: allocation.phaseId || '',
      front: allocation.front || '',
      hoursPerDay: allocation.hoursPerDay,
      allocationType: allocation.allocationType || 'Projeto',
      status: allocation.status || 'Confirmada',
      notes: allocation.notes || '',
      startDate: newStartStr,
      endDate: newEndStr,
    });
    toast.success("Período ajustado");
  };

  // Modal handlers
  const openCreateModal = (resourceId: string, date: string) => {
    if (!canEdit) return;
    setEditingAllocation(null);
    setModalForm({
      resourceId, projectId: projects[0]?.id || '', phaseId: '', front: resources.find(r => r.id === resourceId)?.front || 'FI',
      startDate: date, endDate: date, hoursPerDay: 4,
      allocationType: 'Projeto', status: 'Planejado', notes: ''
    });
    setModalOpen(true);
  };

  const openEditModal = (allocation: Allocation) => {
    setEditingAllocation(allocation);
    setModalForm({
      resourceId: allocation.resourceId, projectId: allocation.projectId,
      phaseId: allocation.phaseId, front: allocation.front,
      startDate: allocation.startDate, endDate: allocation.endDate,
      hoursPerDay: allocation.hoursPerDay, allocationType: allocation.allocationType,
      status: allocation.status, notes: allocation.notes
    });
    setModalOpen(true);
  };

  // Helper: check if allocation is blocked by absence or resource endDate
  const getBlockingErrors = useCallback((resourceId: string, startDate: string, endDate: string): string[] => {
    const errors: string[] = [];
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return errors;

    // Check resource endDate - only block if resource already left before start
    if (resource.endDate && resource.endDate > '1900-01-01' && resource.endDate < startDate) {
      errors.push(`${resource.name} tem data fim na consultoria em ${resource.endDate}. N\u00e3o \u00e9 poss\u00edvel alocar ap\u00f3s essa data.`);
    }
    // Note: if endDate < allocation end, server will clip automatically

    // Check absences - only block if absence covers ENTIRE period
    const overlapping = absences.filter(a =>
      a.resourceId === resourceId &&
      isBlockingAbsence(a) &&
      a.startDate <= startDate &&
      a.endDate >= endDate
    );
    if (overlapping.length > 0) {
      const absInfo = overlapping.map(a => `${a.type} (${a.startDate} a ${a.endDate})`).join(', ');
      errors.push(`${resource.name} est\u00e1 em aus\u00eancia durante todo o per\u00edodo: ${absInfo}`);
    }

    return errors;
  }, [resources, absences]);

  // Get warnings (non-blocking) for allocation
  const getWarnings = useCallback((resourceId: string, startDate: string, endDate: string): { warnings: string[]; maxEndDate: string } => {
    const warnings: string[] = [];
    let maxEndDate = '';
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return { warnings, maxEndDate };

    // Warn if resource endDate is before allocation end (will be clipped)
    if (resource.endDate && resource.endDate > '1900-01-01' && resource.endDate >= startDate && resource.endDate < endDate) {
      maxEndDate = resource.endDate;
      warnings.push(`${resource.name} sai da consultoria em ${resource.endDate}. Aloca\u00e7\u00e3o ser\u00e1 limitada at\u00e9 essa data.`);
    }

    // Warn about partial absence overlap
    const partialOverlap = absences.filter(a =>
      a.resourceId === resourceId &&
      isBlockingAbsence(a) &&
      a.startDate <= endDate &&
      a.endDate >= startDate &&
      !(a.startDate <= startDate && a.endDate >= endDate)
    );
    if (partialOverlap.length > 0) {
      for (const abs of partialOverlap) {
        warnings.push(`${resource.name} tem ${abs.type} de ${abs.startDate} a ${abs.endDate} (conflito parcial).`);
      }
    }

    return { warnings, maxEndDate };
  }, [resources, absences]);

  const handleModalSave = async () => {
    if (!canEdit) { toast.error('Sem permiss\u00e3o para editar aloca\u00e7\u00f5es'); return; }
    if (!modalForm.resourceId || !modalForm.projectId) {
      toast.error("Recurso e Projeto s\u00e3o obrigat\u00f3rios");
      return;
    }

    // Validate: block if resource is on leave or past endDate
    const blockErrors = getBlockingErrors(modalForm.resourceId, modalForm.startDate, modalForm.endDate);
    if (blockErrors.length > 0) {
      toast.error(blockErrors[0]);
      return;
    }

    try {
      if (editingAllocation) {
        const result = await updateAllocation.mutateAsync({ id: editingAllocation.id, ...modalForm });
        if (result.clippedEndDate) {
          toast.success(`Aloca\u00e7\u00e3o atualizada (limitada at\u00e9 ${result.clippedEndDate})`);
        } else {
          toast.success("Aloca\u00e7\u00e3o atualizada");
        }
      } else {
        const result = await createAllocation.mutateAsync(modalForm);
        if (result.clippedEndDate) {
          toast.success(`Aloca\u00e7\u00e3o criada (limitada at\u00e9 ${result.clippedEndDate})`);
        } else {
          toast.success("Aloca\u00e7\u00e3o criada");
        }
      }
      setModalOpen(false);
    } catch (err: any) {
      const msg = err?.message || "Erro ao salvar";
      toast.error(msg);
    }
  };

  const handleModalDelete = async () => {
    if (!canEdit) { toast.error('Sem permissão para excluir alocações'); return; }
    if (!editingAllocation) return;
    if (!confirm("Confirma exclusão da alocação?")) return;
    await deleteAllocation.mutateAsync({ id: editingAllocation.id });
    setModalOpen(false);
    toast.success("Alocação excluída");
  };

  // Export CSV
  const exportCSV = () => {
    const headers = ['Recurso', 'Projeto', 'Frente', 'Data Início', 'Data Fim', 'Horas/Dia', 'Tipo', 'Status', 'Observações'];
    const rows = allAllocations.map(a => {
      const resource = resources.find(r => r.id === a.resourceId);
      const project = projects.find(p => p.id === a.projectId);
      return [resource?.name || '', project?.name || '', a.front, a.startDate, a.endDate, a.hoursPerDay, a.allocationType, a.status, a.notes];
    });
    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `alocacoes_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso");
  };

  const activeAllocation = activeId ? allAllocations.find(a => a.id === activeId) : null;

  // Navigation handlers
  const handlePrev = () => {
    if (viewMode === 'week') setWeekOffset(w => w - 1);
    else if (viewMode === 'month') setMonthOffset(m => m - 1);
    else setYearOffset(y => y - 1);
  };
  const handleNext = () => {
    if (viewMode === 'week') setWeekOffset(w => w + 1);
    else if (viewMode === 'month') setMonthOffset(m => m + 1);
    else setYearOffset(y => y + 1);
  };
  const handleToday = () => {
    if (viewMode === 'week') setWeekOffset(0);
    else if (viewMode === 'month') setMonthOffset(0);
    else setYearOffset(0);
  };

  const periodLabel = viewMode === 'week'
    ? `${format(currentWeekStart, "dd MMM", { locale: ptBR })} - ${format(addDays(currentWeekStart, 4), "dd MMM yyyy", { locale: ptBR })}`
    : viewMode === 'month'
    ? format(currentMonth, "MMMM yyyy", { locale: ptBR })
    : `${currentYear}`;

  const resourceFilterOptions = resources
    .filter(r => r.status === 'Ativo')
    .map(r => ({ value: r.id, label: r.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const projectFilterOptions = projects
    .map(p => ({ value: p.id, label: p.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const managerFilterOptions = Array.from(new Set(projects.map((p: any) => p.manager).filter(Boolean) as string[]))
    .sort()
    .map(manager => ({ value: manager, label: manager }));
  const groupFilterOptions = Array.from(new Set(
    resources
      .filter(r => r.status === 'Ativo')
      .map((resource: Resource) => resource.group?.trim() || 'Sem grupo')
  ))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map(group => ({ value: group, label: group }));
  const frontFilterOptions = FRONTS.map(front => ({ value: front, label: front }));

  // Annual view: click a week to open that month filtered by resource
  const handleAnnualWeekClick = (resourceId: string, date: string) => {
    const targetMonth = startOfMonth(parseISO(date));
    const now = new Date();
    const diff = (targetMonth.getFullYear() - now.getFullYear()) * 12 + (targetMonth.getMonth() - now.getMonth());
    setMonthOffset(diff);
    setFilterResources([resourceId]);
    setViewMode('month');
  };

  return (
    <div className="w-full max-w-full space-y-4 overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold sm:text-2xl">Planner de Alocação</h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            {viewMode === 'week' ? 'Arraste cards para mover, use as bordas para redimensionar' :
             viewMode === 'month' ? 'Arraste barras para mover, use as bordas para redimensionar' :
             'Clique em um mês para ver detalhes'}
          </p>
        </div>
        <div className={`grid w-full gap-2 sm:flex sm:w-auto ${canEdit ? 'grid-cols-3' : 'grid-cols-1'}`}>
          <Button variant="outline" onClick={downloadTemplate} className="min-w-0 gap-1 px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm">
            <Download className="h-4 w-4 shrink-0" /> <span className="truncate">Modelo</span>
          </Button>
          {canEdit && <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="min-w-0 gap-1 px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm">
            <Upload className="h-4 w-4 shrink-0" /> <span className="truncate">Importar</span>
          </Button>}
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleBulkImport} />
          <Button variant="outline" onClick={exportCSV} className="min-w-0 gap-1 px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm">
            <Download className="h-4 w-4 shrink-0" /> <span className="truncate">CSV</span>
          </Button>
        </div>
      </div>

      {/* Dashboard-like Alert Cards */}
      {dashStats && ((dashStats.projectsMissingFronts || []).length > 0 || plannerUnallocatedResources.length > 0 || (dashStats.resourceEndDateAlerts || []).length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Projetos Faltando Recurso */}
          {(dashStats.projectsMissingFronts || []).length > 0 && (
            <Card className="border-red-300 bg-red-50/50">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <FolderSearch className="h-4 w-4 text-red-600" />
                    Projetos Faltando Recurso
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-red-300 text-red-700">
                      {(dashStats.projectsMissingFronts || []).length}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setAlertCardsExpanded(prev => ({ ...prev, missing: !prev.missing }))}
                      aria-label={alertCardsExpanded.missing ? 'Recolher projetos faltando recurso' : 'Expandir projetos faltando recurso'}
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${alertCardsExpanded.missing ? 'rotate-180' : ''}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {alertCardsExpanded.missing && (
              <CardContent className="px-4 pb-3">
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {(dashStats.projectsMissingFronts || []).map((item: ProjectMissingFrontsAlert, i: number) => (
                    <div
                      key={i}
                      className="space-y-1 p-2 rounded-md hover:bg-red-100/80 cursor-pointer transition-colors border border-transparent hover:border-red-200"
                      onClick={() => openQuickAllocModal(item)}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium">{item.projectName}</p>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 text-red-600 border-red-300">Alocar</Badge>
                      </div>
                      {item.missingFronts && item.missingFronts.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.missingFronts.map((f: string) => (
                            <Badge key={f} variant="destructive" className="text-[10px]">{f}</Badge>
                          ))}
                        </div>
                      )}
                      {item.gaps && item.gaps.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {item.gaps.map((gap: ProjectFrontGap, gi: number) => (
                            <button
                              key={gi}
                              type="button"
                              className="w-full text-left text-[10px] text-orange-700 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5 cursor-pointer hover:bg-orange-100 hover:border-orange-300 transition-colors flex items-center justify-between gap-1"
                              onClick={(e) => { e.stopPropagation(); openQuickAllocModal(item, gap); }}
                              title={`Clique para alocar recurso de ${gap.gapStart} at\u00e9 ${gap.gapEnd}`}
                            >
                              <span>
                                {getQuickGapLabel(item, gap)}
                              </span>
                              <Badge variant="outline" className="text-[8px] px-1 py-0 text-orange-600 border-orange-300 shrink-0">Alocar</Badge>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
              )}
            </Card>
          )}

          {/* Recursos sem Alocação */}
          {plannerUnallocatedResources.length > 0 && (
            <Card className="border-amber-300 bg-amber-50/50">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <UserX className="h-4 w-4 text-amber-600" />
                    Recursos sem Alocação no Período
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-amber-300 text-amber-700">
                      {plannerUnallocatedResources.length}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setAlertCardsExpanded(prev => ({ ...prev, unallocated: !prev.unallocated }))}
                      aria-label={alertCardsExpanded.unallocated ? 'Recolher recursos sem alocação' : 'Expandir recursos sem alocação'}
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${alertCardsExpanded.unallocated ? 'rotate-180' : ''}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {alertCardsExpanded.unallocated && (
              <CardContent className="px-4 pb-3">
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {plannerUnallocatedResources.map((item: string | { id: string; name: string }, i: number) => {
                    const resourceName = getUnallocatedResourceName(item, resources as Resource[]);
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-xs">{resourceName}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
              )}
            </Card>
          )}

          {/* Recursos com Saída Próxima */}
          {(dashStats.resourceEndDateAlerts || []).length > 0 && (
            <Card className="border-orange-300 bg-orange-50/50">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <UserMinus className="h-4 w-4 text-orange-600" />
                    Recursos com Saída Próxima
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-orange-300 text-orange-700">
                      {(dashStats.resourceEndDateAlerts || []).length}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setAlertCardsExpanded(prev => ({ ...prev, departures: !prev.departures }))}
                      aria-label={alertCardsExpanded.departures ? 'Recolher recursos com saída próxima' : 'Expandir recursos com saída próxima'}
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${alertCardsExpanded.departures ? 'rotate-180' : ''}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {alertCardsExpanded.departures && (
              <CardContent className="px-4 pb-3">
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {(dashStats.resourceEndDateAlerts || []).map((alert: any, i: number) => (
                    <div key={i} className="p-2 bg-white border border-orange-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-orange-800">{alert.resourceName}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 text-orange-700 border-orange-400">Sai em {alert.endDate}</Badge>
                      </div>
                      <div className="space-y-1 ml-3">
                        {alert.affectedProjects.map((impact: ResourceEndDateImpact, pi: number) => (
                          <button
                            key={pi}
                            type="button"
                            className="w-full text-left text-[10px] text-orange-700 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5 hover:bg-orange-100 hover:border-orange-300 transition-colors flex items-center justify-between gap-1"
                            onClick={() => openQuickAllocModal({
                              projectId: impact.projectId,
                              projectName: impact.projectName,
                              missingFronts: [impact.front],
                              gaps: [{
                                front: impact.front,
                                gapStart: impact.impactStart,
                                gapEnd: impact.impactEnd,
                                reason: impact.reason,
                              }],
                            }, impact)}
                            title={`Clique para alocar recurso de ${impact.impactStart} at\u00e9 ${impact.impactEnd}`}
                          >
                            <span>
                              <span className="font-medium">{impact.projectName}</span>
                              {' '}({impact.front}) {impact.impactStart} a {impact.impactEnd}: {impact.reason}
                            </span>
                            <Badge variant="outline" className="text-[8px] px-1 py-0 text-orange-600 border-orange-300 shrink-0">Alocar</Badge>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Filters */}
      <Card className="sticky top-14 z-20 max-w-full overflow-hidden bg-background/95 shadow-sm backdrop-blur sm:static sm:shadow-none">
        <CardContent className="px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {/* View toggle */}
            <div className="grid w-full grid-cols-3 overflow-hidden rounded-md border sm:inline-flex sm:w-auto">
              <Button
                variant={viewMode === 'week' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 rounded-none gap-1.5 px-2 text-xs sm:text-sm"
                onClick={() => setViewMode('week')}
              >
                <Calendar className="h-3.5 w-3.5" /> Semana
              </Button>
              <Button
                variant={viewMode === 'month' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 rounded-none gap-1.5 px-2 text-xs sm:text-sm"
                onClick={() => setViewMode('month')}
              >
                <CalendarDays className="h-3.5 w-3.5" /> Mês
              </Button>
              <Button
                variant={viewMode === 'year' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 rounded-none gap-1.5 px-2 text-xs sm:text-sm"
                onClick={() => setViewMode('year')}
              >
                <CalendarRange className="h-3.5 w-3.5" /> Ano
              </Button>
            </div>

            <div className="grid w-full grid-cols-3 overflow-hidden rounded-md border sm:inline-flex sm:w-auto">
              <Button
                variant={timelineMode === 'resources' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 rounded-none px-2 text-xs"
                onClick={() => setTimelineMode('resources')}
              >
                Consultores
              </Button>
              <Button
                variant={timelineMode === 'combined' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 rounded-none px-2 text-xs"
                onClick={() => setTimelineMode('combined')}
              >
                Projetos + Consultores
              </Button>
              <Button
                variant={timelineMode === 'projects' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 rounded-none px-2 text-xs"
                onClick={() => setTimelineMode('projects')}
              >
                Projetos
              </Button>
            </div>

            {/* Period navigation */}
            <div className="grid grid-cols-[2rem_1fr_2rem] items-center gap-2 sm:inline-flex sm:w-auto">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-0 truncate text-center text-sm font-medium capitalize sm:min-w-[180px]">
                {periodLabel}
              </span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="col-span-3 h-8 sm:col-span-1" onClick={handleToday}>Hoje</Button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex sm:flex-wrap sm:items-center">
              <MultiFilter
                label="Recursos"
                allLabel="Todos Recursos"
                selected={filterResources}
                options={resourceFilterOptions}
                onChange={setFilterResources}
              />

              <MultiFilter
                label="Projetos"
                allLabel="Todos Projetos"
                selected={filterProjects}
                options={projectFilterOptions}
                onChange={setFilterProjects}
              />

              <MultiFilter
                label="Gestores"
                allLabel="Todos Gestores"
                selected={filterManagers}
                options={managerFilterOptions}
                onChange={setFilterManagers}
              />

              <MultiFilter
                label="Grupos"
                allLabel="Todos Grupos"
                selected={filterGroups}
                options={groupFilterOptions}
                onChange={setFilterGroups}
                className="sm:w-[150px]"
              />

              <MultiFilter
                label="Frentes"
                allLabel="Todas Frentes"
                selected={filterFronts}
                options={frontFilterOptions}
                onChange={setFilterFronts}
                className="sm:w-[130px]"
              />

              <MultiFilter
                label="Alocação"
                allLabel="Alocação: Todos"
                selected={filterAllocationStatuses}
                options={ALLOCATION_FILTER_OPTIONS}
                onChange={setFilterAllocationStatuses}
                className="sm:w-[160px]"
              />

              <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => {
                if (sortPlanner === 'name') setSortPlannerDir(d => d === 'asc' ? 'desc' : 'asc');
                else { setSortPlanner('name'); setSortPlannerDir('asc'); }
              }}>
                Nome {sortPlanner === 'name' ? (sortPlannerDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => {
                if (sortPlanner === 'front') setSortPlannerDir(d => d === 'asc' ? 'desc' : 'asc');
                else { setSortPlanner('front'); setSortPlannerDir('asc'); }
              }}>
                Frente {sortPlanner === 'front' ? (sortPlannerDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gantt Grid */}
      <Card className="max-w-full overflow-hidden">
        <CardContent className="max-w-full overflow-hidden p-0">
          {viewMode === 'week' ? (
            /* ===== WEEKLY VIEW ===== */
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className="w-full max-w-full overflow-x-auto overscroll-x-contain">
                <table className="w-full min-w-[640px] border-collapse sm:min-w-[800px]">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="sticky left-0 z-10 w-[150px] min-w-[150px] border-b border-r bg-muted/50 p-2 text-left text-xs font-semibold sm:w-[220px] sm:min-w-[220px]">
                        {showProjectTimeline && !showResourceTimeline ? 'Projeto' : showProjectTimeline ? 'Projeto/Recurso' : 'Recurso'}
                      </th>
                      {weekDays.map(day => (
                        <th key={day.toISOString()} className="min-w-[100px] border-b p-2 text-center text-xs font-semibold sm:min-w-[140px]">
                          <div>{format(day, 'EEE', { locale: ptBR })}</div>
                          <div className="text-muted-foreground font-normal">{format(day, 'dd/MM')}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {showProjectTimeline && filteredTimelineProjects.map(project => (
                      <ProjectTimelineRow
                        key={`project-${project.id}`}
                        project={project}
                        phases={phases}
                        days={weekDays}
                        projects={projects}
                      />
                    ))}
                    {showResourceTimeline && filteredResources.map(resource => (
                      <tr key={resource.id} className="border-b last:border-b-0">
                        <td className="sticky left-0 z-10 border-r bg-white p-2">
                          <ResourcePlannerLabel resource={resource} compact />
                        </td>
                        {weekDays.map(day => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const cellAllocations = getAllocationsForCell(resource.id, day);
                          const totalHours = getTotalHours(resource.id, day);
                          const absent = isResourceAbsent(resource.id, day);
                          const pastEnd = !!(resource.endDate && resource.endDate < dateStr);

                          return (
                            <td key={dateStr} className="p-0 align-top">
                              <DayCell
                                resourceId={resource.id}
                                date={dateStr}
                                totalHours={totalHours}
                                capacity={resource.dailyCapacity}
                                isAbsent={absent}
                                isPastEndDate={pastEnd}
                                allocCount={cellAllocations.length}
                                onClickEmpty={() => openCreateModal(resource.id, dateStr)}
                              >
                                {cellAllocations.map(alloc => (
                                  <AllocationCard
                                    key={alloc.id}
                                    allocation={alloc}
                                    projects={projects}
                                    phases={phases}
                                    referenceDate={dateStr}
                                    onEdit={openEditModal}
                                    onResizeEnd={handleResizeEnd}
                                    isDragging={activeId === alloc.id}
                                  />
                                ))}
                              </DayCell>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {showProjectTimeline && filteredTimelineProjects.length === 0 && !showResourceTimeline && (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-muted-foreground">
                          Nenhum projeto encontrado com os filtros aplicados
                        </td>
                      </tr>
                    )}
                    {showResourceTimeline && filteredResources.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-muted-foreground">
                          Nenhum recurso encontrado com os filtros aplicados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <DragOverlay>
                {activeAllocation && (
                  <div className={`rounded px-2 py-1 text-[10px] text-white shadow-lg ${getProjectColor(activeAllocation.projectId, projects)}`}>
                    {projects.find(p => p.id === activeAllocation.projectId)?.name} - {activeAllocation.hoursPerDay}h
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          ) : viewMode === 'month' ? (
            /* ===== MONTHLY VIEW with DnD/Resize ===== */
            <div className="w-full max-w-full overflow-x-auto overscroll-x-contain">
              <table className="w-full border-collapse" style={{ minWidth: `${monthDays.length * 28 + 190}px` }}>
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left text-xs font-semibold p-2 min-w-[190px] border-b border-r sticky left-0 bg-muted/50 z-10">
                      {showProjectTimeline && !showResourceTimeline ? 'Projeto' : showProjectTimeline ? 'Projeto/Recurso' : 'Recurso'}
                    </th>
                    {monthDays.map(day => (
                      <th key={day.toISOString()} className="text-center text-[9px] font-medium p-0.5 border-b min-w-[28px] max-w-[36px]">
                        <div className="text-muted-foreground">{format(day, 'EEE', { locale: ptBR }).charAt(0).toUpperCase()}</div>
                        <div>{format(day, 'dd')}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {showProjectTimeline && filteredTimelineProjects.map(project => (
                    <ProjectTimelineRow
                      key={`project-${project.id}`}
                      project={project}
                      phases={phases}
                      days={monthDays}
                      projects={projects}
                    />
                  ))}
                  {showResourceTimeline && filteredResources.map(resource => (
                    <MonthlyGanttRow
                      key={resource.id}
                      resource={resource}
                      allocations={filteredAllocations}
                      projects={projects}
                      phases={phases}
                      absences={absences}
                      days={monthDays}
                      onClickAllocation={openEditModal}
                      onClickDay={(resId, date) => openCreateModal(resId, date)}
                      onMoveAllocation={handleMonthlyMove}
                      onResizeAllocation={handleMonthlyResize}
                    />
                  ))}
                  {showProjectTimeline && filteredTimelineProjects.length === 0 && !showResourceTimeline && (
                    <tr>
                      <td colSpan={monthDays.length + 1} className="text-center py-12 text-muted-foreground">
                        Nenhum projeto encontrado com os filtros aplicados
                      </td>
                    </tr>
                  )}
                  {showResourceTimeline && filteredResources.length === 0 && (
                    <tr>
                      <td colSpan={monthDays.length + 1} className="text-center py-12 text-muted-foreground">
                        Nenhum recurso encontrado com os filtros aplicados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* ===== ANNUAL VIEW ===== */
            <div ref={annualScrollRef} className="max-h-[70vh] w-full max-w-full overflow-auto overscroll-contain">
              <table className="w-full border-collapse" style={{ minWidth: `${yearWeeks.length * 42 + 220}px` }}>
                <thead className="sticky top-0 z-30">
                  <tr className="bg-muted/50">
                    <th rowSpan={2} className="sticky left-0 z-40 min-w-[220px] border-b border-r bg-muted p-2 text-left text-xs font-semibold shadow-sm">
                      {showProjectTimeline && !showResourceTimeline ? 'Projeto' : showProjectTimeline ? 'Projeto/Recurso' : 'Recurso'}
                    </th>
                    {yearMonthGroups.map((group, idx) => (
                      <th
                        key={`${group.monthIdx}-${idx}`}
                        colSpan={group.count}
                        className="border-b border-r bg-muted p-1.5 text-center text-xs font-semibold shadow-sm"
                      >
                        {format(new Date(currentYear, group.monthIdx, 1), 'MMM', { locale: ptBR })}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-muted/30">
                    {yearWeeks.map((week, idx) => (
                      <th key={idx} className="min-w-[42px] border-b border-r bg-muted/95 p-1 text-center text-[10px] font-medium shadow-sm">
                        <span className="block">S{idx + 1}</span>
                        <span className="block text-[9px] font-normal text-muted-foreground">{week.label}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {showProjectTimeline && filteredTimelineProjects.map(project => (
                    <AnnualProjectTimelineRow
                      key={`project-year-${project.id}`}
                      project={project}
                      phases={phases}
                      weeks={yearWeeks}
                    />
                  ))}
                  {showResourceTimeline && filteredResources.map(resource => (
                    <AnnualResourceGanttRow
                      key={resource.id}
                      resource={resource}
                      allocations={filteredAllocations}
                      projects={projects}
                      absences={absences}
                      weeks={yearWeeks}
                      onClickWeek={handleAnnualWeekClick}
                      onClickAllocation={openEditModal}
                    />
                  ))}
                  {showProjectTimeline && filteredTimelineProjects.length === 0 && !showResourceTimeline && (
                    <tr>
                      <td colSpan={yearWeeks.length + 1} className="text-center py-12 text-muted-foreground">
                        Nenhum projeto encontrado com os filtros aplicados
                      </td>
                    </tr>
                  )}
                  {showResourceTimeline && filteredResources.length === 0 && (
                    <tr>
                      <td colSpan={yearWeeks.length + 1} className="text-center py-12 text-muted-foreground">
                        Nenhum recurso encontrado com os filtros aplicados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-50 border border-green-200" /> Disponível</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-50 border border-amber-200" /> Alta Utilização</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-50 border border-red-200" /> Sobrealocado</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-50 border border-blue-200" /> Férias/Ausência</div>
        {viewMode !== 'year' && (
          <div className="flex items-center gap-1.5 ml-4">
            <span className="italic">Arraste as barras para mover, bordas para redimensionar</span>
          </div>
        )}
        {viewMode === 'year' && (
          <div className="flex items-center gap-1.5 ml-4">
            <span className="italic">Clique em um mês para abrir a visão mensal detalhada</span>
          </div>
        )}
      </div>

      {/* Project color legend */}
      {projects.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs">
          {projects.slice(0, 8).map((p, i) => (
            <div key={p.id} className="flex items-center gap-1.5">
              <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: PROJECT_COLORS_HEX[i % PROJECT_COLORS_HEX.length] }} />
              <span className="text-muted-foreground">{p.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Edit/Create Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{editingAllocation ? 'Editar Alocação' : 'Nova Alocação'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Recurso</Label>
                <Select value={modalForm.resourceId} onValueChange={v => setModalForm({ ...modalForm, resourceId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{resources.filter(r => r.status === 'Ativo').map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Projeto</Label>
                <Select value={modalForm.projectId} onValueChange={v => setModalForm({ ...modalForm, projectId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Frente</Label>
                <Select value={modalForm.front} onValueChange={v => setModalForm({ ...modalForm, front: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FRONTS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Tipo</Label>
                <Select value={modalForm.allocationType} onValueChange={v => setModalForm({ ...modalForm, allocationType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ALLOCATION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={modalForm.status} onValueChange={v => setModalForm({ ...modalForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ALLOCATION_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Data Início</Label>
                <Input type="date" value={modalForm.startDate} onChange={e => setModalForm({ ...modalForm, startDate: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Data Fim</Label>
                <Input type="date" value={modalForm.endDate} onChange={e => setModalForm({ ...modalForm, endDate: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Horas/Dia</Label>
                <Input type="number" min={1} max={24} value={modalForm.hoursPerDay} onChange={e => setModalForm({ ...modalForm, hoursPerDay: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Observações</Label>
              <Input value={modalForm.notes} onChange={e => setModalForm({ ...modalForm, notes: e.target.value })} />
            </div>

            {/* Overallocation warning */}
            {modalForm.resourceId && modalForm.startDate && (() => {
              const resource = resources.find(r => r.id === modalForm.resourceId);
              if (!resource) return null;
              const date = parseISO(modalForm.startDate);
              const currentHours = getTotalHours(modalForm.resourceId, date);
              const projectedHours = currentHours + modalForm.hoursPerDay - (editingAllocation?.hoursPerDay || 0);
              if (projectedHours > resource.dailyCapacity) {
                return (
                  <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Sobrealocação detectada: {projectedHours}h / {resource.dailyCapacity}h de capacidade diária</span>
                  </div>
                );
              }
              return null;
            })()}

            {/* Absence / EndDate blocking warning */}
            {modalForm.resourceId && modalForm.startDate && modalForm.endDate && (() => {
              const errors = getBlockingErrors(modalForm.resourceId, modalForm.startDate, modalForm.endDate);
              if (errors.length === 0) return null;
              return (
                <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-300 rounded text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-semibold">Bloqueado:</span>
                    {errors.map((err, i) => <div key={i}>{err}</div>)}
                  </div>
                </div>
              );
            })()}

            {/* Non-blocking warnings (endDate clip, partial absence) */}
            {modalForm.resourceId && modalForm.startDate && modalForm.endDate && (() => {
              const errors = getBlockingErrors(modalForm.resourceId, modalForm.startDate, modalForm.endDate);
              if (errors.length > 0) return null; // already showing blocking errors
              const { warnings, maxEndDate } = getWarnings(modalForm.resourceId, modalForm.startDate, modalForm.endDate);
              if (warnings.length === 0) return null;
              return (
                <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-300 rounded text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-semibold">Atenção:</span>
                    {warnings.map((w, i) => <div key={i}>{w}</div>)}
                    {maxEndDate && <div className="font-medium mt-1">A alocação será salva até {maxEndDate}.</div>}
                  </div>
                </div>
              );
            })()}
          </div>
          <DialogFooter className="flex-col gap-3 sm:flex-row sm:justify-between">
            <div className="w-full sm:w-auto">
              {editingAllocation && canEdit && (
                <Button className="w-full sm:w-auto" variant="destructive" onClick={handleModalDelete}>Excluir</Button>
              )}
            </div>
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
              <Button className="w-full sm:w-auto" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              {canEdit && <Button
                className="w-full sm:w-auto"
                onClick={handleModalSave}
                disabled={!!(modalForm.resourceId && modalForm.startDate && modalForm.endDate && getBlockingErrors(modalForm.resourceId, modalForm.startDate, modalForm.endDate).length > 0)}
              >{editingAllocation ? 'Salvar' : 'Criar'}</Button>}
              {!canEdit && <Badge variant="secondary">Somente visualização</Badge>}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Allocation Modal (from gap cards) */}
      <Dialog open={quickAllocModalOpen} onOpenChange={setQuickAllocModalOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderSearch className="h-5 w-5 text-red-600" />
              Alocação Rápida — {quickAllocProject?.projectName}
            </DialogTitle>
          </DialogHeader>
          {quickAllocProject && (
            <div className="space-y-4 py-2">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm font-medium text-red-800 mb-2">Frentes sem recurso alocado:</p>
                <div className="flex flex-wrap gap-1.5">
                  {quickAllocProject.missingFronts.map((f: string) => (
                    <Badge
                      key={f}
                      variant={quickAllocForm.front === f ? "default" : "destructive"}
                      className={`text-xs cursor-pointer transition-all ${quickAllocForm.front === f ? 'ring-2 ring-offset-1 ring-primary' : 'hover:opacity-80'}`}
                      onClick={() => {
                        const range = getQuickAllocationRange(quickAllocProject, f);
                        const startDate = range.startDate || quickAllocForm.startDate;
                        const endDate = range.endDate || quickAllocForm.endDate;
                        setQuickAllocForm(prev => ({
                          ...prev,
                          front: f,
                          resourceId: findSuggestedQuickResourceId(quickAllocProject.projectId, f, startDate, endDate),
                          startDate,
                          endDate,
                        }));
                      }}
                    >
                      {f}
                    </Badge>
                  ))}
                </div>
                {quickAllocProject.gaps.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {quickAllocProject.gaps
                      .filter(gap => gap.front === quickAllocForm.front)
                      .map((gap, index) => (
                        <p key={`${gap.front}-${gap.gapStart}-${index}`} className="text-xs text-red-700">
                          {getQuickGapLabel(quickAllocProject, gap)}
                        </p>
                      ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Recurso *</Label>
                <Select value={quickAllocForm.resourceId} onValueChange={v => setQuickAllocForm(prev => ({ ...prev, resourceId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione um recurso..." /></SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Recursos da frente {quickAllocForm.front}</div>
                    {resources
                      .filter((r: any) =>
                        r.status === 'Ativo' &&
                        resourceMatchesQuickFront(r, quickAllocForm.front) &&
                        !resourceHasQuickConflict(r.id, quickAllocProject.projectId, quickAllocForm.front, quickAllocForm.startDate, quickAllocForm.endDate)
                      )
                      .map((r: any) => (
                        <SelectItem key={r.id} value={r.id}>
                          <span className="flex items-center gap-2">
                            {r.name}
                            <Badge variant="secondary" className="text-[10px] px-1">{(r.fronts || [r.front]).filter(Boolean).join(', ')}</Badge>
                            <Badge variant="outline" className="text-[10px] px-1">{r.profile}</Badge>
                          </span>
                        </SelectItem>
                      ))}
                    {resources.filter((r: any) =>
                      r.status === 'Ativo' &&
                      resourceMatchesQuickFront(r, quickAllocForm.front) &&
                      !resourceHasQuickConflict(r.id, quickAllocProject.projectId, quickAllocForm.front, quickAllocForm.startDate, quickAllocForm.endDate)
                    ).length === 0 && (
                      <div className="px-2 py-2 text-xs text-muted-foreground">
                        Nenhum consultor livre dessa frente no mesmo projeto/período.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {/* Selected resource info */}
              {quickAllocForm.resourceId && (() => {
                const res = resources.find((r: any) => r.id === quickAllocForm.resourceId) as any;
                if (!res) return null;
                return (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-blue-800">Recurso selecionado:</p>
                    <p className="text-sm text-blue-700 mt-1">
                      {res.name} — {res.profile} ({(res.fronts || []).join(', ')}) — Capacidade: {res.dailyCapacity}h/dia
                    </p>
                    {quickAllocForm.hoursPerDay > res.dailyCapacity && (
                      <p className="text-xs text-red-600 mt-1 font-medium flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Atenção: horas alocadas excedem a capacidade diária do recurso!
                      </p>
                    )}
                  </div>
                );
              })()}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Data Início *</Label>
                  <Input type="date" value={quickAllocForm.startDate} onChange={e => setQuickAllocForm(prev => ({ ...prev, startDate: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Data Fim *</Label>
                  <Input type="date" value={quickAllocForm.endDate} onChange={e => setQuickAllocForm(prev => ({ ...prev, endDate: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Horas por Dia</Label>
                <Input type="number" min={1} max={24} value={quickAllocForm.hoursPerDay} onChange={e => setQuickAllocForm(prev => ({ ...prev, hoursPerDay: Number(e.target.value) }))} />
              </div>
            </div>
          )}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => setQuickAllocModalOpen(false)}>Cancelar</Button>
            <Button className="w-full sm:w-auto" onClick={handleQuickAllocate} disabled={createAllocation.isPending || !quickAllocForm.resourceId || !quickAllocForm.front}>
              {createAllocation.isPending ? 'Criando...' : 'Criar Alocação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
