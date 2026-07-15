import { useMemo, useState, useRef, useEffect } from 'react';
import { parseISO, addDays, getMonth, getYear, differenceInDays, format, isAfter, isBefore } from 'date-fns';
import { ExternalLink, AlertTriangle, RefreshCw, ChevronDown, Check } from 'lucide-react';
import type { GanttItem, Member, JiraSettings } from '../types';

// 브리핑에서 항상 제외 — 이니셔티브/에픽 단위 진행률은 MD 그래프가 이미 다룬다
const BRIEFING_EXCLUDED_TYPES = new Set(['Epic', 'Initiative']);
const BRIEFING_DUE_HORIZON_DAYS = 2;

interface BriefingRow {
  item: GanttItem;
  daysLeft: number;
  hasBotLabel: boolean;
}

function daysUntil(dateStr: string, todayStr: string): number {
  return differenceInDays(parseISO(dateStr), parseISO(todayStr));
}

function formatDueTag(daysLeft: number): string {
  if (daysLeft < 0) return `${-daysLeft}일 초과`;
  if (daysLeft === 0) return '오늘 마감';
  return `D-${daysLeft}`;
}

// 오늘의 요약 — 매번 최신 데이터에서 직접 계산 (외부 저장소 의존 없음)
function buildBriefingSummary(rows: BriefingRow[], members: Member[]): string[] {
  if (rows.length === 0) return [];
  const notes: string[] = [];
  const memberName = (id: string) => members.find(m => m.id === id)?.name ?? '';

  // 1) 특정 담당자에게 몰려 있는지
  const countByMember = new Map<string, number>();
  rows.forEach(({ item }) => countByMember.set(item.memberId, (countByMember.get(item.memberId) ?? 0) + 1));
  const [topMemberId, topCount] = [...countByMember.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topCount >= 2 && topCount >= Math.ceil(rows.length / 2)) {
    notes.push(`${memberName(topMemberId)}님 쪽에 브리핑 대상 티켓이 좀 쌓였어요 (${topCount}건). 캐파를 넘어선 건지 한번 봐주시면 좋을 것 같아요.`);
  }

  // 2) 라벨 없이 가장 오래 초과된 건 — 봇이 놓쳤을 가능성
  const noLabelOverdue = rows
    .filter(r => !r.hasBotLabel && r.daysLeft < 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)[0];
  if (noLabelOverdue) {
    notes.push(`${memberName(noLabelOverdue.item.memberId)}님의 ${noLabelOverdue.item.jiraKey}는 벌써 ${-noLabelOverdue.daysLeft}일째 마감이 지났는데 마감 초과 라벨은 안 붙어 있어요. 지금도 진행 중인 게 맞는지 확인이 필요해 보여요.`);
  }

  // 3) 봇 라벨 비율
  const botCount = rows.filter(r => r.hasBotLabel).length;
  if (botCount > 0 && botCount < rows.length) {
    notes.push(`오늘 올라온 ${rows.length}건 중 봇이 실제로 마감 초과 라벨을 붙인 건 ${botCount}건뿐이에요. 라벨만 보면 이 ${botCount}건이 제일 급합니다.`);
  }

  return notes;
}

const STATUS_OPTIONS: { value: GanttItem['status']; label: string }[] = [
  { value: 'todo',        label: 'SUGGESTED' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done',        label: 'Done' },
  { value: 'hold',        label: 'Hold' },
];

function StatusFilter({ selected, onChange }: { selected: GanttItem['status'][]; onChange: (v: GanttItem['status'][]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  function toggle(v: GanttItem['status']) {
    onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border transition-colors whitespace-nowrap
          ${selected.length > 0 ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
        style={{ borderRadius: 4, height: 28 }}>
        상태
        {selected.length > 0 && (
          <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] flex items-center justify-center font-bold">{selected.length}</span>
        )}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1.5 left-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[160px] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/80">
            <button onClick={() => onChange([])} className="text-xs text-gray-500 hover:text-gray-800">초기화</button>
            <button onClick={() => onChange(STATUS_OPTIONS.map(o => o.value))} className="text-xs text-indigo-500 hover:text-indigo-800 font-semibold">전체 선택</button>
          </div>
          <div className="py-1">
            {STATUS_OPTIONS.map(opt => {
              const checked = selected.includes(opt.value);
              return (
                <button key={opt.value} onClick={() => toggle(opt.value)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-left transition-colors">
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-indigo-500 border-indigo-400' : 'border-gray-300'}`}>
                    {checked && <Check size={9} className="text-white" strokeWidth={3} />}
                  </div>
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  items: GanttItem[];
  members: Member[];
  jiraSettings: JiraSettings;
  onSync: () => void;
  syncLoading: boolean;
  onReorderMembers: (members: Member[]) => void;
}

function workingDays(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0;
  const start = parseISO(startStr);
  const end   = parseISO(endStr);
  const total = differenceInDays(end, start) + 1;
  if (total <= 0) return 0;
  let count = 0;
  for (let i = 0; i < total; i++) {
    const dow = addDays(start, i).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function getQuarterLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  return `${getYear(d)}-Q${Math.floor(getMonth(d) / 3) + 1}`;
}

function getCurrentYearQuarters(): string[] {
  const y = new Date().getFullYear();
  return [`${y}-Q1`, `${y}-Q2`, `${y}-Q3`, `${y}-Q4`];
}

function quarterTotalWorkingDays(quarterLabel: string): number {
  const [yearStr, qStr] = quarterLabel.split('-');
  const year = parseInt(yearStr);
  const qNum = parseInt(qStr[1]);
  const startMonth = (qNum - 1) * 3;
  const start = new Date(year, startMonth, 1);
  const end   = new Date(year, startMonth + 3, 0);
  return workingDays(format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd'));
}

function quarterRange(label: string): { start: Date; end: Date } {
  const [yearStr, qStr] = label.split('-');
  const year = parseInt(yearStr);
  const qNum = parseInt(qStr[1]);
  const startMonth = (qNum - 1) * 3;
  return {
    start: new Date(year, startMonth, 1),
    end:   new Date(year, startMonth + 3, 0),
  };
}

function calcQuarterMD(mItems: GanttItem[]): Record<string, number> {
  const result: Record<string, number> = {};
  const quarters = getCurrentYearQuarters();
  for (const item of mItems) {
    if (item.noDates) continue;
    if (item.issueType === 'Epic') continue;
    const itemStart = parseISO(item.startDate);
    const itemEnd   = parseISO(item.endDate);
    for (const q of quarters) {
      const { start: qStart, end: qEnd } = quarterRange(q);
      const clippedStart = itemStart > qStart ? itemStart : qStart;
      const clippedEnd   = itemEnd   < qEnd   ? itemEnd   : qEnd;
      if (clippedStart > clippedEnd) continue;
      const md = workingDays(format(clippedStart, 'yyyy-MM-dd'), format(clippedEnd, 'yyyy-MM-dd'));
      if (md > 0) result[q] = (result[q] ?? 0) + md;
    }
  }
  return result;
}

function itemOverlapsQuarter(item: GanttItem, q: string): boolean {
  if (item.noDates) return true;
  const { start: qStart, end: qEnd } = quarterRange(q);
  const s = parseISO(item.startDate);
  const e = parseISO(item.endDate);
  return !isAfter(s, qEnd) && !isBefore(e, qStart);
}

const STATUS_COLOR: Record<GanttItem['status'], string> = {
  todo: '#94a3b8', in_progress: '#6366f1', done: '#22c55e', hold: '#94a3b8',
};
const STATUS_LABEL: Record<GanttItem['status'], string> = {
  todo: 'SUGGESTED', in_progress: 'In Progress', done: 'Done', hold: 'Hold',
};

const Q_LABEL = ['Q1', 'Q2', 'Q3', 'Q4'];

type ListFilterKey = 'overdue' | 'nodate' | 'planned';

export default function Dashboard({ items, members, jiraSettings, onSync, syncLoading, onReorderMembers }: Props) {
  const activeMembers = members.filter(m => m.active);
  const dragMember = useRef<string | null>(null);
  const quarters = getCurrentYearQuarters();
  const today = format(new Date(), 'yyyy-MM-dd');

  // 일일 브리핑 — 최우선(마감 임박·초과 / DUE_OVERDUE_BOT) 목록, 디자인·작업 티켓만
  const briefingItems = useMemo(() => {
    return items
      .filter(i =>
        i.type === 'jira' &&
        !i.noDates &&
        i.status !== 'done' &&
        !BRIEFING_EXCLUDED_TYPES.has(i.issueType ?? ''))
      .map(i => ({
        item: i,
        daysLeft: daysUntil(i.endDate, today),
        hasBotLabel: (i.labels ?? []).includes('DUE_OVERDUE_BOT'),
      }))
      .filter(({ daysLeft, hasBotLabel }) => hasBotLabel || daysLeft <= BRIEFING_DUE_HORIZON_DAYS)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [items, today]);

  const briefingTop3 = useMemo(() => {
    const sorted = [...briefingItems].sort((a, b) => {
      if (a.hasBotLabel !== b.hasBotLabel) return a.hasBotLabel ? -1 : 1;
      return a.daysLeft - b.daysLeft;
    });
    return sorted.slice(0, 3);
  }, [briefingItems]);

  const briefingNotes = useMemo(() => buildBriefingSummary(briefingItems, members), [briefingItems, members]);

  const currentQuarter = getQuarterLabel(today);
  const defaultQ = quarters.includes(currentQuarter) ? currentQuarter : quarters[0];
  const [selectedQ, setSelectedQ] = useState<string>(defaultQ);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [listFilters, setListFilters] = useState<ListFilterKey[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<GanttItem['status'][]>(['todo', 'in_progress']);

  // 일정 초과: 미완료인데 endDate가 오늘 이전
  const overdueItems = useMemo(() =>
    items.filter(i => i.type === 'jira' && !i.noDates && i.status !== 'done' && i.endDate < today),
    [items, today]
  );
  const noDatesItems = useMemo(() =>
    items.filter(i => i.noDates && i.status !== 'done'),
    [items]
  );
  const plannedItems = useMemo(() =>
    items.filter(i => i.type === 'planned'),
    [items]
  );

  // 상태 집계 (선택 분기 반영)
  const totalSummary = useMemo(() => {
    const allJi = items.filter(i => i.type === 'jira' && !i.noDates);
    const ji = selectedQ === 'all' ? allJi : allJi.filter(i => itemOverlapsQuarter(i, selectedQ));
    const done = ji.filter(i => i.status === 'done').length;
    return {
      total:  items.filter(i => i.type === 'jira').length,
      todo:   ji.filter(i => i.status === 'todo').length,
      inProg: ji.filter(i => i.status === 'in_progress').length,
      done,
      hold:   ji.filter(i => i.status === 'hold').length,
    };
  }, [items, selectedQ]);

  // MD 집계 (멤버별 합산)
  const totalQMD = useMemo(() =>
    activeMembers.reduce((acc, m) => {
      const mItems = items.filter(i => i.type === 'jira' && !i.noDates && i.memberId === m.id);
      const mQMD = calcQuarterMD(mItems);
      Object.entries(mQMD).forEach(([q, v]) => { acc[q] = (acc[q] ?? 0) + v; });
      return acc;
    }, {} as Record<string, number>),
    [items, activeMembers]
  );

  // 선택 분기에 따른 MD 계산
  const { usedMD, totalMD } = useMemo(() => {
    if (selectedQ === 'all') {
      const used = Object.values(totalQMD).reduce((s, v) => s + v, 0);
      const total = quarters.reduce((s, q) => s + quarterTotalWorkingDays(q) * activeMembers.length, 0);
      return { usedMD: used, totalMD: total };
    }
    const used = totalQMD[selectedQ] ?? 0;
    const total = quarterTotalWorkingDays(selectedQ) * activeMembers.length;
    return { usedMD: used, totalMD: total };
  }, [selectedQ, totalQMD, quarters, activeMembers]);

  const pct = totalMD > 0 ? Math.min(Math.round((usedMD / totalMD) * 100), 100) : 0;
  const remainMD = Math.max(totalMD - usedMD, 0);

  // 태스크 리스트에 표시할 아이템
  const listItems = useMemo(() => {
    if (listFilters.length > 0) {
      const result: GanttItem[] = [];
      const seen = new Set<string>();
      if (listFilters.includes('overdue')) overdueItems.forEach(i => { if (!seen.has(i.id)) { seen.add(i.id); result.push(i); } });
      if (listFilters.includes('nodate'))  noDatesItems.forEach(i => { if (!seen.has(i.id)) { seen.add(i.id); result.push(i); } });
      if (listFilters.includes('planned')) plannedItems.forEach(i => { if (!seen.has(i.id)) { seen.add(i.id); result.push(i); } });
      return result;
    }

    let base = selectedMemberId
      ? items.filter(i => i.memberId === selectedMemberId)
      : items;

    if (selectedQ !== 'all') {
      base = base.filter(i => itemOverlapsQuarter(i, selectedQ));
    }
    // DONE 미노출, 일정 미기입+완료도 미노출
    base = base.filter(i => i.status !== 'done');
    return base;
  }, [listFilters, overdueItems, noDatesItems, plannedItems, selectedMemberId, items, selectedQ, filterStatuses]);

  const selectedMember = activeMembers.find(m => m.id === selectedMemberId) ?? null;

  function toggleBadge(f: ListFilterKey) {
    setListFilters(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
    setSelectedMemberId(null);
  }
  function handleMemberClick(id: string) {
    setListFilters([]);
    setSelectedMemberId(prev => prev === id ? null : id);
  }

  return (
    <div className="space-y-5">

      {/* ── 일일 브리핑 ── */}
      <div data-testid="daily-briefing" className="bg-white border border-gray-200 p-5" style={{ borderRadius: 8 }}>
        <div className="flex items-baseline gap-2 mb-4">
          <p className="text-base font-semibold text-gray-800">일일 브리핑</p>
          {jiraSettings.lastSynced && (
            <span className="text-[11px] text-gray-400">
              {new Date(jiraSettings.lastSynced).toLocaleString('ko-KR', {
                month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })} 기준
            </span>
          )}
        </div>

        {briefingNotes.length > 0 && (
          <div className="flex flex-col gap-2 mb-5">
            {briefingNotes.map((note, idx) => (
              <p key={idx} className="text-[13px] text-gray-700 leading-relaxed" style={{ maxWidth: '62ch' }}>
                {note}
              </p>
            ))}
          </div>
        )}

        {briefingItems.length === 0 ? (
          <p className="text-sm text-gray-400">지금은 마감이 급한 티켓이 없어요.</p>
        ) : (
          <>
            {/* TOP 3 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-5">
              {briefingTop3.map(({ item, daysLeft, hasBotLabel }) => (
                <a key={item.id} href={item.jiraUrl} target="_blank" rel="noreferrer"
                  className="block border border-gray-200 hover:bg-gray-50 transition-colors"
                  style={{ borderRadius: '0 6px 6px 0', borderLeft: '3px solid #f87171', padding: '10px 12px' }}>
                  <p className="text-[11px] font-mono font-semibold text-red-500 flex items-center gap-1">
                    {item.jiraKey} · {members.find(m => m.id === item.memberId)?.name ?? ''}
                    <ExternalLink size={9} />
                  </p>
                  <p className="text-[12.5px] font-semibold text-gray-800 mt-0.5 truncate">{item.title}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {hasBotLabel ? 'DUE_OVERDUE_BOT · ' : ''}{formatDueTag(daysLeft)}
                  </p>
                </a>
              ))}
            </div>

            {/* 최우선 목록 */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[13px] font-semibold text-gray-700">최우선 — 마감 임박·초과</span>
              <span className="text-[11px] text-gray-400 font-mono">{briefingItems.length}건</span>
            </div>
            <div className="border border-gray-200 overflow-y-auto" style={{ borderRadius: 6, maxHeight: 230 }}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="text-[10px] text-gray-400 uppercase border-b border-gray-100">
                    <th className="px-3 py-2 text-left font-semibold" style={{ width: 90 }}>KEY</th>
                    <th className="px-3 py-2 text-left font-semibold" style={{ width: 70 }}>담당자</th>
                    <th className="px-3 py-2 text-left font-semibold">SUMMARY</th>
                    <th className="px-3 py-2 text-left font-semibold" style={{ width: 90 }}>STATUS</th>
                    <th className="px-3 py-2 text-left font-semibold" style={{ width: 120 }}>DUE</th>
                  </tr>
                </thead>
                <tbody>
                  {briefingItems.map(({ item, daysLeft, hasBotLabel }) => (
                    <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => window.open(item.jiraUrl, '_blank', 'noopener')}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="flex items-center gap-1 text-blue-500 font-mono">
                          <ExternalLink size={10} />{item.jiraKey}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                        {members.find(m => m.id === item.memberId)?.name ?? ''}
                      </td>
                      <td className="px-3 py-2 text-gray-800 truncate max-w-xs">{item.title}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: STATUS_COLOR[item.status] }}>
                        {STATUS_LABEL[item.status]}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {hasBotLabel
                          ? <span className="text-[10.5px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5" style={{ borderRadius: 4 }}>DUE_OVERDUE_BOT</span>
                          : <span className="text-gray-500">{formatDueTag(daysLeft)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── 요약 카드 ── */}
      <div>
        <p className="text-xl text-gray-800 mb-3">팀 리소스 요약</p>
      <div className="bg-white border border-gray-200 p-5" style={{ borderRadius: 8 }}>

        {/* 분기 탭 + MD 그래프 */}
        <div className="mb-5">
          <div className="flex gap-1 mb-6">
            <button onClick={() => setSelectedQ('all')}
              className={`px-6 py-2 text-sm transition-colors
                ${selectedQ === 'all' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              style={{ borderRadius: 4 }}>
              전체
            </button>
            {quarters.map((q, i) => (
              <button key={q} onClick={() => setSelectedQ(q)}
                className={`px-6 py-2 text-sm transition-colors
                  ${selectedQ === q ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                style={{ borderRadius: 4 }}>
                {Q_LABEL[i]}
              </button>
            ))}
          </div>

          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-base font-normal text-indigo-500">{usedMD}md 사용</span>
            <span className="text-base font-normal text-gray-400">{remainMD}md 잔여</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
            <div className="h-full rounded-full bg-indigo-500 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-sm text-gray-400">
            <span>0</span>
            <span className="text-indigo-400">{pct}%</span>
            <span>{totalMD}md</span>
          </div>
        </div>

        {/* 상태 박스 */}
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">
            Total Tasks {totalSummary.todo + totalSummary.inProg + totalSummary.done + totalSummary.hold}
          </p>
          <div className="flex gap-2">
          {[
            { label: 'SUGGESTED',   val: totalSummary.todo,   color: '#1e293b' },
            { label: 'IN PROGRESS', val: totalSummary.inProg, color: '#6366f1' },
            { label: 'DONE',        val: totalSummary.done,   color: '#22c55e' },
            ...(totalSummary.hold > 0 ? [{ label: 'HOLD', val: totalSummary.hold, color: '#f59e0b' }] : []),
          ].map(s => (
            <div key={s.label} className="flex-1 bg-gray-100" style={{ borderRadius: 4, padding: '12px 16px' }}>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{s.label}</p>
              <p className="text-2xl font-normal" style={{ color: s.color }}>{s.val}</p>
            </div>
          ))}
          </div>
        </div>
      </div>
      </div>

      {/* ── 멤버 카드 그리드 ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 -mt-4">
        {activeMembers.map(member => {
          const allJi = items.filter(i => i.memberId === member.id && i.type === 'jira' && !i.noDates);
          const noDates = items.filter(i => i.memberId === member.id && i.noDates);

          const ji = selectedQ === 'all'
            ? allJi
            : allJi.filter(i => itemOverlapsQuarter(i, selectedQ));

          const done     = ji.filter(i => i.status === 'done').length;
          const doneRate = ji.length > 0 ? Math.round((done / ji.length) * 100) : 0;
          const qMD      = calcQuarterMD(allJi);
          const displayMD = selectedQ === 'all'
            ? Object.values(qMD).reduce((s, v) => s + v, 0)
            : (qMD[selectedQ] ?? 0);
          const qAvail = selectedQ === 'all'
            ? quarters.reduce((s, q) => s + quarterTotalWorkingDays(q), 0)
            : quarterTotalWorkingDays(selectedQ);
          const mdPct = qAvail > 0 ? Math.min(Math.round((displayMD / qAvail) * 100), 100) : 0;
          const isActive = selectedMemberId === member.id;

          return (
            <div key={member.id}
              draggable
              onDragStart={() => { dragMember.current = member.id; }}
              onDragOver={e => e.preventDefault()}
              onDrop={() => {
                if (!dragMember.current || dragMember.current === member.id) return;
                const from = members.findIndex(m => m.id === dragMember.current);
                const to   = members.findIndex(m => m.id === member.id);
                if (from === -1 || to === -1) return;
                const next = [...members];
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                onReorderMembers(next);
                dragMember.current = null;
              }}
              onDragEnd={() => { dragMember.current = null; }}
              className={`relative text-left bg-white border transition-all cursor-grab active:cursor-grabbing
                ${isActive ? 'border-indigo-400 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'}`}
              style={{ borderRadius: 8, padding: 16 }}
              onClick={() => handleMemberClick(member.id)}>

              {/* 드래그 핸들 */}
              <div className="absolute top-2 right-2 text-gray-300 text-[11px] leading-none select-none">⠿</div>

              {/* 헤더: 아바타 + 이름 + done율 */}
              <div className="flex items-center gap-2.5 mb-5">
                {member.avatar
                  ? <img src={member.avatar} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                      style={{ background: member.color }}>{member.name[0]}</div>}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{member.name}</p>
                  <p className="text-[11px] text-gray-400">
                    {ji.length} tasks
                    {noDates.length > 0 && <span className="text-amber-500 ml-1">⚠{noDates.length}</span>}
                  </p>
                </div>
                <div className="ml-auto text-right flex-shrink-0">
                  <p className="text-lg text-gray-700 leading-none">{mdPct}%</p>
                </div>
              </div>

              {/* MD 그래프 */}
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-sm text-indigo-400 font-normal">{displayMD}md 사용</span>
                <span className="text-sm text-gray-400">{Math.max(qAvail - displayMD, 0)}md 잔여</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
                <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${mdPct}%` }} />
              </div>

              {/* 분기별 MD */}
              <div className="flex gap-1.5 mb-3 mt-2">
                {Q_LABEL.map((key, i) => {
                  const q = quarters[i];
                  const md = qMD[q] ?? 0;
                  const avail = Math.round(quarterTotalWorkingDays(q));
                  return (
                    <div key={key} className={`flex-1 bg-gray-100 transition-colors ${selectedQ === q ? 'ring-1 ring-indigo-300' : ''}`}
                      style={{ borderRadius: 4, padding: '8px 10px' }}>
                      <p className="text-[9px] text-gray-400 uppercase tracking-wide leading-none mb-1">{key}</p>
                      <p className="text-sm font-normal text-gray-700 leading-none">
                        {md}<span className="text-gray-400 text-sm">/{avail}</span>
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* 상태 요약 */}
              <div className="mt-4">
              <p className="text-[9px] text-gray-400 uppercase tracking-wide leading-none mb-2">Tasks</p>
              <div className="flex gap-1.5">
                {[
                  { label: 'SUGGESTED', val: ji.filter(i => i.status === 'todo').length,      color: '#1e293b' },
                  { label: 'IN PROGRESS', val: ji.filter(i => i.status === 'in_progress').length, color: '#6366f1' },
                  { label: 'DONE',    val: done,                                              color: '#22c55e' },
                ].map(s => (
                  <div key={s.label} className="flex-1 bg-gray-100" style={{ borderRadius: 4, padding: '10px 12px' }}>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wide leading-none mb-1">{s.label}</p>
                    <p className="text-xl font-normal" style={{ color: s.color }}>{s.val}</p>
                  </div>
                ))}
              </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 필터 배지 ── */}
      {(overdueItems.length > 0 || noDatesItems.length > 0 || plannedItems.length > 0) && (
        <div className="flex items-center gap-2 -mt-2">
          {overdueItems.length > 0 && (
            <button onClick={() => toggleBadge('overdue')}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 transition-all
                ${listFilters.includes('overdue')
                  ? 'bg-red-500 text-white border border-red-500 shadow-sm'
                  : 'bg-white text-red-500 border border-red-200 hover:border-red-400 hover:bg-red-50'}`}
              style={{ borderRadius: 6, height: 28 }}>
              <AlertTriangle size={10} />
              일정 초과 {overdueItems.length}건
              {listFilters.includes('overdue') && <span className="ml-0.5 opacity-80">✕</span>}
            </button>
          )}
          {noDatesItems.length > 0 && (
            <button onClick={() => toggleBadge('nodate')}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 transition-all
                ${listFilters.includes('nodate')
                  ? 'bg-amber-400 text-white border border-amber-400 shadow-sm'
                  : 'bg-white text-amber-500 border border-amber-200 hover:border-amber-400 hover:bg-amber-50'}`}
              style={{ borderRadius: 6, height: 28 }}>
              <AlertTriangle size={10} />
              일정 미기입 {noDatesItems.length}건
              {listFilters.includes('nodate') && <span className="ml-0.5 opacity-80">✕</span>}
            </button>
          )}
          {plannedItems.length > 0 && (
            <button onClick={() => toggleBadge('planned')}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 transition-all
                ${listFilters.includes('planned')
                  ? 'bg-cyan-500 text-white border border-cyan-500 shadow-sm'
                  : 'bg-white text-cyan-600 border border-cyan-200 hover:border-cyan-400 hover:bg-cyan-50'}`}
              style={{ borderRadius: 6, height: 28 }}>
              ✦ 예정 {plannedItems.length}건
              {listFilters.includes('planned') && <span className="ml-0.5 opacity-80">✕</span>}
            </button>
          )}
          {(listFilters.length > 0 || selectedMemberId) && (
            <button onClick={() => { setListFilters([]); setSelectedMemberId(null); }}
              className="ml-auto text-xs text-gray-400 hover:text-gray-600 px-2 py-1 hover:bg-gray-100 transition-colors"
              style={{ borderRadius: 4 }}>
              전체 보기
            </button>
          )}
        </div>
      )}

      {/* ── 태스크 리스트 ── */}
      {(() => {
        const renderRow = (item: typeof listItems[number], showMember: boolean) => {
          const member = members.find(m => m.id === item.memberId);
          const md = (item.noDates || item.issueType === 'Epic') ? null : workingDays(item.startDate, item.endDate);
          const isOverdue = !item.noDates && item.status !== 'done' && item.endDate < today;
          return (
            <tr key={item.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors
              ${item.noDates ? 'bg-amber-50/40' : isOverdue ? 'bg-red-50/30' : ''}`}>
              <td className="px-5 py-2.5 whitespace-nowrap">
                {item.jiraKey
                  ? <a href={item.jiraUrl} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-blue-500 hover:underline font-mono">
                      <ExternalLink size={10} />{item.jiraKey}
                    </a>
                  : <span className="text-cyan-500">✦ 예정</span>}
              </td>
              {showMember && (
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {member && (
                    <div className="flex items-center gap-1.5">
                      {member.avatar
                        ? <img src={member.avatar} className="w-5 h-5 rounded-full object-cover" />
                        : <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-semibold flex-shrink-0"
                            style={{ background: member.color }}>{member.name[0]}</div>}
                      <span className="text-gray-600 text-[11px]">{member.name}</span>
                    </div>
                  )}
                </td>
              )}
              <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                {item.type === 'planned' ? (item.category ?? '예정') : (item.issueType ?? 'Task')}
              </td>
              <td className="px-3 py-2.5 max-w-xs">
                <div className="flex items-center gap-1">
                  {item.noDates && <AlertTriangle size={10} className="text-amber-400 flex-shrink-0" />}
                  {isOverdue && <AlertTriangle size={10} className="text-red-400 flex-shrink-0" />}
                  <span className="truncate text-gray-800">{item.title}</span>
                </div>
                {item.epicName && <span className="text-[10px] text-gray-400 block truncate">{item.epicName}</span>}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap" style={{
                color: item.noDates
                  ? (item.status === 'hold' ? STATUS_COLOR['hold'] : '#f59e0b')
                  : STATUS_COLOR[item.status]
              }}>
                {item.noDates
                  ? (item.status === 'hold' ? 'Hold' : '일정 미기입')
                  : STATUS_LABEL[item.status]}
              </td>
              <td className="px-3 py-2.5 text-right text-gray-700 whitespace-nowrap">
                {md !== null ? `${md}d` : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">
                {item.noDates ? '—' : item.startDate}
              </td>
              <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">
                {item.noDates ? '—' : item.endDate}
              </td>
            </tr>
          );
        };

        const COL_WIDTHS = { key: 110, member: 80, type: 72, status: 110, md: 52, date: 100 };
        const theadCols = (showMember: boolean) => (
          <thead>
            <tr className="bg-gray-50 text-[10px] text-gray-500 uppercase border-b border-gray-100">
              <th className="px-5 py-2.5 text-left font-semibold" style={{ width: COL_WIDTHS.key }}>KEY</th>
              {showMember && <th className="px-3 py-2.5 text-left font-semibold" style={{ width: COL_WIDTHS.member }}>담당자</th>}
              <th className="px-3 py-2.5 text-left font-semibold" style={{ width: COL_WIDTHS.type }}>TYPE</th>
              <th className="px-3 py-2.5 text-left font-semibold" style={{ width: 360 }}>SUMMARY</th>
              <th className="px-3 py-2.5 text-left font-semibold" style={{ width: COL_WIDTHS.status }}>STATUS</th>
              <th className="px-3 py-2.5 text-right font-semibold" style={{ width: COL_WIDTHS.md }}>MD</th>
              <th className="px-3 py-2.5 text-left font-semibold" style={{ width: COL_WIDTHS.date }}>START</th>
              <th className="px-3 py-2.5 text-left font-semibold" style={{ width: COL_WIDTHS.date }}>END</th>
            </tr>
          </thead>
        );

        // 특정 멤버 선택: 단일 테이블
        if (selectedMemberId) {
          return (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl font-normal text-gray-800">{selectedMember?.name ?? ''}</span>
                <span className="text-sm text-gray-400">{listItems.length}건</span>
              </div>
              <div className="bg-white border border-gray-200 overflow-hidden" style={{ borderRadius: 8 }}>
                <table className="w-full text-xs">
                  {theadCols(false)}
                  <tbody>{listItems.map(item => renderRow(item, false))}</tbody>
                </table>
              </div>
            </div>
          );
        }

        // 전체 보기 또는 배지 필터: 팀원별 분리 섹션
        const groups = activeMembers
          .map(m => ({ member: m, items: listItems.filter(i => i.memberId === m.id) }))
          .filter(g => g.items.length > 0);

        return (
          <div className="flex flex-col gap-4">
            {groups.map(({ member, items: groupItems }) => (
              <div key={member.id}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl font-normal text-gray-800">{member.name}</span>
                  <span className="text-sm text-gray-400">{groupItems.length}건</span>
                </div>
                <div className="bg-white border border-gray-200 overflow-hidden" style={{ borderRadius: 8 }}>
                  <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
                    {theadCols(false)}
                    <tbody>{groupItems.map(item => renderRow(item, false))}</tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
