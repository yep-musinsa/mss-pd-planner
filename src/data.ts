import type { Member } from './types';

export const MEMBERS: Member[] = [
  { id: 'm1', name: '김선경', email: 'seonkyung.kim@musinsa.com', color: '#6366f1', active: true, jiraAccountId: '712020:ee34afa8-0ab5-46f4-bc17-37fa25a14aa1' },
  { id: 'm2', name: '류진한', email: 'jinhan.ryu@musinsa.com',   color: '#0ea5e9', active: true, jiraAccountId: '712020:3221df48-36b6-43ce-9fd3-bd30f9fc3d5a' },
  { id: 'm3', name: '박영은', email: 'ye.park@musinsa.com',       color: '#10b981', active: true, jiraAccountId: '712020:e6c24002-8ccc-4fd1-8ce2-8f8d16efd31d' },
  { id: 'm4', name: '유호재', email: 'hojae.yoo@musinsa.com',     color: '#f59e0b', active: true, jiraAccountId: '712020:52d76173-a3ed-4aa5-b844-c6729bf302a6' },
  { id: 'm5', name: '이미희', email: 'mihee.lee@29cm.co.kr',      color: '#ec4899', active: true, jiraAccountId: '712020:f113f08a-fdf5-423e-b2f5-e68298ab0070' },
  { id: 'm6', name: '이지향', email: 'scent.lee@musinsa.com',     color: '#8b5cf6', active: true, jiraAccountId: '712020:9842fd46-fe95-4bff-a47b-644980525b88' },
];


// 대한민국 공휴일 (YYYY-MM-DD → 명칭). 매년 갱신 필요.
export const KR_HOLIDAYS: Record<string, string> = {
  // 2026
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '대체공휴일',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '대체공휴일',
  '2026-06-06': '현충일',
  '2026-08-15': '광복절',
  '2026-08-17': '대체공휴일',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절',
  '2026-10-05': '대체공휴일',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',
};

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
