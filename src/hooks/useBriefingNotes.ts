import { useEffect, useState } from 'react';
import { format } from 'date-fns';

const PROXY_BASE = window.location.hostname === 'localhost'
  ? '/jira-proxy'
  : 'https://jira-proxy.ye-park.workers.dev/jira-proxy';

interface BriefingNotes {
  date: string;
  notes: string[];
}

// 매일 아침 브리핑 자동화가 Worker에 남겨둔 요약 노트를 가져온다.
// 오늘 날짜로 남겨진 노트가 없으면 빈 배열 — 섹션은 호출부에서 숨긴다.
export function useBriefingNotes(): string[] {
  const [notes, setNotes] = useState<string[]>([]);

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    fetch(`${PROXY_BASE}/briefing-notes`)
      .then(res => res.ok ? res.json() : null)
      .then((data: BriefingNotes | null) => {
        if (data && data.date === today && Array.isArray(data.notes)) {
          setNotes(data.notes);
        }
      })
      .catch(() => { /* 조용히 무시 — 노트는 있으면 보너스 */ });
  }, []);

  return notes;
}
