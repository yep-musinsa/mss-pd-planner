import { useEffect, useState, useCallback } from 'react';
import type { AttendanceMap, WorkMode } from '../types';

const PROXY_BASE = window.location.hostname === 'localhost'
  ? '/jira-proxy'
  : 'https://jira-proxy.ye-park.workers.dev/jira-proxy';

// 출근 현황을 KV에서 불러오고, 셀 단위로 저장한다.
export function useAttendance() {
  const [attendance, setAttendance] = useState<AttendanceMap>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    fetch(`${PROXY_BASE}/attendance`)
      .then(res => res.ok ? res.json() : {})
      .then((data: AttendanceMap) => setAttendance(data ?? {}))
      .catch(() => { /* 조용히 무시 */ })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // 한 셀 업데이트 — 낙관적 반영 후 서버 저장
  const setCell = useCallback((memberId: string, date: string, status: WorkMode | '') => {
    setAttendance(prev => {
      const next: AttendanceMap = { ...prev, [memberId]: { ...(prev[memberId] ?? {}) } };
      if (status) next[memberId][date] = status;
      else delete next[memberId][date];
      return next;
    });
    fetch(`${PROXY_BASE}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, date, status }),
    }).catch(() => { /* 실패 시 다음 reload에서 보정 */ });
  }, []);

  return { attendance, loading, setCell, reload };
}
