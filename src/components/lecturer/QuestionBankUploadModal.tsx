import React, { useState, useRef, useMemo } from 'react';
import {
  X, Upload, FileSpreadsheet, FileText, Download,
  CheckCircle2, AlertTriangle, Trash2, Check, Loader2, Code2
} from 'lucide-react';
import { Subject, Chapter, User, QuestionUsage } from '../../types';
import {
  ParsedQuestionDraft,
  parseExcelQuestions,
  parseWordQuestions,
  downloadSampleExcelTemplate,
  downloadSampleWordTemplate,
  convertDraftToQuestionPayload,
} from '../../utils/questionFileParser';
import {
  importQuestionsFromFile,
  saveExam,
  requestAISolvePracticalQuestions,
  getSubjectsForUser,
} from '../../services/storageService';
import { normalizeVietnameseNFC } from '../../utils/fileDownload';

interface QuestionBankUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: Subject[];
  chapters: Chapter[];
  currentUser: User;
  defaultSubjectId?: string;
  onSuccess: (summaryMessage: string) => void;
}

export const QuestionBankUploadModal: React.FC<QuestionBankUploadModalProps> = ({
  isOpen,
  onClose,
  subjects,
  chapters,
  currentUser,
  defaultSubjectId,
  onSuccess,
}) => {
  const allowedSubjects = useMemo(
    () => (currentUser.role === 'admin' ? subjects : getSubjectsForUser(currentUser)),
    [currentUser, subjects]
  );
  const initialSubjectId = (defaultSubjectId && allowedSubjects.some(s => s.id === defaultSubjectId))
    ? defaultSubjectId
    : (allowedSubjects[0]?.id || subjects[0]?.id || '');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(initialSubjectId);
  const subjectChapters = chapters.filter(c => c.subjectId === selectedSubjectId);
  const [selectedChapterId, setSelectedChapterId] = useState<string>(subjectChapters[0]?.id || '');

  const [fileName, setFileName] = useState<string>('');
  const [drafts, setDrafts] = useState<ParsedQuestionDraft[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string>('');
  const [solvingAI, setSolvingAI] = useState(false);
  const [aiSolveStatus, setAiSolveStatus] = useState<string>('');
  const [aiSolveError, setAiSolveError] = useState<string>('');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  // Optional auto-create Mock Exam toggle & Usage separation (Ôn tập vs Đề thi thật)
  const [alsoCreateExam, setAlsoCreateExam] = useState<boolean>(true);
  const [questionUsage, setQuestionUsage] = useState<QuestionUsage>('exam');
  const [examTitle, setExamTitle] = useState<string>('');
  const [examDuration, setExamDuration] = useState<number>(45);
  const [examFormat, setExamFormat] = useState<'theory' | 'practical'>('theory');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevIsOpenRef = useRef<boolean>(false);

  React.useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;
    if (!isOpen) return;

    if (justOpened || !allowedSubjects.some(s => s.id === selectedSubjectId)) {
      const nextSubId =
        (defaultSubjectId && allowedSubjects.some(s => s.id === defaultSubjectId) && defaultSubjectId) ||
        allowedSubjects[0]?.id ||
        subjects[0]?.id ||
        '';
      setSelectedSubjectId(nextSubId);
      const nextSub = subjects.find(s => s.id === nextSubId);
      setExamFormat(nextSub?.subjectType === 'practical' ? 'practical' : 'theory');
      setExamDuration(nextSub?.subjectType === 'practical' ? 90 : 45);
      const nextChs = chapters.filter(c => c.subjectId === nextSubId);
      setSelectedChapterId(nextChs[0]?.id || '');
    }
  }, [isOpen, defaultSubjectId, allowedSubjects, subjects, chapters, selectedSubjectId]);

  if (!isOpen) return null;

  const selectedSubject = subjects.find(s => s.id === selectedSubjectId) || subjects[0];

  const solvePracticalDrafts = async (
    currentDrafts: ParsedQuestionDraft[],
    targetSub: Subject | undefined,
    forceAll = false
  ) => {
    const isPracticalSub = targetSub?.subjectType === 'practical';
    const practicalTargets = currentDrafts.filter(d => {
      const isPracticalQ = d.questionType === 'essay' || (isPracticalSub && d.options.length === 0);
      if (!isPracticalQ) return false;
      if (forceAll) return true;
      return !d.sampleSolution || !String(d.correctAnswer || '').trim();
    });

    if (practicalTargets.length === 0) return;

    setSolvingAI(true);
    setAiSolveError('');
    setAiSolveStatus(`AI đang tự tìm code mẫu và đáp án đúng cho ${practicalTargets.length} câu hỏi thực hành...`);

    try {
      const res = await requestAISolvePracticalQuestions({
        subjectName: targetSub?.name || 'Lập trình thực hành',
        subjectCode: targetSub?.code,
        questions: practicalTargets.map(q => ({
          tempId: q.tempId,
          content: q.content,
          existingCodeSnippet: q.codeSnippet,
          existingAnswer: typeof q.correctAnswer === 'string' ? q.correctAnswer : '',
        })),
      });

      const solMap = new Map(
        (res?.solutions || []).map(s => [s.tempId, s])
      );

      setDrafts(prev =>
        prev.map(d => {
          const sol = solMap.get(d.tempId);
          if (!sol) return d;
          const existingAns = String(d.correctAnswer || '').trim();
          const hasDefaultExp =
            !d.explanation ||
            d.explanation.includes('Sinh viên trình bày đúng giải thuật') ||
            d.explanation.includes('Câu hỏi được nhập từ ngân hàng');
          return {
            ...d,
            questionType: 'essay',
            sampleSolution: d.sampleSolution || sol.sampleSolution,
            correctAnswer: existingAns || sol.rubricKeywords || 'main|return|if|for',
            explanation: hasDefaultExp && sol.explanation ? sol.explanation : d.explanation,
            aiSolved: true,
          };
        })
      );

      setAiSolveStatus(
        `AI đã tự động tìm code chuẩn và đáp án cho ${practicalTargets.length}/${practicalTargets.length} câu hỏi thực hành (chỉ giải đúng câu hỏi trong tệp).`
      );
    } catch (err: any) {
      setAiSolveStatus('');
      setAiSolveError(
        err?.message || 'AI tạm thời chưa thể tìm code mẫu cho các câu thực hành. Bạn vẫn có thể bấm thử lại hoặc lưu câu hỏi.'
      );
    } finally {
      setSolvingAI(false);
    }
  };

  const handleSubjectChange = (newSubId: string) => {
    setSelectedSubjectId(newSubId);
    const sub = subjects.find(s => s.id === newSubId);
    const chs = chapters.filter(c => c.subjectId === newSubId);
    const nextChId = chs[0]?.id || '';
    setSelectedChapterId(nextChId);
    if (sub?.subjectType === 'practical') {
      setExamFormat('practical');
      setExamDuration(90);
    } else {
      setExamFormat('theory');
      setExamDuration(45);
    }
    const updatedDrafts = drafts.map(d => ({
      ...d,
      chapterId: nextChId,
      questionType: sub?.subjectType === 'practical' && d.options.length === 0 ? 'essay' as const : d.questionType,
    }));
    setDrafts(updatedDrafts);
    if (sub?.subjectType === 'practical' && updatedDrafts.some(d => !d.sampleSolution)) {
      solvePracticalDrafts(updatedDrafts, sub);
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError('');
    setAiSolveError('');
    setAiSolveStatus('');
    setDrafts([]);
    setSelectedIds(new Set());
    setParsing(true);
    setFileName(file.name);

    try {
      const targetChId = selectedChapterId || chapters.filter(c => c.subjectId === selectedSubjectId)[0]?.id || 'ch_general';
      const lower = file.name.toLowerCase();
      const isPracticalSub = selectedSubject?.subjectType === 'practical';
      let parsed: ParsedQuestionDraft[] = [];

      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        parsed = await parseExcelQuestions(file, targetChId);
      } else if (lower.endsWith('.docx')) {
        parsed = await parseWordQuestions(file, targetChId, { isPracticalSubject: isPracticalSub });
      } else {
        throw new Error('Chỉ hỗ trợ định dạng Word (.docx) hoặc Excel (.xlsx, .xls).');
      }

      if (isPracticalSub) {
        parsed = parsed.map(p =>
          p.options.length === 0 ? { ...p, questionType: 'essay', points: p.points === 1 ? 5 : p.points } : p
        );
      }

      setDrafts(parsed);
      setSelectedIds(new Set(parsed.map(p => p.tempId)));

      const isPracticalFile =
        parsed.some(p => p.questionType === 'essay') || isPracticalSub;

      setExamFormat(isPracticalFile ? 'practical' : 'theory');
      setExamDuration(isPracticalFile ? 90 : Math.max(20, parsed.length * 2));
      setExamTitle(
        isPracticalFile
          ? `Thi thử Thực hành: ${selectedSubject?.name || 'Học phần'} (${file.name.replace(/\.\w+$/, '')})`
          : `Đề thi thử: ${selectedSubject?.name || 'Học phần'} (${file.name.replace(/\.\w+$/, '')})`
      );

      setParsing(false);

      if (isPracticalFile && parsed.some(p => p.questionType === 'essay')) {
        await solvePracticalDrafts(parsed, selectedSubject);
      }
    } catch (err: any) {
      setDrafts([]);
      setSelectedIds(new Set());
      setParseError(err.message || 'Không thể đọc tệp câu hỏi. Vui lòng kiểm tra lại định dạng mẫu.');
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleDraft = (tempId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  };

  const removeDraft = (tempId: string) => {
    setDrafts(prev => prev.filter(d => d.tempId !== tempId));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(tempId);
      return next;
    });
  };

  const handleImportSubmit = () => {
    if (!selectedSubjectId) {
      setParseError('Vui lòng chọn môn học trước khi lưu.');
      return;
    }

    const chosenDrafts = drafts.filter(d => selectedIds.has(d.tempId));
    if (chosenDrafts.length === 0) {
      setParseError('Vui lòng chọn ít nhất 1 câu hỏi để nhập vào hệ thống.');
      return;
    }

    const fallbackChId = selectedChapterId || subjectChapters[0]?.id || 'ch_general';
    const payloads = chosenDrafts.map(d => {
      const base = convertDraftToQuestionPayload(
        {
          ...d,
          content: normalizeVietnameseNFC(d.content),
          explanation: normalizeVietnameseNFC(d.explanation),
          options: d.options.map(o => ({ ...o, text: normalizeVietnameseNFC(o.text) })),
          chapterId: d.chapterId || fallbackChId,
        },
        selectedSubjectId,
        currentUser.fullName
      );
      return {
        ...base,
        questionUsage,
      };
    });

    const savedQuestions = importQuestionsFromFile(payloads, fileName || 'Word/Excel');

    let examCreatedNote = '';
    if (alsoCreateExam) {
      const maxScore = 10;
      const standardTotalQuestions = examFormat === 'practical' ? 2 : 45;
      saveExam({
        subjectId: selectedSubjectId,
        title: normalizeVietnameseNFC(examTitle.trim() || `Đề thi thử từ ${fileName}`),
        code: `${examFormat === 'practical' ? 'TH' : 'EX'}-${Date.now().toString().slice(-4)}`,
        description: `Đề thi trong hệ thống thi thử (đề cương học phần) (${savedQuestions.length} câu, nhập từ ${fileName}).`,
        examFormat,
        durationMinutes: Math.max(5, Number(examDuration) || 45),
        totalQuestions: standardTotalQuestions,
        maxScore,
        passScore: 0,
        allowReview: true,
        shuffleQuestions: examFormat !== 'practical',
        maxAttempts: 5,
        status: 'published',
        questionIds: savedQuestions.map(q => q.id),
        createdBy: currentUser.id,
        isOfficialSchoolExam: true,
      });
      examCreatedNote = ' và tạo thành công 1 Đề thi thử mới (Đề cương học phần)!';
    }

    const usageLabel =
      questionUsage === 'exam'
        ? 'kho Hệ thống thi thử (Đề cương học phần)'
        : questionUsage === 'both'
        ? 'cả Ôn tập & Thi thử'
        : 'ngân hàng Ôn tập';

    onSuccess(
      `Đã nhập ${savedQuestions.length} câu hỏi từ "${fileName}" vào ${usageLabel} môn ${selectedSubject?.name}${examCreatedNote}`
    );
    setDrafts([]);
    setFileName('');
    onClose();
  };

  const selectedCount = drafts.filter(d => selectedIds.has(d.tempId)).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Nhập Ngân hàng Câu hỏi từ Word (.docx) hoặc Excel (.xlsx)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hệ thống tự động đọc câu hỏi trắc nghiệm & thực hành để làm đề thi thử và bài ôn tập cho sinh viên.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            aria-label="Đóng hộp thoại"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Step 1: Subject & Chapter + Template downloads */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Môn học áp dụng <span className="text-red-500">*</span>
              </label>
              {allowedSubjects.length > 0 ? (
                <select
                  value={selectedSubjectId}
                  onChange={e => handleSubjectChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                >
                  {allowedSubjects.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.isHot ? '[HOT] ' : ''}{s.code} - {s.name} ({s.subjectType === 'practical' ? 'Thực hành' : s.subjectType === 'project' ? 'Đồ án' : 'Lý thuyết'})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 text-xs font-medium">
                  Bạn chưa được phân công phụ trách môn học nào để tải lên ngân hàng câu hỏi.
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Chương học mặc định
              </label>
              <select
                value={selectedChapterId}
                onChange={e => setSelectedChapterId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
              >
                {subjectChapters.length > 0 ? (
                  subjectChapters.map(c => (
                    <option key={c.id} value={c.id}>
                      Chương {c.chapterNumber}: {c.title}
                    </option>
                  ))
                ) : (
                  <option value="ch_general">Chương tổng hợp</option>
                )}
              </select>
            </div>
          </div>

          {/* Sample template bar */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Tải tệp mẫu chuẩn định dạng (nếu cần tham khảo cấu trúc trước khi tải lên):
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadSampleWordTemplate('theory')}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                Mẫu Trắc nghiệm (.docx)
              </button>
              <button
                type="button"
                onClick={() => downloadSampleWordTemplate('practical')}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                Mẫu Thi Thực hành (.docx)
              </button>
              <button
                type="button"
                onClick={() => downloadSampleExcelTemplate('theory')}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-emerald-500 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                Mẫu Trắc nghiệm (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => downloadSampleExcelTemplate('practical')}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-emerald-500 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                Mẫu Thi Thực hành (.xlsx)
              </button>
            </div>
          </div>

          {/* Dropzone / File Picker */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.xlsx,.xls"
              onChange={handleFilePick}
              className="hidden"
              id="question-bank-file-upload"
            />
            <label
              htmlFor="question-bank-file-upload"
              className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-600 dark:hover:border-blue-500 bg-slate-50/50 dark:bg-slate-950/30 cursor-pointer transition text-center"
            >
              <Upload className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-2" />
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {parsing
                  ? 'Đang đọc và phân tích cấu trúc câu hỏi...'
                  : fileName
                  ? `Đã chọn: ${fileName} (Nhấn để chọn tệp khác)`
                  : 'Nhấn để chọn file Word (.docx) hoặc Excel (.xlsx) từ máy tính'}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Chỉ đọc đúng phần câu hỏi trong file Word/Excel và tự động trích xuất đáp án đúng có sẵn (dòng Đáp án, dấu *, gạch chân/in đậm hoặc Bảng đáp án).
              </p>
            </label>
          </div>

          {parseError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Parsed Question Preview */}
          {drafts.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Chỉ đọc đúng {drafts.length} câu hỏi trong tệp ({selectedCount} câu được chọn lưu)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {drafts.some(d => d.questionType === 'essay') && (
                    <button
                      type="button"
                      disabled={solvingAI}
                      onClick={() => solvePracticalDrafts(drafts, selectedSubject, true)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[11px] font-semibold flex items-center gap-1.5"
                    >
                      {solvingAI ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Code2 className="w-3.5 h-3.5" />
                      )}
                      <span>AI tự tìm code & đáp án thực hành</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedIds(
                        selectedCount === drafts.length
                          ? new Set()
                          : new Set(drafts.map(d => d.tempId))
                      )
                    }
                    className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                  >
                    {selectedCount === drafts.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </button>
                </div>
              </div>

              {(solvingAI || aiSolveStatus) && (
                <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 text-xs text-indigo-800 dark:text-indigo-200 flex items-center gap-2">
                  {solvingAI ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0 text-indigo-600" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-indigo-600" />
                  )}
                  <span>{aiSolveStatus}</span>
                </div>
              )}

              {aiSolveError && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{aiSolveError}</span>
                  </div>
                  <button
                    type="button"
                    disabled={solvingAI}
                    onClick={() => solvePracticalDrafts(drafts, selectedSubject, true)}
                    className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold shrink-0"
                  >
                    Thử lại
                  </button>
                </div>
              )}

              <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
                {drafts.map((q, idx) => {
                  const isChecked = selectedIds.has(q.tempId);
                  const isEditing = editingDraftId === q.tempId;
                  return (
                    <div
                      key={q.tempId}
                      className={`p-3.5 rounded-xl border text-xs transition ${
                        isChecked
                          ? 'bg-white dark:bg-slate-900 border-blue-300 dark:border-blue-800'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <label className="flex items-start gap-2.5 cursor-pointer flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleDraft(q.tempId)}
                            className="mt-0.5 rounded border-slate-300"
                          />
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              <span className="text-blue-700 dark:text-blue-400">Câu {idx + 1}</span>
                              <span>·</span>
                              <span>
                                {q.questionType === 'essay'
                                  ? 'Thực hành / Tự luận'
                                  : q.questionType === 'multiple_choice'
                                  ? 'Nhiều đáp án'
                                  : q.questionType === 'true_false'
                                  ? 'Đúng / Sai'
                                  : 'Trắc nghiệm 1 đáp án'}
                              </span>
                              <span>·</span>
                              <span>{q.points} điểm</span>
                              <span>·</span>
                              <span>
                                {q.difficulty === 'easy' ? 'Dễ' : q.difficulty === 'hard' ? 'Khó' : 'Trung bình'}
                              </span>
                              {q.questionType === 'essay' && q.sampleSolution && (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                                  Đã có code & đáp án chuẩn
                                </span>
                              )}
                              {q.questionType !== 'essay' && q.answerDetected && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                                  Tự lấy đáp án đúng
                                </span>
                              )}
                            </div>
                            <div className="font-medium text-slate-900 dark:text-white whitespace-pre-wrap">
                              {q.content}
                            </div>
                            {q.codeSnippet && (
                              <div className="space-y-1">
                                <div className="text-[10px] font-semibold text-slate-500">Code gợi ý đề bài:</div>
                                <pre className="p-2 rounded bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto">
                                  {q.codeSnippet}
                                </pre>
                              </div>
                            )}
                            {q.questionType === 'essay' && (q.sampleSolution || isEditing) && (
                              <div className="space-y-1.5 pt-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1">
                                    <Code2 className="w-3.5 h-3.5" />
                                    Code chuẩn / Đáp án thực hành (AI tìm kiếm):
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(ev) => {
                                      ev.preventDefault();
                                      setEditingDraftId(isEditing ? null : q.tempId);
                                    }}
                                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                                  >
                                    {isEditing ? 'Xong' : 'Chỉnh sửa code/đáp án'}
                                  </button>
                                </div>
                                {isEditing ? (
                                  <div
                                    className="space-y-2"
                                    onClick={(ev) => ev.preventDefault()}
                                  >
                                    <textarea
                                      rows={6}
                                      value={q.sampleSolution || ''}
                                      onChange={(ev) =>
                                        setDrafts(prev =>
                                          prev.map(item =>
                                            item.tempId === q.tempId
                                              ? { ...item, sampleSolution: ev.target.value }
                                              : item
                                          )
                                        )
                                      }
                                      placeholder="Nhập code mẫu chuẩn..."
                                      className="w-full p-2.5 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-slate-950 text-emerald-300 font-mono text-[11px]"
                                    />
                                    <input
                                      type="text"
                                      value={String(q.correctAnswer || '')}
                                      onChange={(ev) =>
                                        setDrafts(prev =>
                                          prev.map(item =>
                                            item.tempId === q.tempId
                                              ? { ...item, correctAnswer: ev.target.value }
                                              : item
                                          )
                                        )
                                      }
                                      placeholder="Từ khóa chấm điểm cách nhau bởi dấu | (vd: struct|for|return)"
                                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-[11px]"
                                    />
                                  </div>
                                ) : (
                                  <pre className="p-2.5 rounded-lg bg-slate-950 text-emerald-300 font-mono text-[11px] overflow-x-auto max-h-40">
                                    {q.sampleSolution}
                                  </pre>
                                )}
                                {q.correctAnswer && (
                                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                                    <strong>Từ khóa chấm (Rubric):</strong>{' '}
                                    <span className="font-mono text-emerald-700 dark:text-emerald-400">
                                      {String(q.correctAnswer)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                            {q.options.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1">
                                {q.options.map((opt, oi) => {
                                  const letter = ['A', 'B', 'C', 'D'][oi] || '';
                                  const isRight = Array.isArray(q.correctAnswer)
                                    ? q.correctAnswer.includes(opt.id)
                                    : q.correctAnswer === opt.id;
                                  return (
                                    <div
                                      key={`${opt.id}-${oi}`}
                                      className={`px-2 py-1 rounded ${
                                        isRight
                                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-semibold'
                                          : 'text-slate-600 dark:text-slate-400'
                                      }`}
                                    >
                                      {letter ? `${letter}. ` : ''}{opt.text}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {q.warnings && q.warnings.length > 0 && (
                              <div className="text-amber-600 dark:text-amber-400 text-[11px]">
                                Lưu ý: {q.warnings.join(' ')}
                              </div>
                            )}
                          </div>
                        </label>
                        <button
                          type="button"
                          onClick={() => removeDraft(q.tempId)}
                          className="p-1 text-slate-400 hover:text-red-600"
                          title="Xóa khỏi danh sách nhập"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Phân tách nguồn câu hỏi Ôn tập vs Hệ thống thi thử (đề cương học phần) */}
              <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 space-y-2">
                <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  Phân loại sử dụng bộ câu hỏi (Tách biệt Ôn tập và Hệ thống thi thử - đề cương học phần)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer ${questionUsage === 'exam' ? 'bg-white border-blue-600 text-blue-900 font-semibold' : 'bg-white/60 border-amber-200 text-slate-700'}`}>
                    <input
                      type="radio"
                      name="uploadQuestionUsage"
                      checked={questionUsage === 'exam'}
                      onChange={() => setQuestionUsage('exam')}
                      className="mt-0.5"
                    />
                    <div>
                      <div>Chỉ dùng cho Hệ thống thi thử</div>
                      <div className="text-[10px] font-normal text-slate-500">Ẩn khỏi phần Ôn tập miễn phí (Đề cương học phần)</div>
                    </div>
                  </label>
                  <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer ${questionUsage === 'practice' ? 'bg-white border-blue-600 text-blue-900 font-semibold' : 'bg-white/60 border-amber-200 text-slate-700'}`}>
                    <input
                      type="radio"
                      name="uploadQuestionUsage"
                      checked={questionUsage === 'practice'}
                      onChange={() => setQuestionUsage('practice')}
                      className="mt-0.5"
                    />
                    <div>
                      <div>Chỉ dùng để Ôn tập</div>
                      <div className="text-[10px] font-normal text-slate-500">Sinh viên luyện tập tự do theo chương</div>
                    </div>
                  </label>
                  <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer ${questionUsage === 'both' ? 'bg-white border-blue-600 text-blue-900 font-semibold' : 'bg-white/60 border-amber-200 text-slate-700'}`}>
                    <input
                      type="radio"
                      name="uploadQuestionUsage"
                      checked={questionUsage === 'both'}
                      onChange={() => setQuestionUsage('both')}
                      className="mt-0.5"
                    />
                    <div>
                      <div>Cả Ôn tập & Thi thử</div>
                      <div className="text-[10px] font-normal text-slate-500">Xuất hiện ở cả hai ngân hàng</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Optional Create Mock Exam directly */}
              <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 space-y-3">
                <label className="flex items-center gap-2 text-xs font-bold text-blue-900 dark:text-blue-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoCreateExam}
                    onChange={e => {
                      const checked = e.target.checked;
                      setAlsoCreateExam(checked);
                      setQuestionUsage(checked ? 'exam' : 'practice');
                    }}
                    className="rounded border-blue-400"
                  />
                  <span>Đồng thời tạo ngay Đề thi thử (Đề cương học phần) cho sinh viên từ bộ câu hỏi vừa tải lên</span>
                </label>

                {alsoCreateExam && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Tên Đề thi thử
                      </label>
                      <input
                        type="text"
                        value={examTitle}
                        onChange={e => setExamTitle(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Hình thức
                        </label>
                        <select
                          value={examFormat}
                          onChange={e => setExamFormat(e.target.value as 'theory' | 'practical')}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                        >
                          <option value="theory">Trắc nghiệm</option>
                          <option value="practical">Thực hành</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Phút làm bài
                        </label>
                        <input
                          type="number"
                          min={10}
                          max={180}
                          value={examDuration}
                          onChange={e => setExamDuration(Number(e.target.value) || 45)}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            disabled={selectedCount === 0 || solvingAI}
            onClick={handleImportSubmit}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            {solvingAI ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {solvingAI
              ? 'AI đang tìm code & đáp án...'
              : `Lưu ${selectedCount > 0 ? `${selectedCount} câu hỏi` : 'câu hỏi'} vào Hệ thống`}
          </button>
        </div>
      </div>
    </div>
  );
};
