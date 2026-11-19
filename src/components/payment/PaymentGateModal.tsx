import React, { useEffect, useState, useCallback } from 'react';
import {
  QrCode, ShieldCheck, CheckCircle2, Copy, Check,
  RefreshCw, X, Lock, AlertTriangle, Landmark, BookOpen, Send, Phone
} from 'lucide-react';
import type { ExamPaymentOrder, PaymentConfig, User } from '../../types';
import {
  checkExamPaymentStatus,
  createExamPaymentOrder,
  markExamPaymentSubmitted,
  extractErrorMessage,
} from '../../services/storageService';

interface PaymentGateModalProps {
  isOpen: boolean;
  user: User;
  subjectId: string;
  subjectName: string;
  reason?: string;
  onClose: () => void;
  onUnlocked: (updatedUser: User) => void;
}

export const PaymentGateModal: React.FC<PaymentGateModalProps> = ({
  isOpen,
  user,
  subjectId,
  subjectName,
  reason,
  onClose,
  onUnlocked,
}) => {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submittingNotice, setSubmittingNotice] = useState(false);
  const [submittedNoticeDone, setSubmittedNoticeDone] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<ExamPaymentOrder | null>(null);
  const [config, setConfig] = useState<Partial<PaymentConfig> | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [paidSuccess, setPaidSuccess] = useState(false);
  const userRef = React.useRef(user);
  userRef.current = user;

  const initOrder = useCallback(async () => {
    if (!isOpen || !user?.id || !subjectId) return;
    setLoading(true);
    setError('');
    setOrder(null);
    setSubmittedNoticeDone(false);
    try {
      const res = await createExamPaymentOrder(userRef.current, subjectId, subjectName);
      if (res.alreadyPaid && res.user) {
        setPaidSuccess(true);
        setTimeout(() => {
          onUnlocked(res.user!);
        }, 400);
        return;
      }
      if (res.order) {
        setOrder(res.order);
        if (res.order.studentSubmittedAt) {
          setSubmittedNoticeDone(true);
        }
      }
      if (res.config) {
        setConfig(res.config);
      }
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Không thể tải thông tin chuyển khoản. Vui lòng thử lại sau.'));
    } finally {
      setLoading(false);
    }
  }, [isOpen, user?.id, subjectId, subjectName, onUnlocked]);

  useEffect(() => {
    if (isOpen) {
      setPaidSuccess(false);
      void initOrder();
    }
  }, [isOpen, initOrder]);

  const handleNotifySubmitted = async () => {
    if (!order?.orderCode) return;
    setSubmittingNotice(true);
    setError('');
    try {
      const updatedOrder = await markExamPaymentSubmitted(order.orderCode);
      setOrder(updatedOrder);
      setSubmittedNoticeDone(true);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Không thể gửi yêu cầu xác nhận. Vui lòng thử lại.'));
    } finally {
      setSubmittingNotice(false);
    }
  };

  const handleCheckApproved = async () => {
    if (!order?.orderCode || paidSuccess) return;
    setChecking(true);
    setError('');
    try {
      const res = await checkExamPaymentStatus(order.orderCode);
      if (res.paid) {
        setPaidSuccess(true);
        const mergedPaidIds = Array.from(
          new Set([...(userRef.current.paidSubjectIds || []), subjectId])
        );
        const updatedUser: User = res.user || {
          ...userRef.current,
          paidSubjectIds: mergedPaidIds,
          hasPaidExamAccess: true,
          examAccessPaidAt: res.order.paidAt || new Date().toISOString(),
          examAccessOrderCode: order.orderCode,
        };
        setTimeout(() => {
          onUnlocked(updatedUser);
        }, 600);
      } else {
        setError(
          'Môn học này đang chờ Admin hoặc Giảng viên xác nhận mở khóa. Sau khi chuyển khoản 10.000đ, hãy bấm "Tôi đã chuyển khoản" và liên hệ Admin/Giảng viên (Zalo: 0334613184) để được duyệt ngay.'
        );
      }
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Không thể kiểm tra trạng thái xác nhận.'));
    } finally {
      setChecking(false);
    }
  };

  const handleCopy = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  if (!isOpen) return null;

  const amountDisplay = `${(order?.amount || config?.examFeeVnd || 10000).toLocaleString('vi-VN')} đ`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full shadow-2xl overflow-hidden my-4">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight">
                Đề Thi Thử Đang Khóa — Mở Khóa Môn Học (10.000đ / Môn)
              </h2>
              <p className="text-xs text-blue-200 flex items-center gap-1.5 mt-0.5">
                <BookOpen className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>Môn học: <strong className="text-white">{subjectName}</strong></span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {reason && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed">
              <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{reason}</span>
            </div>
          )}

          {/* Policy summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="font-bold text-emerald-900 mb-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Ôn tập & Đề cương: Miễn phí 100%
              </div>
              <p className="text-emerald-800 leading-relaxed">
                Toàn bộ câu hỏi ôn tập theo chương, đáp án chi tiết và tài liệu bài giảng vẫn miễn phí hoàn toàn.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200">
              <div className="font-bold text-blue-900 mb-1 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                Xác nhận bởi Admin hoặc Giảng viên
              </div>
              <p className="text-blue-800 leading-relaxed">
                Sau khi chuyển khoản 10.000đ cho môn <strong>{subjectName}</strong>, bấm gửi yêu cầu để <strong>Admin / Giảng viên</strong> duyệt mở khóa trực tiếp cho tài khoản{' '}
                <strong className="font-mono">{user.studentCode || user.username}</strong>.
              </p>
            </div>
          </div>

          {paidSuccess ? (
            <div className="p-8 text-center bg-emerald-50 border border-emerald-200 rounded-2xl">
              <div className="w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto mb-3 shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-emerald-900 mb-1">
                Đã mở khóa môn "{subjectName}"!
              </h3>
              <p className="text-sm text-emerald-700">
                Admin / Giảng viên đã xác nhận mở khóa. Đang chuyển bạn vào hệ thống thi thử (đề cương học phần)...
              </p>
            </div>
          ) : loading ? (
            <div className="p-10 text-center border border-slate-200 rounded-2xl bg-slate-50">
              <RefreshCw className="w-7 h-7 text-blue-600 animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700">
                Đang tạo thông tin chuyển khoản 10.000đ cho môn {subjectName}...
              </p>
            </div>
          ) : order ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5">
              {/* VietQR Column */}
              <div className="md:col-span-5 flex flex-col items-center">
                <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm w-full max-w-[230px]">
                  <img
                    src={order.qrUrl}
                    alt={`Mã VietQR chuyển khoản ${order.orderCode}`}
                    className="w-full aspect-square object-contain rounded-lg"
                  />
                </div>
                <span className="mt-2.5 text-[11px] font-medium text-slate-500 text-center">
                  Quét mã VietQR bằng app Ngân hàng hoặc tự nhập STK bên cạnh
                </span>
              </div>

              {/* Bank Transfer Details */}
              <div className="md:col-span-7 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wide mb-1">
                  <Landmark className="w-4 h-4 text-blue-600" />
                  Thông tin chuyển khoản mở khóa môn (10.000đ)
                </div>

                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
                  <div className="px-3.5 py-2 flex items-center justify-between gap-2">
                    <span className="text-slate-500">Môn học mở khóa</span>
                    <span className="font-bold text-blue-800 text-right">{subjectName}</span>
                  </div>

                  <div className="px-3.5 py-2 flex items-center justify-between gap-2">
                    <span className="text-slate-500">Ngân hàng</span>
                    <span className="font-bold text-slate-900">
                      {config?.bankName || order.bankCode}
                    </span>
                  </div>

                  <div className="px-3.5 py-2 flex items-center justify-between gap-2">
                    <span className="text-slate-500">Số tài khoản</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {order.accountNumber}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopy('acc', order.accountNumber)}
                        className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Sao chép số tài khoản"
                      >
                        {copiedField === 'acc' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="px-3.5 py-2 flex items-center justify-between gap-2">
                    <span className="text-slate-500">Chủ tài khoản</span>
                    <span className="font-bold text-slate-900 uppercase">
                      {order.accountName || 'NGUYEN VU XUAN KIEN'}
                    </span>
                  </div>

                  <div className="px-3.5 py-2 flex items-center justify-between gap-2">
                    <span className="text-slate-500">Số tiền chính xác</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-extrabold text-rose-600 text-sm tabular-nums">
                        {amountDisplay}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopy('amount', String(order.amount))}
                        className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
                        title="Sao chép số tiền"
                      >
                        {copiedField === 'amount' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="px-3.5 py-2 flex items-center justify-between gap-2 bg-blue-50/70">
                    <span className="text-blue-800 font-semibold">Nội dung CK (Ghi chú)</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-extrabold text-blue-700 text-sm tracking-wide">
                        {order.orderCode}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopy('code', order.orderCode)}
                        className="p-1 rounded bg-blue-100 hover:bg-blue-200 text-blue-700"
                        title="Sao chép nội dung chuyển khoản"
                      >
                        {copiedField === 'code' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed flex items-start gap-2">
                  <Phone className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Hệ thống <strong>không sử dụng xác nhận tự động</strong>. Sau khi chuyển khoản xong, bấm nút{' '}
                    <strong>"Tôi đã chuyển khoản"</strong> bên dưới và gửi biên lai qua Zalo{' '}
                    <strong className="font-mono">0334613184</strong> (Nguyễn Vũ Xuân Kiên) hoặc báo Giảng viên bộ môn để xác nhận mở khóa.
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">Chưa tải được thông tin tài khoản chuyển khoản</p>
                <p className="text-xs text-amber-800">{error || 'Quản trị viên chưa thiết lập tài khoản ngân hàng nhận tiền.'}</p>
              </div>
            </div>
          )}

          {submittedNoticeDone && order && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong>Đã gửi yêu cầu xác nhận thành công (Mã: {order.orderCode})!</strong> Yêu cầu của bạn đã hiển thị trong bảng duyệt của <strong>Admin và Giảng viên</strong>. Sau khi được bấm xác nhận, hãy nhấn <strong>"Kiểm tra đã mở khóa chưa"</strong> để vào thi ngay.
              </div>
            </div>
          )}

          {error && order && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Để sau (Ôn tập miễn phí)
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {order && !submittedNoticeDone && (
                <button
                  type="button"
                  disabled={submittingNotice}
                  onClick={() => void handleNotifySubmitted()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold disabled:opacity-60 transition-colors"
                >
                  {submittingNotice ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Tôi đã chuyển khoản — Gửi xác nhận
                </button>
              )}

              {order && (
                <button
                  type="button"
                  disabled={checking}
                  onClick={() => void handleCheckApproved()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold disabled:opacity-60 transition-colors"
                >
                  {checking ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  Kiểm tra đã mở khóa chưa
                </button>
              )}

              {!order && !loading && (
                <button
                  type="button"
                  onClick={() => void initOrder()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold"
                >
                  <RefreshCw className="w-4 h-4" />
                  Tải lại thông tin CK
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
