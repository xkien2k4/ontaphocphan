import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BookOpen,
  Code2,
  Copy,
  Check,
  RotateCw,
  Lightbulb,
} from 'lucide-react';
import { Question, AIGeneratedQuestion } from '../../types';
import { requestAIExplainQuestion } from '../../services/storageService';

interface AIExplanationModalProps {
  question: Question | AIGeneratedQuestion;
  studentAnswer?: string | string[];
  subjectName: string;
  onClose: () => void;
}

export const AIExplanationModal: React.FC<AIExplanationModalProps> = ({
  question,
  studentAnswer,
  subjectName,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [explanationData, setExplanationData] = useState<{
    whyCorrect: string;
    whyOthersWrong: { option: string; reason: string }[];
    keyTakeaway: string;
    codeExample?: string;
    textbookCitation?: string;
  } | null>(null);

  const fetchExplanation = async () => {
    setLoading(true);
    setError(null);
    try {
      const studentAnsStr = Array.isArray(studentAnswer)
        ? studentAnswer.join(', ')
        : (studentAnswer ?? 'Chưa chọn');

      const res = await requestAIExplainQuestion({
        questionContent: question.content,
        studentAnswer: studentAnsStr,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        options: question.options,
        subjectName,
      });

      if (res && res.explanation) {
        setExplanationData(res.explanation);
      } else {
        throw new Error('Dữ liệu phản hồi từ AI không đúng cấu trúc');
      }
    } catch (err: any) {
      console.error('Lỗi khi tải AI explanation:', err);
      setError(err.message || 'Không thể kết nối với dịch vụ AI phân tích.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExplanation();
  }, [question.id]);

  const handleCopy = () => {
    if (!explanationData) return;
    const text = `[GIẢI THÍCH AI - MÔN ${subjectName.toUpperCase()}]
Câu hỏi: ${question.content}

1. TẠI SAO ĐÁP ÁN ĐÚNG:
${explanationData.whyCorrect}

2. PHÂN TÍCH CÁC PHƯƠNG ÁN SAI / BẪY THƯỜNG GẶP:
${explanationData.whyOthersWrong?.map(w => `- ${w.option}: ${w.reason}`).join('\n')}

3. GHI NHỚ CỐT LÕI:
${explanationData.keyTakeaway}
${explanationData.codeExample ? `\n4. MINH HỌA:\n${explanationData.codeExample}` : ''}
${explanationData.textbookCitation ? `\nNguồn: ${explanationData.textbookCitation}` : ''}
`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl my-8 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-linear-to-r from-blue-500/10 via-indigo-500/10 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-white text-lg">
                  AI Phân Tích & Giải Thích Chi Tiết
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-800">
                  {subjectName}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Bóc tách nguyên lý cốt lõi, đối chiếu chuẩn đầu ra & phân tích các bẫy đề thi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* Question Review Card */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Nội dung câu hỏi</span>
              {question.options && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {question.options.length} phương án
                </span>
              )}
            </div>
            <p className="text-slate-900 dark:text-white font-medium text-base leading-relaxed">
              {question.content}
            </p>

            {question.codeSnippet && (
              <pre className="p-3 bg-slate-950 text-slate-100 rounded-lg font-mono text-xs overflow-x-auto border border-slate-800">
                <code>{question.codeSnippet}</code>
              </pre>
            )}

            {question.options && question.options.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                {question.options.map((opt, oIdx) => {
                  const isCorrect = Array.isArray(question.correctAnswer)
                    ? question.correctAnswer.includes(opt.id)
                    : question.correctAnswer === opt.id;
                  const isStudentSelected = Array.isArray(studentAnswer)
                    ? studentAnswer.includes(opt.id)
                    : studentAnswer === opt.id;

                  return (
                    <div
                      key={`${opt.id}-${oIdx}`}
                      className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 transition ${
                        isCorrect
                          ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-medium'
                          : isStudentSelected
                          ? 'border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
                          : 'border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold uppercase shrink-0">{opt.id}.</span>
                        <span className="truncate">{opt.text}</span>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        {isCorrect && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Đúng
                          </span>
                        )}
                        {isStudentSelected && !isCorrect && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                            <XCircle className="w-3.5 h-3.5" /> Bạn chọn
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Loading State */}
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 animate-spin">
                <RotateCw className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">
                  AI đang tư duy và tổng hợp phân tích...
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                  Truy vấn cơ sở tri thức đề cương, phân tích cấu trúc câu hỏi và chuẩn bị lời giải chuyên sâu.
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
              <div className="space-y-2 flex-1">
                <p className="font-semibold text-xs">Không thể tạo lời giải AI</p>
                <p className="text-xs">{error}</p>
                <button
                  onClick={fetchExplanation}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Thử lại
                </button>
              </div>
            </div>
          )}

          {/* Explanation Data Result */}
          {!loading && explanationData && (
            <div className="space-y-4">
              {/* 1. Why Correct */}
              <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2 mb-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>1. Tại sao đáp án này chính xác?</span>
                </div>
                <p className="text-slate-700 dark:text-slate-200 text-xs sm:text-sm leading-relaxed whitespace-pre-line">
                  {explanationData.whyCorrect}
                </p>
              </div>

              {/* 2. Why Others Wrong / Traps */}
              {explanationData.whyOthersWrong && explanationData.whyOthersWrong.length > 0 && (
                <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2 mb-2 text-amber-800 dark:text-amber-300 font-bold text-sm">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>2. Phân tích bẫy đề thi & các phương án sai</span>
                  </div>
                  <ul className="space-y-2">
                    {explanationData.whyOthersWrong.map((item, idx) => (
                      <li key={idx} className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 flex items-start gap-2">
                        <span className="font-bold text-amber-700 dark:text-amber-400 shrink-0">
                          {item.option}:
                        </span>
                        <span>{item.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 3. Key Takeaway */}
              <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800/80 bg-blue-50/50 dark:bg-blue-950/30">
                <div className="flex items-center gap-2 mb-2 text-blue-800 dark:text-blue-300 font-bold text-sm">
                  <Lightbulb className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>3. Điểm kiến thức cốt lõi cần ghi nhớ (Key Takeaway)</span>
                </div>
                <p className="text-slate-700 dark:text-slate-200 text-xs sm:text-sm leading-relaxed">
                  {explanationData.keyTakeaway}
                </p>
              </div>

              {/* 4. Code Example (if any) */}
              {explanationData.codeExample && (
                <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/30 dark:bg-indigo-950/20">
                  <div className="flex items-center gap-2 mb-2 text-indigo-800 dark:text-indigo-300 font-bold text-sm">
                    <Code2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>4. Minh họa mã nguồn / Cú pháp chuẩn</span>
                  </div>
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg font-mono text-xs overflow-x-auto border border-slate-800">
                    <code>{explanationData.codeExample}</code>
                  </pre>
                </div>
              )}

              {/* 5. Textbook / Syllabus Citation */}
              {explanationData.textbookCitation && (
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
                  <BookOpen className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Nguồn tham chiếu đề cương & giáo trình:
                    </span>{' '}
                    <span>{explanationData.textbookCitation}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-blue-500" />
            <span>Phân tích bởi Gemini AI • Khoa CNTT</span>
          </div>
          <div className="flex items-center gap-2">
            {explanationData && (
              <button
                onClick={handleCopy}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Đã sao chép' : 'Sao chép giải thích'}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white font-semibold text-xs transition"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
