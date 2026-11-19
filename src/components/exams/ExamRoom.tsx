import React, { useState, useEffect, useRef } from 'react';
import { Exam, Question, User, ExamAttempt, AICodeGradingResult } from '../../types';
import {
  Clock, Flag, AlertTriangle, ArrowLeft, ArrowRight,
  Save, Send, Code2, Loader2
} from 'lucide-react';
import { evaluateQuestionScore } from '../../utils/examScoring';
import {
  makeUniqueId,
  requestAIGradeAlgorithmImage,
  requestAIGradeCode,
} from '../../services/storageService';
import { AlgorithmImageUploadBox } from '../common/AlgorithmImageUploadBox';
import {
  getSubjectProgrammingLanguage,
  hasQuestionAnswer,
  isAlgorithmImageSubject,
  isCodeAutoGradedSubject,
  isImageSubmissionAnswer,
} from '../../utils/subjectGrading';

interface ExamRoomProps {
  exam: Exam;
  questions: Question[];
  currentUser: User;
  onSubmitExam: (attempt: ExamAttempt) => void;
  onExit: () => void;
}

export const ExamRoom: React.FC<ExamRoomProps> = ({
  exam,
  questions,
  currentUser,
  onSubmitExam,
  onExit,
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(Math.max(1, exam.durationMinutes) * 60);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [isGradingExam, setIsGradingExam] = useState<boolean>(false);
  const [gradingProgressText, setGradingProgressText] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<string>('Đã lưu câu trả lời');
  const [startTime] = useState<number>(Date.now());
  const hasSubmittedRef = useRef<boolean>(false);
  const submitFnRef = useRef<() => void>(() => {});

  const isAlgoImageSub = isAlgorithmImageSubject(exam.subjectId);
  const isCodeAiSub = isCodeAutoGradedSubject(exam.subjectId);
  const targetLang = getSubjectProgrammingLanguage(exam.subjectId);

  // Countdown timer (single stable interval, avoids stale closure and duplicate submissions)
  useEffect(() => {
    if (questions.length === 0) return;
    const timer = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          window.clearInterval(timer);
          if (!hasSubmittedRef.current) {
            submitFnRef.current();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [questions.length]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const currentQ = questions[currentIndex];

  if (!currentQ) {
    return (
      <div className="max-w-xl mx-auto my-16 px-4 py-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-center shadow-sm">
        <p className="text-slate-600 dark:text-slate-300 font-semibold mb-4">Không tìm thấy câu hỏi cho phòng thi này.</p>
        <button
          onClick={onExit}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors"
        >
          Quay lại danh sách đề thi
        </button>
      </div>
    );
  }

  const shouldUseAlgoImage = isAlgoImageSub && currentQ.questionType === 'essay';
  const shouldUseCodeAI = isCodeAiSub && currentQ.questionType === 'essay';

  const handleSelectAnswer = (optId: string) => {
    let updated: Record<string, any>;
    if (currentQ.questionType === 'multiple_choice') {
      const currentList: string[] = Array.isArray(answers[currentQ.id]) ? answers[currentQ.id] : [];
      const nextList = currentList.includes(optId)
        ? currentList.filter(id => id !== optId)
        : [...currentList, optId];
      updated = { ...answers, [currentQ.id]: nextList };
    } else {
      updated = { ...answers, [currentQ.id]: optId };
    }
    setAnswers(updated);
    setSaveStatus('Đang lưu...');
    setTimeout(() => setSaveStatus('Đã lưu tự động'), 300);
  };

  const handleTextAnswer = (val: any) => {
    setAnswers({ ...answers, [currentQ.id]: val });
    setSaveStatus('Đang lưu...');
    setTimeout(() => setSaveStatus('Đã lưu tự động'), 300);
  };

  const handleToggleMarkReview = () => {
    setMarkedForReview({
      ...markedForReview,
      [currentQ.id]: !markedForReview[currentQ.id],
    });
  };

  const handleFinalSubmit = async () => {
    if (hasSubmittedRef.current || questions.length === 0) return;
    hasSubmittedRef.current = true;
    setShowConfirmModal(false);

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const aiGrading: Record<string, AICodeGradingResult> = {};

    const gradableQuestions = (isCodeAiSub || isAlgoImageSub)
      ? questions.filter(q => q.questionType === 'essay' && hasQuestionAnswer(answers[q.id]))
      : [];

    if (gradableQuestions.length > 0) {
      setIsGradingExam(true);
      setGradingProgressText(
        isAlgoImageSub
          ? `Gemini AI đang đọc và chấm ${gradableQuestions.length} hình ảnh bài làm Thuật toán...`
          : `Gemini AI đang chấm tự động ${gradableQuestions.length} bài code ${targetLang}...`
      );

      await Promise.all(
        gradableQuestions.map(async (q) => {
          const userAns = answers[q.id];
          try {
            if (isAlgoImageSub && isImageSubmissionAnswer(userAns)) {
              const res = await requestAIGradeAlgorithmImage({
                subjectName: exam.title,
                questionContent: q.content,
                sampleSolution: q.sampleSolution,
                rubricKeywords: Array.isArray(q.correctAnswer)
                  ? q.correctAnswer.join('|')
                  : String(q.correctAnswer || ''),
                imageDataUrl: userAns.dataUrl,
                note: userAns.note,
                maxPoints: q.points || 5,
              });
              if (res?.grading) aiGrading[q.id] = res.grading;
            } else if (isCodeAiSub) {
              const res = await requestAIGradeCode({
                subjectId: exam.subjectId,
                subjectName: exam.title,
                language: targetLang,
                questionContent: q.content,
                codeSnippet: q.codeSnippet,
                sampleSolution: q.sampleSolution,
                rubricKeywords: Array.isArray(q.correctAnswer)
                  ? q.correctAnswer.join('|')
                  : String(q.correctAnswer || ''),
                studentCode: String(userAns || ''),
                maxPoints: q.points || 5,
              });
              if (res?.grading) aiGrading[q.id] = res.grading;
            }
          } catch (err) {
            console.warn(`AI grading skipped for ${q.id}:`, err);
          }
        })
      );
      setIsGradingExam(false);
    }

    let correctCount = 0;
    let wrongCount = 0;
    let unattemptedCount = 0;
    let totalEarnedPoints = 0;
    let totalPossiblePoints = 0;

    questions.forEach((q) => {
      const evaluation = evaluateQuestionScore(q, answers[q.id], aiGrading[q.id]);
      totalPossiblePoints += evaluation.maxPoints;
      totalEarnedPoints += evaluation.earnedPoints;

      if (!evaluation.isAttempted) {
        unattemptedCount++;
      } else if (evaluation.isCorrect) {
        correctCount++;
      } else {
        wrongCount++;
      }
    });

    const score = totalPossiblePoints > 0
      ? Number(((totalEarnedPoints / totalPossiblePoints) * exam.maxScore).toFixed(1))
      : 0;

    const attempt: ExamAttempt = {
      id: makeUniqueId('att'),
      examId: exam.id,
      examTitle: exam.title,
      subjectId: exam.subjectId,
      studentId: currentUser.id,
      studentName: currentUser.fullName,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date().toISOString(),
      durationSeconds,
      score,
      maxScore: exam.maxScore,
      totalQuestions: questions.length,
      correctAnswers: correctCount,
      wrongAnswers: wrongCount,
      unattempted: unattemptedCount,
      status: 'submitted',
      answers,
      ...(Object.keys(aiGrading).length > 0 ? { aiGrading } : {}),
    };

    onSubmitExam(attempt);
  };

  submitFnRef.current = handleFinalSubmit;

  const answeredCount = questions.filter(q => hasQuestionAnswer(answers[q.id])).length;
  const reviewCount = Object.values(markedForReview).filter(Boolean).length;
  const isTimeCritical = timeLeft < 300; // < 5 mins

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-16">
      {/* Sticky Top Countdown Header */}
      <div className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3 transition-colors shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded">
                {exam.code}
              </span>
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate max-w-xs sm:max-w-md">
                {exam.title}
              </h2>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Save className="w-3 h-3" />
                <span>{saveStatus}</span>
              </span>
              <span>·</span>
              <span>Đã làm: {answeredCount}/{questions.length}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Timer */}
            <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-mono text-sm sm:text-base font-extrabold border ${
              isTimeCritical
                ? 'bg-rose-50 text-rose-600 border-rose-300 dark:bg-rose-950 dark:border-rose-800 animate-pulse'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700'
            }`}>
              <Clock className="w-4 h-4 text-slate-500" />
              <span>{formatTime(timeLeft)}</span>
            </div>

            <button
              onClick={() => setShowConfirmModal(true)}
              disabled={isGradingExam}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Nộp bài</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Question Stage */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-5">
            {/* Question Bar */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  Câu hỏi {currentIndex + 1} / {questions.length}
                </span>
                <span className="text-xs font-mono font-bold text-blue-700 dark:text-blue-400">
                  ({currentQ.points || 1} điểm)
                </span>
                {exam.examFormat === 'practical' && (
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <Code2 className="w-3.5 h-3.5" />
                    Thi thực hành
                  </span>
                )}
                {shouldUseAlgoImage && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                    Nộp hình ảnh bài làm + Gemini AI chấm
                  </span>
                )}
                {shouldUseCodeAI && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                    Code {targetLang} · Gemini AI chấm tự động
                  </span>
                )}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                  currentQ.difficulty === 'easy'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : currentQ.difficulty === 'medium'
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                }`}>
                  {currentQ.difficulty === 'easy' ? 'Dễ' : currentQ.difficulty === 'medium' ? 'Vừa' : 'Khó'}
                </span>
              </div>

              {/* Review checkbox */}
              <button
                onClick={handleToggleMarkReview}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  markedForReview[currentQ.id]
                    ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 border-slate-200 dark:border-slate-700'
                }`}
              >
                <Flag className={`w-3.5 h-3.5 ${markedForReview[currentQ.id] ? 'fill-amber-500 text-amber-500' : ''}`} />
                <span>{markedForReview[currentQ.id] ? 'Đang đánh dấu xem lại' : 'Đánh dấu câu này'}</span>
              </button>
            </div>

            {/* Question Text */}
            <h3 className="text-base font-semibold text-slate-900 dark:text-white leading-relaxed">
              {currentQ.content}
            </h3>

            {/* Code Snippet */}
            {currentQ.codeSnippet && (
              <div className="p-4 rounded-2xl bg-slate-950 font-mono text-xs text-emerald-400 overflow-x-auto shadow-inner">
                <pre>{currentQ.codeSnippet}</pre>
              </div>
            )}

            {/* Options */}
            {currentQ.options && currentQ.options.length > 0 && (
              <div className="space-y-3 pt-2">
                {currentQ.options.map((opt, oIdx) => {
                  const isSelected = currentQ.questionType === 'multiple_choice'
                    ? (Array.isArray(answers[currentQ.id]) ? answers[currentQ.id] : []).includes(opt.id)
                    : answers[currentQ.id] === opt.id;

                  return (
                    <div
                      key={`${opt.id}-${oIdx}`}
                      onClick={() => handleSelectAnswer(opt.id)}
                      className={`p-3.5 rounded-2xl border text-xs sm:text-sm cursor-pointer transition-all flex items-center gap-3 ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 font-semibold ring-1 ring-blue-500'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}>
                        {String.fromCharCode(65 + oIdx)}
                      </div>
                      <span>{opt.text}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Fill blank */}
            {currentQ.questionType === 'fill_blank' && (
              <div className="pt-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Nhập câu trả lời ngắn:
                </label>
                <input
                  type="text"
                  placeholder="Nhập đáp án tại đây..."
                  value={answers[currentQ.id] || ''}
                  onChange={(e) => handleTextAnswer(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Essay / Practical Coding vs Nhập môn thuật toán Image Upload */}
            {currentQ.questionType === 'essay' && (
              shouldUseAlgoImage ? (
                <AlgorithmImageUploadBox
                  value={answers[currentQ.id]}
                  disabled={isGradingExam}
                  onChange={(nextVal) => handleTextAnswer(nextVal)}
                />
              ) : (
                <div className="pt-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                      {exam.examFormat === 'practical'
                        ? shouldUseCodeAI
                          ? `Trình soạn thảo mã nguồn ${targetLang} (Gemini AI tự chấm khi nộp bài):`
                          : 'Trình soạn thảo mã nguồn / lời giải thực hành:'
                        : 'Soạn thảo câu trả lời tự luận:'}
                    </label>
                    {currentQ.codeSnippet && (
                      <button
                        type="button"
                        onClick={() => handleTextAnswer(currentQ.codeSnippet || '')}
                        className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                      >
                        Chèn khung code mẫu vào bài làm
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={exam.examFormat === 'practical' ? 12 : 6}
                    placeholder={
                      exam.examFormat === 'practical'
                        ? `// Nhập mã nguồn ${targetLang} hoàn chỉnh của bạn tại đây...`
                        : 'Trình bày giải thuật, phân tích ưu nhược điểm...'
                    }
                    value={typeof answers[currentQ.id] === 'string' ? answers[currentQ.id] : ''}
                    onChange={(e) => handleTextAnswer(e.target.value)}
                    className={`w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      exam.examFormat === 'practical'
                        ? 'font-mono leading-6 bg-slate-950 text-emerald-300 placeholder:text-slate-500'
                        : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                    }`}
                  />
                </div>
              )
            )}
          </div>

          {/* Stepper navigation */}
          <div className="flex items-center justify-between">
            <button
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex(currentIndex - 1)}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Câu trước</span>
            </button>

            {currentIndex === questions.length - 1 ? (
              <button
                onClick={() => setShowConfirmModal(true)}
                disabled={isGradingExam}
                className="px-6 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Hoàn tất & Nộp bài</span>
              </button>
            ) : (
              <button
                onClick={() => setCurrentIndex(currentIndex + 1)}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <span>Câu tiếp theo</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Question Palette Matrix */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">
              Danh sách câu hỏi
            </h3>

            {/* Legend */}
            <div className="space-y-1.5 text-[11px] text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded bg-blue-600" />
                <span>Đã làm ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded bg-slate-100 dark:bg-slate-800 border" />
                <span>Chưa làm ({questions.length - answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded bg-amber-400" />
                <span>Đánh dấu xem lại ({reviewCount})</span>
              </div>
            </div>

            {/* Palette Grid */}
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const isAnswered = hasQuestionAnswer(answers[q.id]);
                const isMarked = markedForReview[q.id];
                const isCurrent = idx === currentIndex;

                let btnClass = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700';

                if (isAnswered) {
                  btnClass = 'bg-blue-600 text-white font-bold';
                }

                if (isMarked) {
                  btnClass = 'bg-amber-400 text-slate-900 font-bold';
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`relative h-9 rounded-xl text-xs font-mono font-bold transition-all flex items-center justify-center ${btnClass} ${
                      isCurrent ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900' : ''
                    }`}
                  >
                    <span>{idx + 1}</span>
                    {isMarked && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setShowConfirmModal(true)}
                disabled={isGradingExam}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Nộp bài thi</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950 text-amber-600 mx-auto flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white text-center">
              Xác nhận Nộp bài thi
            </h3>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl my-4 text-xs space-y-2 text-slate-600 dark:text-slate-300">
              <div className="flex justify-between">
                <span>Số câu đã trả lời:</span>
                <strong className="text-emerald-600">{answeredCount} / {questions.length}</strong>
              </div>
              <div className="flex justify-between">
                <span>Số câu chưa trả lời:</span>
                <strong className="text-rose-600">{questions.length - answeredCount} câu</strong>
              </div>
              {reviewCount > 0 && (
                <div className="flex justify-between text-amber-600">
                  <span>Câu đánh dấu xem lại:</span>
                  <strong>{reviewCount} câu</strong>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500 text-center mb-6">
              {(isCodeAiSub || isAlgoImageSub)
                ? 'Sau khi xác nhận nộp bài, Gemini AI sẽ tự động chấm bài làm và hiển thị nhận xét chi tiết ngay lập tức.'
                : 'Bạn có chắc chắn muốn nộp bài ngay bây giờ? Sau khi nộp bài sẽ không thể thay đổi đáp án.'}
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Tiếp tục làm bài
              </button>
              <button
                onClick={handleFinalSubmit}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
              >
                Xác nhận nộp bài
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Grading Loading Overlay */}
      {isGradingExam && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-8 max-w-md w-full text-center shadow-2xl space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Gemini AI đang chấm bài thi...
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {gradingProgressText || 'Hệ thống đang kiểm tra tính đúng đắn, cú pháp và logic bài làm của bạn.'}
            </p>
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-indigo-700">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Vui lòng đợi trong giây lát</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
