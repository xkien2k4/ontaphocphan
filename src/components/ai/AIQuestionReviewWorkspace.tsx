import React, { useState } from 'react';
import { AIGeneratedQuestion, Subject, User, BloomLevel, DifficultyLevel } from '../../types';
import {
  CheckCircle, XCircle, Trash2, Edit3, Check, Search, Filter,
  BookOpen, AlertCircle, FileText, CheckCheck, Save
} from 'lucide-react';
import {
  approveAIGeneratedQuestion, rejectAIGeneratedQuestion,
  deleteAIGeneratedQuestion, saveAIGeneratedQuestion
} from '../../services/storageService';

interface AIQuestionReviewWorkspaceProps {
  currentUser: User;
  questions: AIGeneratedQuestion[];
  subjects: Subject[];
  onRefreshData: () => void;
  onOpenGenerator: () => void;
}

export const AIQuestionReviewWorkspace: React.FC<AIQuestionReviewWorkspaceProps> = ({
  currentUser,
  questions,
  subjects,
  onRefreshData,
  onOpenGenerator,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('pending_review');
  const [search, setSearch] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>('');
  const [editExplanation, setEditExplanation] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [rejectModalQ, setRejectModalQ] = useState<AIGeneratedQuestion | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('Nội dung chưa sát với chuẩn đầu ra');
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    tone: 'danger' | 'success';
    onConfirm: () => void;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const allowedSubjectIds = subjects.map(s => s.id);
  const scopedQuestions = subjects.length > 0
    ? questions.filter(q => allowedSubjectIds.includes(q.subjectId))
    : questions;

  const filtered = scopedQuestions.filter((q) => {
    const matchSub = selectedSubject === 'all' || q.subjectId === selectedSubject;
    const matchStatus = statusFilter === 'all' || q.status === statusFilter;
    const matchSearch =
      (q.content || '').toLowerCase().includes(search.toLowerCase()) ||
      (q.documentTitle || '').toLowerCase().includes(search.toLowerCase()) ||
      (q.explanation || '').toLowerCase().includes(search.toLowerCase());
    return matchSub && matchStatus && matchSearch;
  });

  const pendingCount = scopedQuestions.filter(q => q.status === 'pending_review').length;
  const approvedCount = scopedQuestions.filter(q => q.status === 'approved').length;
  const rejectedCount = scopedQuestions.filter(q => q.status === 'rejected').length;

  const handleStartEdit = (q: AIGeneratedQuestion) => {
    setEditingId(q.id);
    setEditContent(q.content);
    setEditExplanation(q.explanation);
  };

  const handleSaveEdit = (q: AIGeneratedQuestion) => {
    if (!editContent.trim()) {
      showToast('Nội dung câu hỏi không được để trống.');
      return;
    }
    const updated = {
      ...q,
      content: editContent.trim(),
      explanation: editExplanation.trim(),
    };
    saveAIGeneratedQuestion(updated);
    setEditingId(null);
    onRefreshData();
    showToast('Đã lưu nội dung chỉnh sửa câu hỏi!');
  };

  const handleApprove = (q: AIGeneratedQuestion) => {
    approveAIGeneratedQuestion(q.id, currentUser);
    onRefreshData();
    showToast(`Đã duyệt câu hỏi và đưa vào Ngân hàng chính thức!`);
  };

  const handleReject = (q: AIGeneratedQuestion) => {
    setRejectModalQ(q);
    setRejectReason('Nội dung chưa sát với chuẩn đầu ra');
  };

  const submitReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalQ) return;
    rejectAIGeneratedQuestion(rejectModalQ.id, currentUser, rejectReason.trim() || 'Chưa đạt yêu cầu');
    setRejectModalQ(null);
    onRefreshData();
    showToast('Đã chuyển trạng thái câu hỏi thành Từ chối.');
  };

  const handleDelete = (id: string) => {
    setConfirmModal({
      title: 'Xóa câu hỏi dự thảo',
      message: 'Bạn có chắc chắn muốn xóa câu hỏi dự thảo này khỏi danh sách?',
      confirmLabel: 'Xóa câu hỏi',
      tone: 'danger',
      onConfirm: () => {
        deleteAIGeneratedQuestion(id);
        setConfirmModal(null);
        onRefreshData();
        showToast('Đã xóa câu hỏi khỏi danh sách.');
      },
    });
  };

  const handleApproveAllPending = () => {
    const pendings = filtered.filter(q => q.status === 'pending_review');
    if (pendings.length === 0) return;
    setConfirmModal({
      title: 'Phê duyệt hàng loạt',
      message: `Bạn có chắc chắn muốn duyệt toàn bộ ${pendings.length} câu hỏi đang chờ vào ngân hàng chính thức?`,
      confirmLabel: `Duyệt ${pendings.length} câu hỏi`,
      tone: 'success',
      onConfirm: () => {
        pendings.forEach(q => approveAIGeneratedQuestion(q.id, currentUser, 'Duyệt hàng loạt'));
        setConfirmModal(null);
        onRefreshData();
        showToast(`Đã duyệt thành công ${pendings.length} câu hỏi vào ngân hàng chính thức!`);
      },
    });
  };

  const bloomLabels: Record<number, string> = {
    1: 'Bậc 1: Nhớ',
    2: 'Bậc 2: Hiểu',
    3: 'Bậc 3: Vận dụng',
    4: 'Bậc 4: Phân tích',
    5: 'Bậc 5: Đánh giá',
    6: 'Bậc 6: Sáng tạo',
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Actions */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">
            <FileText className="w-4 h-4" />
            <span>Khu vực Kiểm duyệt Câu hỏi do AI Tạo</span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
            Kiểm tra & Phê duyệt Ngân hàng Câu hỏi
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Giảng viên có toàn quyền kiểm soát, chỉnh sửa câu hỏi trước khi đưa vào ngân hàng chính thức cho sinh viên ôn tập.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {pendingCount > 0 && (
            <button
              onClick={handleApproveAllPending}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-1.5"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Duyệt tất cả ({pendingCount})</span>
            </button>
          )}

          <button
            onClick={onOpenGenerator}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1.5"
          >
            <span>Tạo thêm câu hỏi AI</span>
          </button>
        </div>
      </div>

      {toastMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-2xl text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-500" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Status tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs">
          <button
            onClick={() => setStatusFilter('pending_review')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
              statusFilter === 'pending_review'
                ? 'bg-white dark:bg-slate-900 text-amber-600 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <span>Chờ duyệt</span>
            <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-mono flex items-center justify-center font-bold">
              {pendingCount}
            </span>
          </button>

          <button
            onClick={() => setStatusFilter('approved')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
              statusFilter === 'approved'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <span>Đã duyệt</span>
            <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-mono flex items-center justify-center font-bold">
              {approvedCount}
            </span>
          </button>

          <button
            onClick={() => setStatusFilter('rejected')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
              statusFilter === 'rejected'
                ? 'bg-white dark:bg-slate-900 text-rose-600 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <span>Từ chối</span>
            <span className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 text-[10px] font-mono flex items-center justify-center font-bold">
              {rejectedCount}
            </span>
          </button>

          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
              statusFilter === 'all'
                ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Tất cả ({scopedQuestions.length})
          </button>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {subjects.length > 1 && (
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="all">Tất cả môn được giao</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Tìm nội dung, tài liệu nguồn..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>
        </div>
      </div>

      {/* Questions list */}
      <div className="space-y-4">
        {filtered.map((q, idx) => {
          const isEditing = editingId === q.id;

          return (
            <div
              key={q.id}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center flex-wrap gap-2">
                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded">
                    Câu #{idx + 1}
                  </span>
                  <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950 px-2 py-0.5 rounded">
                    {bloomLabels[q.bloomLevel] || `Bậc ${q.bloomLevel}`}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                    q.difficulty === 'easy' ? 'bg-emerald-50 text-emerald-700' :
                    q.difficulty === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                  }`}>
                    {q.difficulty === 'easy' ? 'Dễ' : q.difficulty === 'medium' ? 'Trung bình' : 'Khó'}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    q.status === 'approved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                    q.status === 'rejected' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' :
                    'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}>
                    {q.status === 'approved' ? 'Đã duyệt vào ngân hàng' :
                     q.status === 'rejected' ? 'Đã từ chối' : 'Chờ phê duyệt'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <FileText className="w-3.5 h-3.5" />
                  <span className="truncate max-w-xs">{q.documentTitle}</span>
                </div>
              </div>

              {/* Question Content */}
              {isEditing ? (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Chỉnh sửa nội dung câu hỏi:
                  </label>
                  <textarea
                    rows={3}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Chỉnh sửa lời giải & giải thích:
                  </label>
                  <textarea
                    rows={2}
                    value={editExplanation}
                    onChange={(e) => setEditExplanation(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 rounded-lg border text-xs"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={() => handleSaveEdit(q)}
                      className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center gap-1"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Lưu thay đổi</span>
                    </button>
                  </div>
                </div>
              ) : (
                <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white leading-relaxed">
                  {q.content}
                </h3>
              )}

              {/* Code Snippet if any */}
              {q.codeSnippet && (
                <div className="p-3.5 rounded-xl bg-slate-950 font-mono text-xs text-emerald-400 overflow-x-auto shadow-inner">
                  <pre>{q.codeSnippet}</pre>
                </div>
              )}

              {/* Options */}
              {q.options && q.options.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {q.options.map((opt, oIdx) => {
                    const isCorrect = Array.isArray(q.correctAnswer)
                      ? q.correctAnswer.includes(opt.id)
                      : q.correctAnswer === opt.id;

                    return (
                      <div
                        key={`${opt.id}-${oIdx}`}
                        className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                          isCorrect
                            ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 font-semibold ring-1 ring-emerald-500'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[11px] ${
                            isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                          }`}>
                            {String.fromCharCode(65 + oIdx)}
                          </span>
                          <span>{opt.text}</span>
                        </div>

                        {isCorrect && (
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Đáp án đúng
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Explanation & Source reference */}
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/20 rounded-2xl border border-blue-100 dark:border-blue-900/40 text-xs space-y-1.5">
                <div>
                  <span className="font-bold text-blue-900 dark:text-blue-300">Giải thích chi tiết: </span>
                  <span className="text-slate-700 dark:text-slate-300">{q.explanation}</span>
                </div>
                {q.sourceReference && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    <strong>Nguồn tham chiếu: </strong>{q.sourceReference}
                  </div>
                )}
                {q.reviewNotes && (
                  <div className="text-[11px] text-amber-700 dark:text-amber-300">
                    <strong>Ghi chú duyệt: </strong>{q.reviewNotes} (bởi {q.reviewedBy})
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  {!isEditing && (
                    <button
                      onClick={() => handleStartEdit(q)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Chỉnh sửa</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(q.id)}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg"
                    title="Xóa câu hỏi"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {q.status !== 'rejected' && (
                    <button
                      onClick={() => handleReject(q)}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-600 flex items-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Từ chối</span>
                    </button>
                  )}

                  {q.status !== 'approved' && (
                    <button
                      onClick={() => handleApprove(q)}
                      className="px-4 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-sm"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Phê duyệt vào Ngân hàng</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-slate-500 text-xs">
            Không có câu hỏi nào trong mục này. Bấm "Tạo thêm câu hỏi AI" để sinh câu hỏi từ tài liệu bài giảng.
          </div>
        )}
      </div>

      {/* Reject Reason Modal */}
      {rejectModalQ && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={submitReject} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Từ chối câu hỏi dự thảo
            </h3>
            <p className="text-xs text-slate-500 line-clamp-2">{rejectModalQ.content}</p>
            <div>
              <label className="block text-xs font-medium mb-1.5 text-slate-700 dark:text-slate-300">
                Lý do từ chối (tùy chọn)
              </label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalQ(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Xác nhận từ chối
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {confirmModal.title}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {confirmModal.message}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold ${
                  confirmModal.tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
