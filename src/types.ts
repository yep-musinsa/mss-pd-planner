export type ItemType = 'jira' | 'planned';
export type ItemStatus = 'todo' | 'in_progress' | 'done' | 'hold';
export type ViewMode = 'gantt' | 'dashboard' | 'members' | 'settings';

export interface Member {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  color: string;
  active: boolean;
  jiraAccountId?: string; // Jira API 연동용
}

export interface GanttItem {
  id: string;
  type: ItemType;
  title: string;
  memberId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  status: ItemStatus;
  // Jira 전용
  jiraKey?: string;
  jiraUrl?: string;
  epicName?: string;
  initiativeKey?: string; // Epic이 속한 Initiative의 jiraKey
  labels?: string[];      // Jira 라벨 (Initiative 전용)
  issueType?: string;
  // 예정 업무 전용
  note?: string;
  category?: string;
  registeredBy?: string;
  // 날짜 미입력
  noDates?: boolean;
}

export interface JiraSettings {
  baseUrl: string;       // e.g. musinsa.atlassian.net
  email: string;
  apiToken: string;
  jql: string;           // simple 모드: 직접 JQL / tiered 모드: Tier1 Initiative JQL
  syncMode?: 'simple' | 'tiered'; // 동기화 방식 (기본: tiered)
  lastSynced?: string;
}
