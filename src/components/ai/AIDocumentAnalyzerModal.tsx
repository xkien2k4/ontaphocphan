import React from 'react';
import { LearningDocument } from '../../types';
import { X, CheckCircle2, BookOpen, Layers, Award, FileText } from 'lucide-react';

interface AIDocumentAnalyzerModalProps {
  document: LearningDocument | null;
  isOpen: boolean;
  onClose: () => void;
  onStartGenerateQuestions: (doc: LearningDocument) => void;
}

export const AIDocumentAnalyzerModal: React.FC<AIDocumentAnalyzerModalProps> = ({
  document,
  isOpen,
  onClose,
  onStartGenerateQuestions,
}) => {
  if (!isOpen || !document) return null;

  const result = document.analysisResult;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded">
                  AI Phân tích Cấu trúc & Đề cương
                </span>
                <span className="text-xs text-slate-400">· {document.fileType.toUpperCase()}</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white truncate max-w-xl">
                {document.title}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs sm:text-sm">
          {result ? (
            <>
              {/* Course Goals & CLO */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
                  <div className="flex items-center gap-2 font-bold text-blue-900 dark:text-blue-300 mb-2">
                    <Award className="w-4 h-4 text-blue-600" />
                    <span>Mục tiêu Học phần (Course Goals)</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    {result.courseGoals?.map((goal, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span>{goal}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
                  <div className="flex items-center gap-2 font-bold text-indigo-900 dark:text-indigo-300 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                    <span>Chuẩn đầu ra môn học (CLOs)</span>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    {result.clos?.map((clo, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                          [{clo.code}]
                        </span>
                        <span>{clo.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Chapters Breakdown */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>Cấu trúc các Chương & Khái niệm Cốt lõi được trích xuất</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {result.chapters?.map((ch, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-2"
                    >
                      <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                        <span>Chương {ch.chapterNumber}: {ch.title}</span>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2">{ch.summary}</p>
                      
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                          Khái niệm & Định nghĩa trọng tâm:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {ch.coreConcepts?.map((c, cIdx) => (
                            <span
                              key={cIdx}
                              className="text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Priority Review Recommendations */}
              <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs">
                <span className="font-bold text-amber-900 dark:text-amber-300 block mb-1.5">
                  Đề xuất chủ đề ưu tiên sinh câu hỏi ôn tập:
                </span>
                <div className="flex flex-wrap gap-2">
                  {result.priorityReview?.map((topic, idx) => (
                    <span
                      key={idx}
                      className="bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-lg font-medium"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-slate-500">
              Chưa có kết quả phân tích AI cho tài liệu này. Vui lòng bấm "Phân tích tài liệu bằng AI".
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Dữ liệu phân tích làm cơ sở chuẩn để AI sinh câu hỏi không bị sai lệch kiến thức.
          </span>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Đóng
            </button>
            <button
              onClick={() => {
                onClose();
                onStartGenerateQuestions(document);
              }}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-sm"
            >
              <span>Tiến hành tạo câu hỏi AI từ tài liệu này</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
