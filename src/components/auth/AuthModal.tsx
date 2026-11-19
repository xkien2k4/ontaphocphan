import React, { useState, useEffect, useRef } from 'react';
import { User } from '../../types';
import {
  loginUser,
  registerStudent,
  extractErrorMessage,
} from '../../services/storageService';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register';
  onClose: () => void;
  onAuthSuccess: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  onClose,
  onAuthSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);

  // Login form state
  const [loginInput, setLoginInput] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Register form state (Students only)
  const [regFullName, setRegFullName] = useState('');
  const [regStudentCode, setRegStudentCode] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regClass, setRegClass] = useState('');
  const [regMajor, setRegMajor] = useState('Công nghệ Thông tin');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const redirectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrorMsg(null);
      setSuccessMsg(null);
      setForgotMsg(null);
      setIsSubmitting(false);
    } else {
      if (redirectTimerRef.current) {
        window.clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
      setErrorMsg(null);
      setSuccessMsg(null);
      setForgotMsg(null);
      setIsSubmitting(false);
      setLoginPassword('');
      setRegPassword('');
      setRegConfirmPassword('');
    }
    return () => {
      if (redirectTimerRef.current) {
        window.clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setForgotMsg(null);

    if (!loginInput.trim() || !loginPassword) {
      setErrorMsg('Vui lòng nhập tên đăng nhập, MSSV hoặc email và mật khẩu.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await loginUser(loginInput.trim(), loginPassword);
      if (!res.success || !res.user) {
        setErrorMsg(extractErrorMessage(res.error, 'Đăng nhập không thành công.'));
        return;
      }

      onAuthSuccess(res.user);
      onClose();
    } catch (err: any) {
      setErrorMsg(extractErrorMessage(err, 'Lỗi kết nối khi đăng nhập. Vui lòng thử lại.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!regFullName.trim() || !regStudentCode.trim() || !regClass.trim() || !regEmail.trim() || !regPassword) {
      setErrorMsg('Vui lòng điền đầy đủ các trường bắt buộc có dấu (*).');
      return;
    }

    const cleanCode = regStudentCode.trim();
    if (!/^[a-zA-Z0-9_\-.]{4,25}$/.test(cleanCode)) {
      setErrorMsg('Mã số sinh viên (MSSV) hợp lệ cần từ 4 đến 25 ký tự chữ hoặc số (ví dụ: 223148201057 hoặc 24IT001).');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(regEmail.trim())) {
      setErrorMsg('Vui lòng nhập địa chỉ email hợp lệ (ví dụ: sinhvien@dhhp.edu.vn hoặc gmail.com).');
      return;
    }

    if (regPassword.length < 6) {
      setErrorMsg('Mật khẩu phải có độ dài ít nhất 6 ký tự.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMsg('Xác nhận mật khẩu không trùng khớp với mật khẩu đã nhập.');
      return;
    }

    setIsSubmitting(true);
    let registeredOk = false;
    try {
      const createdStudent = await registerStudent({
        fullName: regFullName.trim(),
        studentCode: regStudentCode.trim(),
        email: regEmail.trim(),
        phone: regPhone.trim(),
        className: regClass.trim(),
        major: regMajor.trim() || 'Công nghệ Thông tin',
        password: regPassword,
      });

      registeredOk = true;
      setSuccessMsg(`Đăng ký thành công tài khoản sinh viên [${createdStudent.studentCode}]! Đang mở cổng học tập...`);
      onAuthSuccess(createdStudent);
      redirectTimerRef.current = window.setTimeout(() => {
        onClose();
      }, 650);
    } catch (err: any) {
      setErrorMsg(extractErrorMessage(err, 'Lỗi khi đăng ký tài khoản sinh viên.'));
    } finally {
      if (!registeredOk) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in duration-150 my-6">
        {/* University Header with Logo */}
        <div className="p-6 text-center border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <img
            src="/assets/aistudio/dhhp-logo_dbc8bacc.png"
            alt="Logo Trường Đại học Hải Phòng"
            className="w-16 h-16 object-contain mx-auto mb-2"
          />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
            Trường Đại Học Hải Phòng
          </h2>
          <h3 className="text-xs font-semibold text-blue-700 dark:text-blue-400 mt-0.5">
            Khoa Công Nghệ Thông Tin
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Hệ thống Ôn tập & Đánh giá Trực tuyến (IT Study Platform)
          </p>
        </div>

        {/* Tab Switcher: Login / Student Registration */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
          <button
            onClick={() => { setMode('login'); setErrorMsg(null); setForgotMsg(null); }}
            className={`flex-1 py-3 text-center transition-colors border-b-2 ${
              mode === 'login'
                ? 'border-blue-700 text-blue-700 dark:text-blue-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-50 dark:bg-slate-950'
            }`}
          >
            Đăng nhập hệ thống
          </button>
          <button
            onClick={() => { setMode('register'); setErrorMsg(null); setForgotMsg(null); }}
            className={`flex-1 py-3 text-center transition-colors border-b-2 ${
              mode === 'register'
                ? 'border-blue-700 text-blue-700 dark:text-blue-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-50 dark:bg-slate-950'
            }`}
          >
            Đăng ký sinh viên
          </button>
        </div>

        <div className="p-6 text-xs max-h-[70vh] overflow-y-auto">
          {errorMsg && (
            <div className="mb-4 p-3 rounded-lg border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 rounded-lg border border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">
              {successMsg}
            </div>
          )}

          {forgotMsg && (
            <div className="mb-4 p-3 rounded-lg border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
              {forgotMsg}
            </div>
          )}

          {/* MODE 1: LOGIN */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Tên đăng nhập hoặc Email
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: gv_daongoctu hoặc admin hoặc MSSV đã đăng ký"
                  value={loginInput}
                  onChange={(e) => setLoginInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Mật khẩu</label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  </button>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Nhập mật khẩu tài khoản"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Ghi nhớ đăng nhập</span>
                </label>
                <button
                  type="button"
                  onClick={() => setForgotMsg('Để đặt lại mật khẩu, sinh viên vui lòng liên hệ Ban cán sự lớp hoặc gửi yêu cầu hỗ trợ tới Khoa CNTT qua email fit@dhhp.edu.vn.')}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Quên mật khẩu?
                </button>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-bold text-xs shadow-sm transition"
              >
                {isSubmitting ? 'Đang đồng bộ & đăng nhập...' : 'Đăng nhập vào hệ thống'}
              </button>

              <div className="text-center pt-1">
                <span className="text-slate-500">Chưa có tài khoản sinh viên? </span>
                <button
                  type="button"
                  onClick={() => { setMode('register'); setErrorMsg(null); }}
                  className="font-bold text-blue-700 dark:text-blue-400 hover:underline"
                >
                  Đăng ký ngay tại đây
                </button>
              </div>
            </form>
          )}

          {/* MODE 2: STUDENT REGISTRATION ONLY */}
          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3">

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Họ và tên sinh viên <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={120}
                  placeholder="Ví dụ: Hoàng Minh Đức"
                  value={regFullName}
                  onChange={(e) => setRegFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Mã sinh viên (MSSV) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={25}
                    placeholder="Ví dụ: 223148201057"
                    value={regStudentCode}
                    onChange={(e) => setRegStudentCode(e.target.value.replace(/[^a-zA-Z0-9_\-.]/g, '').slice(0, 25))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    required
                  />
                  <div className="mt-1 text-[10px] text-slate-400">
                    Mã số sinh viên theo thẻ SV
                  </div>
                </div>
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Lớp sinh hoạt <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    placeholder="Ví dụ: CNTT1.K23 hoặc K25CNTTE"
                    value={regClass}
                    onChange={(e) => setRegClass(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Địa chỉ Email sinh viên <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  maxLength={150}
                  placeholder="Ví dụ: kien@dhhp.edu.vn hoặc a@gmail.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Số điện thoại
                  </label>
                  <input
                    type="tel"
                    maxLength={25}
                    placeholder="09xx xxx xxx"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Ngành học
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={regMajor}
                    onChange={(e) => setRegMajor(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Mật khẩu <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="Tối thiểu 6 ký tự"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Xác nhận mật khẩu <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="Nhập lại mật khẩu"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-bold text-xs shadow-sm transition"
              >
                {isSubmitting ? 'Đang đăng ký & lưu lên máy chủ...' : 'Hoàn tất đăng ký tài khoản sinh viên'}
              </button>

              <div className="text-center pt-2">
                <span className="text-slate-500">Đã có tài khoản? </span>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setErrorMsg(null); }}
                  className="font-bold text-blue-700 dark:text-blue-400 hover:underline"
                >
                  Quay lại đăng nhập
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
