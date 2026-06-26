import { useRef, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import {
  addDays, differenceInDays, format,
  startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  eachMonthOfInterval, eachQuarterOfInterval,
  isWeekend, parseISO, isToday,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import type { GanttItem, Member } from '../types';
import type { GanttChartHandle } from './GanttChart';

// ── 높이 상수 ─────────────────────────────────────────────────
const INIT_H = 38;
const EPIC_H = 34;
const TASK_H = 32;

// ── 왼쪽 패널 컬럼 너비 ───────────────────────────────────────
const COL_KEY      = 70;
const COL_TYPE     = 58;
const COL_STATUS   = 78;
const COL_DATE     = 66;
const COL_ASSIGNEE = 72;
// SUMMARY = flex-1

const LEFT_DEFAULT = 580;
const LEFT_MIN     = 340;
const LEFT_MAX     = 760;

// ── 색상 설정 ─────────────────────────────────────────────────
const STATUS_CFG: Record<string, { bg: string; color: string; label: string }> = {
  todo:        { bg: '#f1f5f9', color: '#64748b', label: 'Suggested' },
  in_progress: { bg: '#e0e7ff', color: '#4338ca', label: 'In Progress' },
  done:        { bg: '#dcfce7', color: '#166534', label: 'Done' },
  hold:        { bg: '#fef3c7', color: '#b45309', label: 'Hold' },
};

const TYPE_CFG: Record<string, { bg: string; color: string; label: string }> = {
  Initiative: { bg: '#ede9fe', color: '#7c3aed', label: 'Initiative' },
  Epic:       { bg: '#fff7ed', color: '#fb923c', label: 'Epic' },
  Design:     { bg: '#e0e7ff', color: '#4338ca', label: 'Design' },
  Task:       { bg: '#f1f5f9', color: '#475569', label: 'Task' },
  Story:      { bg: '#d1fae5', color: '#065f46', label: 'Story' },
  Bug:        { bg: '#fee2e2', color: '#b91c1c', label: 'Bug' },
  'Sub-task': { bg: '#f8fafc', color: '#94a3b8', label: 'Sub' },
};

const BAR_OVERRIDE: Record<string, string> = {
  Initiative: '#7c3aed',
  Epic:       '#fb923c',
  Design:     '#6366f1',
};

function getBarColor(item: GanttItem): string {
  if (item.status === 'done' || item.status === 'hold') return '#94a3b8';
  if (item.issueType === 'Initiative') {
    return item.status === 'in_progress' ? '#8b5cf6' : '#ddd6fe';
  }
  if (item.issueType === 'Epic') {
    return item.status === 'in_progress' ? '#fb923c' : '#fed7aa';
  }
  if (item.issueType === 'Design') {
    return item.status === 'in_progress' ? '#6366f1' : '#a5b4fc';
  }
  // Task, Story, Sub-task 등 기본
  return item.status === 'in_progress' ? '#3b82f6' : '#bfdbfe';
}

function fmtDate(d: string) { return d.slice(5).replace('-', '/'); }

// ── 데이터 구조 ───────────────────────────────────────────────
interface EpicGroup { epic: GanttItem; tasks: GanttItem[] }
interface InitGroup { key: string; name: string; item?: GanttItem; epics: EpicGroup[] }

type RowData =
  | { kind: 'init'; group: InitGroup; top: number }
  | { kind: 'epic'; group: InitGroup; eg: EpicGroup; top: number }
  | { kind: 'task'; task: GanttItem; top: number };

// ── Props ─────────────────────────────────────────────────────
interface Props {
  items: GanttItem[];
  members: Member[];
  viewStart: Date;
  viewEnd: Date;
  colW?: number;
  onClickItem: (item: GanttItem) => void;
  customTitles?: Record<string, string>;
  onClickInitiative?: (initiativeKey: string, item?: GanttItem) => void;
}

// ── 컴포넌트 ──────────────────────────────────────────────────
const InitiativeGanttView = forwardRef<GanttChartHandle, Props>(function InitiativeGanttView(
  { items, members, viewStart, viewEnd, colW = 28, onClickItem, customTitles = {}, onClickInitiative },
  ref,
) {
  const leftRef  = useRef<HTMLDivElement>(null);
  const bodyRef  = useRef<HTMLDivElement>(null);
  const hdrRef   = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);
  const resX     = useRef(0);
  const resW     = useRef(0);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [leftW, setLeftW]         = useState(LEFT_DEFAULT);

  const totalDays = differenceInDays(viewEnd, viewStart) + 1;
  const totalW    = totalDays * colW;
  const months    = useMemo(() => eachMonthOfInterval({ start: viewStart, end: viewEnd }), [viewStart, viewEnd]);
  const quarters  = useMemo(() => eachQuarterOfInterval({ start: viewStart, end: viewEnd }), [viewStart, viewEnd]);
  const todayOff  = differenceInDays(new Date(), viewStart) * colW;
  const showQ     = colW <= 16;
  const showDays  = colW >= 28;
  const dayFmt    = colW >= 36 ? 'M/d' : 'd';

  // ── 그룹 구성 ───────────────────────────────────────────────
  const groups = useMemo((): InitGroup[] => {
    const epicItems = items.filter(i => i.type === 'jira' && i.issueType === 'Epic');
    const taskItems = items.filter(i => i.type === 'jira' && i.issueType !== 'Epic' && i.issueType !== 'Initiative');
    const initItems = items.filter(i => i.type === 'jira' && i.issueType === 'Initiative');

    // initiativeKey → GanttItem 빠른 조회
    const initByKey = new Map(initItems.filter(i => i.jiraKey).map(i => [i.jiraKey!, i]));
    const initByTitle = new Map(initItems.map(i => [i.title, i]));

    const map = new Map<string, InitGroup>();

    for (const epic of epicItems) {
      // initiativeKey(jiraKey)로 먼저 매칭, 없으면 epicName(title)으로 폴백
      const initItem = epic.initiativeKey
        ? (initByKey.get(epic.initiativeKey) ?? initByTitle.get(epic.epicName ?? ''))
        : initByTitle.get(epic.epicName ?? '');

      const groupKey = epic.initiativeKey ?? epic.epicName ?? '기타';
      const groupName = epic.epicName ?? '기타';

      if (!map.has(groupKey)) {
        map.set(groupKey, { key: groupKey, name: groupName, item: initItem, epics: [] });
      }
      map.get(groupKey)!.epics.push({ epic, tasks: taskItems.filter(t => t.epicName === epic.title) });
    }

    // PD 라벨 있고 PD- 키 Epic이 있는 그룹만 노출
    return Array.from(map.values()).filter(group => {
      const hasPdLabel = group.item?.labels?.some(l => l.toUpperCase() === 'PD') ?? false;
      const hasPdEpic  = group.epics.some(eg => eg.epic.jiraKey?.toUpperCase().startsWith('PD-'));
      return hasPdLabel && hasPdEpic;
    });
  }, [items]);

  // ── 행 목록 (top 누적) ──────────────────────────────────────
  const rows = useMemo((): RowData[] => {
    const result: RowData[] = [];
    let top = 0;
    for (const group of groups) {
      result.push({ kind: 'init', group, top }); top += INIT_H;
      if (!collapsed.has(group.key)) {
        for (const eg of group.epics) {
          result.push({ kind: 'epic', group, eg, top }); top += EPIC_H;
          for (const task of eg.tasks) {
            result.push({ kind: 'task', task, top }); top += TASK_H;
          }
        }
      }
    }
    return result;
  }, [groups, collapsed]);

  const totalH = rows.reduce((s, r) =>
    s + (r.kind === 'init' ? INIT_H : r.kind === 'epic' ? EPIC_H : TASK_H), 0);

  // ── 스크롤 동기화 ────────────────────────────────────────────
  function syncH(src: 'h' | 'b', left: number) {
    if (src === 'b' && hdrRef.current)  hdrRef.current.scrollLeft  = left;
    if (src === 'h' && bodyRef.current) bodyRef.current.scrollLeft = left;
  }
  function syncV(src: 'l' | 'r', top: number) {
    if (src === 'l' && bodyRef.current) bodyRef.current.scrollTop = top;
    if (src === 'r' && leftRef.current) leftRef.current.scrollTop = top;
  }

  // ── 리사이즈 핸들 ────────────────────────────────────────────
  const onResizeDown = (ev: React.MouseEvent) => {
    ev.preventDefault();
    resizing.current = true;
    resX.current = ev.clientX;
    resW.current = leftW;
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      setLeftW(Math.min(LEFT_MAX, Math.max(LEFT_MIN, resW.current + e.clientX - resX.current)));
    };
    const onUp = () => {
      resizing.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── 외부 핸들 ────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    scrollToToday: () => {
      const offset = Math.max(0, todayOff - 250);
      if (bodyRef.current) bodyRef.current.scrollLeft = offset;
      if (hdrRef.current)  hdrRef.current.scrollLeft  = offset;
    },
    collapseAll:    () => setCollapsed(new Set(groups.map(g => g.key))),
    expandAll:      () => setCollapsed(new Set()),
    isAllCollapsed: () => groups.every(g => collapsed.has(g.key)),
  }));

  // ── 바 위치 계산 ─────────────────────────────────────────────
  function bLeft(d: string)           { return differenceInDays(parseISO(d), viewStart) * colW; }
  function bWidth(s: string, e: string) {
    return Math.max((differenceInDays(parseISO(e), parseISO(s)) + 1) * colW, colW);
  }

  function memberName(id: string) {
    if (id === 'unassigned') return '미정';
    return members.find(m => m.id === id)?.name ?? '';
  }

  function initBarRange(group: InitGroup): { s: string; e: string } | null {
    const all = group.epics.flatMap(eg => [eg.epic, ...eg.tasks]).filter(i => !i.noDates);
    if (all.length === 0) {
      if (group.item && !group.item.noDates) return { s: group.item.startDate, e: group.item.endDate };
      return null;
    }
    const s = all.reduce((m, i) => i.startDate < m ? i.startDate : m, all[0].startDate);
    const e = all.reduce((m, i) => i.endDate   > m ? i.endDate   : m, all[0].endDate);
    return { s, e };
  }

  // ── 왼쪽 패널 행 렌더링 ──────────────────────────────────────
  function renderLeft(row: RowData) {
    if (row.kind === 'init') {
      const { group } = row;
      const isCol     = collapsed.has(group.key);
      const item      = group.item;
      const sc        = item ? STATUS_CFG[item.status] : null;
      const initKey   = item?.jiraKey ?? group.key;
      const displayName = customTitles[initKey] || group.name;
      const hasCustom   = !!customTitles[initKey];
      return (
        <div key={`l-init-${group.key}`}
          className="flex items-center border-b select-none"
          style={{ height: INIT_H, background: '#f5f3ff', borderColor: '#ddd6fe' }}>
          {/* KEY */}
          <div style={{ width: COL_KEY, flexShrink: 0 }} className="px-2">
            {item?.jiraKey
              ? <a href={item.jiraUrl} target="_blank" rel="noreferrer"
                  className="text-[10px] font-mono text-violet-500 hover:underline block truncate"
                  onClick={e => e.stopPropagation()}>{item.jiraKey}</a>
              : <span className="text-[10px] text-violet-300 px-1">—</span>
            }
          </div>
          {/* TYPE */}
          <div style={{ width: COL_TYPE, flexShrink: 0 }} className="px-1">
            <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: '#ede9fe', color: '#7c3aed' }}>
              Initia…
            </span>
          </div>
          {/* SUMMARY: chevron(접기) + 타이틀(상세 열기) 분리 */}
          <div className="flex-1 min-w-0 px-1.5 flex items-center gap-1">
            <button
              className="text-[9px] text-violet-400 hover:text-violet-700 flex-shrink-0 px-0.5 transition-colors"
              onClick={() => setCollapsed(prev => { const n = new Set(prev); n.has(group.key) ? n.delete(group.key) : n.add(group.key); return n; })}>
              {isCol ? '▶' : '▼'}
            </button>
            <button
              className="flex-1 min-w-0 text-left hover:underline decoration-violet-300 underline-offset-2 transition-colors group"
              onClick={() => onClickInitiative?.(initKey, item)}>
              <p className={`text-[13px] font-medium truncate ${hasCustom ? 'text-violet-700' : 'text-violet-900'}`}>
                {displayName}
              </p>
            </button>
          </div>
          {/* 담당자 */}
          <div style={{ width: COL_ASSIGNEE, flexShrink: 0 }} className="px-1.5">
            <span className="text-[10px] text-gray-300">—</span>
          </div>
          {/* STATUS */}
          <div style={{ width: COL_STATUS, flexShrink: 0 }} className="px-1">
            {sc && <span className="inline-flex rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>}
          </div>
          {/* START */}
          <div style={{ width: COL_DATE, flexShrink: 0 }} className="px-1.5">
            {item && !item.noDates ? <span className="text-[10px] text-gray-500">{fmtDate(item.startDate)}</span> : <span className="text-[10px] text-gray-300">—</span>}
          </div>
          {/* END */}
          <div style={{ width: COL_DATE, flexShrink: 0 }} className="px-1.5">
            {item && !item.noDates ? <span className="text-[10px] text-gray-500">{fmtDate(item.endDate)}</span> : <span className="text-[10px] text-gray-300">—</span>}
          </div>
        </div>
      );
    }

    if (row.kind === 'epic') {
      const { epic } = row.eg;
      const tc = TYPE_CFG[epic.issueType ?? 'Epic'] ?? TYPE_CFG.Epic;
      const sc = STATUS_CFG[epic.status] ?? STATUS_CFG.todo;
      return (
        <div key={`l-epic-${epic.id}`}
          className="flex items-center border-b border-gray-100 cursor-pointer hover:bg-orange-50/40 transition-colors"
          style={{ height: EPIC_H, background: '#fffaf7' }}
          onClick={() => onClickItem(epic)}>
          <div style={{ width: COL_KEY, flexShrink: 0 }} className="pl-5 pr-2">
            {epic.jiraKey && (
              <a href={epic.jiraUrl} target="_blank" rel="noreferrer"
                className="text-[10px] font-mono text-orange-400 hover:underline block truncate"
                onClick={e => e.stopPropagation()}>{epic.jiraKey}</a>
            )}
          </div>
          <div style={{ width: COL_TYPE, flexShrink: 0 }} className="px-1">
            <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: tc.bg, color: tc.color }}>
              {tc.label.length > 6 ? tc.label.slice(0, 5) + '…' : tc.label}
            </span>
          </div>
          <div className="flex-1 min-w-0 px-1.5">
            <p className="text-[11px] text-gray-700 truncate">
              {epic.noDates && <span className="text-amber-500 mr-1">⚠</span>}{epic.title}
            </p>
          </div>
          <div style={{ width: COL_ASSIGNEE, flexShrink: 0 }} className="px-1.5">
            <span className="text-[10px] text-gray-600">{memberName(epic.memberId)}</span>
          </div>
          <div style={{ width: COL_STATUS, flexShrink: 0 }} className="px-1">
            <span className="inline-flex rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
          </div>
          <div style={{ width: COL_DATE, flexShrink: 0 }} className="px-1.5">
            {!epic.noDates ? <span className="text-[10px] text-gray-500">{fmtDate(epic.startDate)}</span> : <span className="text-[10px] text-gray-300">—</span>}
          </div>
          <div style={{ width: COL_DATE, flexShrink: 0 }} className="px-1.5">
            {!epic.noDates ? <span className="text-[10px] text-gray-500">{fmtDate(epic.endDate)}</span> : <span className="text-[10px] text-gray-300">—</span>}
          </div>
        </div>
      );
    }

    // task
    const { task } = row;
    const tc = TYPE_CFG[task.issueType ?? 'Task'] ?? TYPE_CFG.Task;
    const sc = STATUS_CFG[task.status] ?? STATUS_CFG.todo;
    return (
      <div key={`l-task-${task.id}`}
        className="flex items-center border-b border-gray-50 cursor-pointer hover:bg-indigo-50/20 transition-colors"
        style={{ height: TASK_H }}
        onClick={() => onClickItem(task)}>
        <div style={{ width: COL_KEY, flexShrink: 0 }} className="pl-9 pr-2">
          {task.jiraKey && (
            <a href={task.jiraUrl} target="_blank" rel="noreferrer"
              className="text-[10px] font-mono text-indigo-400 hover:underline block truncate"
              onClick={e => e.stopPropagation()}>{task.jiraKey}</a>
          )}
        </div>
        <div style={{ width: COL_TYPE, flexShrink: 0 }} className="px-1">
          <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: tc.bg, color: tc.color }}>
            {tc.label.length > 6 ? tc.label.slice(0, 5) + '…' : tc.label}
          </span>
        </div>
        <div className="flex-1 min-w-0 px-1.5">
          <p className="text-[11px] text-gray-600 truncate">
            {task.noDates && <span className="text-amber-500 mr-1">⚠</span>}{task.title}
          </p>
        </div>
        <div style={{ width: COL_ASSIGNEE, flexShrink: 0 }} className="px-1.5">
          <span className="text-[10px] text-gray-600">{memberName(task.memberId)}</span>
        </div>
        <div style={{ width: COL_STATUS, flexShrink: 0 }} className="px-1">
          <span className="inline-flex rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
        </div>
        <div style={{ width: COL_DATE, flexShrink: 0 }} className="px-1.5">
          {!task.noDates ? <span className="text-[10px] text-gray-500">{fmtDate(task.startDate)}</span> : <span className="text-[10px] text-gray-300">—</span>}
        </div>
        <div style={{ width: COL_DATE, flexShrink: 0 }} className="px-1.5">
          {!task.noDates ? <span className="text-[10px] text-gray-500">{fmtDate(task.endDate)}</span> : <span className="text-[10px] text-gray-300">—</span>}
        </div>
      </div>
    );
  }

  // ── 헤더 (월/일) 렌더링 ──────────────────────────────────────
  function renderTimeHeader() {
    return (
      <div style={{ width: totalW }}>
        {showQ ? (
          <>
            <div className="relative" style={{ height: 30, borderBottom: '1px solid #e5e7eb' }}>
              {quarters.map(q => {
                const qs = startOfQuarter(q) < viewStart ? viewStart : startOfQuarter(q);
                const qe = endOfQuarter(q)   > viewEnd   ? viewEnd   : endOfQuarter(q);
                return (
                  <div key={q.toISOString()} className="absolute flex items-center justify-center text-xs font-bold text-gray-600"
                    style={{ left: differenceInDays(qs, viewStart) * colW, width: (differenceInDays(qe, qs) + 1) * colW, height: 30, borderRight: '1px solid #e5e7eb' }}>
                    {format(q, 'yyyy-')}Q{Math.ceil((q.getMonth() + 1) / 3)}
                  </div>
                );
              })}
            </div>
            <div className="relative" style={{ height: 28, borderBottom: '1px solid #e5e7eb' }}>
              {months.map(m => {
                const ms = m < viewStart ? viewStart : startOfMonth(m);
                const me = endOfMonth(m) > viewEnd ? viewEnd : endOfMonth(m);
                const isCur = new Date() >= ms && new Date() <= endOfMonth(m);
                return (
                  <div key={m.toISOString()} className={`absolute flex items-center justify-center text-[11px] font-semibold ${isCur ? 'text-indigo-600' : 'text-gray-400'}`}
                    style={{ left: differenceInDays(ms, viewStart) * colW, width: (differenceInDays(me, ms) + 1) * colW, height: 28, borderRight: '1px solid #e5e7eb' }}>
                    {format(m, 'M월', { locale: ko })}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="relative" style={{ height: 30, borderBottom: '1px solid #e5e7eb' }}>
              {months.map(m => {
                const ms = m < viewStart ? viewStart : startOfMonth(m);
                const me = endOfMonth(m) > viewEnd ? viewEnd : endOfMonth(m);
                return (
                  <div key={m.toISOString()} className="absolute flex items-center px-2 text-xs font-bold text-gray-500"
                    style={{ left: differenceInDays(ms, viewStart) * colW, width: (differenceInDays(me, ms) + 1) * colW, height: 30, borderRight: '1px solid #e5e7eb' }}>
                    {format(m, 'yyyy.MM', { locale: ko })}
                  </div>
                );
              })}
            </div>
            {showDays && (
              <div className="flex" style={{ height: 28 }}>
                {Array.from({ length: totalDays }).map((_, i) => {
                  const d = addDays(viewStart, i);
                  return (
                    <div key={i} style={{ width: colW }}
                      className={`flex-shrink-0 flex items-center justify-center text-[10px] border-r
                        ${isToday(d) ? 'bg-indigo-100 text-indigo-700 font-bold border-indigo-200'
                          : isWeekend(d) ? 'text-gray-300 border-gray-100 bg-gray-50/80'
                          : 'text-gray-400 border-gray-100'}`}>
                      {format(d, dayFmt)}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  const resizeHandle = (extraClass = '') => (
    <div onMouseDown={onResizeDown}
      className={`flex-shrink-0 w-1.5 cursor-col-resize hover:bg-blue-400 transition-colors bg-transparent group relative z-10 ${extraClass}`}
      style={{ marginLeft: -3, marginRight: -3 }}>
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-gray-300 group-hover:bg-blue-400 transition-colors" />
    </div>
  );

  // ── 렌더 ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden select-none">

      {/* ── 헤더 ── */}
      <div className="flex border-b border-gray-200 bg-gray-50 flex-shrink-0">
        {/* 왼쪽 컬럼명 */}
        <div className="flex-shrink-0 border-r border-gray-200" style={{ width: leftW }}>
          <div className="flex items-center h-7 border-t border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            <div style={{ width: COL_KEY }} className="px-2">KEY</div>
            <div style={{ width: COL_TYPE }} className="px-1">TYPE</div>
            <div className="flex-1 px-2">SUMMARY</div>
            <div style={{ width: COL_ASSIGNEE }} className="px-1.5">담당자</div>
            <div style={{ width: COL_STATUS }} className="px-1">STATUS</div>
            <div style={{ width: COL_DATE }} className="px-1.5">START</div>
            <div style={{ width: COL_DATE }} className="px-1.5">END</div>
          </div>
        </div>
        {resizeHandle()}
        {/* 타임라인 헤더 */}
        <div className="overflow-hidden flex-1" ref={hdrRef}
          onScroll={e => syncH('h', (e.target as HTMLDivElement).scrollLeft)}>
          {renderTimeHeader()}
        </div>
      </div>

      {/* ── 바디 ── */}
      <div className="flex" style={{ maxHeight: 'calc(100vh - 290px)' }}>

        {/* 왼쪽 패널 */}
        <div ref={leftRef} className="flex-shrink-0 overflow-y-auto" style={{ width: leftW }}
          onScroll={e => syncV('l', (e.target as HTMLDivElement).scrollTop)}>
          {rows.map(row => renderLeft(row))}
        </div>

        {resizeHandle('border-r border-gray-200')}

        {/* 오른쪽 타임라인 */}
        <div ref={bodyRef} className="overflow-auto flex-1"
          onScroll={e => {
            syncH('b', (e.target as HTMLDivElement).scrollLeft);
            syncV('r', (e.target as HTMLDivElement).scrollTop);
          }}>
          <div style={{ width: totalW, height: totalH, position: 'relative' }}>

            {/* 오늘 세로선 */}
            {todayOff >= 0 && todayOff <= totalW && (
              <div className="absolute inset-y-0 pointer-events-none z-10"
                style={{ left: todayOff + colW / 2 - 1, width: 2, background: 'rgba(59,130,246,0.35)' }} />
            )}

            {/* 행 배경 */}
            {rows.map(row => {
              const h   = row.kind === 'init' ? INIT_H : row.kind === 'epic' ? EPIC_H : TASK_H;
              const top = row.top;
              const isInit = row.kind === 'init';
              return (
                <div key={`bg-${row.kind}-${row.kind === 'task' ? row.task.id : row.kind === 'epic' ? row.eg.epic.id : row.group.key}`}
                  className="absolute border-b"
                  style={{ top, left: 0, right: 0, height: h, borderColor: isInit ? '#ddd6fe' : '#f1f5f9', background: isInit ? '#f5f3ff' : 'transparent' }}>
                  {!isInit && Array.from({ length: totalDays }).map((_, i) =>
                    isWeekend(addDays(viewStart, i))
                      ? <div key={i} className="absolute inset-y-0 bg-gray-50/70" style={{ left: i * colW, width: colW }} />
                      : null
                  )}
                </div>
              );
            })}

            {/* 간트 바 */}
            {rows.map(row => {
              if (row.kind === 'init') {
                const range = initBarRange(row.group);
                if (!range) return null;
                const l = bLeft(range.s), w = bWidth(range.s, range.e);
                return (
                  <div key={`bar-init-${row.group.key}`} className="absolute rounded-full pointer-events-none"
                    style={{ left: l, top: row.top + (INIT_H - 7) / 2, width: w, height: 7, background: '#7c3aed', opacity: 0.5 }} />
                );
              }

              if (row.kind === 'epic') {
                const { epic } = row.eg;
                if (epic.noDates) {
                  return (
                    <div key={`bar-epic-${epic.id}`}
                      className="absolute z-10 rounded-sm bg-amber-400 flex items-center justify-center text-white text-[11px] cursor-pointer"
                      style={{ left: todayOff + colW / 2 - 11, top: row.top + (EPIC_H - 22) / 2, width: 22, height: 22 }}
                      onClick={() => onClickItem(epic)}>⚠</div>
                  );
                }
                const l = bLeft(epic.startDate), w = bWidth(epic.startDate, epic.endDate);
                return (
                  <div key={`bar-epic-${epic.id}`}
                    className="absolute rounded cursor-pointer overflow-hidden"
                    style={{ left: l, top: row.top + (EPIC_H - 14) / 2, width: w, height: 14, background: getBarColor(epic), opacity: 0.88 }}
                    onClick={() => onClickItem(epic)}>
                    <div className="absolute inset-0 flex items-center px-1.5">
                      <span className="text-[9px] font-medium truncate" style={{ color: (epic.status === 'done' || epic.status === 'hold') ? '#e2e8f0' : '#fff' }}>{epic.title}</span>
                    </div>
                  </div>
                );
              }

              // task
              const { task } = row;
              if (task.noDates) {
                return (
                  <div key={`bar-task-${task.id}`}
                    className="absolute z-10 rounded-sm bg-amber-400 flex items-center justify-center text-white text-[11px] cursor-pointer"
                    style={{ left: todayOff + colW / 2 - 11, top: row.top + (TASK_H - 22) / 2, width: 22, height: 22 }}
                    onClick={() => onClickItem(task)}>⚠</div>
                );
              }
              const l = bLeft(task.startDate), w = bWidth(task.startDate, task.endDate);
              return (
                <div key={`bar-task-${task.id}`}
                  className="absolute rounded cursor-pointer"
                  style={{ left: l, top: row.top + (TASK_H - 12) / 2, width: w, height: 12, background: getBarColor(task), opacity: 0.85 }}
                  onClick={() => onClickItem(task)} />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

export default InitiativeGanttView;
