import React, { useState, useEffect } from 'react';
import { LearningDocument, Subject, User } from '../../types';
import {
  Upload, FileText, BookOpen, Trash2, Eye,
  CheckCircle, Clock, AlertCircle, Plus, Search, ChevronRight,
  Loader2, Download
} from 'lucide-react';
import {
  saveLearningDocument, deleteLearningDocument,
  requestAIAnalyzeDocument
} from '../../services/storageService';
import { readTextFileCleanly } from '../../utils/fileDownload';
import mammoth from 'mammoth';

interface AILearningDocsManagerProps {
  currentUser: User;
  documents: LearningDocument[];
  subjects: Subject[];
  onRefreshDocs: () => void;
  onOpenAnalyzerModal: (doc: LearningDocument) => void;
  onOpenGeneratorModal: (doc: LearningDocument) => void;
}

export const AILearningDocsManager: React.FC<AILearningDocsManagerProps> = ({
  currentUser,
  documents,
  subjects,
  onRefreshDocs,
  onOpenAnalyzerModal,
  onOpenGeneratorModal,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [analyzingDocId, setAnalyzingDocId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<LearningDocument | null>(null);

  // New Doc Form
  const [newTitle, setNewTitle] = useState('');
  const [newSubjectId, setNewSubjectId] = useState(subjects[0]?.id || 'sub_dsa');
  const [newFileType, setNewFileType] = useState<'pdf' | 'docx' | 'pptx' | 'txt'>('pdf');
  const [newDescription, setNewDescription] = useState('');
  const [newContent, setNewContent] = useState('');

  useEffect(() => {
    if (subjects.length > 0 && !subjects.some(s => s.id === newSubjectId)) {
      setNewSubjectId(subjects[0].id);
    }
  }, [subjects, newSubjectId]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleExtractLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const lowerName = file.name.toLowerCase();
    try {
      let extractedText = '';
      if (lowerName.endsWith('.docx')) {
        const buffer = await file.arrayBuffer();
        const res = await mammoth.extractRawText({ arrayBuffer: buffer });
        extractedText = res.value || '';
        setNewFileType('docx');
      } else if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
        extractedText = await readTextFileCleanly(file);
        setNewFileType('txt');
      } else {
        setUploadError('Hỗ trợ trích xuất tự động tệp .docx, .txt, .md. Với file PDF/PPTX vui lòng copy/dán nội dung văn bản vào khung bên dưới.');
        return;
      }

      if (!extractedText.trim()) {
        setUploadError('Không trích xuất được nội dung văn bản từ tệp đã chọn.');
        return;
      }
      if (!newTitle.trim()) {
        setNewTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      setNewContent(extractedText.trim());
    } catch (err: any) {
      setUploadError(err?.message || 'Không thể đọc tệp tài liệu đã chọn.');
    } finally {
      e.target.value = '';
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    if (!newTitle.trim() || !newContent.trim()) {
      setUploadError('Vui lòng nhập tiêu đề và nội dung bài giảng/đề cương!');
      return;
    }

    const created = saveLearningDocument({
      subjectId: newSubjectId,
      title: newTitle.trim(),
      fileType: newFileType,
      fileSize: `${Math.max(0.1, newContent.length / 1024).toFixed(1)} KB`,
      description: newDescription.trim() || 'Tài liệu học phần tải lên bởi giảng viên',
      rawContent: newContent.trim(),
      status: 'analyzing',
      processingStatus: 'analyzing',
      uploadedBy: currentUser.fullName,
    });

    onRefreshDocs();
    setIsUploadModalOpen(false);
    setNewTitle('');
    setNewDescription('');
    setNewContent('');
    setUploadError(null);
    showToast('Tải lên tài liệu học tập thành công!');

    // Automatically trigger AI analysis
    handleTriggerAnalyze(created);
  };

  const handleTriggerAnalyze = async (doc: LearningDocument) => {
    setAnalyzingDocId(doc.id);
    saveLearningDocument({
      ...doc,
      status: 'analyzing',
      processingStatus: 'analyzing',
    });
    onRefreshDocs();
    try {
      const subject = subjects.find(s => s.id === doc.subjectId);
      const res = await requestAIAnalyzeDocument({
        documentTitle: doc.title,
        subjectName: subject?.name || 'Công nghệ Thông tin',
        documentType: doc.fileType,
        rawContent: doc.rawContent || '',
      });

      if (res && res.analysis) {
        saveLearningDocument({
          ...doc,
          status: 'analyzed',
          processingStatus: 'analyzed',
          analysisResult: res.analysis,
        });
        onRefreshDocs();
        showToast('AI đã hoàn tất phân tích mục tiêu & chuẩn đầu ra tài liệu!');
      } else {
        saveLearningDocument({
          ...doc,
          status: 'error',
          processingStatus: 'failed',
        });
        onRefreshDocs();
        showToast('Không nhận được kết quả phân tích hợp lệ từ AI.');
      }
    } catch (err: any) {
      console.error(err);
      saveLearningDocument({
        ...doc,
        status: 'error',
        processingStatus: 'failed',
      });
      onRefreshDocs();
      showToast('Lỗi khi AI phân tích tài liệu.');
    } finally {
      setAnalyzingDocId(null);
    }
  };

  const handleConfirmDelete = () => {
    if (!confirmDeleteDoc) return;
    deleteLearningDocument(confirmDeleteDoc.id);
    setConfirmDeleteDoc(null);
    onRefreshDocs();
    showToast('Đã xóa tài liệu khỏi hệ thống.');
  };

  const filtered = documents.filter((d) => {
    const matchSub = selectedSubject === 'all' || d.subjectId === selectedSubject;
    const matchSearch =
      (d.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.description || '').toLowerCase().includes(search.toLowerCase());
    return matchSub && matchSearch;
  });

  const getSubjectName = (subId: string) => {
    return subjects.find(s => s.id === subId)?.name || 'Môn học CNTT';
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">
            <BookOpen className="w-4 h-4" />
            <span>Nguồn Dữ Liệu Huấn Luyện AI</span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
            Kho Đề Cương & Bài Giảng Học Phần
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tải lên bài giảng hoặc đề cương chi tiết để AI phân tích cấu trúc chương và chuẩn đầu ra CLO trước khi sinh câu hỏi.
          </p>
        </div>

        <button
          onClick={() => setIsUploadModalOpen(true)}
          className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1.5 shrink-0"
        >
          <Upload className="w-4 h-4" />
          <span>Tải lên tài liệu mới</span>
        </button>
      </div>

      {toastMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-2xl text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-500" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Filter and search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedSubject('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap ${
              selectedSubject === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            Tất cả môn ({documents.length})
          </button>
          {subjects.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSubject(s.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap ${
                selectedSubject === s.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {s.code}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Tìm tài liệu theo tên..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Documents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((doc) => {
          const isAnalyzing = analyzingDocId === doc.id;

          return (
            <div
              key={doc.id}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between shadow-sm space-y-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded">
                    {getSubjectName(doc.subjectId)}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    doc.status === 'analyzed' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                    doc.status === 'analyzing' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                    doc.status === 'error' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' :
                    'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}>
                    {doc.status === 'analyzed' ? <CheckCircle className="w-3 h-3 text-emerald-600" /> : <Clock className="w-3 h-3" />}
                    <span>
                      {doc.status === 'analyzed' ? 'Đã phân tích AI' :
                       doc.status === 'analyzing' ? 'Đang phân tích...' :
                       doc.status === 'error' ? 'Lỗi phân tích' : 'Chưa phân tích'}
                    </span>
                  </span>
                </div>

                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug">
                  {doc.title}
                </h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  {doc.description}
                </p>

                <div className="flex items-center gap-2.5 text-[11px] text-slate-400 mt-3">
                  <span className="uppercase font-mono font-bold text-slate-600 dark:text-slate-300">
                    {doc.fileType}
                  </span>
                  <span>·</span>
                  <span>{doc.fileSize}</span>
                  <span>·</span>
                  <span>Đăng bởi {doc.uploadedBy}</span>
                </div>
              </div>

              {/* Action bar */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {doc.analysisResult && (
                    <button
                      onClick={() => onOpenAnalyzerModal(doc)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1"
                      title="Xem kết quả phân tích chuẩn đầu ra & chương mục"
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-500" />
                      <span>Xem phân tích</span>
                    </button>
                  )}

                  {!doc.analysisResult && (
                    <button
                      disabled={isAnalyzing}
                      onClick={() => handleTriggerAnalyze(doc)}
                      className="px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-900 hover:bg-blue-50 dark:hover:bg-blue-950 text-xs font-semibold text-blue-600 flex items-center gap-1"
                    >
                      {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                      <span>{isAnalyzing ? 'Đang phân tích...' : 'AI Phân tích'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => setConfirmDeleteDoc(doc)}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg"
                    title="Xóa tài liệu"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => onOpenGeneratorModal(doc)}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>AI Tạo Câu hỏi</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Tải lên Đề cương hoặc Bài giảng Học phần
              </h3>
              <button onClick={() => setIsUploadModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs overflow-y-auto">
              {uploadError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Môn học</label>
                  <select
                    value={newSubjectId}
                    onChange={(e) => setNewSubjectId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                  >
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1">Định dạng file</label>
                  <select
                    value={newFileType}
                    onChange={(e) => setNewFileType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 uppercase"
                  >
                    <option value="pdf">PDF (Đề cương / Slide)</option>
                    <option value="docx">DOCX (Đề cương chi tiết)</option>
                    <option value="pptx">PPTX (Slide bài giảng)</option>
                    <option value="txt">TXT / Markdown</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Tên tài liệu / Tiêu đề bài giảng</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Đề cương chi tiết học phần Lập trình Web..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Mô tả tóm tắt</label>
                <input
                  type="text"
                  placeholder="Tóm tắt nội dung các chương hoặc chuẩn đầu ra..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label className="font-medium">
                    Nội dung văn bản trích xuất từ tài liệu (Gửi cho AI phân tích)
                  </label>
                  <label className="px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50 transition">
                    + Chọn file Word (.docx) / .txt
                    <input
                      type="file"
                      accept=".docx,.txt,.md"
                      onChange={handleExtractLocalFile}
                      className="hidden"
                    />
                  </label>
                </div>
                <textarea
                  required
                  rows={8}
                  placeholder="Dán nội dung bài giảng, đề cương hoặc chọn file .docx/.txt ở nút trên để AI đọc hiểu..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full p-3 font-mono text-xs rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  AI sẽ trích xuất chuẩn đầu ra CLO, cấu trúc chương và định nghĩa từ đoạn văn bản này để sinh câu hỏi chính xác.
                </span>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setIsUploadModalOpen(false); setUploadError(null); }}
                  className="px-4 py-2 rounded-xl border"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold"
                >
                  Lưu & Bắt đầu AI Phân tích
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {confirmDeleteDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Xác nhận xóa tài liệu học tập
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Bạn có chắc chắn muốn xóa tài liệu <strong className="text-slate-900 dark:text-white">{confirmDeleteDoc.title}</strong> khỏi hệ thống?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDeleteDoc(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Xóa tài liệu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
