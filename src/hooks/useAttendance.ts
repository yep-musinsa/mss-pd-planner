import { useEffect, useState, useCallback } from 'react';
import type { AttendanceMap, WorkMode } from '../types';
import { apiFetch } from '../lib/api';

// 출근 현황을 KV에서 불러오고, 셀 단위로 저장한다.
export function useAttendance() {
  const [attendance, setAttendance] = useState<AttendanceMap>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    apiFetch('/attendance')
      .then(res => res.ok ? res.json() : {})
      .then((data: AttendanceMap) => setAttendance(data ?? {}))
      .catch(() => { /* 조용히 무시 */ })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // 한 셀 업데이트 — 낙관적 반영 후 서버 저장, 서버가 거절하면 다시 불러와 되돌린다
  const setCell = useCallback((memberId: string, date: string, status: WorkMode | '') => {
    setAttendance(prev => {
      const next: AttendanceMap = { ...prev, [memberId]: { ...(prev[memberId] ?? {}) } };
      if (status) next[memberId][date] = status;
      else delete next[memberId][date];
      return next;
    });
    apiFetch('/attendance', {
      method: 'POST',
      body: JSON.stringify({ memberId, date, status }),
    })
      .then(res => { if (!res.ok) reload(); })
      .catch(() => reload());
  }, [reload]);

  return { attendance, loading, setCell, reload };
}
