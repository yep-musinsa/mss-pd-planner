import { useState, useEffect } from 'react';
import { X, ExternalLink, Pencil, Trash2, Calendar } from 'lucide-react';
import type { GanttItem, Member } from '../types';
import { STATUS_COLOR, STATUS_LABEL } from '../data';

interface Props {
  item: GanttItem;
  member?: Member;
  memberItems?: GanttItem[]; // 담당자의 전체 일정
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  // 이니셔티브 커스텀 타이틀
  customTitle?: string;
  onSaveCustomTitle?: (title: string) => void;
}

const STATUS_DOT: Record<string, string> = {
  todo: '#a5b4fc', in_progress: '#6366f1', done: '#22c55e', hold: '#f59e0b',
};

export default function ItemDetailPanel({ item, member, memberItems = [], onClose, onEdit, onDelete, customTitle, onSaveCustomTitle }: Props) {
  const isPlanned    = item.type === 'planned';
  const isInitiative = item.issueType === 'Initiative';
  const [titleInput, setTitleInput] = useState(customTitle ?? '');
  useEffect(() => { setTitleInput(customTitle ?? ''); }, [customTitle]);

  // 담당자의 현재 진행 중 + 예정 일정 (완료 제외, 날짜 있는 것만, 현재 아이템 제외)
  const scheduleItems = memberItems
    .filter(i => i.id !== item.id && i.status !== 'done' && !i.noDates && i.startDate && i.endDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 5);

  return (
    <div className="fixed inset-0 z-40 flex justify-end pointer-events-none">
      {/* 딤 배경 */}
      <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />

      {/* 패널 */}
      <div className="relative pointer-events-auto w-80 bg-white h-full shadow-2xl flex flex-col border-l border-gray-200 animate-[slideIn_0.2s_ease]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-white"
              style={{ background: isPlanned ? '#94a3b8' : STATUS_COLOR[item.status] }}>
              {isPlanned ? `✦ 예정${item.category ? ` · ${item.category}` : ''}` : STATUS_LABEL[item.status]}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* 제목 */}
          <div>
            <h3 className="text-base font-bold text-gray-900 leading-snug">{item.title}</h3>
            {item.jiraKey && (
              <a href={item.jiraUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 mt-1.5 text-indigo-500 text-xs font-medium hover:underline">
                <ExternalLink size={12} />
                {item.jiraKey}
              </a>
            )}
          </div>

          {/* 커스텀 타이틀 (Initiative 전용) */}
          {isInitiative && onSaveCustomTitle && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">차트 표시 타이틀</p>
              <input
                type="text"
                value={titleInput}
                onChange={e => setTitleInput(e.target.value)}
                placeholder="입력하지 않으면 Jira 티켓명으로 표시"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => onSaveCustomTitle(titleInput.trim())}
                  className="flex-1 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors">
                  저장
                </button>
                {titleInput && (
                  <button
                    onClick={() => { setTitleInput(''); onSaveCustomTitle(''); }}
                    className="px-3 py-1.5 rounded-lg bg-gray-50 text-gray-500 text-xs font-medium hover:bg-gray-100 transition-colors">
                    초기화
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 일정 */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">일정</p>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Calendar size={14} className="text-gray-400" />
              <span>{item.startDate}</span>
              <span className="text-gray-300">→</span>
              <span>{item.endDate}</span>
            </div>
          </div>

          {/* 담당자 + 담당자 일정 */}
          {member && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">담당자 일정</p>
              {/* 담당자 정보 */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ background: member.color }}>
                  {member.name.slice(0, 1)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{member.name}</p>
                  <p className="text-xs text-gray-400">{member.email}</p>
                </div>
              </div>
              {/* 담당자 현재 일정 목록 */}
              {scheduleItems.length > 0 ? (
                <div className="space-y-1.5">
                  {scheduleItems.map(si => (
                    <div key={si.id} className="flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                        style={{ background: STATUS_DOT[si.status] ?? '#94a3b8' }} />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-700 truncate leading-snug">{si.title}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{si.startDate} → {si.endDate}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-300 pl-1">진행 중인 일정 없음</p>
              )}
            </div>
          )}

          {/* 요청자 */}
          {item.registeredBy && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">요청자</p>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-[10px] font-bold flex-shrink-0">
                  {item.registeredBy.slice(0, 1)}
                </div>
                <p className="text-sm text-gray-700 font-medium">{item.registeredBy}</p>
              </div>
            </div>
          )}

          {/* 메모 */}
          {item.note && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">메모</p>
              <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-lg px-3 py-2">{item.note}</p>
            </div>
          )}

          {/* Jira URL */}
          {item.jiraUrl && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Jira</p>
              <a href={item.jiraUrl} target="_blank" rel="noreferrer"
                className="text-xs text-indigo-500 hover:underline break-all">{item.jiraUrl}</a>
            </div>
          )}
        </div>

        {/* 하단 액션 (예정 업무만 편집 가능) */}
        {isPlanned && (
          <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
            <button onClick={onEdit}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 transition-colors">
              <Pencil size={14} />수정
            </button>
            <button onClick={onDelete}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors">
              <Trash2 size={14} />삭제
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
