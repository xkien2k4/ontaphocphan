import React, { useState } from 'react';
import { ExamAttempt, Question, Exam } from '../../types';
import {
  CheckCircle, XCircle, Award, ArrowLeft, RotateCcw,
  BarChart2, HelpCircle, Check, FileImage
} from 'lucide-react';
import { AIExplanationModal } from '../ai/AIExplanationModal';
import { evaluateQuestionScore } from '../../utils/examScoring';
import { AICodeGradingCard } from '../common/AICodeGradingCard';
import { isImageSubmissionAnswer } from '../../utils/subjectGrading';

interface ExamResultProps {
  attempt: ExamAttempt;
  exam: Exam;
  questions: Question[];
  canRetake?: boolean;
  onRetake: (examId: string) => void;
  onBackToExams: () => void;
  onViewAnalytics: () => void;
}

export const ExamResult: React.FC<ExamResultProps> = ({
  attempt,
  exam,
  questions,
  canRetake = true,
  onRetake,
  onBackToExams,
  onViewAnalytics,
}) => {
  const [aiExplainingQuestion, setAiExplainingQuestion] = useState<Question | null>(null);

  if (!attempt || !exam) {
    return (
      <div className="max-w-xl mx-auto my-16 px-4 py-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-center shadow-sm">
        <p className="text-slate-600 dark:text-slate-300 font-semibold mb-4">Không tìm thấy thông tin kết quả bài thi.</p>
        <button
          onClick={onBackToExams}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors"
        >
          Quay lại danh sách đề thi
        </button>
      </div>
    );
  }

  const minutes = Math.floor((attempt.durationSeconds || 0) / 60);
  const seconds = (attempt.durationSeconds || 0) % 60;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Top Banner */}
      <div className="rounded-3xl p-6 sm:p-10 border shadow-xl text-white bg-gradient-to-r from-blue-950 via-indigo-950 to-slate-900 border-blue-900">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-2 opacity-90">
              <Award className="w-4 h-4" />
              <span>KẾT QUẢ BÀI THI TRỰC TUYẾN</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
              {exam.title}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300">
              Mã đề: <span className="font-mono">{exam.code}</span> · Thí sinh: <strong>{attempt.studentName}</strong>
            </p>
          </div>

          <div className="text-center md:text-right bg-white/10 backdrop-blur-md p-5 rounded-2xl border border-white/20 shrink-0">
            <div className="text-4xl sm:text-5xl font-black font-mono tabular-nums">
              {(attempt.score ?? 0).toFixed(1)} <span className="text-xl font-normal text-slate-300">/ {attempt.maxScore}</span>
            </div>
            <div className="mt-2 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full inline-block bg-blue-600 text-white">
              THANG ĐIỂM {attempt.maxScore}
            </div>
          </div>
        </div>

        {/* 4 Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 mt-6 border-t border-white/15 text-xs">
          <div>
            <span className="text-slate-300">Thời gian làm bài:</span>
            <div className="text-base font-bold font-mono mt-0.5">{minutes}m {seconds}s</div>
          </div>
          <div>
            <span className="text-slate-300">Số câu đúng:</span>
            <div className="text-base font-bold text-emerald-400 mt-0.5">
              {attempt.correctAnswers} / {attempt.totalQuestions}
            </div>
          </div>
          <div>
            <span className="text-slate-300">Số câu sai:</span>
            <div className="text-base font-bold text-rose-400 mt-0.5">
              {attempt.wrongAnswers} câu
            </div>
          </div>
          <div>
            <span className="text-slate-300">Chưa trả lời:</span>
            <div className="text-base font-bold text-slate-300 mt-0.5">
              {attempt.unattempted} câu
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={onBackToExams}
          className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Về danh sách đề thi</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={onViewAnalytics}
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 text-slate-700 dark:text-slate-300"
          >
            <BarChart2 className="w-4 h-4" />
            <span>Xem biểu đồ tiến độ</span>
          </button>

          <button
            disabled={!canRetake}
            onClick={() => onRetake(exam.id)}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white flex items-center gap-1.5 shadow-sm"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{canRetake ? 'Làm lại đề thi này' : 'Đã hết lượt làm bài'}</span>
          </button>
        </div>
      </div>

      {/* Detailed Question Review */}
      <div className="space-y-6">
        <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Chi tiết Đáp án & Lời giải
          </h2>
          <span className="text-xs text-slate-500">
            Đối chiếu bài làm của bạn với đáp án chuẩn
          </span>
        </div>

        {questions.map((q, idx) => {
          const safeAnswers = attempt.answers || {};
          const userAns = safeAnswers[q.id];
          const aiGrading = attempt.aiGrading?.[q.id];
          const evaluation = evaluateQuestionScore(q, userAns, aiGrading);
          const isCorrect = evaluation.isCorrect;

          return (
            <div
              key={q.id}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    Câu {idx + 1}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    isCorrect
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                  }`}>
                    {isCorrect ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    <span>{isCorrect ? 'Đạt yêu cầu' : 'Chưa đạt'}</span>
                  </span>
                </div>

                <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">
                  {evaluation.earnedPoints} / {evaluation.maxPoints} điểm
                </span>
              </div>

              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {q.content}
              </h3>

              {q.codeSnippet && (
                <div className="p-4 rounded-2xl bg-slate-950 font-mono text-xs text-emerald-400 overflow-x-auto">
                  <pre>{q.codeSnippet}</pre>
                </div>
              )}

              {/* Options Breakdown */}
              {q.options && q.options.length > 0 && (
                <div className="space-y-2 pt-2">
                  {q.options.map((opt, oIdx) => {
                    const isSelected = Array.isArray(userAns)
                      ? userAns.includes(opt.id)
                      : userAns === opt.id;
                    const isKey = Array.isArray(q.correctAnswer)
                      ? q.correctAnswer.includes(opt.id)
                      : q.correctAnswer === opt.id;

                    let optClass = 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60';
                    if (isKey) {
                      optClass = 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 font-semibold ring-1 ring-emerald-500';
                    } else if (isSelected && !isKey) {
                      optClass = 'border-rose-500 bg-rose-50/80 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100 ring-1 ring-rose-500';
                    }

                    return (
                      <div
                        key={`${opt.id}-${oIdx}`}
                        className={`p-3 rounded-2xl border text-xs sm:text-sm flex items-center justify-between ${optClass}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs shrink-0">
                            {String.fromCharCode(65 + oIdx)}
                          </span>
                          <span>{opt.text}</span>
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                          {isSelected && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                              (Lựa chọn của bạn)
                            </span>
                          )}
                          {isKey && (
                            <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Đáp án đúng
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Fill in blank answer */}
              {q.questionType === 'fill_blank' && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs space-y-1">
                  <div>
                    <span className="text-slate-500">Câu trả lời của bạn: </span>
                    <strong className={isCorrect ? 'text-emerald-600' : 'text-rose-600'}>
                      {userAns || '(Chưa điền)'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Đáp án chuẩn: </span>
                    <strong className="text-emerald-600">{String(q.correctAnswer)}</strong>
                  </div>
                </div>
              )}

              {/* Essay / Practical / Algorithm Image answer */}
              {q.questionType === 'essay' && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Bài làm của bạn:</span>
                    {!aiGrading && evaluation.totalKeywords > 0 && (
                      <span className="text-[11px] font-mono text-blue-700 dark:text-blue-400">
                        Khớp tiêu chí thuật toán: {evaluation.matchedKeywords.length}/{evaluation.totalKeywords}
                      </span>
                    )}
                  </div>

                  {isImageSubmissionAnswer(userAns) ? (
                    <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-blue-700">
                        <FileImage className="w-4 h-4" />
                        <span>{userAns.fileName}</span>
                      </div>
                      <img
                        src={userAns.dataUrl}
                        alt="Ảnh bài làm thuật toán"
                        className="max-h-72 w-auto object-contain rounded-lg border border-slate-200"
                      />
                      {userAns.note && (
                        <div className="text-xs text-slate-600">
                          <strong>Ghi chú:</strong> {userAns.note}
                        </div>
                      )}
                    </div>
                  ) : (
                    <pre className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                      {typeof userAns === 'string' && userAns.trim() ? userAns : '(Chưa làm)'}
                    </pre>
                  )}

                  {aiGrading && <AICodeGradingCard grading={aiGrading} />}

                  {q.sampleSolution && (
                    <div className="pt-1 space-y-1.5">
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold block">
                        Code mẫu / Đáp án thực hành chuẩn:
                      </span>
                      <pre className="p-3.5 rounded-xl bg-slate-950 text-emerald-300 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                        {q.sampleSolution}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Explanation */}
              <div className="p-4 bg-blue-50/70 dark:bg-blue-950/30 rounded-2xl border border-blue-200 dark:border-blue-900/50 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900 dark:text-blue-300">
                    <HelpCircle className="w-4 h-4" />
                    <span>Giải thích chi tiết:</span>
                  </div>
                  <button
                    onClick={() => setAiExplainingQuestion(q)}
                    className="px-2.5 py-1 rounded-lg bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-[11px] flex items-center gap-1.5 transition shadow-xs"
                  >
                    <span>Phân tích bằng AI</span>
                  </button>
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                  {q.explanation}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Explanation Modal */}
      {aiExplainingQuestion && (
        <AIExplanationModal
          question={aiExplainingQuestion}
          studentAnswer={
            isImageSubmissionAnswer((attempt.answers || {})[aiExplainingQuestion.id])
              ? `[Hình ảnh bài làm: ${(attempt.answers || {})[aiExplainingQuestion.id].fileName}] ${(attempt.answers || {})[aiExplainingQuestion.id].note || ''}`
              : (attempt.answers || {})[aiExplainingQuestion.id]
          }
          subjectName={exam.title}
          onClose={() => setAiExplainingQuestion(null)}
        />
      )}
    </div>
  );
};
