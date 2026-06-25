import { useRef, useMemo, useState, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react';
import {
  addDays, differenceInDays, format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  eachMonthOfInterval, eachQuarterOfInterval, isToday, parseISO, isWeekend,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import type { GanttItem, Member } from '../types';

// ── 레이아웃 상수 ──────────────────────────────────────────────
const ROW_H = 36;
const MEMBER_ROW_H = 42;
const BAR_H = 22;
const RESIZE_HANDLE_W = 8;

const LEFT_W_DEFAULT = 390;
const LEFT_W_MIN     = 220;
const LEFT_W_MAX     = 640;
const COL_KEY_W    = 70;
const COL_TYPE_W   = 64;
const COL_STATUS_W = 78;

// ── 타입 칩 설정 ───────────────────────────────────────────────
const TYPE_CFG: Record<string, { bg: string; color: string; label: string }> = {
  Initiative: { bg: '#ede9fe', color: '#7c3aed', label: 'Initiative' },
  Epic:       { bg: '#fff7ed', color: '#c2410c', label: 'Epic' },
  Design:     { bg: '#e0e7ff', color: '#4338ca', label: 'Design' },
  Task:       { bg: '#f1f5f9', color: '#475569', label: 'Task' },
  Story:      { bg: '#d1fae5', color: '#065f46', label: 'Story' },
  Bug:        { bg: '#fee2e2', color: '#b91c1c', label: 'Bug' },
  'Sub-task': { bg: '#f8fafc', color: '#94a3b8', label: 'Sub' },
  planned:    { bg: '#f8fafc', color: '#94a3b8', label: '예정' },
};

// ── 상태 칩 설정 ───────────────────────────────────────────────
const STATUS_CFG: Record<GanttItem['status'], { bg: string; color: string; label: string }> = {
  todo:        { bg: '#f1f5f9', color: '#64748b', label: 'SUGGESTED' },
  in_progress: { bg: '#e0e7ff', color: '#4338ca', label: 'In Progress' },
  done:        { bg: '#dcfce7', color: '#166534', label: 'Done' },
  hold:        { bg: '#fef3c7', color: '#b45309', label: 'Hold' },
};

// ── 간트바 색상 ────────────────────────────────────────────────
const BAR_COLOR: Record<GanttItem['status'], string> = {
  todo:        '#94a3b8',
  in_progress: '#3b82f6',
  done:        '#22c55e',
  hold:        '#f59e0b',
};
const CAT_COLOR: Record<string, string> = {
  '휴가': '#f97316', '교육': '#a855f7', '기타': '#6b7280', 'QA': '#0d9488',
  '개발': '#2563eb', '디자인': '#db2777', '기획': '#0ea5e9',
};

// Initiative/Epic 별 바 색상
const ISSUE_BAR_COLOR: Record<string, string> = {
  Initiative: '#7c3aed',
  Epic: '#c2410c',
  Design: '#db2777',
  Story: '#059669',
  Bug: '#dc2626',
  'Sub-task': '#94a3b8',
};

function getBarColor(item: GanttItem): string {
  if (item.type === 'planned') return CAT_COLOR[item.category ?? ''] ?? '#94a3b8';
  if (item.issueType === 'Design') {
    if (item.status === 'in_progress') return '#6366f1';
    if (item.status === 'todo')        return '#a5b4fc';
  }
  if (item.issueType === 'Epic') {
    if (item.status === 'in_progress') return '#c2410c';
    if (item.status === 'todo')        return '#fdba74';
  }
  if (item.issueType && ISSUE_BAR_COLOR[item.issueType]) return ISSUE_BAR_COLOR[item.issueType];
  return BAR_COLOR[item.status] ?? '#94a3b8';
}

// ── 미니 컴포넌트 ──────────────────────────────────────────────
function TypeChip({ type }: { type?: string }) {
  const cfg = type ? TYPE_CFG[type] : undefined;
  const c = cfg ?? { bg: '#f1f5f9', color: '#64748b', label: type ?? '—' };
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap leading-none"
      style={{ background: c.bg, color: c.color }}>
      {c.label.length > 8 ? c.label.slice(0, 6) + '…' : c.label}
    </span>
  );
}

function StatusChip({ status }: { status: GanttItem['status'] }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.todo;
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap leading-none"
      style={{ background: c.bg, color: c.color }}>
      {c.label}
    </span>
  );
}

// ── 드래그 상태 ────────────────────────────────────────────────
interface DragState {
  itemId: string;
  mode: 'move' | 'resize-right' | 'resize-left';
  startX: number;
  origStart: string;
  origEnd: string;
}

// ── Props ──────────────────────────────────────────────────────
interface Props {
  items: GanttItem[];
  members: Member[];
  viewStart: Date;
  viewEnd: Date;
  colW?: number; // 열 너비 (zoom에 따라 다름)
  onClickItem: (item: GanttItem) => void;
  onUpdateDates: (id: string, startDate: string, endDate: string) => void;
}

export interface GanttChartHandle {
  scrollToToday: () => void;
  collapseAll: () => void;
  expandAll: () => void;
  isAllCollapsed: () => boolean;
}

function fmtDate(d: Date) { return format(d, 'yyyy-MM-dd'); }

// ── 메인 컴포넌트 ──────────────────────────────────────────────
const GanttChart = forwardRef<GanttChartHandle, Props>(function GanttChart(
  { items, members, viewStart, viewEnd, colW = 28, onClickItem, onUpdateDates },
  ref,
) {
  const bodyScrollRef   = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const leftPanelRef    = useRef<HTMLDivElement>(null);
  const [hoverId,   setHoverId]   = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragDelta, setDragDelta] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [leftW, setLeftW] = useState(LEFT_W_DEFAULT);
  const resizingRef = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    resizeStartX.current = e.clientX;
    resizeStartW.current = leftW;

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizeStartX.current;
      setLeftW(Math.min(LEFT_W_MAX, Math.max(LEFT_W_MIN, resizeStartW.current + delta)));
    };
    const onUp = () => {
      resizingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [leftW]);

  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function effHeight(memberId: string, h: number) {
    return collapsed.has(memberId) ? MEMBER_ROW_H : h;
  }

  const totalDays = differenceInDays(viewEnd, viewStart) + 1;
  const totalW    = totalDays * colW;
  const months    = useMemo(() => eachMonthOfInterval({ start: viewStart, end: viewEnd }), [viewStart, viewEnd]);
  const quarters  = useMemo(() => eachQuarterOfInterval({ start: viewStart, end: viewEnd }), [viewStart, viewEnd]);
  const todayOff  = differenceInDays(new Date(), viewStart) * colW;
  const activeMembers = members.filter(m => m.active);

  // zoom에 따라 헤더 표시 형식 결정
  const showQuarterHeader = colW <= 16;
  const showDayNums  = colW >= 28;
  const dayFmt       = colW >= 36 ? 'M/d' : 'd';

  // scrollToToday 노출
  useImperativeHandle(ref, () => ({
    scrollToToday: () => {
      if (bodyScrollRef.current) {
        const offset = Math.max(0, todayOff - 250);
        bodyScrollRef.current.scrollLeft = offset;
        if (headerScrollRef.current) headerScrollRef.current.scrollLeft = offset;
      }
    },
    collapseAll: () => setCollapsed(new Set(sections.map(s => s.member.id))),
    expandAll:   () => setCollapsed(new Set()),
    isAllCollapsed: () => sections.every(s => collapsed.has(s.member.id)),
  }));

  // viewStart 바뀔 때 (Today 클릭) 자동 스크롤
  useEffect(() => {
    const offset = Math.max(0, todayOff - 250);
    if (bodyScrollRef.current) bodyScrollRef.current.scrollLeft = offset;
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = offset;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewStart.toISOString()]);

  function barLeft(dateStr: string) {
    return differenceInDays(parseISO(dateStr), viewStart) * colW;
  }
  function barWidth(s: string, e: string) {
    return Math.max((differenceInDays(parseISO(e), parseISO(s)) + 1) * colW, colW);
  }

  function getDragged(item: GanttItem, delta: number) {
    const days = Math.round(delta / colW);
    const s = parseISO(item.startDate), e = parseISO(item.endDate);
    if (dragState?.mode === 'move')         return { startDate: fmtDate(addDays(s, days)), endDate: fmtDate(addDays(e, days)) };
    if (dragState?.mode === 'resize-right') { const ne = addDays(e, days); return { startDate: item.startDate, endDate: fmtDate(ne < s ? s : ne) }; }
    if (dragState?.mode === 'resize-left')  { const ns = addDays(s, days); return { startDate: fmtDate(ns > e ? e : ns), endDate: item.endDate }; }
    return { startDate: item.startDate, endDate: item.endDate };
  }

  const onMouseDown = useCallback((e: React.MouseEvent, item: GanttItem, mode: DragState['mode']) => {
    if (item.type !== 'planned') return;
    e.preventDefault(); e.stopPropagation();
    setDragState({ itemId: item.id, mode, startX: e.clientX, origStart: item.startDate, origEnd: item.endDate });
    setDragDelta(0);
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragState) setDragDelta(e.clientX - dragState.startX);
  }, [dragState]);

  const onMouseUp = useCallback(() => {
    if (!dragState) return;
    const item = items.find(i => i.id === dragState.itemId);
    if (item && dragDelta !== 0) {
      const { startDate, endDate } = getDragged(item, dragDelta);
      onUpdateDates(item.id, startDate, endDate);
    }
    setDragState(null); setDragDelta(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState, dragDelta, items, onUpdateDates]);

  function syncScroll(src: 'header' | 'body', left: number) {
    if (src === 'body'   && headerScrollRef.current) headerScrollRef.current.scrollLeft = left;
    if (src === 'header' && bodyScrollRef.current)  bodyScrollRef.current.scrollLeft  = left;
  }

  function syncVertical(src: 'left' | 'right', top: number) {
    if (src === 'left'  && bodyScrollRef.current)  bodyScrollRef.current.scrollTop  = top;
    if (src === 'right' && leftPanelRef.current)   leftPanelRef.current.scrollTop   = top;
  }

  // 멤버별 섹션 구성
  const sections = useMemo(() => {
    const result = activeMembers.map(member => {
      const memberItems = items.filter(i => i.memberId === member.id && i.issueType !== 'Initiative');
      return { member, memberItems, height: MEMBER_ROW_H + Math.max(memberItems.length, 1) * ROW_H };
    });
    const unassigned = items.filter(i => i.memberId === 'unassigned' || !i.memberId);
    if (unassigned.length > 0) {
      result.push({
        member: { id: 'unassigned', name: '미정', color: '#94a3b8', email: '', active: true },
        memberItems: unassigned,
        height: MEMBER_ROW_H + unassigned.length * ROW_H,
      });
    }
    return result;
  }, [items, activeMembers]);

  const totalH = sections.reduce((s, sec) => s + effHeight(sec.member.id, sec.height), 0);

  return (
    <div
      className="flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden select-none"
      style={{ cursor: dragState ? (dragState.mode === 'move' ? 'grabbing' : 'ew-resize') : 'default' }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}>

      {/* ── 헤더 ── */}
      <div className="flex border-b border-gray-200 bg-gray-50 flex-shrink-0">
        {/* 왼쪽: 컬럼명 */}
        <div className="flex-shrink-0 border-r border-gray-200 flex flex-col justify-end"
          style={{ width: leftW, minHeight: 58 }}>
          <div className="flex items-center border-t border-gray-100 h-7 bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            <div style={{ width: COL_KEY_W }} className="px-2">KEY</div>
            <div style={{ width: COL_TYPE_W }} className="px-1">TYPE</div>
            <div className="flex-1 px-2">SUMMARY</div>
            <div style={{ width: COL_STATUS_W }} className="px-1 text-right pr-3">STATUS</div>
          </div>
        </div>
        {/* 리사이즈 핸들 */}
        <div
          onMouseDown={onResizeMouseDown}
          className="flex-shrink-0 w-1.5 cursor-col-resize hover:bg-blue-400 transition-colors bg-transparent group relative z-10"
          style={{ marginLeft: -3, marginRight: -3 }}
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-gray-300 group-hover:bg-blue-400 transition-colors" />
        </div>
        {/* 오른쪽: 월/일 */}
        <div className="overflow-hidden flex-1" ref={headerScrollRef}
          onScroll={e => syncScroll('header', (e.target as HTMLDivElement).scrollLeft)}>
          <div style={{ width: totalW }}>
            {showQuarterHeader ? (
              <>
                {/* 분기 헤더 */}
                <div className="relative" style={{ height: 30, borderBottom: '1px solid #e5e7eb' }}>
                  {quarters.map(q => {
                    const qStart = startOfQuarter(q) < viewStart ? viewStart : startOfQuarter(q);
                    const qEnd   = endOfQuarter(q) > viewEnd ? viewEnd : endOfQuarter(q);
                    const left   = differenceInDays(qStart, viewStart) * colW;
                    const w      = (differenceInDays(qEnd, qStart) + 1) * colW;
                    return (
                      <div key={q.toISOString()}
                        className="absolute flex items-center justify-center text-xs font-bold text-gray-600"
                        style={{ left, width: w, height: 30, borderRight: '1px solid #e5e7eb' }}>
                        {format(q, 'yyyy-')}Q{Math.ceil((q.getMonth() + 1) / 3)}
                      </div>
                    );
                  })}
                </div>
                {/* 월 서브헤더 */}
                <div className="relative" style={{ height: 28, borderBottom: '1px solid #e5e7eb' }}>
                  {months.map(month => {
                    const mStart = month < viewStart ? viewStart : startOfMonth(month);
                    const mEnd   = endOfMonth(month) > viewEnd ? viewEnd : endOfMonth(month);
                    const left   = differenceInDays(mStart, viewStart) * colW;
                    const w      = (differenceInDays(mEnd, mStart) + 1) * colW;
                    const isCurrentMonth = isToday(mStart) || (new Date() >= mStart && new Date() <= endOfMonth(month));
                    return (
                      <div key={month.toISOString()}
                        className={`absolute flex items-center justify-center text-[11px] font-semibold ${isCurrentMonth ? 'text-indigo-600' : 'text-gray-400'}`}
                        style={{ left, width: w, height: 28, borderRight: '1px solid #e5e7eb' }}>
                        {format(month, 'M월', { locale: ko })}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                {/* 월 헤더 */}
                <div className="relative" style={{ height: 30, borderBottom: '1px solid #e5e7eb' }}>
                  {months.map(month => {
                    const mStart = month < viewStart ? viewStart : startOfMonth(month);
                    const mEnd   = endOfMonth(month) > viewEnd ? viewEnd : endOfMonth(month);
                    const left   = differenceInDays(mStart, viewStart) * colW;
                    const w      = (differenceInDays(mEnd, mStart) + 1) * colW;
                    return (
                      <div key={month.toISOString()}
                        className="absolute flex items-center px-2 text-xs font-bold text-gray-500"
                        style={{ left, width: w, height: 30, borderRight: '1px solid #e5e7eb' }}>
                        {format(month, 'yyyy.MM', { locale: ko })}
                      </div>
                    );
                  })}
                </div>
                {/* 일 헤더 */}
                {showDayNums && (
                  <div className="flex" style={{ height: 28 }}>
                    {Array.from({ length: totalDays }).map((_, i) => {
                      const d = addDays(viewStart, i);
                      return (
                        <div key={i}
                          className={`flex-shrink-0 flex items-center justify-center text-[10px] border-r
                            ${isToday(d) ? 'bg-indigo-100 text-indigo-700 font-bold border-indigo-200'
                              : isWeekend(d) ? 'text-gray-300 border-gray-100 bg-gray-50/80'
                              : 'text-gray-400 border-gray-100'}`}
                          style={{ width: colW }}>
                          {format(d, dayFmt)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 바디 ── */}
      <div className="flex" style={{ maxHeight: 'calc(100vh - 290px)' }}>

        {/* 왼쪽 고정 테이블 */}
        <div ref={leftPanelRef} className="flex-shrink-0 overflow-y-auto"
          style={{ width: leftW }}
          onScroll={e => syncVertical('left', (e.target as HTMLDivElement).scrollTop)}>

          {sections.map(({ member, memberItems, height }) => {
            const isCollapsed = collapsed.has(member.id);
            return (
            <div key={member.id} className="border-b border-gray-200" style={{ height: effHeight(member.id, height) }}>
              {/* 멤버 헤더 */}
              <div className="flex items-center gap-2 px-3 bg-gray-50/80 border-b border-gray-100 cursor-pointer select-none hover:bg-gray-100/80 transition-colors"
                style={{ height: MEMBER_ROW_H }}
                onClick={() => toggleCollapse(member.id)}>
                <span className="text-gray-400 text-[8px] transition-transform flex-shrink-0"
                  style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
                {member.avatar
                  ? <img src={member.avatar} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  : (
                    <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[11px] font-bold"
                      style={{ background: member.color }}>
                      {member.name[0]}
                    </div>
                  )}
                <span className="font-semibold text-gray-800 text-sm">{member.name}</span>
                <span className="text-[11px] text-gray-400 ml-auto bg-gray-100 px-2 py-0.5 rounded-full">
                  {memberItems.filter(i => !i.noDates).length}건
                </span>
                {memberItems.some(i => i.noDates) && (
                  <span className="text-[11px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full ml-1 border border-amber-200">
                    ⚠ {memberItems.filter(i => i.noDates).length}
                  </span>
                )}
              </div>

              {/* 아이템 행 */}
              {!isCollapsed && memberItems.map(item => {
                const typeKey = item.type === 'planned' ? 'planned' : (item.issueType ?? 'Task');
                return (
                  <div key={item.id}
                    className={`flex items-center border-b border-gray-50 cursor-pointer transition-colors group
                      ${item.noDates ? 'bg-amber-50/30 hover:bg-amber-50/60' : 'hover:bg-indigo-50/20'}`}
                    style={{ height: ROW_H }}
                    onClick={() => onClickItem(item)}>
                    {/* KEY */}
                    <div style={{ width: COL_KEY_W }} className="px-2 flex-shrink-0 overflow-hidden">
                      {item.jiraKey
                        ? <a href={item.jiraUrl} target="_blank" rel="noreferrer"
                            className="text-[10px] font-mono text-indigo-500 hover:text-indigo-700 hover:underline truncate block"
                            onClick={e => e.stopPropagation()}>
                            {item.jiraKey}
                          </a>
                        : <span className="text-[10px] text-cyan-500 font-semibold">✦ 예정</span>
                      }
                    </div>
                    {/* TYPE */}
                    <div style={{ width: COL_TYPE_W }} className="px-1 flex-shrink-0">
                      <TypeChip type={typeKey} />
                    </div>
                    {/* SUMMARY */}
                    <div className="flex-1 px-1.5 min-w-0">
                      <div className="flex items-center gap-1">
                        {item.noDates && <span className="text-amber-500 text-[10px] flex-shrink-0">⚠</span>}
                        <p className="text-[11px] text-gray-700 truncate leading-tight group-hover:text-gray-900">
                          {item.title}
                        </p>
                      </div>
                      {item.epicName && (
                        <p className="text-[10px] text-gray-400 truncate leading-none mt-0.5">{item.epicName}</p>
                      )}
                    </div>
                    {/* STATUS */}
                    <div style={{ width: COL_STATUS_W }} className="px-1 flex-shrink-0 flex justify-end pr-2">
                      {item.noDates
                        ? <span className="text-[10px] text-gray-400">일정 미기입</span>
                        : <StatusChip status={item.status} />
                      }
                    </div>
                  </div>
                );
              })}
              {!isCollapsed && memberItems.length === 0 && (
                <div style={{ height: ROW_H }} className="flex items-center px-4">
                  <span className="text-xs text-gray-300">업무 없음</span>
                </div>
              )}
            </div>
            );
          })}
        </div>

        {/* 리사이즈 핸들 (바디) */}
        <div
          onMouseDown={onResizeMouseDown}
          className="flex-shrink-0 w-1.5 cursor-col-resize hover:bg-blue-400 transition-colors bg-transparent group relative z-10 border-r border-gray-200"
          style={{ marginLeft: -3, marginRight: -3 }}
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-gray-300 group-hover:bg-blue-400 transition-colors" />
        </div>

        {/* 오른쪽 타임라인 */}
        <div ref={bodyScrollRef} className="overflow-auto flex-1"
          onScroll={e => {
            syncScroll('body', (e.target as HTMLDivElement).scrollLeft);
            syncVertical('right', (e.target as HTMLDivElement).scrollTop);
          }}>
          <div style={{ width: totalW, height: totalH, position: 'relative' }}>

            {/* 섹션 배경 */}
            {(() => {
              let top = 0;
              return sections.map(({ member, memberItems, height }) => {
                const isCol = collapsed.has(member.id);
                const eh = effHeight(member.id, height);
                const sTop = top; top += eh;
                const rowCnt = Math.max(memberItems.length, 1);
                return (
                  <div key={member.id} className="absolute border-b border-gray-200"
                    style={{ top: sTop, left: 0, right: 0, height: eh }}>
                    <div className="absolute inset-x-0 top-0 bg-gray-50/60"
                      style={{ height: MEMBER_ROW_H, borderBottom: '1px solid #e5e7eb' }} />
                    {!isCol && Array.from({ length: totalDays }).map((_, i) =>
                      isWeekend(addDays(viewStart, i))
                        ? <div key={i} className="absolute inset-y-0 bg-gray-50/80"
                            style={{ left: i * colW, width: colW }} />
                        : null
                    )}
                    {!isCol && Array.from({ length: rowCnt }).map((_, i) => (
                      <div key={i} className="absolute inset-x-0"
                        style={{ top: MEMBER_ROW_H + (i + 1) * ROW_H - 1, height: 1, background: '#e5e7eb', zIndex: 2 }} />
                    ))}
                  </div>
                );
              });
            })()}

            {/* 오늘 세로선 */}
            {todayOff >= 0 && todayOff <= totalW && (
              <div className="absolute inset-y-0 pointer-events-none z-10"
                style={{ left: todayOff + colW / 2 - 1, width: 2, background: 'rgba(59,130,246,0.35)' }} />
            )}

            {/* 간트 바 */}
            {(() => {
              let mTop = 0;
              return sections.flatMap(({ member, memberItems, height }) => {
                const isCol = collapsed.has(member.id);
                const eh = effHeight(member.id, height);
                const baseTop = mTop; mTop += eh;

                // 접힌 상태: Jira 바 + 예정건 바 분리 렌더링
                if (isCol) {
                  const vsStr = fmtDate(viewStart);
                  const veStr = fmtDate(viewEnd);
                  const top   = baseTop + (MEMBER_ROW_H - 8) / 2;
                  const bars: React.ReactNode[] = [];

                  // Jira 티켓 통합 바
                  const jiraDated = memberItems.filter(i => i.type !== 'planned' && i.startDate && i.endDate);
                  if (jiraDated.length > 0) {
                    const minS = jiraDated.reduce((m, i) => i.startDate! < m ? i.startDate! : m, jiraDated[0].startDate!);
                    const maxE = jiraDated.reduce((m, i) => i.endDate!   > m ? i.endDate!   : m, jiraDated[0].endDate!);
                    if (maxE >= vsStr && minS <= veStr) {
                      const cs = minS < vsStr ? vsStr : minS;
                      const ce = maxE > veStr ? veStr : maxE;
                      bars.push(
                        <div key={`collapsed-jira-${member.id}`}
                          className="absolute rounded-full pointer-events-none"
                          style={{ left: barLeft(cs), top, width: Math.max(barWidth(cs, ce), colW), height: 8, background: member.color, opacity: 0.5 }} />
                      );
                    }
                  }

                  // 예정건 통합 바 (회색)
                  const plannedDated = memberItems.filter(i => i.type === 'planned' && i.startDate && i.endDate);
                  if (plannedDated.length > 0) {
                    const minS = plannedDated.reduce((m, i) => i.startDate! < m ? i.startDate! : m, plannedDated[0].startDate!);
                    const maxE = plannedDated.reduce((m, i) => i.endDate!   > m ? i.endDate!   : m, plannedDated[0].endDate!);
                    if (maxE >= vsStr && minS <= veStr) {
                      const cs = minS < vsStr ? vsStr : minS;
                      const ce = maxE > veStr ? veStr : maxE;
                      bars.push(
                        <div key={`collapsed-planned-${member.id}`}
                          className="absolute rounded-full group cursor-default"
                          style={{ left: barLeft(cs), top, width: Math.max(barWidth(cs, ce), colW), height: 8, background: '#94a3b8', opacity: 0.6 }}>
                          <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1.5 bg-gray-800 text-white text-[11px] font-medium rounded px-2 py-1 whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                            예정 업무
                          </div>
                        </div>
                      );
                    }
                  }

                  return bars;
                }

                return memberItems.map((item, idx) => {
                  const rowTop = baseTop + MEMBER_ROW_H + idx * ROW_H;

                  // ── 날짜 미기입 아이템: ⚠ 배지만 표시 ──
                  if (item.noDates) {
                    const badgeX = todayOff + colW / 2;
                    const badgeY = rowTop + (ROW_H - 22) / 2;
                    return (
                      <div key={item.id}
                        className="absolute z-10 cursor-pointer group"
                        style={{ left: badgeX - 11, top: badgeY, width: 22, height: 22 }}
                        onClick={() => onClickItem(item)}
                        onMouseEnter={() => setHoverId(item.id)}
                        onMouseLeave={() => setHoverId(null)}>
                        <div className="w-full h-full rounded-sm bg-amber-400 flex items-center justify-center text-white text-[11px] font-bold shadow-sm hover:bg-amber-500 transition-colors">
                          ⚠
                        </div>
                        {hoverId === item.id && (
                          <div className="absolute z-50 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl pointer-events-none whitespace-nowrap"
                            style={{ top: '110%', left: '50%', transform: 'translateX(-50%)', minWidth: 200 }}>
                            <p className="font-semibold mb-1 text-amber-300">⚠ 일정 미기입</p>
                            <p className="leading-snug">{item.title}</p>
                            {item.jiraKey && <p className="text-gray-300 text-[11px] mt-1">🔗 {item.jiraKey}</p>}
                            {item.epicName && <p className="text-gray-400 text-[10px]">📁 {item.epicName}</p>}
                            <p className="text-gray-400 text-[10px] mt-1">Jira에서 시작/마감일을 입력해주세요</p>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // ── 일반 간트 바 ──
                  const dragging = dragState?.itemId === item.id;
                  const di   = dragging ? { ...item, ...getDragged(item, dragDelta) } : item;
                  const vsStr = fmtDate(viewStart);
                  const veStr = fmtDate(viewEnd);
                  if (!di.startDate || !di.endDate) return null;
                  if (di.endDate < vsStr || di.startDate > veStr) return null;
                  const clippedStart = di.startDate < vsStr ? vsStr : di.startDate;
                  const clippedEnd   = di.endDate   > veStr ? veStr : di.endDate;
                  const left = barLeft(clippedStart);
                  const width = Math.max(barWidth(clippedStart, clippedEnd), colW);
                  const top  = rowTop + (ROW_H - BAR_H) / 2;
                  const isP  = item.type === 'planned';
                  const color = getBarColor(item);

                  return (
                    <div key={item.id}
                      className={`absolute rounded flex items-center text-white text-[10px] font-medium overflow-hidden
                        transition-shadow ${dragging ? 'opacity-75 shadow-xl z-20' : 'z-5 hover:shadow-md'}
                        ${isP ? 'cursor-grab' : 'cursor-pointer'}`}
                      style={{
                        left, top, width, height: BAR_H,
                        background: color,
                        opacity: item.status === 'done' ? 0.55 : 1,
                        border: isP ? `1.5px dashed ${color}` : 'none',
                        boxSizing: 'border-box',
                      }}
                      onMouseEnter={() => !dragState && setHoverId(item.id)}
                      onMouseLeave={() => setHoverId(null)}
                      onClick={() => !dragState && Math.abs(dragDelta) < 5 && onClickItem(item)}>

                      {isP && (
                        <div className="absolute left-0 inset-y-0 cursor-ew-resize hover:bg-black/10 flex items-center justify-center"
                          style={{ width: RESIZE_HANDLE_W, zIndex: 2 }}
                          onMouseDown={e => onMouseDown(e, item, 'resize-left')}>
                          <div className="w-px h-3 bg-white/40 rounded" />
                        </div>
                      )}

                      <div className="flex-1 flex items-center overflow-hidden min-w-0"
                        style={{ paddingLeft: isP ? RESIZE_HANDLE_W + 4 : 6 }}
                        onMouseDown={isP ? e => onMouseDown(e, item, 'move') : undefined}>
                        {isP && <span className="text-white/70 mr-0.5 flex-shrink-0 text-[9px]">✦</span>}
                        <span className="truncate leading-none">
                          {width >= 56
                            ? (item.jiraKey || item.title.slice(0, 14))
                            : (item.jiraKey?.replace(/^[A-Z]+-/, '') ?? '')}
                        </span>
                      </div>

                      {isP && (
                        <div className="absolute right-0 inset-y-0 cursor-ew-resize hover:bg-black/10 flex items-center justify-center"
                          style={{ width: RESIZE_HANDLE_W, zIndex: 2 }}
                          onMouseDown={e => onMouseDown(e, item, 'resize-right')}>
                          <div className="w-px h-3 bg-white/40 rounded" />
                        </div>
                      )}

                      {dragging && (
                        <div className="absolute -top-6 left-0 bg-gray-900 text-white text-[10px] rounded px-2 py-0.5 whitespace-nowrap z-30 pointer-events-none">
                          {di.startDate} ~ {di.endDate}
                        </div>
                      )}

                      {hoverId === item.id && !dragging && (
                        <div className="absolute z-50 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl pointer-events-none"
                          style={{ top: '110%', left: 0, minWidth: 220, maxWidth: 300 }}>
                          <p className="font-semibold mb-1 leading-snug">{item.title}</p>
                          {item.jiraKey && <p className="text-gray-300 text-[11px] mb-0.5">🔗 {item.jiraKey}</p>}
                          {item.epicName && <p className="text-gray-400 text-[10px] mb-0.5">📁 {item.epicName}</p>}
                          <p className="text-gray-300 text-[11px]">{item.startDate} ~ {item.endDate}</p>
                          {item.note && <p className="text-gray-400 text-[10px] mt-1 border-t border-gray-700 pt-1">{item.note}</p>}
                        </div>
                      )}
                    </div>
                  );
                });
              });
            })()}
          </div>
        </div>
      </div>
    </div>
  );
});

export default GanttChart;
