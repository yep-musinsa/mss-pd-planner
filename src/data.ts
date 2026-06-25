import type { Member } from './types';

export const MEMBERS: Member[] = [
  { id: 'm1', name: '김선경', email: 'seonkyung.kim@musinsa.com', color: '#6366f1', active: true, jiraAccountId: '712020:ee34afa8-0ab5-46f4-bc17-37fa25a14aa1' },
  { id: 'm2', name: '류진한', email: 'jinhan.ryu@musinsa.com',   color: '#0ea5e9', active: true, jiraAccountId: '712020:3221df48-36b6-43ce-9fd3-bd30f9fc3d5a' },
  { id: 'm3', name: '박영은', email: 'ye.park@musinsa.com',       color: '#10b981', active: true, jiraAccountId: '712020:e6c24002-8ccc-4fd1-8ce2-8f8d16efd31d' },
  { id: 'm4', name: '유호재', email: 'hojae.yoo@musinsa.com',     color: '#f59e0b', active: true, jiraAccountId: '712020:52d76173-a3ed-4aa5-b844-c6729bf302a6' },
  { id: 'm5', name: '이미희', email: 'mihee.lee@29cm.co.kr',      color: '#ec4899', active: true, jiraAccountId: '712020:f113f08a-fdf5-423e-b2f5-e68298ab0070' },
  { id: 'm6', name: '이지향', email: 'scent.lee@29cm.co.kr',      color: '#8b5cf6', active: true, jiraAccountId: '712020:9842fd46-fe95-4bff-a47b-644980525b88' },
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
