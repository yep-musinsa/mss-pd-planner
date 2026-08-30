import { useState, useMemo, useRef, useEffect } from 'react';
import { startOfWeek, addDays, addWeeks, format, isSameWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Bell } from 'lucide-react';
import type { Member, WorkMode } from '../types';
import { useAttendance } from '../hooks/useAttendance';

const DAY_LABELS = ['월', '화', '수', '목', '금'];

const MODE_META: Record<WorkMode, { label: string; bg: string; color: string }> = {
  office: { label: '오피스', bg: '#dbeafe', color: '#1d4ed8' },
  wfh:    { label: '재택',   bg: '#dcfce7', color: '#15803d' },
  off:    { label: '휴가',   bg: '#ffedd5', color: '#c2410c' },
};
const MODE_ORDER: WorkMode[] = ['office', 'wfh', 'off'];

interface Props {
  members: Member[];
  currentEmail: string;
}

export default function AttendanceView({ members, currentEmail }: Props) {
  const { attendance, setCell } = useAttendance();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [openCell, setOpenCell] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const activeMembers = useMemo(() => members.filter(m => m.active), [members]);
  const days = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const dayKeys = useMemo(() => days.map(d => format(d, 'yyyy-MM-dd')), [days]);
  const isThisWeek = isSameWeek(weekStart, new Date(), { weekStartsOn: 1 });

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    if (!openCell) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenCell(null);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [openCell]);

  // 요일별 오피스 출근율 = 오피스 / (오피스 + 재택), 휴가·미입력 제외
  const dayRates = useMemo(() => dayKeys.map(dk => {
    let office = 0, present = 0;
    for (const m of activeMembers) {
      const st = attendance[m.id]?.[dk] ?? 'office'; // 미입력은 오피스로 간주
      if (st === 'office') { office++; present++; }
      else if (st === 'wfh') { present++; }
    }
    return present > 0 ? { pct: Math.round((office / present) * 100), office, present } : null;
  }), [dayKeys, activeMembers, attendance]);

  const rangeLabel = `${format(days[0], 'M월 d일')} – ${format(days[4], 'M월 d일')}`;

  return (
    <div ref={rootRef} className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">출근 현황</h1>
          <p className="text-[12.5px] text-gray-500 mt-0.5">주 2회 재택 · 팀 오피스 출근율은 매일 50% 이상을 유지해야 합니다</p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-[12.5px] text-gray-500 font-medium">
          <Bell size={13} className="text-gray-400" />
          슬랙 알림 <span className="text-gray-300">준비 중</span>
        </div>
      </div>

      {/* 카드 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* 주간 네비 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <button onClick={() => setWeekStart(w => addWeeks(w, -1))}
            className="w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center justify-center">
            <ChevronLeft size={16} />
          </button>
          <span className="text-[15px] font-bold text-gray-800">{rangeLabel}</span>
          <button onClick={() => setWeekStart(w => addWeeks(w, 1))}
            className="w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center justify-center">
            <ChevronRight size={16} />
          </button>
          {!isThisWeek && (
            <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              className="text-xs font-semibold text-indigo-500 border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 rounded-md hover:bg-indigo-100">
              이번 주
            </button>
          )}
          <span className="ml-auto text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1.5 rounded-md">
            코어비즈니스디자인 · {activeMembers.length}명
          </span>
        </div>

        {/* 그리드 */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left pl-4 py-3 text-[11px] font-semibold text-gray-400 uppercase" style={{ width: 160 }}>이름</th>
              {days.map((d, i) => (
                <th key={i} className="py-2.5 text-center border-b border-gray-200">
                  <span className="block text-[11px] text-gray-400 font-semibold">{DAY_LABELS[i]}</span>
                  <span className="text-[13px] font-bold text-gray-700">{format(d, 'M/d')}</span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {activeMembers.map((member, mIdx) => {
              const isMe = member.email.toLowerCase() === currentEmail.toLowerCase();
              const openUp = mIdx >= activeMembers.length - 2; // 마지막 2행은 위로 열기
              return (
                <tr key={member.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                  <td className="pl-4 py-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6.5 h-6.5 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                        style={{ background: member.color, width: 26, height: 26 }}>
                        {member.name[0]}
                      </div>
                      <span className="text-[13px] font-semibold text-gray-800">{member.name}</span>
                      {isMe && <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">나</span>}
                    </div>
                  </td>
                  {dayKeys.map(dk => {
                    const st = (attendance[member.id]?.[dk] as WorkMode | undefined) ?? 'office';
                    const meta = MODE_META[st];
                    const cellId = `${member.id}::${dk}`;
                    const isOpen = openCell === cellId;
                    return (
                      <td key={dk} className="py-1.5 text-center relative">
                        <button
                          disabled={!isMe}
                          onClick={() => setOpenCell(isOpen ? null : cellId)}
                          className={`inline-flex items-center justify-center gap-1.5 rounded-md text-[12.5px] font-bold transition-colors
                            ${isMe ? 'cursor-pointer' : 'cursor-default'}`}
                          style={{
                            minWidth: 88, padding: '6px 10px',
                            background: meta.bg,
                            color: meta.color,
                            border: '1px solid transparent',
                          }}>
                          {meta.label}
                          {isMe && <span className="text-[9px] opacity-50">▼</span>}
                        </button>

                        {isOpen && (
                          <div className={`absolute z-30 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden
                            ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
                            style={{ minWidth: 100 }}>
                            {MODE_ORDER.map(opt => {
                              const om = MODE_META[opt];
                              return (
                                <button key={opt}
                                  onClick={() => { setCell(member.id, dk, opt); setOpenCell(null); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left">
                                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                    style={{ background: om.color }} />
                                  <span className="text-[12.5px] text-gray-700">{om.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* 출근율 요약 (맨 아래) */}
            <tr>
              <td className="pl-4 py-3 text-[12px] font-bold text-gray-700 border-t-2 border-gray-200 bg-gray-50">
                오피스 출근율
              </td>
              {dayRates.map((r, i) => {
                const warn = r != null && r.pct < 50;
                return (
                  <td key={i} className="py-3 text-center border-t-2 border-gray-200 bg-gray-50">
                    {r == null ? (
                      <span className="text-sm text-gray-300">—</span>
                    ) : (
                      <div className="inline-flex flex-col items-center gap-1">
                        <span className="text-[17px] font-extrabold" style={{ color: warn ? '#ef4444' : '#22c55e' }}>
                          {r.pct}%
                        </span>
                        <span className="block rounded-full overflow-hidden" style={{ width: 54, height: 4, background: '#e5e7eb' }}>
                          <span className="block h-full rounded-full" style={{ width: `${r.pct}%`, background: warn ? '#ef4444' : '#22c55e' }} />
                        </span>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-4 text-[12px] text-gray-500 font-medium pl-1">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: '#dbeafe' }} /> 오피스</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: '#dcfce7' }} /> 재택</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: '#ffedd5' }} /> 휴가</span>
        <span className="text-gray-400">· 출근율 = 오피스 ÷ (오피스+재택), 휴가 제외</span>
        <span className="text-gray-400">· 본인 행만 수정할 수 있어요</span>
      </div>
    </div>
  );
}
