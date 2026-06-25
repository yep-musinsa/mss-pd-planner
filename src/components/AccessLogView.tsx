import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface LogEntry {
  email: string;
  name: string;
  time: string;
  ua: string;
}

const PROXY_BASE = window.location.hostname === 'localhost'
  ? '/jira-proxy'
  : 'https://jira-proxy.ye-park.workers.dev/jira-proxy';

export default function AccessLogView({ email }: { email: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${PROXY_BASE}/access-log?email=${encodeURIComponent(email)}`);
      if (!res.ok) throw new Error('권한 없음');
      setLogs(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function fmt(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
  }

  function device(ua: string) {
    if (/iPhone|iPad/.test(ua)) return '📱 iOS';
    if (/Android/.test(ua)) return '📱 Android';
    if (/Mac/.test(ua)) return '💻 Mac';
    if (/Windows/.test(ua)) return '🖥 Windows';
    return '🌐';
  }

  return (
    <div className="max-w-3xl mx-auto py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">접속 로그</h2>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16 text-gray-400 text-sm">불러오는 중...</div>
      ) : logs.length === 0 ? (
        <div className="flex justify-center py-16 text-gray-300 text-sm">로그 없음</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">시간 (KST)</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">이름</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">이메일</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">기기</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-2.5 text-gray-600 font-mono text-xs whitespace-nowrap">{fmt(log.time)}</td>
                  <td className="px-4 py-2.5 text-gray-800 font-medium">{log.name || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{log.email}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{device(log.ua)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-300 px-4 py-2">최근 {logs.length}건</p>
        </div>
      )}
    </div>
  );
}
