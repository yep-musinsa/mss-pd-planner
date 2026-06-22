import { useState, useRef, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';
import type { GanttItem, Member } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  members: Member[];
  onClose: () => void;
  onSave: (item: Omit<GanttItem, 'id'>) => void;
  onDelete?: () => void;
  editing?: GanttItem | null;
}

export default function AddPlanModal({ members, onClose, onSave, onDelete, editing }: Props) {
  const { user } = useAuth();
  const activeMembers = members.filter(m => m.active);
  const [form, setForm] = useState({
    title: editing?.title ?? '',
    memberId: editing?.memberId ?? '',
    startDate: editing?.startDate ?? '',
    endDate: editing?.endDate ?? '',
    note: editing?.note ?? '',
    registeredBy: editing?.registeredBy ?? (user?.name ?? ''),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [memberOpen, setMemberOpen] = useState(false);
  const memberRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!memberOpen) return;
    const h = (e: MouseEvent) => {
      if (memberRef.current && !memberRef.current.contains(e.target as Node)) setMemberOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [memberOpen]);

  const selectedMember = activeMembers.find(m => m.id === form.memberId);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = '제목을 입력해주세요';
    if (!form.startDate) e.startDate = '시작일을 선택해주세요';
    if (!form.endDate) e.endDate = '종료일을 선택해주세요';
    if (form.startDate && form.endDate && form.startDate > form.endDate)
      e.endDate = '종료일은 시작일 이후여야 합니다';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSave({
      type: 'planned',
      title: form.title,
      memberId: form.memberId,
      startDate: form.startDate,
      endDate: form.endDate,
      status: 'todo',
      note: form.note || undefined,
      registeredBy: form.registeredBy || undefined,
    });
    onClose();
  }

  const inputCls = "w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white shadow-2xl w-full max-w-lg mx-4" style={{ borderRadius: 8 }}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            {editing ? '예정 업무 수정' : '예정 업무 추가'}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 transition-colors" style={{ borderRadius: 4 }}>
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* 제목 */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">제목 *</label>
            <input
              className={`${inputCls} ${errors.title ? 'border-red-400' : ''}`}
              style={{ borderRadius: 4 }}
              placeholder="업무 / 일정 제목을 입력하세요"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
          </div>

          {/* 담당자 커스텀 드롭다운 */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">담당자 *</label>
            <div ref={memberRef} className="relative">
              <button type="button"
                onClick={() => setMemberOpen(o => !o)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 border text-sm bg-white transition-colors
                  ${errors.memberId ? 'border-red-400' : 'border-gray-200 hover:border-gray-300'}`}
                style={{ borderRadius: 4 }}>
                {selectedMember ? (
                  <>
                    {selectedMember.avatar
                      ? <img src={selectedMember.avatar} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                          style={{ background: selectedMember.color }}>{selectedMember.name[0]}</div>}
                    <span className="text-gray-800">{selectedMember.name}</span>
                  </>
                ) : form.memberId === 'unassigned' ? (
                  <>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 text-[10px] font-semibold flex-shrink-0 bg-gray-100">?</div>
                    <span className="text-gray-700">담당자 미정</span>
                  </>
                ) : (
                  <span className="text-gray-400">담당자 선택</span>
                )}
                <ChevronDown size={14} className={`ml-auto text-gray-400 transition-transform ${memberOpen ? 'rotate-180' : ''}`} />
              </button>
              {memberOpen && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 shadow-lg z-50 overflow-hidden" style={{ borderRadius: 4 }}>
                  <button type="button"
                    onClick={() => { setForm(f => ({ ...f, memberId: 'unassigned' })); setMemberOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-gray-50
                      ${form.memberId === 'unassigned' ? 'bg-indigo-50' : ''}`}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 text-[10px] font-semibold flex-shrink-0 bg-gray-100">?</div>
                    <span className={form.memberId === 'unassigned' ? 'text-indigo-700 font-medium' : 'text-gray-500'}>담당자 미정</span>
                  </button>
                  {activeMembers.map(m => (
                    <button key={m.id} type="button"
                      onClick={() => { setForm(f => ({ ...f, memberId: m.id })); setMemberOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-gray-50
                        ${form.memberId === m.id ? 'bg-indigo-50' : ''}`}>
                      {m.avatar
                        ? <img src={m.avatar} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                        : <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                            style={{ background: m.color }}>{m.name[0]}</div>}
                      <span className={form.memberId === m.id ? 'text-indigo-700 font-medium' : 'text-gray-700'}>{m.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {errors.memberId && <p className="text-red-500 text-xs mt-1">{errors.memberId}</p>}
          </div>

          {/* 날짜 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 mb-1">시작일 *</label>
              <input type="date"
                className={`${inputCls} ${errors.startDate ? 'border-red-400' : ''}`}
                style={{ borderRadius: 4 }}
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              {errors.startDate && <p className="text-red-500 text-xs mt-1">{errors.startDate}</p>}
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 mb-1">종료일 *</label>
              <input type="date"
                className={`${inputCls} ${errors.endDate ? 'border-red-400' : ''}`}
                style={{ borderRadius: 4 }}
                value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              {errors.endDate && <p className="text-red-500 text-xs mt-1">{errors.endDate}</p>}
            </div>
          </div>

          {/* 등록자 */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">등록자</label>
            <div className="px-3 py-2 text-sm bg-gray-50 border border-gray-200"
              style={{ borderRadius: 4, color: form.registeredBy ? '#374151' : '#9ca3af' }}>
              {form.registeredBy || '로그인 사용자 자동 입력'}
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">메모 (선택)</label>
            <textarea
              className={`${inputCls} resize-none`}
              style={{ borderRadius: 4 }}
              rows={2}
              placeholder="추가 설명이 있으면 입력해주세요"
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          </div>

          {/* 버튼 */}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
              style={{ borderRadius: 4 }}>
              취소
            </button>
            <button type="submit"
              className="flex-1 py-2.5 bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-colors"
              style={{ borderRadius: 4 }}>
              {editing ? '저장' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
