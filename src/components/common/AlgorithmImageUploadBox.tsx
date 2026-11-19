import React, { useId, useRef, useState } from 'react';
import { ImagePlus, Trash2, Upload, FileImage, AlertTriangle, Loader2 } from 'lucide-react';
import { ImageSubmissionAnswer } from '../../types';
import { processUploadedAlgorithmImage } from '../../utils/imageUpload';
import { isImageSubmissionAnswer } from '../../utils/subjectGrading';

interface AlgorithmImageUploadBoxProps {
  value: any;
  disabled?: boolean;
  onChange: (nextVal: ImageSubmissionAnswer | '') => void;
}

export const AlgorithmImageUploadBox: React.FC<AlgorithmImageUploadBoxProps> = ({
  value,
  disabled = false,
  onChange,
}) => {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const currentImage = isImageSubmissionAnswer(value) ? value : null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setProcessing(true);
    try {
      const processed = await processUploadedAlgorithmImage(
        file,
        currentImage?.note || ''
      );
      onChange(processed);
    } catch (err: any) {
      setUploadError(err?.message || 'Không thể tải lên hình ảnh bài làm.');
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleNoteChange = (note: string) => {
    if (!currentImage) return;
    onChange({
      ...currentImage,
      note,
    });
  };

  const handleRemove = () => {
    setUploadError('');
    onChange('');
  };

  return (
    <div className="pt-2 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-xs font-semibold text-slate-700">
          Tải lên hình ảnh bài làm Nhập môn thuật toán (Lưu đồ khối / Mã giả / Code viết tay hoặc chụp màn hình):
        </label>
        {currentImage && !disabled && (
          <button
            type="button"
            onClick={handleRemove}
            className="text-[11px] font-semibold text-rose-600 hover:underline flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa ảnh</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
        disabled={disabled || processing}
        onChange={handleFileChange}
        className="hidden"
        id={inputId}
      />

      {!currentImage ? (
        <label
          htmlFor={disabled ? undefined : inputId}
          className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed transition text-center ${
            disabled
              ? 'border-slate-200 bg-slate-50 opacity-70 cursor-not-allowed'
              : 'border-blue-300 hover:border-blue-600 bg-blue-50/40 hover:bg-blue-50/70 cursor-pointer'
          }`}
        >
          {processing ? (
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-2" />
          ) : (
            <ImagePlus className="w-8 h-8 text-blue-600 mb-2" />
          )}
          <div className="text-xs sm:text-sm font-bold text-slate-900">
            {processing
              ? 'Đang xử lý & nén hình ảnh...'
              : 'Nhấn để chọn hoặc tải lên hình ảnh bài giải'}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Hỗ trợ ảnh lưu đồ thuật toán, giấy viết tay, hoặc ảnh chụp code (.PNG, .JPG, .WEBP)
          </p>
        </label>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold min-w-0">
              <FileImage className="w-4 h-4 shrink-0" />
              <span className="truncate">{currentImage.fileName}</span>
            </div>
            {!disabled && (
              <label
                htmlFor={inputId}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:border-blue-500 text-[11px] font-semibold text-slate-700 cursor-pointer flex items-center gap-1 shrink-0"
              >
                <Upload className="w-3 h-3" />
                <span>Đổi ảnh khác</span>
              </label>
            )}
          </div>

          <div className="rounded-xl overflow-hidden border border-slate-200 bg-white flex items-center justify-center p-2">
            <img
              src={currentImage.dataUrl}
              alt="Bài làm thuật toán của sinh viên"
              className="max-h-80 w-auto object-contain rounded-lg"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Ghi chú / Giải thích thêm về ảnh bài làm (tùy chọn):
            </label>
            <input
              type="text"
              disabled={disabled}
              value={currentImage.note || ''}
              onChange={(e) => handleNoteChange(e.target.value)}
              placeholder="Ví dụ: Lưu đồ vòng lặp while tìm số nguyên tố..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
            />
          </div>
        </div>
      )}

      {uploadError && (
        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}
    </div>
  );
};
