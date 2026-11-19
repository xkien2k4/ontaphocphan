import React, { useState, useEffect, useMemo } from 'react';
import { Subject, Chapter, DifficultyLevel } from '../../types';
import { BookOpen } from 'lucide-react';

interface PracticeSetupProps {
  subjects: Subject[];
  chapters: Chapter[];
  initialSubjectId?: string;
  initialChapterId?: string;
  onStartSession: (config: {
    subjectId: string;
    chapterId?: string;
    difficulty: DifficultyLevel | 'all';
    questionCount: number;
    instantFeedback: boolean;
  }) => void;
}

export const PracticeSetup: React.FC<PracticeSetupProps> = ({
  subjects,
  chapters,
  initialSubjectId,
  initialChapterId,
  onStartSession,
}) => {
  const practiceSubjects = useMemo(
    () => subjects.filter(s => s.subjectType !== 'project'),
    [subjects]
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    (initialSubjectId && practiceSubjects.some(s => s.id === initialSubjectId) ? initialSubjectId : practiceSubjects[0]?.id) || ''
  );
  const [selectedChapterId, setSelectedChapterId] = useState<string>(
    initialChapterId || 'all'
  );
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel | 'all'>('all');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [instantFeedback] = useState<boolean>(false);

  useEffect(() => {
    if (initialSubjectId && practiceSubjects.some(s => s.id === initialSubjectId)) {
      setSelectedSubjectId(initialSubjectId);
      setSelectedChapterId(initialChapterId || 'all');
    } else if (practiceSubjects.length > 0 && !practiceSubjects.some(s => s.id === selectedSubjectId)) {
      setSelectedSubjectId(practiceSubjects[0].id);
      setSelectedChapterId('all');
    }
  }, [initialSubjectId, initialChapterId, practiceSubjects]);

  const currentChapters = chapters.filter(c => c.subjectId === selectedSubjectId);
  const currentSubject = practiceSubjects.find(s => s.id === selectedSubjectId);

  const handleSubjectChange = (id: string) => {
    setSelectedSubjectId(id);
    setSelectedChapterId('all');
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId || practiceSubjects.length === 0) return;
    onStartSession({
      subjectId: selectedSubjectId,
      chapterId: selectedChapterId === 'all' ? undefined : selectedChapterId,
      difficulty: selectedDifficulty,
      questionCount,
      instantFeedback,
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-10 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
              Cấu hình Phiên Ôn tập Tự do
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Bộ câu hỏi ôn tập riêng biệt theo chương (tách biệt hoàn toàn với Đề thi thử thật của Trường)
            </p>
          </div>
        </div>

        <form onSubmit={handleStart} className="space-y-6">
          {/* 1. Select Subject */}
          <div>
            <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
              1. Chọn môn học cần ôn luyện ({practiceSubjects.length} môn Lý thuyết & Thực hành)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto p-1">
              {practiceSubjects.map((sub) => (
                <div
                  key={sub.id}
                  onClick={() => handleSubjectChange(sub.id)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                    selectedSubjectId === sub.id
                      ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-semibold ring-1 ring-blue-500'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-mono text-[10px] text-slate-400">{sub.code}</span>
                    {sub.isHot && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-extrabold uppercase tracking-wider">
                        HOT
                      </span>
                    )}
                  </div>
                  <div className="font-medium truncate mt-0.5">{sub.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Select Chapter */}
          <div>
            <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
              2. Chọn chương học hoặc chủ đề
            </label>
            <select
              value={selectedChapterId}
              onChange={(e) => setSelectedChapterId(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Toàn bộ các chương của môn ({currentSubject?.name})</option>
              {currentChapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.title}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Difficulty & Count */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
                3. Mức độ khó
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'all', label: 'Tất cả' },
                  { id: 'easy', label: 'Dễ' },
                  { id: 'medium', label: 'Vừa' },
                  { id: 'hard', label: 'Khó' },
                ].map((diff) => (
                  <button
                    key={diff.id}
                    type="button"
                    onClick={() => setSelectedDifficulty(diff.id as any)}
                    className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                      selectedDifficulty === diff.id
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {diff.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
                4. Số lượng câu hỏi
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

          <div className="pt-4 flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={practiceSubjects.length === 0 || !selectedSubjectId}
              className="px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4" />
              <span>Bắt đầu Luyện tập ngay</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
