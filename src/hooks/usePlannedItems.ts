import { useState, useEffect, useCallback } from 'react';
import type { GanttItem } from '../types';

const IS_LOCAL = window.location.hostname === 'localhost';
const WORKER_BASE = 'https://jira-proxy.ye-park.workers.dev';
const LOCAL_KEY = 'pd-planner-planned';

// 로컬: localStorage / 배포: Worker KV
async function fetchPlanned(): Promise<GanttItem[]> {
  if (IS_LOCAL) {
    try { const s = localStorage.getItem(LOCAL_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  }
  try {
    const res = await fetch(`${WORKER_BASE}/jira-proxy/planned`);
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
    await fetch(`${WORKER_BASE}/jira-proxy/planned`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(planned),
    });
  } catch { /* ignore */ }
}

export function usePlannedItems() {
  const [plannedItems, setPlannedItems] = useState<GanttItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlanned().then(items => {
      setPlannedItems(items);
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
