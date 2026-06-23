import { useState, useMemo, useRef, useEffect } from 'react';
import {
  addMonths, subMonths, addWeeks, subWeeks,
  startOfMonth, endOfMonth, format,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Plus, LayoutDashboard, Calendar,
  Users, Settings, ChevronDown, Check, X, RefreshCw, LogOut,
} from 'lucide-react';
import type { GanttItem, Member, ViewMode, JiraSettings } from './types';
import { MEMBERS } from './data';
import GanttChart, { type GanttChartHandle } from './components/GanttChart';
import InitiativeGanttView from './components/InitiativeGanttView';
import Dashboard from './components/Dashboard';
import AddPlanModal from './components/AddPlanModal';
import ItemDetailPanel from './components/ItemDetailPanel';
import MemberManager from './components/MemberManager';
import JiraSettingsPanel, { loadJiraSettings } from './components/JiraSettingsPanel';
import { useJiraSync } from './hooks/useJiraSync';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import { usePlannedItems } from './hooks/usePlannedItems';

const ITEMS_KEY   = 'pd-planner-items';
const MEMBERS_KEY = 'pd-planner-members';

function loadJiraItems(): GanttItem[] {
  try {
    const s = localStorage.getItem(ITEMS_KEY);
    if (s) return (JSON.parse(s) as GanttItem[]).filter(i => i.type === 'jira');
  } catch { /* ignore */ }
  return [];
}

// 구버전 localStorage 예정 항목 정리
try { localStorage.removeItem('pd-planner-planned'); } catch { /* ignore */ }
function saveItems(items: GanttItem[]) {
  // Jira 아이템만 localStorage에 캐시
  const jira = items.filter(i => i.type === 'jira');
  localStorage.setItem(ITEMS_KEY, JSON.stringify(jira));
}

function loadMembers(): Member[] {
  try { const s = localStorage.getItem(MEMBERS_KEY); if (s) return JSON.parse(s); } catch { /* ignore */ }
  return MEMBERS;
}
function saveMembers(members: Member[]) { localStorage.setItem(MEMBERS_KEY, JSON.stringify(members)); }

function generateId() {
  return `u${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── zoom 설정 ──────────────────────────────────────────────────
type GanttZoom = 'week' | 'month' | 'quarter' | 'year';

const ZOOM_COL_W: Record<GanttZoom, number> = {
  week: 44, month: 28, quarter: 7, year: 4,
};

function calcViewRange(center: Date, zoom: GanttZoom): { viewStart: Date; viewEnd: Date } {
  switch (zoom) {
    case 'week':
      return {
        viewStart: startOfMonth(subMonths(center, 6)),
        viewEnd: endOfMonth(addMonths(center, 18)),
      };
    case 'month':
      return {
        viewStart: startOfMonth(subMonths(center, 6)),
        viewEnd: endOfMonth(addMonths(center, 18)),
      };
    case 'quarter':
      return {
        viewStart: startOfMonth(subMonths(center, 6)),
        viewEnd: endOfMonth(addMonths(center, 18)),
      };
    case 'year':
      return {
        viewStart: startOfMonth(subMonths(center, 12)),
        viewEnd: endOfMonth(addMonths(center, 24)),
      };
  }
}

function navDelta(zoom: GanttZoom, dir: 1 | -1): (d: Date) => Date {
  switch (zoom) {
    case 'week':    return d => dir === 1 ? addWeeks(d, 1) : subWeeks(d, 1);
    case 'month':   return d => dir === 1 ? addMonths(d, 1) : subMonths(d, 1);
    case 'quarter': return d => dir === 1 ? addMonths(d, 3) : subMonths(d, 3);
    case 'year':    return d => dir === 1 ? addMonths(d, 12) : subMonths(d, 12);
  }
}

// ── 멀티셀렉트 드롭다운 ────────────────────────────────────────
interface DropOpt {
  value: string;
  label: string;
  avatar?: string;
  color?: string;
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: DropOpt[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);
  }

  const isActive = selected.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 text-xs font-medium border transition-colors whitespace-nowrap
          ${isActive
            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
        style={{ borderRadius: 4, height: 28 }}>
        {label}
        {isActive && (
          <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-[10px] flex items-center justify-center font-bold">
            {selected.length}
          </span>
        )}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 left-0 bg-white border border-gray-200 rounded-lg shadow-xl z-50 min-w-[168px] overflow-hidden">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/80">
            <button onClick={() => onChange([])}
              className="text-xs text-gray-500 hover:text-gray-800 transition-colors">
              초기화
            </button>
            <button onClick={() => onChange(options.map(o => o.value))}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold transition-colors">
              전체 선택
            </button>
          </div>
          {/* 옵션 목록 */}
          <div className="py-1 max-h-64 overflow-y-auto">
            {options.map(opt => {
              const checked = selected.includes(opt.value);
              return (
                <button key={opt.value} onClick={() => toggle(opt.value)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-left transition-colors">
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors
                    ${checked ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300'}`}>
                    {checked && <Check size={9} className="text-white" strokeWidth={3} />}
                  </div>
                  {opt.avatar && (
                    <img src={opt.avatar} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                  )}
                  {!opt.avatar && opt.color && (
                    <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
                      style={{ background: opt.color }}>
                      {opt.label[0]}
                    </div>
                  )}
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

// ── 메인 앱 ───────────────────────────────────────────────────
export default function App() {
  const { user, isAdmin, logout } = useAuth();

  // 로그인 안 되어 있으면 로그인 페이지
  if (!user) return <LoginPage />;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return <AppInner isAdmin={isAdmin} logout={logout} />;
}

import type { AuthUser } from './contexts/AuthContext';

function AppInner({ isAdmin, logout }: { isAdmin: boolean; logout: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  const [jiraItems, setJiraItems] = useState<GanttItem[]>(loadJiraItems);
  const { plannedItems, updatePlanned } = usePlannedItems();
  const items = useMemo(() => [...plannedItems, ...jiraItems], [plannedItems, jiraItems]);
  const [members, setMembers] = useState<Member[]>(loadMembers);
  const [view, setView]       = useState<ViewMode>('gantt');
  const [ganttZoom, setGanttZoom] = useState<GanttZoom>('month');
  const [viewCenter, setViewCenter] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem]   = useState<GanttItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<GanttItem | null>(null);
  const [filterMemberIds, setFilterMemberIds]   = useState<string[]>([]);
  const [filterIssueTypes, setFilterIssueTypes] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses]     = useState<string[]>(['todo', 'in_progress']);
  const [jiraSettings, setJiraSettings] = useState<JiraSettings>(loadJiraSettings);
  const [syncFlash, setSyncFlash] = useState(false);
  const [ganttAllCollapsed, setGanttAllCollapsed] = useState(false);
  const [ganttGroupBy, setGanttGroupBy] = useState<'member' | 'initiative'>('member');
  const { sync: jiraSync, loading: jiraSyncLoading } = useJiraSync();

  const ganttRef        = useRef<GanttChartHandle>(null);
  const initiativeRef   = useRef<GanttChartHandle>(null);

  const { viewStart, viewEnd } = useMemo(
    () => calcViewRange(viewCenter, ganttZoom),
    [viewCenter, ganttZoom],
  );

  const activeMembers = members.filter(m => m.active);

  // 이슈 타입 옵션 (현재 아이템 기반 동적 생성)
  const issueTypeOptions = useMemo<DropOpt[]>(() => {
    const types = new Set<string>();
    items.forEach(i => {
      if (i.type === 'planned') types.add('예정');
      else types.add(i.issueType ?? 'Task');
    });
    const ORDER = ['Initiative', 'Epic', 'Design', 'Task', 'Story', 'Bug', 'Sub-task', '예정'];
    return Array.from(types)
      .sort((a, b) => {
        const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(t => ({ value: t, label: t }));
  }, [items]);

  const memberOptions = useMemo<DropOpt[]>(() =>
    activeMembers.map(m => ({ value: m.id, label: m.name, avatar: m.avatar, color: m.color })),
    [activeMembers]
  );

  // 일정 미기입 카운트
  const noDatesCount = useMemo(
    () => items.filter(i => i.type === 'jira' && i.noDates).length,
    [items]
  );

  const statusOptions = useMemo<DropOpt[]>(() => [
    { value: 'todo',        label: 'SUGGESTED' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'done',        label: 'Done' },
  ], []);

  // 필터링
  const filteredItems = useMemo(() => items.filter(i => {
    if (filterMemberIds.length > 0 && !filterMemberIds.includes(i.memberId)) return false;
    if (filterIssueTypes.length > 0) {
      const typeKey = i.type === 'planned' ? '예정' : (i.issueType ?? 'Task');
      if (!filterIssueTypes.includes(typeKey)) return false;
    }
    if (filterStatuses.length > 0 && !filterStatuses.includes(i.status)) return false;
    return true;
  }), [items, filterMemberIds, filterIssueTypes, filterStatuses]);

  const hasFilters = filterMemberIds.length > 0 || filterIssueTypes.length > 0 || filterStatuses.length > 0;

  /* ── 아이템 CRUD ── */
  function handleAddItem(item: Omit<GanttItem, 'id'>) {
    const newItem = { ...item, id: generateId() };
    updatePlanned([...plannedItems, newItem]);
  }
  function handleEditItem(item: Omit<GanttItem, 'id'>) {
    if (!editingItem) return;
    if (editingItem.type === 'planned') {
      const updated = plannedItems.map(i => i.id === editingItem.id ? { ...item, id: editingItem.id } : i);
      updatePlanned(updated);
    } else {
      const updated = jiraItems.map(i => i.id === editingItem.id ? { ...item, id: editingItem.id } : i);
      setJiraItems(updated); saveItems(updated);
    }
    setEditingItem(null);
  }
  function handleDeleteItem(id: string) {
    if (plannedItems.some(i => i.id === id)) {
      updatePlanned(plannedItems.filter(i => i.id !== id));
    } else {
      const updated = jiraItems.filter(i => i.id !== id);
      setJiraItems(updated); saveItems(updated);
    }
  }

  function handleUpdateDates(id: string, startDate: string, endDate: string) {
    if (plannedItems.some(i => i.id === id)) {
      updatePlanned(plannedItems.map(i => i.id === id ? { ...i, startDate, endDate } : i));
    } else {
      const updated = jiraItems.map(i => i.id === id ? { ...i, startDate, endDate } : i);
      setJiraItems(updated); saveItems(updated);
    }
  }

  function handleMembersChange(newMembers: Member[]) {
    setMembers(newMembers); saveMembers(newMembers);
  }

  function handleJiraSyncComplete(newJiraItems: GanttItem[], updatedSettings?: JiraSettings) {
    setJiraItems(newJiraItems); saveItems(newJiraItems);
    if (updatedSettings) setJiraSettings(updatedSettings);
    setSyncFlash(true);
    setTimeout(() => setSyncFlash(false), 2000);
  }

  async function handleSyncNow() {
    // 로컬 개발 시에만 토큰 필수, 배포 환경은 Worker KV 토큰 사용
    if (window.location.hostname === 'localhost' && !jiraSettings.apiToken) return;
    const synced = await jiraSync(jiraSettings, members);
    if (synced.length > 0) {
      const now = new Date().toISOString();
      const updated = { ...jiraSettings, lastSynced: now };
      setJiraSettings(updated);
      localStorage.setItem('pd-planner-jira', JSON.stringify(updated));
      handleJiraSyncComplete(synced);
    }
  }

  // 앱 로드 시 자동 동기화 + 1시간마다 주기적 동기화
  useEffect(() => {
    const IS_LOCAL = window.location.hostname === 'localhost';
    if (IS_LOCAL && !jiraSettings.apiToken) return;

    // 앱 열릴 때 바로 동기화 (3초 딜레이 - 앱 렌더링 후)
    const initialTimer = setTimeout(() => { handleSyncNow(); }, 3000);

    // 1시간마다 자동 동기화
    const interval = setInterval(() => { handleSyncNow(); }, 60 * 60 * 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Today 클릭: 뷰 센터를 오늘로 + 타임라인 스크롤
  function handleToday() {
    setViewCenter(new Date());
    setTimeout(() => {
      if (ganttGroupBy === 'member') ganttRef.current?.scrollToToday();
      else initiativeRef.current?.scrollToToday();
    }, 80);
  }

  const plannedCount = plannedItems.length;
  const jiraCount    = jiraItems.length;

  const NAV_ITEMS = [
    { v: 'dashboard' as ViewMode, label: '리소스 요약', Icon: LayoutDashboard },
    { v: 'gantt'     as ViewMode, label: '타임라인',  Icon: Calendar },
    ...(isAdmin ? [{ v: 'members' as ViewMode, label: '팀원', Icon: Users }] : []),
    ...(isAdmin ? [{ v: 'settings' as ViewMode, label: 'Jira 설정', Icon: Settings }] : []),
  ];

  const ZOOM_LABELS: Record<GanttZoom, string> = {
    week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year',
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{ minWidth: 800 }}>

      {/* ── 헤더 ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-full px-6 flex items-center h-14 gap-3">
          <div className="mr-3">
            <span className="font-bold text-gray-900 text-sm">CBD 리소스 관리</span>
          </div>

          <nav className="flex gap-0.5">
            {NAV_ITEMS.map(({ v, label, Icon }) => (
              <button key={v} onClick={() => setView(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${view === v ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                <Icon size={14} />{label}
              </button>
            ))}
          </nav>

          <div className="flex-1" />

          {/* Jira 수동 동기화 */}
          <div className="flex items-center gap-2">
            {jiraSettings.lastSynced && (
              <span className="text-[11px] text-gray-400">
                마지막 동기화 {new Date(jiraSettings.lastSynced).toLocaleString('ko-KR', {
                  month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            )}
            <button onClick={handleSyncNow} disabled={jiraSyncLoading || (!jiraSettings.apiToken && window.location.hostname === 'localhost')}
              className="flex items-center gap-1.5 text-xs font-medium px-3 bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
              style={{ borderRadius: 4, height: 36 }}>
              <RefreshCw size={12} className={jiraSyncLoading ? 'animate-spin' : ''} />
              {jiraSyncLoading ? '동기화 중...' : 'Jira 동기화'}
            </button>
          </div>

          <button onClick={() => { setEditingItem(null); setShowAddModal(true); }}
            className="flex items-center gap-2 bg-indigo-500 text-white font-semibold px-4 hover:bg-indigo-600 transition-colors" style={{ borderRadius: 4, height: 36 }}>
            <Plus size={14} />예정 추가
          </button>

          {/* 사용자 프로필 */}
          <div className="flex items-center gap-2 ml-1 pl-3 border-l border-gray-200">
            {user.picture
              ? <img src={user.picture} className="w-7 h-7 rounded-full object-cover" />
              : <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">{user.name[0]}</div>
            }
            <span className="text-xs text-gray-600 font-medium hidden sm:block">{user.name}</span>
            <button onClick={logout}
              title="로그아웃"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* ── 서브헤더 ── */}
      {view === 'gantt' && (
        <div className="bg-white border-b border-gray-100 sticky top-14 z-20">
          <div className="max-w-full px-6 py-2 flex items-center gap-1.5 flex-wrap">

            {/* 필터 (맨 왼쪽) */}
            {view === 'gantt' && (
              <>
                {/* 상태 멀티셀렉트 */}
                <MultiSelect
                  label="상태"
                  options={statusOptions}
                  selected={filterStatuses}
                  onChange={setFilterStatuses}
                />

                {/* 담당자 멀티셀렉트 */}
                <MultiSelect
                  label="담당자"
                  options={memberOptions}
                  selected={filterMemberIds}
                  onChange={setFilterMemberIds}
                />

                {/* 초기화 버튼 */}
                {hasFilters && (
                  <button
                    onClick={() => { setFilterStatuses([]); setFilterIssueTypes([]); setFilterMemberIds([]); }}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors">
                    <X size={12} />초기화
                  </button>
                )}
              </>
            )}

            <div className="mr-auto" />

            {view === 'gantt' && (
              <>
                {/* 날짜 탐색 */}
                <div className="flex items-center gap-1.5">
                  {/* 뷰 전환 토글 */}
                  <div className="flex items-center gap-0.5 bg-gray-100 p-0.5" style={{ borderRadius: 4, height: 28 }}>
                    {(['member', 'initiative'] as const).map(g => (
                      <button key={g} onClick={() => setGanttGroupBy(g)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors
                          ${ganttGroupBy === g ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        {g === 'member' ? '팀원별' : '이니셔티브별'}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      const ref = ganttGroupBy === 'member' ? ganttRef : initiativeRef;
                      if (ganttAllCollapsed) { ref.current?.expandAll(); setGanttAllCollapsed(false); }
                      else { ref.current?.collapseAll(); setGanttAllCollapsed(true); }
                    }}
                    className="px-2.5 text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                    style={{ borderRadius: 4, height: 28 }}>
                    {ganttAllCollapsed ? '전체 펼치기' : '전체 접기'}
                  </button>
                  <button onClick={handleToday}
                    className="px-2.5 text-xs font-semibold bg-indigo-500 text-white hover:bg-indigo-600 transition-colors" style={{ borderRadius: 4, height: 28 }}>
                    Today
                  </button>
                </div>

                {/* Zoom 탭 */}
                <div className="flex items-center gap-0.5 bg-gray-100 p-0.5" style={{ borderRadius: 4, height: 28 }}>
                  {(['month', 'quarter', 'year'] as GanttZoom[]).map(z => (
                    <button key={z} onClick={() => setGanttZoom(z)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors
                        ${ganttZoom === z ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                      {ZOOM_LABELS[z]}
                    </button>
                  ))}
                </div>

              </>
            )}

          </div>
        </div>
      )}

      {/* ── 메인 콘텐츠 ── */}
      <main className="flex-1 max-w-full w-full px-6 py-5">
        {view === 'gantt' && ganttGroupBy === 'member' && (
          <GanttChart
            ref={ganttRef}
            items={filteredItems}
            members={members}
            viewStart={viewStart}
            viewEnd={viewEnd}
            colW={ZOOM_COL_W[ganttZoom]}
            onClickItem={item => setSelectedItem(item)}
            onUpdateDates={handleUpdateDates}
          />
        )}
        {view === 'gantt' && ganttGroupBy === 'initiative' && (
          <InitiativeGanttView
            ref={initiativeRef}
            items={filteredItems}
            members={members}
            viewStart={viewStart}
            viewEnd={viewEnd}
            colW={ZOOM_COL_W[ganttZoom]}
            onClickItem={item => setSelectedItem(item)}
          />
        )}
        {view === 'dashboard' && (
          <Dashboard
            items={items}
            members={members}
            jiraSettings={jiraSettings}
            onSync={handleSyncNow}
            syncLoading={jiraSyncLoading}
            onReorderMembers={handleMembersChange}
          />
        )}
        {view === 'members' && (
          <MemberManager members={members} onChange={handleMembersChange} />
        )}
        {view === 'settings' && (
          <JiraSettingsPanel members={members} onSyncComplete={handleJiraSyncComplete} />
        )}
      </main>

      {/* ── 모달 ── */}
      {(showAddModal || editingItem) && (
        <AddPlanModal
          members={members}
          editing={editingItem}
          onClose={() => { setShowAddModal(false); setEditingItem(null); }}
          onSave={editingItem ? handleEditItem : handleAddItem}
          onDelete={editingItem ? () => { handleDeleteItem(editingItem.id); setShowAddModal(false); setEditingItem(null); } : undefined}
        />
      )}

      {selectedItem && (
        <ItemDetailPanel
          item={selectedItem}
          member={members.find(m => m.id === selectedItem.memberId)}
          memberItems={[...plannedItems, ...jiraItems].filter(i => i.memberId === selectedItem.memberId)}
          onClose={() => setSelectedItem(null)}
          onEdit={() => {
            if (selectedItem.type === 'planned') {
              setEditingItem(selectedItem);
              setShowAddModal(true);
              setSelectedItem(null);
            }
          }}
          onDelete={() => {
            handleDeleteItem(selectedItem.id);
            setSelectedItem(null);
          }}
        />
      )}

    </div>
  );
}
