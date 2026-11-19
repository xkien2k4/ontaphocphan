import React, { useState } from 'react';
import { Exam, Subject, User, ExamAttempt } from '../../types';
import { Clock, Search, ChevronRight, Award, Lock, CheckCircle2 } from 'lucide-react';
import { hasUnlockedSubjectExam } from '../../services/storageService';

interface ExamListProps {
  exams: Exam[];
  subjects: Subject[];
  attempts: ExamAttempt[];
  currentUser: User;
  onStartExam: (examId: string) => void;
  onViewResult: (attemptId: string) => void;
  onOpenPaymentModal?: (subjectId: string, subjectName: string, examId?: string) => void;
}

export const ExamList: React.FC<ExamListProps> = ({
  exams,
  subjects,
  attempts,
  currentUser,
  onStartExam,
  onViewResult,
  onOpenPaymentModal,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const visibleExams = exams.filter((exam) => currentUser.role !== 'student' || exam.status === 'published');

  const filteredExams = visibleExams.filter((exam) => {
    const matchSubject = selectedSubject === 'all' || exam.subjectId === selectedSubject;
    const matchQuery =
      exam.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exam.code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSubject && matchQuery;
  });

  const getSubjectObj = (subId: string) => subjects.find(s => s.id === subId);

  const getSubjectName = (subId: string) => {
    return getSubjectObj(subId)?.name || 'Môn chuyên ngành';
  };

  const getStudentAttemptsForExam = (examId: string) => {
    return attempts.filter(a => a.examId === examId && a.studentId === currentUser.id);
  };

  const uniqueExamSubjectIds = Array.from(new Set(visibleExams.map(e => e.subjectId)));
  const unlockedSubjectsCount = currentUser.role === 'student'
    ? uniqueExamSubjectIds.filter(subId => hasUnlockedSubjectExam(currentUser, subId)).length
    : uniqueExamSubjectIds.length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            Hệ thống Thi thử (Đề cương học phần)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Hệ thống thi thử theo đề cương học phần Khoa CNTT ĐH Hải Phòng
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Tìm đề thi theo mã hoặc tên..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Filter by subject */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <button
          onClick={() => setSelectedSubject('all')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors ${
            selectedSubject === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
          }`}
        >
          Tất cả môn ({visibleExams.length})
        </button>
        {subjects.map((sub) => {
          const unlocked = hasUnlockedSubjectExam(currentUser, sub.id);
          return (
            <button
              key={sub.id}
              onClick={() => setSelectedSubject(sub.id)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors inline-flex items-center gap-1.5 ${
                selectedSubject === sub.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <span>{sub.name}</span>
              {currentUser.role === 'student' && (
                unlocked ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Lock className="w-3 h-3 text-amber-500" />
                )
              )}
              {sub.isHot && (
                <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-extrabold uppercase tracking-wider">
                  HOT
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Exam Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredExams.map((exam) => {
          const userAttempts = getStudentAttemptsForExam(exam.id);
          const hasTaken = userAttempts.length > 0;
          const reachedMax = currentUser.role === 'student' && exam.maxAttempts > 0 && userAttempts.length >= exam.maxAttempts;
          const bestScore = hasTaken
            ? Math.max(...userAttempts.map(a => a.score ?? 0))
            : null;
          const latestAttempt = userAttempts[0];
          const subjectObj = getSubjectObj(exam.subjectId);
          const subjectName = getSubjectName(exam.subjectId);
          const isUnlocked = hasUnlockedSubjectExam(currentUser, exam.subjectId);

          return (
            <div
              key={exam.id}
              className={`bg-white dark:bg-slate-900 rounded-2xl border p-6 flex flex-col justify-between hover:shadow-lg transition-all ${
                isUnlocked
                  ? 'border-slate-200 dark:border-slate-800'
                  : 'border-amber-200 dark:border-amber-900/60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3 gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded">
                      {exam.code}
                    </span>
                    {subjectObj?.isHot && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
                        HOT
                      </span>
                    )}
                    {currentUser.role === 'student' && (
                      isUnlocked ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3" />
                          Đã mở môn
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                          <Lock className="w-3 h-3" />
                          10.000đ / môn
                        </span>
                      )
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-medium shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{exam.durationMinutes} phút</span>
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] font-semibold mb-1">
                  <span className="text-slate-400 uppercase tracking-wider truncate">
                    {subjectName}
                  </span>
                  {exam.examFormat === 'practical' ? (
                    <span className="text-emerald-700 dark:text-emerald-400 shrink-0">
                      Thực hành
                    </span>
                  ) : (
                    <span className="text-indigo-700 dark:text-indigo-400 shrink-0">
                      Hệ thống thi thử · Đề cương học phần
                    </span>
                  )}
                </div>

                <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                  {exam.title}
                </h3>

                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 line-clamp-2 leading-relaxed">
                  {exam.description}
                </p>

                {/* Exam info list */}
                <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>Số lượng câu hỏi:</span>
                    <strong className="text-slate-900 dark:text-white">
                      {exam.examFormat === 'practical' ? 2 : exam.totalQuestions} câu
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Thang điểm tối đa:</span>
                    <strong className="text-slate-900 dark:text-white">{exam.maxScore} điểm</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Số lần làm tối đa:</span>
                    <strong className="text-slate-900 dark:text-white">{exam.maxAttempts} lần</strong>
                  </div>
                </div>

                {hasTaken && (
                  <div className="mt-3 p-2.5 bg-emerald-50/80 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <Award className="w-4 h-4 text-emerald-600" />
                      <span>Điểm cao nhất: {bestScore?.toFixed(1)}/{exam.maxScore}</span>
                    </div>
                    <span className="text-[11px] text-emerald-600">Đã làm {userAttempts.length}/{exam.maxAttempts} lần</span>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                {hasTaken && latestAttempt ? (
                  <button
                    onClick={() => onViewResult(latestAttempt.id)}
                    className="flex-1 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    Xem lại bài thi
                  </button>
                ) : (
                  <div className="text-[11px] text-slate-400">
                    {isUnlocked ? 'Sẵn sàng thi thử' : 'Chưa mở khóa môn'}
                  </div>
                )}

                {isUnlocked ? (
                  <button
                    disabled={reachedMax}
                    onClick={() => onStartExam(exam.id)}
                    className="flex-1 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white transition-colors shadow-sm flex items-center justify-center gap-1"
                  >
                    <span>{reachedMax ? 'Hết lượt thi' : hasTaken ? 'Thi lại' : 'Vào thi ngay'}</span>
                    {!reachedMax && <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      onOpenPaymentModal
                        ? onOpenPaymentModal(exam.subjectId, subjectName, exam.id)
                        : onStartExam(exam.id)
                    }
                    className="flex-1 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition-colors shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Mở khóa môn (10k)</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredExams.length === 0 && (
        <div className="p-8 text-center text-xs text-slate-500 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900">
          Chưa có đề thi thử nào phù hợp với bộ lọc hiện tại.
        </div>
      )}
    </div>
  );
};
