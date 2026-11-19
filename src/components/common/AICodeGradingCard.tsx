import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, Lightbulb, Code2 } from 'lucide-react';
import { AICodeGradingResult } from '../../types';

interface AICodeGradingCardProps {
  grading: AICodeGradingResult;
  title?: string;
}

export const AICodeGradingCard: React.FC<AICodeGradingCardProps> = ({
  grading,
  title = 'Kết quả chấm tự động từ Gemini AI',
}) => {
  return (
    <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-bold text-indigo-950">
          <Code2 className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>{title}</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white border border-indigo-200 text-indigo-700">
            {grading.gradedBy === 'gemini' ? 'Gemini AI' : 'Chấm Rubric dự phòng'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
              grading.isCorrect
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-rose-100 text-rose-800 border border-rose-300'
            }`}
          >
            {grading.isCorrect ? (
              <CheckCircle className="w-3.5 h-3.5" />
            ) : (
              <XCircle className="w-3.5 h-3.5" />
            )}
            <span>{grading.isCorrect ? 'Code ĐÚNG / Đạt yêu cầu' : 'Code CHƯA ĐÚNG'}</span>
          </span>
          <span className="font-mono font-extrabold text-indigo-900 bg-white px-2.5 py-0.5 rounded-lg border border-indigo-200">
            {grading.score} / {grading.maxPoints} điểm
          </span>
        </div>
      </div>

      {grading.languageCheck && (
        <div className="text-[11px] font-semibold text-indigo-800 bg-white/80 px-3 py-1.5 rounded-lg border border-indigo-100">
          Kiểm tra chuẩn ngôn ngữ / hình thức: {grading.languageCheck}
        </div>
      )}

      <p className="text-slate-800 leading-relaxed font-medium">
        {grading.summary}
      </p>

      {grading.errors && grading.errors.length > 0 && (
        <div className="p-3 rounded-xl bg-rose-50/90 border border-rose-200 space-y-1">
          <div className="font-bold text-rose-800 flex items-center gap-1.5 text-[11px]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Lỗi / Điểm chưa đạt phát hiện trong bài làm:</span>
          </div>
          <ul className="list-disc pl-5 space-y-0.5 text-rose-900 text-[11px]">
            {grading.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {grading.suggestions && grading.suggestions.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 space-y-1">
          <div className="font-bold text-amber-800 flex items-center gap-1.5 text-[11px]">
            <Lightbulb className="w-3.5 h-3.5 shrink-0" />
            <span>Gợi ý sửa lỗi & tối ưu:</span>
          </div>
          <ul className="list-disc pl-5 space-y-0.5 text-amber-900 text-[11px]">
            {grading.suggestions.map((sug, i) => (
              <li key={i}>{sug}</li>
            ))}
          </ul>
        </div>
      )}

      {grading.correctedCode && (
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
            <Code2 className="w-3.5 h-3.5" />
            <span>Code sửa lỗi / Giải thuật tham khảo từ AI:</span>
          </div>
          <pre className="p-3 rounded-xl bg-slate-950 text-emerald-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed">
            {grading.correctedCode}
          </pre>
        </div>
      )}
    </div>
  );
};
