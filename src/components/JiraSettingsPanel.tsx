import { useState } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, Eye, EyeOff, Users } from 'lucide-react';
import type { JiraSettings, Member, GanttItem } from '../types';
import { useJiraSync, buildAssigneeJql } from '../hooks/useJiraSync';

const SETTINGS_KEY = 'pd-planner-jira-settings';

const DEFAULT_TIER1_JQL = 'labels in ("PD") AND issuetype in ("Initiative", "Epic")';
const DEFAULT_SIMPLE_JQL = 'customfield_10015 is not EMPTY AND duedate is not EMPTY AND duedate >= "2026-01-01" AND statusCategory != Done ORDER BY duedate ASC';

export function loadJiraSettings(): JiraSettings {
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    if (s) return JSON.parse(s);
  } catch { /* ignore */ }
  return {
    baseUrl: 'jira.team.musinsa.com',
    email: 'ye.park@musinsa.com',
    apiToken: '',
    jql: DEFAULT_TIER1_JQL,
    syncMode: 'tiered',
  };
}

export function saveJiraSettings(s: JiraSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

interface Props {
  members: Member[];
  onSyncComplete: (items: GanttItem[], settings: JiraSettings) => void;
}

export default function JiraSettingsPanel({ members, onSyncComplete }: Props) {
  const [settings, setSettings] = useState<JiraSettings>(loadJiraSettings);
  // jira.team.musinsa.com = Jira Cloud → Basic Auth 기본값
  // authMode 고정: Basic Auth (email + API token);
  const [showToken, setShowToken] = useState(false);
  const [saved, setSaved] = useState(false);
  const { sync, loading, error, progress } = useJiraSync();

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white';
  const labelCls = 'block text-xs font-semibold text-gray-500 mb-1';

  const missingMembers = members.filter(m => m.active && !m.jiraAccountId);

  function handleSave() {
    saveJiraSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleSync() {
    saveJiraSettings(settings);
    const toSave = settings;
    const items = await sync(toSave, members);
    if (items.length > 0) {
      const updated = { ...toSave, lastSynced: new Date().toISOString() };
      saveJiraSettings(updated);
      setSettings(updated);
      onSyncComplete(items, updated);
    }
  }

  const assigneeJql = buildAssigneeJql(members);

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Jira 연동 설정</h2>
        <p className="text-sm text-gray-500 mt-1">
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">jira.team.musinsa.com</code> 에 연결합니다.
          <strong>이메일 + API 토큰</strong> 방식을 사용합니다.{' '}
          <a href="https://id.atlassian.com/manage-profile/security/api-tokens"
            target="_blank" rel="noreferrer"
            className="text-indigo-500 hover:underline font-medium">API 토큰 발급 →</a>
        </p>
      </div>

      {/* 팀원 매핑 현황 */}
      <div className={`rounded-xl border p-4 ${missingMembers.length ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
        <div className="flex items-center gap-2 mb-2">
          <Users size={14} className={missingMembers.length ? 'text-amber-600' : 'text-green-600'} />
          <span className="text-xs font-bold text-gray-700">팀원 매핑 현황</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {members.filter(m => m.active).map(m => (
            <div key={m.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs
              ${m.jiraAccountId ? 'bg-white border border-green-200 text-green-700' : 'bg-white border border-amber-200 text-amber-600'}`}>
              <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ background: m.color, fontSize: 9 }}>
                {m.name.slice(0, 1)}
              </div>
              <span className="font-medium">{m.name}</span>
              {m.jiraAccountId
                ? <CheckCircle size={10} className="text-green-500" />
                : <span className="text-amber-400">미설정</span>}
            </div>
          ))}
        </div>
        {missingMembers.length > 0 && (
          <p className="text-xs text-amber-600 mt-2">
            ⚠ {missingMembers.map(m => m.name).join(', ')} — 팀원 탭에서 Jira Account ID를 입력해주세요.
          </p>
        )}
        {assigneeJql && (
          <p className="text-xs text-gray-400 mt-2 font-mono truncate">
            자동 적용 JQL: {assigneeJql.slice(0, 80)}…
          </p>
        )}
      </div>

      {/* 연결 정보 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-700">연결 정보</h3>


        {/* API 토큰 */}
        <div>
          <label className={labelCls}>API 토큰</label>
          <input className={inputCls}
            type="password"
            placeholder="ATATT3x..."
            value={settings.apiToken}
            onChange={e => setSettings(s => ({ ...s, apiToken: e.target.value, email: 'ye.park@musinsa.com' }))} />
        </div>
      </div>

      {/* JQL 모드 + 쿼리 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-700">동기화 방식</h3>
        <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-xs text-gray-500">
          <div>
            <span className="font-semibold text-gray-600 block mb-0.5">TIER 1 — INITIATIVE</span>
            <code className="text-gray-400">{settings.jql}</code>
          </div>
          <div>
            <span className="font-semibold text-gray-600 block mb-0.5">TIER 2 — EPIC</span>
            <code className="text-gray-400">parent or Epic Link in (TIER1 KEYS)</code>
          </div>
          <div>
            <span className="font-semibold text-gray-600 block mb-0.5">TIER 3 — TASK</span>
            <code className="text-gray-400">parent or Epic Link in (TIER2 KEYS) AND assignee in (...)</code>
          </div>
        </div>

        {/* Simple 모드 */}
      </div>

      {/* 상태 / 에러 */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">연동 실패</p>
            <p className="mt-0.5 text-xs opacity-80">{error}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm text-indigo-700">
          <RefreshCw size={14} className="animate-spin flex-shrink-0" />
          <span className="text-xs">{progress}</span>
        </div>
      )}

      {!loading && !error && settings.lastSynced && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <CheckCircle size={12} className="text-green-500" />
          마지막 동기화: {new Date(settings.lastSynced).toLocaleString('ko-KR')}
          {' '}— {progress}
        </div>
      )}

      {/* 버튼 */}
      <div className="flex gap-3">
        <button onClick={handleSave}
          className={`px-5 py-2 rounded-xl border text-sm font-medium transition-all
            ${saved ? 'border-green-400 text-green-600 bg-green-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          {saved ? '✓ 저장됨' : '설정 저장'}
        </button>
        <button onClick={handleSync}
          disabled={loading || !settings.apiToken}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-500 text-white text-sm font-semibold
            hover:bg-indigo-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? '동기화 중...' : 'Jira 동기화'}
        </button>
      </div>

      {/* 안내 */}
      <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-600">개발 환경 CORS 처리</p>
        <p>• <code>npm run dev</code> 시 Vite가 <code>/jira-api/*</code> → <code>https://jira.team.musinsa.com/*</code> 로 자동 프록시합니다.</p>
        <p>• 배포 시 Nginx에서 동일하게 프록시 패스를 추가하거나, 사내망에서 직접 호출이 가능한지 확인하세요.</p>
      </div>
    </div>
  );
}
