import React from 'react';
import { ExamAttempt, PracticeSession, Subject, User } from '../../types';
import {
  TrendingUp, Award, CheckCircle, XCircle, Clock, BookOpen,
  AlertTriangle, Calendar, ChevronRight, BarChart3
} from 'lucide-react';

interface StudentAnalyticsProps {
  currentUser: User;
  attempts: ExamAttempt[];
  practiceSessions: PracticeSession[];
  subjects: Subject[];
  onViewAttempt: (attemptId: string) => void;
  onPracticeSubject: (subjectId: string) => void;
}

export const StudentAnalytics: React.FC<StudentAnalyticsProps> = ({
  currentUser,
  attempts,
  practiceSessions,
  subjects,
  onViewAttempt,
  onPracticeSubject,
}) => {
  const studentAttempts = attempts.filter(a => a.studentId === currentUser.id);
  const studentPractice = practiceSessions.filter(p => p.studentId === currentUser.id);

  const totalExams = studentAttempts.length;
  const totalSessions = totalExams + studentPractice.length;
  const normalizedAttemptScores = studentAttempts.map(a =>
    a.maxScore > 0 ? ((a.score ?? 0) / a.maxScore) * 10 : (a.score ?? 0)
  );
  const combinedScores = [
    ...normalizedAttemptScores,
    ...studentPractice.map(p => p.score ?? 0),
  ];
  const avgScore = combinedScores.length > 0
    ? Number((combinedScores.reduce((acc, s) => acc + s, 0) / combinedScores.length).toFixed(1))
    : 0;

  const totalCorrect = studentAttempts.reduce((acc, a) => acc + (a.correctAnswers || 0), 0);
  const totalWrong = studentAttempts.reduce((acc, a) => acc + (a.wrongAnswers || 0), 0);
  const totalQuestionsAnswered = totalCorrect + totalWrong;
  const accuracyPct = totalQuestionsAnswered > 0
    ? Math.round((totalCorrect / totalQuestionsAnswered) * 100)
    : 0;

  // Subject Performance Breakdown (normalized to /10 across both exam attempts & practice)
  const subjectStats = subjects.map((sub) => {
    const subAttempts = studentAttempts.filter(a => a.subjectId === sub.id);
    const subPractice = studentPractice.filter(p => p.subjectId === sub.id);
    const subScores = [
      ...subAttempts.map(a => (a.maxScore > 0 ? ((a.score ?? 0) / a.maxScore) * 10 : (a.score ?? 0))),
      ...subPractice.map(p => p.score ?? 0),
    ];
    const count = subScores.length;
    const avg = count > 0
      ? subScores.reduce((acc, s) => acc + s, 0) / count
      : 0;
    return {
      subject: sub,
      count,
      avg: Number(avg.toFixed(1)),
      progress: Math.min(100, Math.round((count / 3) * 100)),
    };
  });

  const coveredSubjectsCount = subjectStats.filter(s => s.count > 0).length;
  const displayedSubjectStats = [...subjectStats]
    .sort((a, b) => (b.count - a.count) || (b.avg - a.avg))
    .slice(0, Math.max(8, coveredSubjectsCount));
  const coveragePct = subjects.length > 0 ? Math.round((coveredSubjectsCount / subjects.length) * 100) : 0;
  const weakSubjects = subjectStats.filter(s => (s.count > 0 && s.avg < 7.0) || s.count === 0).slice(0, 3);

  const scoreRankLabel =
    combinedScores.length === 0
      ? 'Chưa có dữ liệu bài làm'
      : avgScore >= 8.5
      ? 'Xếp loại Xuất sắc / Giỏi'
      : avgScore >= 7.0
      ? 'Xếp loại Khá'
      : avgScore >= 5.0
      ? 'Xếp loại Trung bình'
      : 'Cần ôn tập thêm';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
          Thống kê & Tiến độ Học tập Cá nhân
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Theo dõi điểm số, phân tích năng lực theo học phần và gợi ý chủ đề cần ôn tập bổ sung
        </p>
      </div>

      {/* Top 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
            <span>Tổng bài thi & ôn tập</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">
            {totalSessions}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {totalExams} đề thi chính thức · {studentPractice.length} phiên tự do
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
            <span>Điểm trung bình</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 font-mono tabular-nums">
            {combinedScores.length > 0 ? avgScore : '0.0'} <span className="text-base text-slate-400 font-normal">/ 10</span>
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-semibold flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{scoreRankLabel}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
            <span>Tỷ lệ câu trả lời đúng</span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-600 flex items-center justify-center">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">
            {totalQuestionsAnswered > 0 ? `${accuracyPct}%` : '—'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {totalCorrect} câu đúng · {totalWrong} câu sai
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
            <span>Độ phủ môn học</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950 text-purple-600 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">
            {coveredSubjectsCount} / {subjects.length}
          </div>
          <div className="text-[11px] text-purple-600 dark:text-purple-400 mt-1 font-semibold">
            Đã tiếp cận {coveragePct}% môn học hiện có
          </div>
        </div>
      </div>

      {/* Visual Chart Bars: Subject Mastery */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Mức độ Nắm vững theo Từng Môn học
              </h3>
              <p className="text-xs text-slate-500">Biểu đồ tỷ lệ hoàn thành và điểm số trung bình</p>
            </div>
          </div>

          <div className="space-y-4">
            {displayedSubjectStats.map((st) => (
              <div key={st.subject.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {st.subject.name} ({st.subject.code})
                  </span>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className="text-slate-400">{st.count} lượt học</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      {st.avg > 0 ? `${st.avg}/10` : 'Chưa thi'}
                    </span>
                  </div>
                </div>

                <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      st.avg >= 8.5
                        ? 'bg-emerald-500'
                        : st.avg >= 6.5
                        ? 'bg-blue-500'
                        : st.avg > 0
                        ? 'bg-amber-500'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                    style={{ width: `${Math.max(8, st.progress)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Weak Topics Recommendation */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
              <AlertTriangle className="w-4 h-4" />
              <span>Gợi ý chủ đề cần cải thiện</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
              Kế hoạch ôn tập đề xuất
            </h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Dựa trên tỷ lệ câu trả lời sai và các học phần chưa có lượt làm bài, hệ thống khuyến nghị bạn nên ưu tiên:
            </p>

            <div className="space-y-3">
              {weakSubjects.map((w) => (
                <div
                  key={w.subject.id}
                  className="p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-semibold text-xs text-slate-900 dark:text-white">
                      {w.subject.name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Mã: {w.subject.code} · {w.count === 0 ? 'Chưa luyện tập' : `Điểm TB: ${w.avg}/10`}
                    </div>
                  </div>

                  <button
                    onClick={() => onPracticeSubject(w.subject.id)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shrink-0 transition-colors shadow-sm"
                  >
                    Ôn ngay
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <span className="text-[11px] text-slate-400">
              Mẹo: Luyện tập 15 phút mỗi ngày giúp tăng 35% khả năng ghi nhớ thuật toán.
            </span>
          </div>
        </div>
      </div>

      {/* History of Exam Attempts */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
          Lịch sử các lần làm bài thi
        </h3>

        {studentAttempts.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            Bạn chưa tham gia bài thi nào. Hãy bắt đầu một bài kiểm tra để lưu lịch sử!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase font-semibold">
                  <th className="py-3 px-3">Tên đề thi</th>
                  <th className="py-3 px-3">Thời gian nộp</th>
                  <th className="py-3 px-3">Thời lượng</th>
                  <th className="py-3 px-3">Đúng / Sai</th>
                  <th className="py-3 px-3">Điểm số</th>
                  <th className="py-3 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {studentAttempts.map((att) => (
                  <tr key={att.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                      {att.examTitle}
                    </td>
                    <td className="py-3 px-3 text-slate-500">
                      {new Date(att.startTime).toLocaleString('vi-VN')}
                    </td>
                    <td className="py-3 px-3 font-mono">
                      {Math.floor((att.durationSeconds || 0) / 60)}m {(att.durationSeconds || 0) % 60}s
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-emerald-600 font-semibold">{att.correctAnswers}</span> /{' '}
                      <span className="text-rose-600 font-semibold">{att.wrongAnswers}</span>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                      {(att.score ?? 0).toFixed(1)} / {att.maxScore}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => onViewAttempt(att.id)}
                        className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium"
                      >
                        Chi tiết bài làm
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
