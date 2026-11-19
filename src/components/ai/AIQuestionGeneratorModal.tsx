import React, { useState, useEffect } from 'react';
import { LearningDocument, Subject, DifficultyLevel, QuestionType, BloomLevel, AIGeneratedQuestion, QuestionOption } from '../../types';
import { X, FileText, Loader2, AlertCircle } from 'lucide-react';
import { makeUniqueId, requestAIGenerateQuestions, saveAIGeneratedQuestion } from '../../services/storageService';

interface AIQuestionGeneratorModalProps {
  document: LearningDocument | null;
  subjects: Subject[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AIQuestionGeneratorModal: React.FC<AIQuestionGeneratorModalProps> = ({
  document,
  subjects,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [selectedChapter, setSelectedChapter] = useState<string>('all');
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [bloomLevel, setBloomLevel] = useState<BloomLevel>(2);
  const [questionType, setQuestionType] = useState<QuestionType>('single_choice');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedChapter('all');
      setErrorMsg(null);
      setLoading(false);
    }
  }, [isOpen, document?.id]);

  if (!isOpen || !document) return null;

  const currentSubject = subjects.find(s => s.id === document.subjectId);

  const bloomDescriptions: Record<BloomLevel, { label: string; desc: string }> = {
    1: { label: 'Bậc 1: Nhớ (Remember)', desc: 'Nhắc lại định nghĩa, cú pháp, thuật ngữ cơ bản' },
    2: { label: 'Bậc 2: Hiểu (Understand)', desc: 'Giải thích nguyên lý, so sánh mô hình, phân biệt cơ chế' },
    3: { label: 'Bậc 3: Vận dụng (Apply)', desc: 'Áp dụng thuật toán, viết truy vấn SQL, tính toán tham số' },
    4: { label: 'Bậc 4: Phân tích (Analyze)', desc: 'Đọc hiểu mã nguồn, phát hiện lỗi Memory Leak/Deadlock' },
    5: { label: 'Bậc 5: Đánh giá (Evaluate)', desc: 'Đánh giá độ phức tạp O(n), lựa chọn giải pháp tối ưu' },
    6: { label: 'Bậc 6: Sáng tạo (Create)', desc: 'Thiết kế lược đồ CSDL chuẩn, lập kế hoạch kiến trúc hệ thống' },
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const response = await requestAIGenerateQuestions({
        subjectName: currentSubject?.name || 'Môn học CNTT',
        chapterTitle: selectedChapter === 'all' ? undefined : selectedChapter,
        documentTitle: document.title,
        rawContent: document.rawContent || '',
        questionCount,
        difficulty,
        bloomLevel,
        questionType,
      });

      if (response && response.result && Array.isArray(response.result.questions)) {
        const jobId = makeUniqueId('job');
        const generatedList = response.result.questions.filter(
          (q: any) => q && typeof q.content === 'string' && q.content.trim().length > 0
        );

        if (generatedList.length === 0) {
          throw new Error('AI chưa trích xuất được câu hỏi hợp lệ từ tài liệu này. Vui lòng bổ sung nội dung chi tiết hơn hoặc giảm số lượng câu mỗi lần tạo.');
        }

        const normalizeChoiceId = (val: string) => {
          const s = val.trim();
          if (/^opt_[1-4]$/i.test(s)) return s.toLowerCase();
          if (/^[abcd]$/i.test(s)) return `opt_${s.toUpperCase().charCodeAt(0) - 64}`;
          if (/^[1-4]$/.test(s)) return `opt_${s}`;
          return s;
        };

        generatedList.forEach((q: any, idx: number) => {
          const resolvedType = (q.type as QuestionType) || questionType;
          const rawOptions: any[] = Array.isArray(q.options) ? q.options.filter((o: any) => o && String(o.text || '').trim().length > 0) : [];
          const resolvedOptions: QuestionOption[] | undefined =
            resolvedType === 'fill_blank' || resolvedType === 'essay'
              ? undefined
              : resolvedType === 'true_false'
              ? [
                  { id: 'opt_true', text: 'Đúng' },
                  { id: 'opt_false', text: 'Sai' },
                ]
              : rawOptions.length >= 2
              ? (() => {
                  const seenOptIds = new Set<string>();
                  return rawOptions.map((o: any, oIdx: number) => {
                    let optId = o.id ? String(o.id).trim() : `opt_${oIdx + 1}`;
                    if (seenOptIds.has(optId)) {
                      optId = `opt_${oIdx + 1}_${Math.random().toString(36).slice(2, 5)}`;
                    }
                    seenOptIds.add(optId);
                    return {
                      id: optId,
                      text: String(o.text).trim(),
                    };
                  });
                })()
              : [
                  { id: 'opt_1', text: 'Phương án A' },
                  { id: 'opt_2', text: 'Phương án B' },
                  { id: 'opt_3', text: 'Phương án C' },
                  { id: 'opt_4', text: 'Phương án D' },
                ];

          let resolvedCorrect = q.correctAnswer;
          if (resolvedType === 'multiple_choice') {
            const items = Array.isArray(resolvedCorrect)
              ? resolvedCorrect.map((x: any) => normalizeChoiceId(String(x)))
              : String(resolvedCorrect || '')
                  .split(/[,;|\s]+/)
                  .map((s: string) => normalizeChoiceId(s))
                  .filter(Boolean);
            const validIds = new Set((resolvedOptions || []).map(o => o.id));
            const matched = items.filter(id => validIds.has(id));
            resolvedCorrect = matched.length > 0 ? matched : ['opt_1', 'opt_2'];
          } else if (resolvedType === 'true_false') {
            const raw = String(resolvedCorrect || '').trim().toLowerCase();
            resolvedCorrect = raw === 'false' || raw === 'opt_false' || raw === 'sai' || raw === '0' ? 'opt_false' : 'opt_true';
          } else if (resolvedType === 'single_choice') {
            const normalized = normalizeChoiceId(String(resolvedCorrect || 'opt_1'));
            const validIds = new Set((resolvedOptions || []).map(o => o.id));
            resolvedCorrect = validIds.has(normalized) ? normalized : (resolvedOptions?.[0]?.id || 'opt_1');
          } else {
            resolvedCorrect = String(resolvedCorrect || '').trim();
          }

          const newAiQ: AIGeneratedQuestion = {
            id: `aiq_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
            jobId,
            documentId: document.id,
            documentTitle: document.title,
            subjectId: document.subjectId,
            bloomLevel,
            difficulty: (q.difficulty as DifficultyLevel) || difficulty,
            questionType: resolvedType,
            content: q.content.trim(),
            codeSnippet: q.codeSnippet ? String(q.codeSnippet).trim() : undefined,
            options: resolvedOptions,
            correctAnswer: resolvedCorrect,
            explanation: q.explanation || 'Lời giải chi tiết do AI trích xuất từ tài liệu.',
            topic: q.topic || 'Kiến thức trọng tâm',
            sourceReference: q.sourceReference || `${document.title} - Phần liên quan`,
            status: 'pending_review',
            createdAt: new Date().toISOString(),
          };
          saveAIGeneratedQuestion(newAiQ);
        });

        onSuccess();
        onClose();
      } else {
        throw new Error('Dữ liệu AI trả về không đúng cấu trúc yêu cầu');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Không thể tạo câu hỏi lúc này. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Cấu hình AI Tự động Sinh Câu hỏi
              </h3>
              <p className="text-xs text-slate-500">
                Tài liệu nguồn: <strong className="text-slate-800 dark:text-slate-200">{document.title}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 rounded-xl text-xs space-y-1.5">
            <div className="flex items-start gap-2 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <span>{errorMsg}</span>
            </div>
            <p className="text-[11px] text-rose-700/85 dark:text-rose-300/85 pl-6">
              Gợi ý: Nếu gặp lỗi kết nối hoặc quá tải tạm thời, hãy chọn mức <strong>5 câu</strong> mỗi lần và bấm <strong>Bắt đầu Sinh Câu hỏi bằng AI</strong> lại.
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleGenerate} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* Chapter selection */}
          <div>
            <label className="block font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1.5">
              1. Chọn phạm vi kiến thức trong tài liệu
            </label>
            <select
              value={selectedChapter}
              onChange={(e) => setSelectedChapter(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="all">Toàn bộ nội dung tài liệu / đề cương</option>
              {document.analysisResult?.chapters?.map((ch, chIdx) => (
                <option key={`${ch.chapterNumber}-${chIdx}`} value={ch.title}>
                  Chương {ch.chapterNumber}: {ch.title}
                </option>
              ))}
            </select>
          </div>

          {/* Bloom Taxonomy */}
          <div>
            <label className="block font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1.5">
              2. Cấp độ nhận thức theo thang Bloom (6 Bậc)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([1, 2, 3, 4, 5, 6] as BloomLevel[]).map((level) => (
                <div
                  key={level}
                  onClick={() => setBloomLevel(level)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    bloomLevel === level
                      ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 ring-1 ring-blue-500 font-semibold'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="text-xs font-bold">{bloomDescriptions[level].label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{bloomDescriptions[level].desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Difficulty & Count */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1.5">
                3. Mức độ khó
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'easy', label: 'Dễ' },
                  { id: 'medium', label: 'Vừa' },
                  { id: 'hard', label: 'Khó' },
                ].map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDifficulty(d.id as any)}
                    className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                      difficulty === d.id
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1.5">
                4. Số lượng câu hỏi AI tạo
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 15, 20].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setQuestionCount(num)}
                    className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                      questionCount === num
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {num} câu
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Question Type */}
          <div>
            <label className="block font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1.5">
              5. Dạng câu hỏi mong muốn
            </label>
            <select
              value={questionType}
              onChange={(e) => setQuestionType(e.target.value as QuestionType)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="single_choice">Trắc nghiệm một đáp án đúng (Mặc định 4 phương án A, B, C, D)</option>
              <option value="multiple_choice">Trắc nghiệm nhiều đáp án đúng</option>
              <option value="true_false">Đúng / Sai</option>
              <option value="fill_blank">Điền từ vào chỗ trống</option>
              <option value="essay">Câu hỏi tự luận</option>
            </select>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>AI đang phân tích & tạo {questionCount} câu hỏi...</span>
                </>
              ) : (
                <>
                  <span>Bắt đầu Sinh Câu hỏi bằng AI</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
