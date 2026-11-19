import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import { updateUserProfile, changeUserPassword, extractErrorMessage } from '../../services/storageService';

interface UserProfileModalProps {
  currentUser: User;
  isOpen: boolean;
  onClose: () => void;
  onUserUpdated: (user: User) => void;
  onLogout: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  currentUser,
  isOpen,
  onClose,
  onUserUpdated,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'edit' | 'password'>('info');

  // Edit form state
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [email, setEmail] = useState(currentUser.email);
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [className, setClassName] = useState(currentUser.className || '');
  const [department, setDepartment] = useState(currentUser.department || '');

  // Password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFullName(currentUser.fullName);
      setEmail(currentUser.email);
      setPhone(currentUser.phone || '');
      setClassName(currentUser.className || '');
      setDepartment(currentUser.department || '');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrorMsg(null);
      setSuccessMsg(null);
      setActiveTab('info');
    }
  }, [currentUser.id, currentUser.fullName, currentUser.email, currentUser.phone, currentUser.className, currentUser.department, isOpen]);

  if (!isOpen) return null;

  // Calculate initials from Full Name (e.g. "Nguyễn Vũ Xuân Kiên" -> "NK")
  const getInitials = (name: string): string => {
    if (!name) return 'IT';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!fullName.trim() || !email.trim()) {
      setErrorMsg('Họ tên và Email không được để trống.');
      return;
    }

    try {
      const updated = await updateUserProfile(currentUser.id, {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        className: currentUser.role === 'student' ? className.trim() : undefined,
        department: currentUser.role === 'lecturer' ? department.trim() : undefined,
      });
      onUserUpdated(updated);
      setSuccessMsg('Cập nhật thông tin tài khoản thành công.');
      setTimeout(() => setSuccessMsg(null), 3000);
      setActiveTab('info');
    } catch (err: any) {
      setErrorMsg(extractErrorMessage(err, 'Lỗi khi cập nhật thông tin.'));
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!oldPassword || !newPassword) {
      setErrorMsg('Vui lòng nhập đầy đủ mật khẩu cũ và mới.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Xác nhận mật khẩu mới không trùng khớp.');
      return;
    }

    try {
      await changeUserPassword(currentUser.id, oldPassword, newPassword);
      setSuccessMsg('Đổi mật khẩu thành công. Vui lòng ghi nhớ mật khẩu mới.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSuccessMsg(null), 3000);
      setActiveTab('info');
    } catch (err: any) {
      setErrorMsg(extractErrorMessage(err, 'Lỗi khi đổi mật khẩu.'));
    }
  };

  const roleLabel =
    currentUser.role === 'admin'
      ? 'Quản trị viên Hệ thống'
      : currentUser.role === 'lecturer'
      ? 'Giảng viên Khoa CNTT'
      : 'Sinh viên Khoa CNTT';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in duration-150">
        {/* Header with Official University Logo & System title */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            <img
              src="/assets/aistudio/dhhp-logo_dbc8bacc.png"
              alt="Logo Trường Đại học Hải Phòng"
              className="w-10 h-10 object-contain"
            />
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-white">
                Hồ Sơ & Thông Tin Tài Khoản
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Trường Đại học Hải Phòng · Khoa Công nghệ Thông tin
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-xs font-semibold px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            Đóng
          </button>
        </div>

        {/* User Card Bar */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4 bg-slate-50/50 dark:bg-slate-900/50">
          {/* Initials Avatar (No stock photos) */}
          <div className="w-14 h-14 rounded-full bg-blue-700 text-white font-bold text-base flex items-center justify-center tracking-wider shrink-0 shadow-sm border-2 border-white dark:border-slate-800">
            {getInitials(currentUser.fullName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-slate-900 dark:text-white text-base truncate">
                {currentUser.fullName}
              </h4>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                {roleLabel}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {currentUser.email} · {currentUser.username}
            </p>
          </div>
        </div>

        {/* Nav Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
          <button
            onClick={() => { setActiveTab('info'); setErrorMsg(null); }}
            className={`flex-1 py-2.5 text-center transition-colors border-b-2 ${
              activeTab === 'info'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-slate-950'
            }`}
          >
            Thông tin chi tiết
          </button>
          <button
            onClick={() => { setActiveTab('edit'); setErrorMsg(null); }}
            className={`flex-1 py-2.5 text-center transition-colors border-b-2 ${
              activeTab === 'edit'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-slate-950'
            }`}
          >
            Chỉnh sửa thông tin
          </button>
          <button
            onClick={() => { setActiveTab('password'); setErrorMsg(null); }}
            className={`flex-1 py-2.5 text-center transition-colors border-b-2 ${
              activeTab === 'password'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-slate-950'
            }`}
          >
            Đổi mật khẩu
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 text-xs max-h-[60vh] overflow-y-auto">
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

          {/* TAB 1: READONLY DETAILS */}
          {activeTab === 'info' && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Họ và tên</span>
                  <span className="font-semibold text-slate-900 dark:text-white mt-1 block">{currentUser.fullName}</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Tên đăng nhập</span>
                  <span className="font-semibold text-slate-900 dark:text-white mt-1 block font-mono">{currentUser.username}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Email liên hệ</span>
                  <span className="font-semibold text-slate-900 dark:text-white mt-1 block truncate">{currentUser.email}</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Số điện thoại</span>
                  <span className="font-semibold text-slate-900 dark:text-white mt-1 block">
                    {currentUser.phone || 'Chưa cập nhật'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                    {currentUser.role === 'lecturer' ? 'Mã giảng viên' : currentUser.role === 'admin' ? 'Mã quản trị' : 'Mã sinh viên'}
                  </span>
                  <span className="font-semibold font-mono text-blue-600 dark:text-blue-400 mt-1 block">
                    {currentUser.lecturerCode || currentUser.studentCode || 'ADMIN_DHHP'}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                    {currentUser.role === 'lecturer' ? 'Bộ môn phụ trách' : currentUser.role === 'student' ? 'Lớp sinh hoạt' : 'Đơn vị công tác'}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white mt-1 block">
                    {currentUser.department || currentUser.className || 'Khoa Công nghệ Thông tin'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Trạng thái tài khoản</span>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {currentUser.status === 'active' ? '[Đang hoạt động]' : '[Bị khóa]'}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Ngày tham gia hệ thống</span>
                  <span className="text-slate-700 dark:text-slate-300 mt-1 block font-mono">
                    {currentUser.createdAt ? new Date(currentUser.createdAt).toLocaleDateString('vi-VN') : '2024-01-01'}
                  </span>
                </div>
              </div>

              <div className="pt-2 text-[11px] text-slate-500 dark:text-slate-400 italic">
                * Lưu ý bảo mật: Sinh viên và Giảng viên không thể tự thay đổi Mã định danh, Vai trò hệ thống hoặc Trạng thái tài khoản. Mọi khiếu nại và hỗ trợ xin gửi về Khoa CNTT qua email fit@dhhp.edu.vn.
              </div>
            </div>
          )}

          {/* TAB 2: EDIT INFO */}
          {activeTab === 'edit' && (
            <form onSubmit={handleSaveProfile} className="space-y-3.5">
              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Họ và tên</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Địa chỉ Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Số điện thoại liên lạc</label>
                <input
                  type="tel"
                  placeholder="09xx xxx xxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              {currentUser.role === 'student' && (
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Lớp sinh hoạt</label>
                  <input
                    type="text"
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              )}

              {currentUser.role === 'lecturer' && (
                <div>
                  <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Bộ môn công tác</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('info')}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-bold"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: CHANGE PASSWORD */}
          {activeTab === 'password' && (
            <form onSubmit={handleChangePassword} className="space-y-3.5">
              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Mật khẩu hiện tại</label>
                <input
                  type="password"
                  placeholder="Nhập mật khẩu đang sử dụng"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Mật khẩu mới</label>
                <input
                  type="password"
                  placeholder="Tối thiểu 6 ký tự"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">Xác nhận mật khẩu mới</label>
                <input
                  type="password"
                  placeholder="Nhập lại mật khẩu mới"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('info')}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-bold"
                >
                  Xác nhận đổi mật khẩu
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
          <button
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="text-xs font-bold text-rose-600 hover:text-rose-700 dark:text-rose-400 underline"
          >
            Đăng xuất tài khoản
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 font-semibold text-xs"
          >
            Đóng cửa sổ
          </button>
        </div>
      </div>
    </div>
  );
};
