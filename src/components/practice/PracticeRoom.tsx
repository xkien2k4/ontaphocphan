import React, { useState } from 'react';
import { AICodeGradingResult, Question, Subject, User } from '../../types';
import {
  ArrowLeft, ArrowRight, Star, CheckCircle, XCircle, RotateCcw,
  Award, HelpCircle, Check, Code, Send, ShieldAlert, FileCheck, Loader2, AlertTriangle
} from 'lucide-react';
import {
  toggleFavorite,
  getFavorites,
  savePracticeSession,
  makeUniqueId,
  requestAIGradeCode,
  requestAIGradeAlgorithmImage,
} from '../../services/storageService';
import { evaluateQuestionScore } from '../../utils/examScoring';
import { AIExplanationModal } from '../ai/AIExplanationModal';
import { AlgorithmImageUploadBox } from '../common/AlgorithmImageUploadBox';
import { AICodeGradingCard } from '../common/AICodeGradingCard';
import {
  getSubjectProgrammingLanguage,
  hasQuestionAnswer,
  isAlgorithmImageSubject,
  isCodeAutoGradedSubject,
  isImageSubmissionAnswer,
} from '../../utils/subjectGrading';

interface PracticeRoomProps {
  currentUser: User;
  subject: Subject;
  questions: Question[];
  instantFeedback: boolean;
  onExit: () => void;
}

export const PracticeRoom: React.FC<PracticeRoomProps> = ({
  currentUser,
  subject,
  questions: initialQuestions,
  onExit,
}) => {
  const [activeQuestions, setActiveQuestions] = useState<Question[]>(initialQuestions);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submittedQuestions, setSubmittedQuestions] = useState<Record<string, boolean>>({});
  const [aiGradingMap, setAiGradingMap] = useState<Record<string, AICodeGradingResult>>({});
  const [gradingErrorMap, setGradingErrorMap] = useState<Record<string, string>>({});
  const [isGradingCurrent, setIsGradingCurrent] = useState<boolean>(false);
  const [isSubmittingAll, setIsSubmittingAll] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [favorites, setFavorites] = useState<string[]>(getFavorites(currentUser.id));
  const [startTime] = useState<number>(Date.now());
  const [aiExplainingQuestion, setAiExplainingQuestion] = useState<Question | null>(null);

  const isAlgoImageSub = isAlgorithmImageSubject(subject.id);
  const isCodeAiSub = isCodeAutoGradedSubject(subject.id);
  const targetLang = getSubjectProgrammingLanguage(subject.id);

  const currentQ = activeQuestions[currentIndex];
  if (!currentQ) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-500 mb-4">Không tìm thấy câu hỏi nào phù hợp với bộ lọc.</p>
        <button
          onClick={onExit}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold"
        >
          Quay lại cấu hình
        </button>
      </div>
    );
  }

  const isCurrentSubmitted = !!submittedQuestions[currentQ.id];
  const isMultiple = currentQ.questionType === 'multiple_choice';
  const currentAnswer = answers[currentQ.id];
  const isCurrentAnswered = hasQuestionAnswer(currentAnswer);

  const shouldUseAlgoImage = isAlgoImageSub && currentQ.questionType === 'essay';
  const shouldUseCodeAI = isCodeAiSub && currentQ.questionType === 'essay';

  const handleSelectOption = (optId: string) => {
    if (isCurrentSubmitted) return;

    if (isMultiple) {
      const currentList: string[] = Array.isArray(answers[currentQ.id]) ? answers[currentQ.id] : [];
      const updated = currentList.includes(optId)
        ? currentList.filter(id => id !== optId)
        : [...currentList, optId];
      setAnswers({ ...answers, [currentQ.id]: updated });
    } else {
      setAnswers({ ...answers, [currentQ.id]: optId });
    }
  };

  const handleToggleFavorite = () => {
    const isFav = toggleFavorite(currentUser.id, currentQ.id);
    if (isFav) {
      setFavorites([...favorites, currentQ.id]);
    } else {
      setFavorites(favorites.filter(id => id !== currentQ.id));
    }
  };

  const gradeQuestionWithGemini = async (
    q: Question,
    ans: any
  ): Promise<AICodeGradingResult | null> => {
    if (q.questionType !== 'essay' || !hasQuestionAnswer(ans)) return null;

    if (isAlgoImageSub && isImageSubmissionAnswer(ans)) {
      const res = await requestAIGradeAlgorithmImage({
        subjectName: subject.name,
        questionContent: q.content,
        sampleSolution: q.sampleSolution,
        rubricKeywords: Array.isArray(q.correctAnswer)
          ? q.correctAnswer.join('|')
          : String(q.correctAnswer || ''),
        imageDataUrl: ans.dataUrl,
        note: ans.note,
        maxPoints: q.points || 5,
      });
      return res.grading;
    }

    if (isCodeAiSub) {
      const res = await requestAIGradeCode({
        subjectId: subject.id,
        subjectName: subject.name,
        language: targetLang,
        questionContent: q.content,
        codeSnippet: q.codeSnippet,
        sampleSolution: q.sampleSolution,
        rubricKeywords: Array.isArray(q.correctAnswer)
          ? q.correctAnswer.join('|')
          : String(q.correctAnswer || ''),
        studentCode: String(ans || ''),
        maxPoints: q.points || 5,
      });
      return res.grading;
    }

    return null;
  };

  const handleRetryAIGradeCurrent = async () => {
    if (isGradingCurrent || !isCurrentAnswered) return;
    setIsGradingCurrent(true);
    setGradingErrorMap(prev => {
      const next = { ...prev };
      delete next[currentQ.id];
      return next;
    });
    try {
      const grading = await gradeQuestionWithGemini(currentQ, answers[currentQ.id]);
      if (grading) {
        setAiGradingMap(prev => ({ ...prev, [currentQ.id]: grading }));
      }
    } catch (err: any) {
      setGradingErrorMap(prev => ({
        ...prev,
        [currentQ.id]: err?.message || 'Chưa thể kết nối Gemini AI để chấm bài lúc này.',
      }));
    } finally {
      setIsGradingCurrent(false);
    }
  };

  // Nộp bài cho câu hỏi hiện tại
  const handleSubmitCurrentQuestion = async () => {
    if (!isCurrentAnswered || isGradingCurrent) return;

    if (shouldUseCodeAI || shouldUseAlgoImage) {
      setIsGradingCurrent(true);
      setGradingErrorMap(prev => {
        const next = { ...prev };
        delete next[currentQ.id];
        return next;
      });
      try {
        const grading = await gradeQuestionWithGemini(currentQ, answers[currentQ.id]);
        if (grading) {
          setAiGradingMap(prev => ({ ...prev, [currentQ.id]: grading }));
        }
      } catch (err: any) {
        setGradingErrorMap(prev => ({
          ...prev,
          [currentQ.id]: err?.message || 'Chưa thể kết nối Gemini AI, tạm chấm theo tiêu chí rubric chuẩn.',
        }));
      } finally {
        setIsGradingCurrent(false);
        setSubmittedQuestions(prev => ({ ...prev, [currentQ.id]: true }));
      }
      return;
    }

    setSubmittedQuestions(prev => ({ ...prev, [currentQ.id]: true }));
  };

  // Nộp toàn bộ bài ôn tập
  const handleFinishAll = async () => {
    if (activeQuestions.length === 0 || isSubmittingAll) return;
    setIsSubmittingAll(true);

    const nextAiMap: Record<string, AICodeGradingResult> = { ...aiGradingMap };
    const nextErrMap: Record<string, string> = { ...gradingErrorMap };

    if (isCodeAiSub || isAlgoImageSub) {
      const toGrade = activeQuestions.filter(
        q =>
          q.questionType === 'essay' &&
          hasQuestionAnswer(answers[q.id]) &&
          !nextAiMap[q.id]
      );

      await Promise.all(
        toGrade.map(async (q) => {
          try {
            const grading = await gradeQuestionWithGemini(q, answers[q.id]);
            if (grading) {
              nextAiMap[q.id] = grading;
              delete nextErrMap[q.id];
            }
          } catch (err: any) {
            nextErrMap[q.id] = err?.message || 'Tạm chấm theo rubric do lỗi kết nối Gemini AI.';
          }
        })
      );
      setAiGradingMap(nextAiMap);
      setGradingErrorMap(nextErrMap);
    }

    const allSubmitted: Record<string, boolean> = {};
    activeQuestions.forEach(q => {
      allSubmitted[q.id] = true;
    });
    setSubmittedQuestions(allSubmitted);

    let correctCount = 0;
    let earnedTotal = 0;
    let maxTotal = 0;
    const wrongIds: string[] = [];

    activeQuestions.forEach((q) => {
      const ev = evaluateQuestionScore(q, answers[q.id], nextAiMap[q.id]);
      earnedTotal += ev.earnedPoints;
      maxTotal += ev.maxPoints;
      if (ev.isCorrect) correctCount++;
      else wrongIds.push(q.id);
    });

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    const score = maxTotal > 0 ? Number(((earnedTotal / maxTotal) * 10).toFixed(1)) : 0;

    savePracticeSession({
      id: makeUniqueId('prac'),
      studentId: currentUser.id,
      subjectId: subject.id,
      totalQuestions: activeQuestions.length,
      correctCount,
      score,
      durationSeconds,
      completedAt: new Date().toISOString(),
      wrongQuestionIds: wrongIds,
    });

    setIsSubmittingAll(false);
    setIsFinished(true);
  };

  const handleRetryWrongs = () => {
    const wrongQs = activeQuestions.filter(
      (q) => !evaluateQuestionScore(q, answers[q.id], aiGradingMap[q.id]).isCorrect
    );

    if (wrongQs.length > 0) {
      setActiveQuestions(wrongQs);
      setCurrentIndex(0);
      setAnswers({});
      setSubmittedQuestions({});
      setAiGradingMap({});
      setGradingErrorMap({});
      setIsFinished(false);
    }
  };

  const isFavorite = favorites.includes(currentQ.id);
  const currentAiGrading = aiGradingMap[currentQ.id];
  const currentGradingError = gradingErrorMap[currentQ.id];
  const currentEvaluation = evaluateQuestionScore(currentQ, answers[currentQ.id], currentAiGrading);

  // Summary screen
  if (isFinished) {
    let correctCount = 0;
    let earnedTotal = 0;
    let maxTotal = 0;
    const wrongCountList: Question[] = [];

    activeQuestions.forEach((q) => {
      const ev = evaluateQuestionScore(q, answers[q.id], aiGradingMap[q.id]);
      earnedTotal += ev.earnedPoints;
      maxTotal += ev.maxPoints;
      if (ev.isCorrect) correctCount++;
      else wrongCountList.push(q);
    });

    const score = maxTotal > 0 ? Number(((earnedTotal / maxTotal) * 10).toFixed(1)) : 0;

    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 text-center shadow-xl">
          <div className="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center mb-4">
            <Award className="w-8 h-8" />
          </div>

          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            Hoàn thành Phiên Ôn tập!
          </h2>
          <p className="text-xs text-slate-500 mt-1 mb-6">
            Môn: {subject.name} ({subject.code})
          </p>

          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 max-w-md mx-auto mb-6">
            <div className="text-4xl font-extrabold text-blue-600 dark:text-blue-400 font-mono tabular-nums mb-1">
              {score} / 10
            </div>
            <div className="text-xs text-slate-500 mb-4">Điểm số ước lượng</div>

            <div className="grid grid-cols-2 gap-4 text-xs font-semibold pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="text-emerald-600 flex items-center justify-center gap-1.5">
                <CheckCircle className="w-4 h-4" />
                <span>Đúng: {correctCount} câu</span>
              </div>
              <div className="text-rose-600 flex items-center justify-center gap-1.5">
                <XCircle className="w-4 h-4" />
                <span>Sai: {wrongCountList.length} câu</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => {
                setIsFinished(false);
                setCurrentIndex(0);
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <FileCheck className="w-4 h-4" />
              <span>Xem lại từng câu & lời giải chuẩn</span>
            </button>

            {wrongCountList.length > 0 && (
              <button
                onClick={handleRetryWrongs}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-sm flex items-center justify-center gap-2 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Làm lại {wrongCountList.length} câu đã sai</span>
              </button>
            )}

            <button
              onClick={onExit}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shadow-sm"
            >
              Quay lại Bảng điều khiển
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <button
          onClick={onExit}
          className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Thoát phiên ôn tập</span>
        </button>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">
            Câu {currentIndex + 1} / {activeQuestions.length}
          </span>
          <button
            onClick={handleToggleFavorite}
            className={`p-1.5 rounded-lg border transition-colors ${
              isFavorite
                ? 'bg-amber-50 text-amber-500 border-amber-300 dark:bg-amber-950 dark:border-amber-800'
                : 'text-slate-400 hover:text-slate-600 border-slate-200 dark:border-slate-700'
            }`}
            title={isFavorite ? 'Bỏ lưu yêu thích' : 'Lưu câu hỏi yêu thích'}
          >
            <Star className={`w-4 h-4 ${isFavorite ? 'fill-amber-400' : ''}`} />
          </button>
          <button
            onClick={handleFinishAll}
            disabled={isSubmittingAll || isGradingCurrent}
            className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 disabled:opacity-60 transition flex items-center gap-1.5 shadow-sm"
          >
            {isSubmittingAll ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            )}
            <span>{isSubmittingAll ? 'AI đang chấm bài...' : 'Nộp toàn bộ bài'}</span>
          </button>
        </div>
      </div>

      {/* Question Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2.5 py-0.5 rounded">
              {subject.code}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
              currentQ.difficulty === 'easy'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : currentQ.difficulty === 'medium'
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
            }`}>
              {currentQ.difficulty === 'easy' ? 'Độ khó: Dễ' : currentQ.difficulty === 'medium' ? 'Độ khó: Trung bình' : 'Độ khó: Khó'}
            </span>
            {isMultiple && (
              <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold bg-purple-50 dark:bg-purple-950 px-2 py-0.5 rounded">
                Nhiều đáp án đúng
              </span>
            )}
            {shouldUseAlgoImage && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                Nộp ảnh bài làm + Gemini AI chấm
              </span>
            )}
            {shouldUseCodeAI && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                Code {targetLang} · Gemini AI chấm tự động
              </span>
            )}
            {isCurrentSubmitted && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                Đã nộp bài
              </span>
            )}
          </div>
          <span className="text-xs text-slate-400 font-medium">{currentQ.points} điểm</span>
        </div>

        {/* Content */}
        <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white leading-relaxed">
          {currentQ.content}
        </h3>

        {/* Code snippet if any */}
        {currentQ.codeSnippet && (
          <div className="p-4 rounded-2xl bg-slate-950 font-mono text-xs text-emerald-400 overflow-x-auto shadow-inner">
            <pre className="leading-relaxed">{currentQ.codeSnippet}</pre>
          </div>
        )}

        {/* Options (Single / Multiple Choice) */}
        {currentQ.options && currentQ.options.length > 0 && (
          <div className="space-y-2.5 pt-2">
            {currentQ.options.map((opt, oIdx) => {
              const isSelected = isMultiple
                ? (Array.isArray(answers[currentQ.id]) ? answers[currentQ.id] : []).includes(opt.id)
                : answers[currentQ.id] === opt.id;

              let optionStyle = 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60';

              if (!isCurrentSubmitted) {
                if (isSelected) {
                  optionStyle = 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 font-medium ring-1 ring-blue-500';
                }
              } else {
                const isCorrectOption = Array.isArray(currentQ.correctAnswer)
                  ? currentQ.correctAnswer.includes(opt.id)
                  : currentQ.correctAnswer === opt.id;

                if (isCorrectOption) {
                  optionStyle = 'border-emerald-500 bg-emerald-50/90 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-100 font-bold ring-2 ring-emerald-500';
                } else if (isSelected && !isCorrectOption) {
                  optionStyle = 'border-rose-500 bg-rose-50/90 dark:bg-rose-950/60 text-rose-900 dark:text-rose-100 ring-2 ring-rose-500 line-through';
                } else {
                  optionStyle = 'border-slate-200 dark:border-slate-800 opacity-60';
                }
              }

              return (
                <div
                  key={`${opt.id}-${oIdx}`}
                  onClick={() => handleSelectOption(opt.id)}
                  className={`p-3.5 rounded-2xl border text-xs sm:text-sm transition-all flex items-center justify-between ${
                    isCurrentSubmitted ? 'cursor-default' : 'cursor-pointer'
                  } ${optionStyle}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300 shrink-0">
                      {String.fromCharCode(65 + oIdx)}
                    </span>
                    <span>{opt.text}</span>
                  </div>

                  {isCurrentSubmitted && (
                    <div>
                      {(Array.isArray(currentQ.correctAnswer) ? currentQ.correctAnswer.includes(opt.id) : currentQ.correctAnswer === opt.id) ? (
                        <Check className="w-5 h-5 text-emerald-600 font-bold" />
                      ) : isSelected ? (
                        <XCircle className="w-5 h-5 text-rose-600 font-bold" />
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Fill in blank */}
        {currentQ.questionType === 'fill_blank' && (
          <div className="pt-2">
            <input
              type="text"
              disabled={isCurrentSubmitted}
              placeholder="Nhập câu trả lời của bạn..."
              value={answers[currentQ.id] || ''}
              onChange={(e) => setAnswers({ ...answers, [currentQ.id]: e.target.value })}
              className={`w-full px-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isCurrentSubmitted ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            />
          </div>
        )}

        {/* Essay / Practical: Algorithm Image Upload vs Code Editor */}
        {currentQ.questionType === 'essay' && (
          shouldUseAlgoImage ? (
            <AlgorithmImageUploadBox
              value={answers[currentQ.id]}
              disabled={isCurrentSubmitted}
              onChange={(nextVal) => setAnswers({ ...answers, [currentQ.id]: nextVal })}
            />
          ) : (
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  {subject.subjectType === 'practical' || currentQ.codeSnippet
                    ? `Viết mã nguồn ${targetLang} của bạn (Gemini AI sẽ tự động chấm khi nộp bài):`
                    : 'Trình bày câu trả lời tự luận của bạn:'}
                </label>
                {!isCurrentSubmitted && currentQ.codeSnippet && (
                  <button
                    type="button"
                    onClick={() => setAnswers({ ...answers, [currentQ.id]: currentQ.codeSnippet })}
                    className="px-2.5 py-1 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold flex items-center gap-1 hover:bg-emerald-100 dark:hover:bg-emerald-950 transition"
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span>Chèn khung code mẫu</span>
                  </button>
                )}
              </div>
              <textarea
                disabled={isCurrentSubmitted}
                rows={subject.subjectType === 'practical' || currentQ.codeSnippet ? 10 : 5}
                placeholder={
                  subject.subjectType === 'practical' || currentQ.codeSnippet
                    ? `// Nhập mã nguồn ${targetLang} hoàn chỉnh tại đây...`
                    : 'Nhập nội dung phân tích, giải thích thuật toán...'
                }
                value={typeof answers[currentQ.id] === 'string' ? answers[currentQ.id] : ''}
                onChange={(e) => setAnswers({ ...answers, [currentQ.id]: e.target.value })}
                className={`w-full p-4 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  subject.subjectType === 'practical' || currentQ.codeSnippet
                    ? 'font-mono bg-slate-950 text-emerald-300 placeholder:text-slate-500'
                    : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                } ${isCurrentSubmitted ? 'opacity-80 cursor-not-allowed' : ''}`}
              />
            </div>
          )
        )}

        {/* NÚT NỘP BÀI CÂU NÀY (KHI CHƯA NỘP) */}
        {!isCurrentSubmitted ? (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                {shouldUseAlgoImage
                  ? 'Hãy tải lên hình ảnh bài làm và nhấn Nộp bài để Gemini AI chấm và xem lời giải.'
                  : shouldUseCodeAI
                  ? `Hãy nhập đoạn code ${targetLang} và nhấn Nộp bài để Gemini AI tự chấm đúng/sai.`
                  : 'Hãy chọn câu trả lời và nhấn Nộp bài để xem đúng/sai và lời giải thích đúng.'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleSubmitCurrentQuestion}
              disabled={!isCurrentAnswered || isGradingCurrent}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all cursor-pointer shrink-0"
            >
              {isGradingCurrent ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Gemini AI đang chấm bài...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Nộp bài câu này</span>
                </>
              )}
            </button>
          </div>
        ) : (
          /* KHI ĐÃ NỘP BÀI */
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
            {/* Banner Đúng / Sai */}
            {currentEvaluation.isCorrect ? (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-emerald-800 dark:text-emerald-200">
                  <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-bold text-xs sm:text-sm">
                      {shouldUseCodeAI || shouldUseAlgoImage
                        ? 'ĐẠT YÊU CẦU! Bài làm được đánh giá chính xác.'
                        : 'CHÍNH XÁC! Bạn đã trả lời đúng.'}
                    </div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      Đạt {currentEvaluation.earnedPoints} / {currentEvaluation.maxPoints} điểm cho câu hỏi này.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAiExplainingQuestion(currentQ)}
                  className="px-4 py-2 rounded-xl bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition shrink-0 cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Hỏi AI phân tích</span>
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-rose-800 dark:text-rose-200">
                  <XCircle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
                  <div>
                    <div className="font-bold text-xs sm:text-sm">
                      CHƯA CHÍNH XÁC ({currentEvaluation.earnedPoints} / {currentEvaluation.maxPoints} điểm)
                    </div>
                    <div className="text-[11px] text-rose-700 dark:text-rose-300">
                      Xem nhận xét chấm bài và lời giải thích chi tiết bên dưới.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAiExplainingQuestion(currentQ)}
                  className="px-4 py-2 rounded-xl bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition shrink-0 cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Hỏi AI phân tích</span>
                </button>
              </div>
            )}

            {/* Kết quả chấm bằng Gemini AI (cho Code C/C++/JS và ảnh Thuật toán) */}
            {currentAiGrading && (
              <AICodeGradingCard
                grading={currentAiGrading}
                title={
                  shouldUseAlgoImage
                    ? 'Gemini AI đánh giá hình ảnh bài làm Thuật toán'
                    : `Gemini AI chấm tự động mã nguồn ${targetLang}`
                }
              />
            )}

            {currentGradingError && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{currentGradingError}</span>
                </div>
                <button
                  type="button"
                  disabled={isGradingCurrent}
                  onClick={handleRetryAIGradeCurrent}
                  className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] shrink-0"
                >
                  {isGradingCurrent ? 'Đang chấm...' : 'Chấm lại bằng Gemini AI'}
                </button>
              </div>
            )}

            {/* Chi tiết Lời giải & Đáp án chuẩn */}
            <div className="p-4 sm:p-5 bg-blue-50/70 dark:bg-blue-950/30 rounded-2xl border border-blue-200 dark:border-blue-900/50 text-xs animate-in fade-in duration-200 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-bold text-blue-900 dark:text-blue-300 text-xs sm:text-sm">
                  <HelpCircle className="w-4 h-4 text-blue-600" />
                  <span>Giải thích & Phân tích đáp án chuẩn:</span>
                </div>
              </div>

              {/* Tự luận & Rubric khi chưa có Gemini grading */}
              {currentQ.questionType === 'essay' && !currentAiGrading && (() => {
                const rubricKeywords = String(currentQ.correctAnswer || '')
                  .split(/[|,;]+/)
                  .map(k => k.trim())
                  .filter(Boolean);
                return (
                  <div className="space-y-1.5 p-3 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-blue-200/70 dark:border-blue-900/50">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      Đánh giá bài làm: <span className="font-mono text-blue-700 dark:text-blue-400 font-bold">{currentEvaluation.earnedPoints} / {currentEvaluation.maxPoints} điểm</span>
                      {currentEvaluation.totalKeywords > 0 && ` (Khớp ${currentEvaluation.matchedKeywords.length}/${currentEvaluation.totalKeywords} từ khóa rubric)`}
                    </div>
                    {rubricKeywords.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] font-semibold text-slate-500">Từ khóa trọng tâm:</span>
                        {rubricKeywords.map((kw, i) => (
                          <span
                            key={i}
                            className={`px-2 py-0.5 rounded font-mono text-[11px] ${
                              currentEvaluation.matchedKeywords.includes(kw)
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Code mẫu chuẩn cho bài thực hành */}
              {currentQ.sampleSolution && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <Code className="w-3.5 h-3.5" />
                    <span>Mã nguồn hoàn chỉnh / Lời giải thực hành chuẩn:</span>
                  </div>
                  <pre className="p-3.5 rounded-xl bg-slate-950 text-emerald-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                    {currentQ.sampleSolution}
                  </pre>
                </div>
              )}

              {/* Lời giải thích */}
              <div className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line font-sans text-xs pt-1">
                {currentQ.explanation}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons & Matrix */}
      <div className="flex items-center justify-between gap-4">
        <button
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex(currentIndex - 1)}
          className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Câu trước</span>
        </button>

        {currentIndex === activeQuestions.length - 1 ? (
          <button
            onClick={handleFinishAll}
            disabled={isSubmittingAll || isGradingCurrent}
            className="px-6 py-2.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white transition-colors shadow-sm flex items-center gap-1.5"
          >
            {isSubmittingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            <span>{isSubmittingAll ? 'Gemini AI đang chấm toàn bộ...' : 'Nộp toàn bộ bài & Kết thúc'}</span>
          </button>
        ) : (
          <button
            onClick={() => setCurrentIndex(currentIndex + 1)}
            className="px-5 py-2.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <span>Câu tiếp theo</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Question Matrix */}
      <div className="bg-slate-50 dark:bg-slate-900/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-[11px] font-semibold text-slate-500">Chuyển nhanh câu hỏi:</div>
          <div className="text-[10px] text-slate-400 flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700 inline-block"></span> Chưa làm</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span> Đang làm</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> Đã nộp (Đúng)</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span> Đã nộp (Sai)</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeQuestions.map((q, idx) => {
            const val = answers[q.id];
            const isAnswered = hasQuestionAnswer(val);
            const isSubmitted = !!submittedQuestions[q.id];
            const ev = isSubmitted ? evaluateQuestionScore(q, val, aiGradingMap[q.id]) : null;
            const isCurrent = idx === currentIndex;

            let badgeStyle = 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700';

            if (isSubmitted) {
              if (ev?.isCorrect) {
                badgeStyle = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-400 dark:border-emerald-800';
              } else {
                badgeStyle = 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-400 dark:border-rose-800';
              }
            } else if (isAnswered) {
              badgeStyle = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-400 dark:border-blue-800';
            }

            return (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(idx)}
                className={`w-8 h-8 rounded-lg text-xs font-mono font-bold transition-all relative ${
                  isCurrent ? 'ring-2 ring-blue-500 scale-105 shadow-xs font-black' : ''
                } ${badgeStyle}`}
                title={`Câu ${idx + 1}: ${isSubmitted ? (ev?.isCorrect ? 'Đã nộp - Đúng' : 'Đã nộp - Sai') : isAnswered ? 'Đã trả lời' : 'Chưa làm'}`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* AI Explanation Modal */}
      {aiExplainingQuestion && (
        <AIExplanationModal
          question={aiExplainingQuestion}
          studentAnswer={
            isImageSubmissionAnswer(answers[aiExplainingQuestion.id])
              ? `[Hình ảnh bài làm: ${answers[aiExplainingQuestion.id].fileName}] ${answers[aiExplainingQuestion.id].note || ''}`
              : answers[aiExplainingQuestion.id]
          }
          subjectName={subject.name}
          onClose={() => setAiExplainingQuestion(null)}
        />
      )}
    </div>
  );
};
