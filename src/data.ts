import type { Member, GanttItem } from './types';

export const MEMBERS: Member[] = [
  { id: 'm1', name: '김선경', email: 'seonkyung.kim@musinsa.com', color: '#6366f1', active: true, jiraAccountId: '712020:ee34afa8-0ab5-46f4-bc17-37fa25a14aa1' },
  { id: 'm2', name: '류진한', email: 'jinhan.ryu@musinsa.com',   color: '#0ea5e9', active: true, jiraAccountId: '712020:3221df48-36b6-43ce-9fd3-bd30f9fc3d5a' },
  { id: 'm3', name: '박영은', email: 'ye.park@musinsa.com',       color: '#10b981', active: true, jiraAccountId: '712020:e6c24002-8ccc-4fd1-8ce2-8f8d16efd31d' },
  { id: 'm4', name: '유호재', email: 'hojae.yoo@musinsa.com',     color: '#f59e0b', active: true, jiraAccountId: '712020:52d76173-a3ed-4aa5-b844-c6729bf302a6' },
  { id: 'm5', name: '이미희', email: 'mihee.lee@29cm.co.kr',      color: '#ec4899', active: true, jiraAccountId: '712020:f113f08a-fdf5-423e-b2f5-e68298ab0070' },
  { id: 'm6', name: '이지향', email: 'scent.lee@29cm.co.kr',      color: '#8b5cf6', active: true, jiraAccountId: '712020:9842fd46-fe95-4bff-a47b-644980525b88' },
];

export const SAMPLE_ITEMS: GanttItem[] = [
  // 김선경 - Jira 기반
  {
    id: 'j1', type: 'jira', title: '[1-A-2] 파트너 통합 인가 Ph.2: 일반계정 관한',
    memberId: 'm1', startDate: '2025-12-17', endDate: '2026-02-27',
    status: 'in_progress', jiraKey: 'TH-1891',
    jiraUrl: 'https://musinsa.atlassian.net/browse/TH-1891', epicName: 'Initiative',
  },
  {
    id: 'j2', type: 'jira', title: '[MSSnE Claim] 일반계정 관한 세분화',
    memberId: 'm1', startDate: '2026-01-01', endDate: '2026-02-02',
    status: 'done', jiraKey: 'CLM-28', jiraUrl: 'https://musinsa.atlassian.net/browse/CLM-28', epicName: 'Epic',
  },
  {
    id: 'j3', type: 'jira', title: '[UX] 마케팅 구좌신청 UI설계/디자인',
    memberId: 'm1', startDate: '2025-11-24', endDate: '2025-11-25',
    status: 'done', jiraKey: 'PD-6488', jiraUrl: 'https://musinsa.atlassian.net/browse/PD-6488', epicName: 'Task',
  },

  // 류진한 - Jira 기반
  {
    id: 'j4', type: 'jira', title: '티블 글로벌 연동 (ETA: 5/27)',
    memberId: 'm2', startDate: '2025-12-01', endDate: '2026-05-27',
    status: 'in_progress', jiraKey: 'TH-1982',
    jiraUrl: 'https://musinsa.atlassian.net/browse/TH-1982', epicName: 'Initiative',
  },
  {
    id: 'j5', type: 'jira', title: 'M6. 티블 글로벌 정산시스템 연동',
    memberId: 'm2', startDate: '2026-04-06', endDate: '2026-05-05',
    status: 'done', jiraKey: 'CBPSE-...',
    jiraUrl: 'https://musinsa.atlassian.net/browse/CBPSE', epicName: 'Epic',
  },

  // 박영은 - Jira 기반
  {
    id: 'j6', type: 'jira', title: '[PD] 파트너 통합 인증/인가 Phase2',
    memberId: 'm3', startDate: '2026-01-12', endDate: '2026-02-14',
    status: 'done', jiraKey: 'PD-7368',
    jiraUrl: 'https://musinsa.atlassian.net/browse/PD-7368', epicName: 'Epic',
  },

  // 유호재 - Jira 기반
  {
    id: 'j7', type: 'jira', title: '[1-A-2] 파트너 통합 인가 Ph.2 (유호재)',
    memberId: 'm4', startDate: '2025-12-17', endDate: '2026-02-27',
    status: 'in_progress', jiraKey: 'TH-1891',
    jiraUrl: 'https://musinsa.atlassian.net/browse/TH-1891', epicName: 'Initiative',
  },
  {
    id: 'j8', type: 'jira', title: 'ISMS PGI - 파트너 통합 인증 V3 전환',
    memberId: 'm4', startDate: '2026-01-12', endDate: '2026-02-02',
    status: 'done', jiraKey: 'SID-15',
    jiraUrl: 'https://musinsa.atlassian.net/browse/SID-15', epicName: 'Epic',
  },

  // 이미희 - Jira 기반
  {
    id: 'j9', type: 'jira', title: '[MSSnE Pricing] 파트너서비스 일반계정 관한',
    memberId: 'm5', startDate: '2026-01-01', endDate: '2026-03-01',
    status: 'in_progress', jiraKey: 'SALEPR-...',
    jiraUrl: 'https://musinsa.atlassian.net/browse/SALEPR', epicName: 'Epic',
  },

  // 이지향 - Jira 기반
  {
    id: 'j10', type: 'jira', title: 'PO 상품/재고 계정 관련 분리 (개발)',
    memberId: 'm6', startDate: '2026-01-01', endDate: '2026-02-27',
    status: 'hold', jiraKey: 'PPRD-1',
    jiraUrl: 'https://musinsa.atlassian.net/browse/PPRD-1', epicName: 'Epic',
  },

  // ── 예정 업무 (planned) ──────────────────────────────────────
  {
    id: 'p1', type: 'planned', title: 'Q3 신규 프로젝트 기획 착수',
    memberId: 'm1', startDate: '2026-07-01', endDate: '2026-07-31',
    status: 'todo', category: '기획', note: 'Q3 OKR 연계 신규 피처 기획',
  },
  {
    id: 'p2', type: 'planned', title: '파트너센터 개편 2차 준비',
    memberId: 'm2', startDate: '2026-06-15', endDate: '2026-08-15',
    status: 'todo', category: '개발', note: '1차 완료 후 2차 범위 확정 예정',
  },
  {
    id: 'p3', type: 'planned', title: '연차 (7/14~7/18)',
    memberId: 'm3', startDate: '2026-07-14', endDate: '2026-07-18',
    status: 'todo', category: '휴가',
  },
  {
    id: 'p4', type: 'planned', title: 'Q3 정산 시스템 검토',
    memberId: 'm4', startDate: '2026-07-07', endDate: '2026-08-31',
    status: 'todo', category: '기획', note: '외부 벤더 미팅 포함',
  },
  {
    id: 'p5', type: 'planned', title: '디자인 시스템 정비',
    memberId: 'm5', startDate: '2026-06-20', endDate: '2026-07-20',
    status: 'todo', category: '디자인',
  },
  {
    id: 'p6', type: 'planned', title: '세미나 발표 준비',
    memberId: 'm6', startDate: '2026-07-01', endDate: '2026-07-10',
    status: 'todo', category: '기타', note: '사내 테크톡 발표',
  },
];

export const CATEGORIES = ['기획', '개발', '디자인', 'QA', '휴가', '교육', '기타'];

export const STATUS_LABEL: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
  hold: 'Hold',
};

export const STATUS_COLOR: Record<string, string> = {
  todo: '#94a3b8',
  in_progress: '#3b82f6',
  done: '#22c55e',
  hold: '#f59e0b',
};
