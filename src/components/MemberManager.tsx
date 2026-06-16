import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Check, Search, Loader } from 'lucide-react';
import type { Member } from '../types';

const MEMBER_COLORS = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b',
  '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6', '#475569',
];

interface Props {
  members: Member[];
  onChange: (members: Member[]) => void;
}

const emptyForm = (): Omit<Member, 'id'> => ({
  name: '',
  email: '',
  color: MEMBER_COLORS[0],
  active: true,
  jiraAccountId: '',
});

export default function MemberManager({ members, onChange }: Props) {
  const [editing, setEditing] = useState<Member | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = '이름을 입력해주세요';
    if (!form.email.trim()) e.email = '이메일을 입력해주세요';
    if (form.email && !/^[^@]+@[^@]+\.[^@]+$/.test(form.email)) e.email = '올바른 이메일 형식이 아닙니다';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleAdd() {
    setAdding(true);
    setEditing(null);
    setForm({ ...emptyForm(), color: MEMBER_COLORS[members.length % MEMBER_COLORS.length] });
    setErrors({});
  }

  function handleEdit(m: Member) {
    setEditing(m);
    setAdding(false);
    setForm({ name: m.name, email: m.email, color: m.color, active: m.active, jiraAccountId: m.jiraAccountId ?? '' });
    setErrors({});
  }

  function handleSave() {
    if (!validate()) return;
    if (adding) {
      onChange([...members, { ...form, id: `m${Date.now()}` }]);
    } else if (editing) {
      onChange(members.map(m => m.id === editing.id ? { ...form, id: m.id } : m));
    }
    setAdding(false);
    setEditing(null);
  }

  function handleDelete(id: string) {
    if (confirm('이 팀원을 삭제할까요?')) {
      onChange(members.filter(m => m.id !== id));
    }
  }

  function toggleActive(id: string) {
    onChange(members.map(m => m.id === id ? { ...m, active: !m.active } : m));
  }

  const [jiraLookupLoading, setJiraLookupLoading] = useState(false);
  const [jiraLookupMsg, setJiraLookupMsg] = useState('');

  async function lookupJira() {
    if (!form.email) return;
    setJiraLookupLoading(true);
    setJiraLookupMsg('');
    try {
      const s = JSON.parse(localStorage.getItem('pd-planner-jira-settings') || '{}');
      if (!s.apiToken) { setJiraLookupMsg('먼저 Jira 설정 탭에서 API 토큰을 저장해주세요.'); return; }
      const auth = `Basic ${btoa(`${s.email}:${s.apiToken}`)}`;
      const r = await fetch(`/jira-api/rest/api/3/user/search?query=${encodeURIComponent(form.email)}&maxResults=5`, {
        headers: { Authorization: auth, Accept: 'application/json' },
      });
      if (!r.ok) throw new Error(`API 오류 (${r.status})`);
      const users = await r.json() as Array<{ accountId: string; displayName: string; avatarUrls: Record<string, string> }>;
      const match = users.find(u =>
        u.displayName.toLowerCase().includes(form.email.split('@')[0].toLowerCase()) ||
        users.length === 1
      ) ?? users[0];
      if (!match) { setJiraLookupMsg('Jira에서 해당 이메일 사용자를 찾을 수 없습니다.'); return; }
      const displayName = match.displayName.split('/')[0].trim(); // "박영은/Biz-P..." → "박영은"
      const avatarUrl = match.avatarUrls['48x48'] ?? match.avatarUrls['32x32'];
      setForm(f => ({
        ...f,
        jiraAccountId: match.accountId,
        name: f.name || displayName,
        avatar: avatarUrl,
      }));
      setJiraLookupMsg(`✓ ${displayName} (${match.accountId.slice(0, 20)}...) 매핑됨`);
    } catch (e) {
      setJiraLookupMsg(`오류: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setJiraLookupLoading(false);
    }
  }

  const inputCls = 'w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white';
  const labelCls = 'block text-xs font-semibold text-gray-500 mb-1';
  const isOpen = adding || editing !== null;

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">팀원 관리</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Jira Account ID를 입력하면 Jira 동기화 시 자동으로 티켓이 배정됩니다.
          </p>
        </div>
        <button onClick={handleAdd}
          className="flex items-center gap-1.5 bg-indigo-500 text-white text-sm font-semibold px-4 hover:bg-indigo-600 transition-colors"
          style={{ borderRadius: 4, height: 36 }}>
          <Plus size={14} />팀원 추가
        </button>
      </div>

      {/* 인라인 추가/수정 폼 */}
      {isOpen && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-gray-800">
              {adding ? '새 팀원 추가' : `${editing?.name} 수정`}
            </h3>
            <button onClick={() => { setAdding(false); setEditing(null); }}
              className="p-1 rounded hover:bg-indigo-100">
              <X size={14} className="text-gray-400" />
            </button>
          </div>

          {/* 이메일 + Jira 자동 조회 */}
          <div>
            <label className={labelCls}>이메일 *</label>
            <div className="flex gap-2">
              <input className={`${inputCls} flex-1 ${errors.email ? 'border-red-400' : ''}`}
                style={{ borderRadius: 4 }}
                placeholder="hong@musinsa.com"
                value={form.email}
                onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setJiraLookupMsg(''); }} />
              <button type="button" onClick={lookupJira}
                disabled={jiraLookupLoading || !form.email}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500 text-white text-xs font-semibold hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap flex-shrink-0"
                style={{ borderRadius: 4 }}>
                {jiraLookupLoading
                  ? <Loader size={12} className="animate-spin" />
                  : <Search size={12} />}
                Jira 자동 조회
              </button>
            </div>
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            {jiraLookupMsg && (
              <p className={`text-xs mt-1 ${jiraLookupMsg.startsWith('✓') ? 'text-green-600' : 'text-amber-600'}`}>
                {jiraLookupMsg}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">이메일만 입력하면 Jira에서 자동 조회됩니다.</p>
          </div>

          {/* 이름 */}
          <div>
            <label className={labelCls}>이름 (표시명)</label>
            <input className={`${inputCls} ${errors.name ? 'border-red-400' : ''}`}
              style={{ borderRadius: 4 }}
              placeholder="홍길동"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            <p className="text-xs text-gray-400 mt-1">자동 조회 시 채워집니다. 비워두고 저장해도 자동 채움.</p>
          </div>

          <div>
            <label className={labelCls}>Jira Account ID</label>
            <input className={inputCls}
              style={{ borderRadius: 4 }}
              placeholder="712020:e6c24002-8ccc-4fd1-8ce2-..."
              value={form.jiraAccountId}
              onChange={e => setForm(f => ({ ...f, jiraAccountId: e.target.value }))} />
            <p className="text-xs text-gray-400 mt-1">자동 조회 결과가 들어옵니다. 수동 입력도 가능.</p>
          </div>

          <div>
            <label className={labelCls}>아바타 색상</label>
            <div className="flex gap-2 flex-wrap">
              {MEMBER_COLORS.map(c => (
                <button key={c} type="button"
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  className="w-7 h-7 rounded-full border-2 transition-all"
                  style={{
                    background: c,
                    borderColor: form.color === c ? '#1e40af' : 'transparent',
                    transform: form.color === c ? 'scale(1.2)' : 'scale(1)',
                  }} />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => { setAdding(false); setEditing(null); }}
              className="flex-1 py-2 border border-gray-200 text-gray-600 text-sm hover:bg-white transition-colors"
              style={{ borderRadius: 4 }}>
              취소
            </button>
            <button onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-colors"
              style={{ borderRadius: 4 }}>
              <Check size={14} />
              {adding ? '추가' : '저장'}
            </button>
          </div>
        </div>
      )}

      {/* 팀원 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase bg-gray-50 border-b border-gray-100">
              <th className="px-5 py-2.5 text-left font-semibold">팀원</th>
              <th className="px-3 py-2.5 text-left font-semibold">이메일</th>
              <th className="px-3 py-2.5 text-left font-semibold">Jira Account ID</th>
              <th className="px-3 py-2.5 text-center font-semibold">상태</th>
              <th className="px-3 py-2.5 text-right font-semibold">관리</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${!m.active ? 'opacity-50' : ''}`}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ background: m.color }}>
                      {m.name.slice(0, 1)}
                    </div>
                    <span className="font-semibold text-gray-800">{m.name}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-gray-500 text-xs">{m.email}</td>
                <td className="px-3 py-3">
                  {m.jiraAccountId
                    ? <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 truncate max-w-[180px] block">
                        {m.jiraAccountId}
                      </code>
                    : <span className="text-xs text-gray-300">미설정</span>}
                </td>
                <td className="px-3 py-3 text-center">
                  <button onClick={() => toggleActive(m.id)}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-colors
                      ${m.active
                        ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {m.active ? '활성' : '비활성'}
                  </button>
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => handleEdit(m)}
                      className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDelete(m.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
