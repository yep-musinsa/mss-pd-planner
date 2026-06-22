import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, Users, Cloud, CloudOff } from 'lucide-react';
import type { JiraSettings, Member, GanttItem } from '../types';
import { useJiraSync, buildAssigneeJql } from '../hooks/useJiraSync';

const SETTINGS_KEY = 'pd-planner-jira-settings';
const DEFAULT_TIER1_JQL = 'labels in ("PD") AND issuetype in ("Initiative", "Epic")';

const IS_LOCAL = window.location.hostname === 'localhost';
const WORKER_BASE = 'https://jira-proxy.ye-park.workers.dev';

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
  const [saved, setSaved] = useState(false);
  const [tokenSaving, setTokenSaving] = useState(false);
  const [workerTokenOk, setWorkerTokenOk] = useState<boolean | null>(null);
  const { sync, loading, error, progress } = useJiraSync();

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white';
  const labelCls = 'block text-xs font-semibold text-gray-500 mb-1';
  const missingMembers = members.filter(m => m.active && !m.jiraAccountId);

  // Worker에 토큰 설정 여부 확인
  useEffect(() => {
    if (IS_LOCAL) return;
    fetch(`${WORKER_BASE}/jira-proxy/admin/token-status`)
      .then(r => r.json())
      .then((d: { configured: boolean }) => setWorkerTokenOk(d.configured))
      .catch(() => setWorkerTokenOk(false));
  }, []);

  async function handleSaveToken() {
    if (!settings.apiToken) return;
    setTokenSaving(true);
    try {
      // 1. 로컬 저장
      saveJiraSettings(settings);
      // 2. Worker KV에 저장 (모든 사용자가 사용 가능하도록)
      if (!IS_LOCAL) {
        const res = await fetch(`${WORKER_BASE}/jira-proxy/admin/save-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'ye.park@musinsa.com', token: settings.apiToken }),
        });
        if (res.ok) {
          setWorkerTokenOk(true);
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setTokenSaving(false);
    }
  }

  async function handleSync() {
    saveJiraSettings(settings);
    const items = await sync(settings, members);
    if (items.length > 0) {
      const updated = { ...settings, lastSynced: new Date().toISOString() };
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
          관리자 전용 페이지입니다. API 토큰을 저장하면 모든 팀원이 Jira 데이터를 볼 수 있습니다.
        </p>
      </div>

      {/* Worker 토큰 상태 */}
      {!IS_LOCAL && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm
          ${workerTokenOk ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
          {workerTokenOk
            ? <><Cloud size={14} /><span>Worker에 토큰이 저장되어 있습니다 — 모든 팀원이 동기화 가능</span></>
            : <><CloudOff size={14} /><span>Worker에 토큰이 없습니다 — 아래에서 토큰을 저장해주세요</span></>
          }
        </div>
      )}

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

      {/* API 토큰 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-700">API 토큰 관리</h3>
        <div>
          <label className={labelCls}>
            Atlassian API 토큰
            {' '}
            <a href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank" rel="noreferrer"
              className="text-indigo-500 hover:underline normal-case font-normal">
              발급 →
            </a>
          </label>
          <input className={inputCls}
            type="password"
            placeholder="ATATT3x..."
            value={settings.apiToken}
            onChange={e => setSettings(s => ({ ...s, apiToken: e.target.value }))}
          />
          <p className="text-xs text-gray-400 mt-1">
            저장하면 Cloudflare Worker에 반영되어 모든 팀원이 동기화 가능해집니다.
          </p>
        </div>

        <button
          onClick={handleSaveToken}
          disabled={tokenSaving || !settings.apiToken}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl border text-sm font-medium transition-all
            ${saved ? 'border-green-400 text-green-600 bg-green-50' : 'border-indigo-300 text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}
            disabled:opacity-40 disabled:cursor-not-allowed`}>
          {tokenSaving ? <RefreshCw size={13} className="animate-spin" /> : null}
          {saved ? '✓ 저장 완료 (Worker에 반영됨)' : tokenSaving ? '저장 중...' : '토큰 저장 및 Worker 반영'}
        </button>
      </div>

      {/* JQL 설정 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-700">동기화 JQL</h3>
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

      {/* 동기화 버튼 */}
      <button onClick={handleSync}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-500 text-white text-sm font-semibold
          hover:bg-indigo-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        {loading ? '동기화 중...' : 'Jira 동기화'}
      </button>
    </div>
  );
}
