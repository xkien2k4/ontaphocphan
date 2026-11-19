import React, { useState } from 'react';
import { Subject } from '../../types';

interface SubjectListProps {
  subjects: Subject[];
  onSelectSubject: (subjectId: string) => void;
  onStartPractice: (subjectId: string) => void;
}

export const SubjectList: React.FC<SubjectListProps> = ({
  subjects,
  onSelectSubject,
  onStartPractice,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'theory' | 'practical' | 'project'>('all');

  const filtered = subjects.filter((s) => {
    const sType = s.subjectType || 'theory';
    if (typeFilter !== 'all' && sType !== typeFilter) return false;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.code || '').toLowerCase().includes(q) ||
      (s.nameEn || '').toLowerCase().includes(q) ||
      (s.assignedLecturerName && s.assignedLecturerName.toLowerCase().includes(q))
    );
  });

  const theorySubjects = filtered.filter(s => (s.subjectType || 'theory') === 'theory');
  const practicalSubjects = filtered.filter(s => s.subjectType === 'practical');
  const projectSubjects = filtered.filter(s => s.subjectType === 'project');

  const getTypeLabel = (type?: string) => {
    if (type === 'practical') return { text: 'Thực hành', color: 'text-emerald-700 dark:text-emerald-400' };
    if (type === 'project') return { text: 'Đồ án học phần', color: 'text-indigo-700 dark:text-indigo-400' };
    return { text: 'Lý thuyết · Trắc nghiệm', color: 'text-slate-600 dark:text-slate-400' };
  };

  const renderSubjectCard = (subject: Subject, idx: number) => {
    const typeInfo = getTypeLabel(subject.subjectType);
    const isProject = subject.subjectType === 'project';
    const isPractical = subject.subjectType === 'practical';

    return (
      <div
        key={subject.id}
        className={`bg-white dark:bg-slate-900 rounded-xl border p-5 flex flex-col justify-between transition ${
          isProject
            ? 'border-indigo-200 dark:border-indigo-900/60 hover:border-indigo-500 dark:hover:border-indigo-600'
            : isPractical
            ? 'border-emerald-200 dark:border-emerald-900/60 hover:border-emerald-500 dark:hover:border-emerald-600'
            : 'border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-700'
        }`}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                {subject.code}
              </span>
              {subject.isHot && (
                <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
                  HOT
                </span>
              )}
            </div>
            <span className={`text-[11px] font-semibold ${typeInfo.color}`}>
              {typeInfo.text}
            </span>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
              {idx + 1}. {subject.name}
            </h3>
            {subject.nameEn && <div className="text-[11px] text-slate-400 italic mt-0.5">{subject.nameEn}</div>}
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed">
            {subject.description}
          </p>

          {/* Subject Info Table */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Giảng viên phụ trách:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {subject.assignedLecturerName || 'Chưa phân công'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Số tín chỉ:</span>
              <span className="font-mono font-medium">{subject.credits} tín chỉ</span>
            </div>
          </div>
        </div>

        <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
          <button
            onClick={() => onSelectSubject(subject.id)}
            className="flex-1 py-1.5 px-3 rounded-lg text-center text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition"
          >
            {isProject ? 'Đề cương & Hướng dẫn' : 'Đề cương & Bài giảng'}
          </button>
          <button
            onClick={() => (isProject ? onSelectSubject(subject.id) : onStartPractice(subject.id))}
            className={`flex-1 py-1.5 px-3 rounded-lg text-center text-xs font-bold text-white shadow-xs transition ${
              isProject
                ? 'bg-indigo-700 hover:bg-indigo-800'
                : isPractical
                ? 'bg-emerald-700 hover:bg-emerald-800'
                : 'bg-blue-800 hover:bg-blue-900'
            }`}
          >
            {isProject ? 'Đăng ký đề tài' : isPractical ? 'Ôn tập / Thi thử' : 'Vào ôn tập'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-400">
            Khung Chương Trình Đào Tạo Khoa CNTT
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
            Danh Sách Học Phần Chuyên Ngành
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Phân chia rõ học phần Lý thuyết · Trắc nghiệm, Thực hành và Đồ án học phần đăng ký đề tài
          </p>
        </div>

        {/* Search Input */}
        <div className="w-full md:w-80">
          <input
            type="text"
            placeholder="Tìm theo mã môn, tên môn hoặc giảng viên..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Type Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {[
          { key: 'all', label: `Tất cả (${subjects.length})` },
          { key: 'theory', label: `Lý thuyết · Trắc nghiệm (${subjects.filter(s => (s.subjectType || 'theory') === 'theory').length})` },
          { key: 'practical', label: `Thực hành (${subjects.filter(s => s.subjectType === 'practical').length})` },
          { key: 'project', label: `Đồ án học phần (${subjects.filter(s => s.subjectType === 'project').length})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setTypeFilter(tab.key as any)}
            className={`px-3.5 py-1.5 rounded-lg font-semibold transition ${
              typeFilter === tab.key
                ? 'bg-blue-800 text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-blue-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grouped Subject Sections when viewing All, or Flat Grid when filtered */}
      {typeFilter === 'all' ? (
        <div className="space-y-10">
          {theorySubjects.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white uppercase tracking-wide">
                    1. Học phần Lý thuyết & Trắc nghiệm ({theorySubjects.length} môn)
                  </h2>
                  <p className="text-xs text-slate-500">Ôn tập ngân hàng câu hỏi trắc nghiệm và thi thử trực tuyến</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {theorySubjects.map((s, idx) => renderSubjectCard(s, idx))}
              </div>
            </section>
          )}

          {practicalSubjects.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-emerald-200 dark:border-emerald-900/60 pb-2.5">
                <div>
                  <h2 className="text-base font-extrabold text-emerald-800 dark:text-emerald-400 uppercase tracking-wide">
                    2. Học phần Thực hành ({practicalSubjects.length} môn)
                  </h2>
                  <p className="text-xs text-slate-500">Thi thử lập trình/SQL trực tuyến giống kỳ thi kết thúc học phần</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {practicalSubjects.map((s, idx) => renderSubjectCard(s, idx))}
              </div>
            </section>
          )}

          {projectSubjects.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-indigo-200 dark:border-indigo-900/60 pb-2.5">
                <div>
                  <h2 className="text-base font-extrabold text-indigo-800 dark:text-indigo-400 uppercase tracking-wide">
                    3. Các môn Đồ án Học phần ({projectSubjects.length} môn)
                  </h2>
                  <p className="text-xs text-slate-500">Xem đề cương hướng dẫn đồ án, đăng ký đề tài thực hiện và nộp mã nguồn GitHub</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {projectSubjects.map((s, idx) => renderSubjectCard(s, idx))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((subject, idx) => renderSubjectCard(subject, idx))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="p-8 text-center text-xs text-slate-500 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
          Không tìm thấy môn học nào khớp với tiêu chí lọc.
        </div>
      )}
    </div>
  );
};
