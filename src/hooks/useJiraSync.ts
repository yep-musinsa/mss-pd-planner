import { useState } from 'react';
import type { GanttItem, JiraSettings, Member } from '../types';

const STATUS_MAP: Record<string, GanttItem['status']> = {
  'To Do': 'todo', '할 일': 'todo', 'Open': 'todo', 'Backlog': 'todo',
  'In Progress': 'in_progress', '진행 중': 'in_progress', 'In Review': 'in_progress',
  'SUGGESTED': 'todo', 'Suggested': 'todo',
  'In Design': 'in_progress', 'In Development': 'in_progress', 'In Review/QA': 'in_progress',
  'Done': 'done', '완료': 'done', 'Closed': 'done', 'Resolved': 'done',
  'HOLD': 'hold', 'Hold': 'hold', 'On Hold': 'hold', '보류': 'hold',
};

interface JiraIssue {
  id: string;
  key: string;
  fields: Record<string, unknown> & {
    summary: string;
    status: { name: string };
    assignee: { accountId?: string; name?: string; displayName: string } | null;
    issuetype: { name: string };
    parent?: { key: string; fields: { summary: string } };
    duedate?: string;
  };
}

// 확인된 날짜 필드: customfield_10015 = 시작 날짜, duedate = 종료일
const START_FIELDS = ['customfield_10015', 'customfield_10020', 'customfield_10014'];
const END_FIELDS   = ['duedate', 'customfield_10016', 'customfield_10021'];

function extractDate(fields: Record<string, unknown>, candidates: string[]): string {
  for (const f of candidates) {
    const v = fields[f];
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  return '';
}

function findMember(assignee: JiraIssue['fields']['assignee'], members: Member[]): Member | undefined {
  if (!assignee) return undefined;
  return members.find(m =>
    (assignee.accountId && m.jiraAccountId === assignee.accountId) ||
    (assignee.name      && m.jiraAccountId === assignee.name)
  );
}

function issueToItem(
  issue: JiraIssue,
  members: Member[],
  baseUrl: string,
  epicName?: string,
  allowNoDates = false,
): GanttItem | null {
  const member = findMember(issue.fields.assignee, members);
  if (!member) return null;

  const startDate = extractDate(issue.fields, START_FIELDS);
  const endDate   = extractDate(issue.fields, END_FIELDS);

  if (!startDate || !endDate) {
    if (!allowNoDates) return null;
    const today = new Date().toISOString().slice(0, 10);
    return {
      id: `jira-${issue.key}`,
      type: 'jira',
      title: issue.fields.summary,
      memberId: member.id,
      startDate: today,
      endDate: today,
      status: STATUS_MAP[issue.fields.status.name] ?? 'in_progress',
      jiraKey: issue.key,
      jiraUrl: `https://${baseUrl}/browse/${issue.key}`,
      issueType: issue.fields.issuetype.name,
      epicName: epicName ?? (issue.fields.parent?.fields?.summary),
      noDates: true,
    };
  }

  return {
    id: `jira-${issue.key}`,
    type: 'jira',
    title: issue.fields.summary,
    memberId: member.id,
    startDate,
    endDate,
    status: STATUS_MAP[issue.fields.status.name] ?? 'in_progress',
    jiraKey: issue.key,
    jiraUrl: `https://${baseUrl}/browse/${issue.key}`,
    issueType: issue.fields.issuetype.name,
    epicName: epicName ?? (issue.fields.parent?.fields?.summary),
  };
}

export function buildAssigneeJql(members: Member[]): string {
  const ids = members
    .filter(m => m.active && m.jiraAccountId)
    .map(m => `"${m.jiraAccountId!}"`)
    .join(', ');
  return ids ? `assignee in (${ids})` : '';
}

// ── API 헬퍼 ──────────────────────────────────────────────────
const IS_PROD = window.location.hostname !== 'localhost';
const API_BASE = IS_PROD
  ? '/.netlify/functions/jira-proxy/rest/api/3'
  : '/jira-api/rest/api/3';
const DATE_FIELDS = ['summary', 'status', 'assignee', 'issuetype', 'parent',
  'duedate', ...START_FIELDS, ...END_FIELDS].join(',');

async function fetchAllIssues(
  jql: string,
  fields: string,
  authHeader: string,
  onProgress?: (n: number) => void,
): Promise<JiraIssue[]> {
  const all: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  while (true) {
    const params: Record<string, string> = { jql, maxResults: '100', fields };
    if (nextPageToken) params.nextPageToken = nextPageToken;

    const res = await fetch(`${API_BASE}/search/jql?${new URLSearchParams(params)}`, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
    });

    if (res.status === 401) throw new Error('인증 실패 — 이메일/토큰을 확인해주세요');
    if (res.status === 400) {
      const body = await res.json().catch(() => ({})) as { errorMessages?: string[] };
      throw new Error(`JQL 오류: ${body.errorMessages?.join(', ') ?? 'JQL을 확인해주세요'}\n쿼리: ${jql.slice(0, 100)}`);
    }
    if (!res.ok) throw new Error(`Jira API 오류 (${res.status})`);

    const data = await res.json() as { issues: JiraIssue[]; isLast: boolean; nextPageToken?: string };
    all.push(...data.issues);
    onProgress?.(all.length);

    if (data.isLast || !data.nextPageToken || data.issues.length === 0) break;
    nextPageToken = data.nextPageToken;
  }
  return all;
}

function chunkKeys(keys: string[], size = 80): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += size) chunks.push(keys.slice(i, i + size));
  return chunks;
}

// ── 3-Tier 동기화 ─────────────────────────────────────────────
async function syncTiered(
  settings: JiraSettings,
  members: Member[],
  authHeader: string,
  setProgress: (s: string) => void,
): Promise<GanttItem[]> {
  const assigneeClause = buildAssigneeJql(members);

  // ── Tier 1: Initiative (full fields for display) ──
  setProgress('Tier 1 — Initiative 조회 중...');
  const tier1Issues = await fetchAllIssues(
    settings.jql,
    DATE_FIELDS,
    authHeader,
    n => setProgress(`Tier 1 — Initiative ${n}건 조회 중...`),
  );
  if (tier1Issues.length === 0) {
    throw new Error('Tier 1 JQL 결과가 없습니다. Initiative JQL을 확인해주세요.');
  }
  const tier1Keys = tier1Issues.map(i => i.key);
  setProgress(`Tier 1 완료 — Initiative ${tier1Keys.length}건`);

  // ── Tier 2: Epic (full fields for display) ──
  setProgress('Tier 2 — Epic 조회 중...');
  const tier2Issues: JiraIssue[] = [];
  for (const chunk of chunkKeys(tier1Keys)) {
    const jql2 = `parent in (${chunk.map(k => `"${k}"`).join(',')})`;
    const issues = await fetchAllIssues(jql2, DATE_FIELDS, authHeader);
    tier2Issues.push(...issues);
    setProgress(`Tier 2 — Epic ${tier2Issues.length}건 조회 중...`);
  }
  if (tier2Issues.length === 0) {
    throw new Error('Tier 2 (Epic) 결과가 없습니다.');
  }
  const tier2Keys = tier2Issues.map(i => i.key);

  // Epic 이름 맵 (tier3에서도 사용)
  const epicMap: Record<string, string> = {};
  tier2Issues.forEach(e => { epicMap[e.key] = e.fields.summary; });

  // Initiative 이름 맵 (Epic의 parent)
  const initiativeMap: Record<string, string> = {};
  tier1Issues.forEach(i => { initiativeMap[i.key] = i.fields.summary; });

  // Tier2 → GanttItems (팀원 배정된 것만)
  const tier2Items = tier2Issues.flatMap(i => {
    const parentKey = (i.fields.parent as { key?: string } | undefined)?.key;
    const epicName = parentKey ? initiativeMap[parentKey] : undefined;
    const item = issueToItem(i, members, settings.baseUrl, epicName);
    return item ? [item] : [];
  });
  setProgress(`Tier 2 완료 — Epic ${tier2Keys.length}건 (팀 배정: ${tier2Items.length}건)`);

  // ── Tier 3: Task (날짜 없는 것도 포함) ──
  setProgress('Tier 3 — Task 조회 중...');
  const tier3Items: GanttItem[] = [];
  let fetched = 0;

  for (const chunk of chunkKeys(tier2Keys)) {
    const parentClause = `parent in (${chunk.map(k => `"${k}"`).join(',')})`;
    const jql3Parts = [parentClause];
    if (assigneeClause) jql3Parts.push(assigneeClause);
    const jql3 = jql3Parts.join(' AND ') + ' ORDER BY duedate ASC';

    const issues = await fetchAllIssues(
      jql3,
      DATE_FIELDS,
      authHeader,
      n => setProgress(`Tier 3 — Task ${fetched + n}건 조회 중...`),
    );

    for (const issue of issues) {
      const parentKey = (issue.fields.parent as { key?: string } | undefined)?.key;
      const epicName = parentKey ? epicMap[parentKey] : undefined;
      const item = issueToItem(issue, members, settings.baseUrl, epicName, true); // allowNoDates=true
      if (item) tier3Items.push(item);
    }
    fetched += issues.length;
  }

  // 중복 제거 (같은 Jira Key는 하위 Tier 우선)
  const seen = new Set<string>();
  const allItems: GanttItem[] = [];
  for (const item of [...tier3Items, ...tier2Items]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      allItems.push(item);
    }
  }

  return allItems;
}

// ── Simple 동기화 (기존 방식) ──────────────────────────────────
async function syncSimple(
  settings: JiraSettings,
  members: Member[],
  authHeader: string,
  setProgress: (s: string) => void,
): Promise<GanttItem[]> {
  const assigneeClause = buildAssigneeJql(members);
  const rawJql = settings.jql.trim();
  const orderByIdx = rawJql.toUpperCase().lastIndexOf('ORDER BY');
  const baseJql = orderByIdx >= 0 ? rawJql.slice(0, orderByIdx).trim() : rawJql;
  const orderBy = orderByIdx >= 0 ? rawJql.slice(orderByIdx) : 'ORDER BY updated DESC';

  let jql: string;
  if (!baseJql) {
    jql = assigneeClause ? `${assigneeClause} ${orderBy}` : orderBy;
  } else if (assigneeClause && !baseJql.toLowerCase().includes('assignee')) {
    jql = `(${baseJql}) AND ${assigneeClause} ${orderBy}`;
  } else {
    jql = `${baseJql} ${orderBy}`;
  }

  const issues = await fetchAllIssues(
    jql, DATE_FIELDS, authHeader,
    n => setProgress(`이슈 ${n}건 조회 중...`),
  );

  const items: GanttItem[] = [];
  for (const issue of issues) {
    const item = issueToItem(issue, members, settings.baseUrl, undefined, true);
    if (item) items.push(item);
  }
  return items;
}

// ── 공개 훅 ───────────────────────────────────────────────────
export function useJiraSync() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');

  async function sync(settings: JiraSettings, members: Member[]): Promise<GanttItem[]> {
    setLoading(true);
    setError(null);
    setProgress('Jira 연결 중...');

    const isPAT = !settings.email;
    const authHeader = isPAT
      ? `Bearer ${settings.apiToken}`
      : `Basic ${btoa(`${settings.email}:${settings.apiToken}`)}`;

    try {
      let items: GanttItem[];
      const mode = settings.syncMode ?? 'tiered';

      if (mode === 'tiered') {
        items = await syncTiered(settings, members, authHeader, setProgress);
      } else {
        items = await syncSimple(settings, members, authHeader, setProgress);
      }

      const withDates = items.filter(i => !i.noDates).length;
      const noDates   = items.filter(i => i.noDates).length;
      setProgress(`완료 — ${withDates}건 매핑됨${noDates > 0 ? ` / 일정 미기입 ${noDates}건` : ''}`);
      return items;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }

  return { sync, loading, error, progress };
}
