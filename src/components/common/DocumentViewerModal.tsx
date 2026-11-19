import React from 'react';
import { X, Download, BookOpen, FileText } from 'lucide-react';

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subjectLabel: string;
  categoryLabel?: string;
  fileType?: string;
  uploadedBy?: string;
  uploadedAt?: string;
  description?: string;
  content: string;
  onDownload?: () => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  isOpen,
  onClose,
  title,
  subjectLabel,
  categoryLabel = 'Đề cương & Bài giảng',
  fileType = 'PDF',
  uploadedBy,
  uploadedAt,
  description,
  content,
  onDownload,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in duration-150">
        {/* Top bar */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5" />
                {categoryLabel}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono font-semibold uppercase">{fileType}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{subjectLabel}</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug">
              {title}
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onDownload && (
              <button
                onClick={onDownload}
                className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tải về máy</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Đóng trình đọc"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Metadata Bar */}
        <div className="px-6 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          {uploadedBy && (
            <span>Giảng viên biên soạn: <strong className="text-slate-700 dark:text-slate-200">{uploadedBy}</strong></span>
          )}
          {uploadedAt && (
            <>
              <span aria-hidden="true">·</span>
              <span>Cập nhật: {new Date(uploadedAt).toLocaleDateString('vi-VN')}</span>
            </>
          )}
        </div>

        {/* Document Reader Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-slate-50/60 dark:bg-slate-950/40 space-y-5">
          {description && (
            <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              <strong className="text-blue-900 dark:text-blue-300 block mb-1">Tóm tắt nội dung:</strong>
              {description}
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>Nội dung đọc trực tiếp trên hệ thống</span>
            </div>

            <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-7 whitespace-pre-wrap font-sans">
              {content}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Đóng trình đọc
          </button>
        </div>
      </div>
    </div>
  );
};
