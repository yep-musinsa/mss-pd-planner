import { useState, useEffect, useCallback } from 'react';
import type { GanttItem } from '../types';
import { IS_LOCAL, apiFetch } from '../lib/api';

const LOCAL_KEY = 'pd-planner-planned';

// 로컬: localStorage / 배포: Worker KV
async function fetchPlanned(): Promise<GanttItem[]> {
  if (IS_LOCAL) {
    try { const s = localStorage.getItem(LOCAL_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  }
  try {
    const res = await apiFetch('/planned');
    return res.ok ? await res.json() : [];
  } catch { return []; }
}

async function savePlanned(items: GanttItem[]): Promise<void> {
  const planned = items.filter(i => i.type === 'planned');
  if (IS_LOCAL) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(planned));
    return;
  }
  try {
    await apiFetch('/planned', {
      method: 'POST',
      body: JSON.stringify(planned),
    });
  } catch { /* ignore */ }
}

export function usePlannedItems() {
  const [plannedItems, setPlannedItems] = useState<GanttItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlanned().then(items => {
      // 중복 ID 제거 (여러 사용자가 같은 ID로 추가했을 경우 대비)
      const seen = new Set<string>();
      const deduped = items.filter(i => {
        if (seen.has(i.id)) return false;
        seen.add(i.id);
        return true;
      });
      setPlannedItems(deduped);
      setLoading(false);
    });
  }, []);

  const updatePlanned = useCallback(async (items: GanttItem[]) => {
    const planned = items.filter(i => i.type === 'planned');
    setPlannedItems(planned);
    await savePlanned(items);
  }, []);

  return { plannedItems, loading, updatePlanned };
}
