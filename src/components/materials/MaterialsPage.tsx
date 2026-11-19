import React, { useState } from 'react';
import { StudyMaterial, Subject } from '../../types';
import { FileText, Download, Search, CheckCircle2, BookOpen } from 'lucide-react';
import { incrementDownloadCount } from '../../services/storageService';
import { downloadStudyMaterialFile } from '../../utils/fileDownload';

interface MaterialsPageProps {
  materials: StudyMaterial[];
  subjects: Subject[];
  onRefreshMaterials: () => void;
}

export const MaterialsPage: React.FC<MaterialsPageProps> = ({
  materials,
  subjects,
  onRefreshMaterials,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'syllabus' | 'lecture'>('all');
  const [search, setSearch] = useState<string>('');
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const filtered = materials.filter((m) => {
    const matchSub = selectedSubject === 'all' || m.subjectId === selectedSubject;
    const matchType = fileTypeFilter === 'all' || m.fileType === fileTypeFilter;
    const matchCategory =
      categoryFilter === 'all' ||
      (categoryFilter === 'syllabus' &&
        (m.materialCategory === 'syllabus' ||
          (!m.materialCategory && (m.title || '').toLowerCase().includes('đề cương')))) ||
      (categoryFilter === 'lecture' &&
        m.materialCategory !== 'syllabus' &&
        (Boolean(m.materialCategory) || !(m.title || '').toLowerCase().includes('đề cương')));
    const matchSearch =
      (m.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (m.description || '').toLowerCase().includes(search.toLowerCase());
    return matchSub && matchType && matchCategory && matchSearch;
  });

  const getSubject = (subId: string) => subjects.find(s => s.id === subId);

  const getSubjectName = (subId: string) => {
    return getSubject(subId)?.name || 'Môn học CNTT';
  };

  const handleDownload = async (material: StudyMaterial) => {
    setDownloadingId(material.id);
    try {
      await downloadStudyMaterialFile(material, getSubjectName(material.subjectId));
      incrementDownloadCount(material.id);
      onRefreshMaterials();
      setDownloadSuccess(material.title);
      setTimeout(() => setDownloadSuccess(null), 3500);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            Kho Đề Cương, Bài Giảng & Giáo Trình
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Tải về thiết bị đề cương chi tiết học phần, bài giảng và giáo trình chuẩn Unicode không lỗi phông chữ
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Tìm kiếm đề cương, bài giảng..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {downloadSuccess && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-2xl text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>Đã tải xuống hoàn tất (chuẩn Unicode tiếng Việt): <strong>{downloadSuccess}</strong></span>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Category Filter */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs">
          {[
            { id: 'all', label: 'Tất cả tài liệu' },
            { id: 'syllabus', label: 'Đề cương học phần' },
            { id: 'lecture', label: 'Bài giảng & Hướng dẫn' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id as any)}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                categoryFilter === cat.id
                  ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* File Type Filter */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs">
          {['all', 'pdf', 'docx', 'pptx'].map((type) => (
            <button
              key={type}
              onClick={() => setFileTypeFilter(type)}
              className={`px-2.5 py-1 rounded-lg uppercase font-semibold transition-colors ${
                fileTypeFilter === type
                  ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Subject Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setSelectedSubject('all')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors ${
            selectedSubject === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
          }`}
        >
          Tất cả môn
        </button>
        {subjects.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedSubject(s.id)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors inline-flex items-center gap-1.5 ${
              selectedSubject === s.id
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <span>{s.code} · {s.name}</span>
            {s.isHot && (
              <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-extrabold uppercase tracking-wider">
                HOT
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Materials List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((mat) => {
          const subjectObj = getSubject(mat.subjectId);
          return (
            <div
              key={mat.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-4 hover:border-blue-400 dark:hover:border-blue-700 transition-all"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
                      {getSubjectName(mat.subjectId)}
                    </span>
                    {subjectObj?.isHot && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
                        HOT
                      </span>
                    )}
                    <span className="text-slate-400">·</span>
                    <span className="font-semibold text-slate-500">
                      {mat.materialCategory === 'syllabus' ? 'Đề cương' : 'Bài giảng'}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                    {mat.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {mat.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 mt-2.5">
                    <span className="uppercase font-mono font-bold text-slate-600 dark:text-slate-300">
                      {mat.fileDataUrl || mat.serverFileUrl ? mat.fileType : 'DOCX'}
                    </span>
                    <span>·</span>
                    <span>{mat.fileSize}</span>
                    <span>·</span>
                    <span>{mat.downloadCount} lượt tải</span>
                    <span>·</span>
                    <span>{mat.uploadedBy}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">
                  {mat.fileDataUrl || mat.serverFileUrl ? 'Tệp gốc từ giảng viên' : 'Định dạng Word chuẩn Unicode'}
                </span>
                <button
                  type="button"
                  disabled={downloadingId === mat.id}
                  onClick={() => void handleDownload(mat)}
                  className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloadingId === mat.id ? 'Đang tải...' : 'Tải về để xem'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-500">Không tìm thấy tài liệu phù hợp với tìm kiếm của bạn.</p>
        </div>
      )}
    </div>
  );
};

