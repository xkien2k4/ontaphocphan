import React, { useState } from 'react';
import { User, NotificationItem } from '../../types';
import { markNotificationRead, markAllNotificationsRead } from '../../services/storageService';

interface HeaderProps {
  currentUser: User | null;
  activeTab: string;
  onNavigate: (tab: string, param?: any) => void;
  onOpenAuthModal: (mode?: 'login' | 'register') => void;
  onOpenProfileModal: () => void;
  onLogout: () => void;
  notifications: NotificationItem[];
  onRefreshNotifications: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  activeTab,
  onNavigate,
  onOpenAuthModal,
  onOpenProfileModal,
  onLogout,
  notifications,
  onRefreshNotifications,
}) => {
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleNotificationClick = (item: NotificationItem) => {
    markNotificationRead(item.id);
    onRefreshNotifications();
    setShowNotifMenu(false);
    if (item.link) {
      if (item.link === 'exam') onNavigate('exams');
      else if (item.link === 'questions') onNavigate('practice');
      else if (item.link === 'results') onNavigate('analytics');
      else if (item.link === 'materials') onNavigate('materials');
    }
  };

  const handleMarkAllRead = () => {
    markAllNotificationsRead();
    onRefreshNotifications();
  };

  // Derive initials for avatar
  const getInitials = (name: string): string => {
    if (!name) return 'IT';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const navLinks = currentUser
    ? [
        { id: 'home', label: 'Trang chủ' },
        { id: 'subjects', label: 'Môn học' },
        { id: 'practice', label: 'Ôn tập' },
        { id: 'exams', label: 'Thi thử' },
        { id: 'materials', label: 'Tài liệu' },
      ]
    : [{ id: 'home', label: 'Trang chủ' }];

  if (currentUser?.role === 'student') {
    navLinks.push({ id: 'analytics', label: 'Tiến độ học tập' });
  } else if (currentUser?.role === 'lecturer') {
    navLinks.push({ id: 'lecturer_portal', label: 'Cổng Giảng viên' });
  } else if (currentUser?.role === 'admin') {
    navLinks.push({ id: 'admin_portal', label: 'Quản trị Hệ thống' });
  }

  const roleTextBadge =
    currentUser?.role === 'admin'
      ? 'Quản trị viên'
      : currentUser?.role === 'lecturer'
      ? 'Giảng viên'
      : 'Sinh viên';

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between gap-4">
        {/* Brand Zone: Official Logo & University Titles */}
        <button
          onClick={() => onNavigate('home')}
          className="flex items-center gap-3 text-left shrink-0 cursor-pointer focus:outline-none"
        >
          <img
            src="/assets/aistudio/dhhp-logo_dbc8bacc.png"
            alt="Logo Trường Đại học Hải Phòng"
            className="w-12 h-12 object-contain shrink-0"
          />
          <div className="hidden sm:block">
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100">
              Trường Đại Học Hải Phòng
            </div>
            <div className="text-[13px] font-bold text-blue-800 dark:text-blue-400">
              Khoa Công Nghệ Thông Tin
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              Hệ Thống Ôn Tập & Khảo Thí Trực Tuyến
            </div>
          </div>
        </button>

        {/* Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
          {navLinks.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Actions & Profile Zone */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Mobile/Tablet Menu Button */}
          <button
            type="button"
            onClick={() => {
              setShowMobileMenu(!showMobileMenu);
              setShowNotifMenu(false);
              setShowUserMenu(false);
            }}
            className="lg:hidden px-2.5 py-1.5 rounded-md text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Mở menu điều hướng"
          >
            {showMobileMenu ? 'Đóng' : 'Menu'}
          </button>

          {currentUser ? (
            <>
              {/* Notifications Dropdown */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowNotifMenu(!showNotifMenu);
                    setShowUserMenu(false);
                    setShowMobileMenu(false);
                  }}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5"
                >
                  <span>Thông báo</span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-600 text-white">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {showNotifMenu && (
                  <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-2 z-50 animate-in fade-in text-xs">
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200">Thông báo Khoa CNTT</span>
                      {unreadCount > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                        >
                          Đọc tất cả
                        </button>
                      )}
                    </div>

                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {notifications.length === 0 ? (
                        <div className="p-4 text-center text-slate-400">Không có thông báo mới</div>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => handleNotificationClick(n)}
                            className={`p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition ${
                              !n.isRead ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                            }`}
                          >
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{n.title}</div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                              {n.message}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* User Account Menu with Initials Avatar */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowUserMenu(!showUserMenu);
                    setShowNotifMenu(false);
                    setShowMobileMenu(false);
                  }}
                  className="flex items-center gap-2 p-1 pl-1.5 pr-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-left"
                >
                  {/* Initials Badge */}
                  <div className="w-8 h-8 rounded-full bg-blue-800 text-white font-bold text-xs flex items-center justify-center shrink-0 border border-blue-900">
                    {getInitials(currentUser.fullName)}
                  </div>
                  <div className="hidden sm:block text-left">
                    <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[120px]">
                      {currentUser.fullName}
                    </div>
                    <div className="text-[10px] font-semibold text-blue-700 dark:text-blue-400">
                      [{roleTextBadge}]
                    </div>
                  </div>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-2 z-50 text-xs">
                    <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                      <div className="font-bold text-slate-900 dark:text-white truncate">
                        {currentUser.fullName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {currentUser.email}
                      </div>
                      <div className="mt-1 inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                        Vai trò: {roleTextBadge}
                      </div>
                    </div>

                    <div className="py-1">
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          onOpenProfileModal();
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold"
                      >
                        Thông tin tài khoản
                      </button>

                      {currentUser.role === 'student' && (
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            onNavigate('analytics');
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                        >
                          Kết quả học tập cá nhân
                        </button>
                      )}

                      {currentUser.role === 'lecturer' && (
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            onNavigate('lecturer_portal');
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                        >
                          Bảng điều khiển Giảng viên
                        </button>
                      )}

                      {currentUser.role === 'admin' && (
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            onNavigate('admin_portal');
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                        >
                          Bảng điều khiển Quản trị viên
                        </button>
                      )}
                    </div>

                    <div className="border-t border-slate-100 dark:border-slate-800 pt-1 mt-1">
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          onOpenAuthModal('login');
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-blue-600 dark:text-blue-400 font-semibold"
                      >
                        Chuyển tài khoản đăng nhập
                      </button>
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          onLogout();
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-rose-600 dark:text-rose-400 font-semibold"
                      >
                        Đăng xuất
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenAuthModal('login')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition"
              >
                Đăng nhập
              </button>
              <button
                onClick={() => onOpenAuthModal('register')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-800 hover:bg-blue-900 text-white shadow-xs transition"
              >
                Đăng ký Sinh viên
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile & Tablet Navigation Drawer */}
      {showMobileMenu && (
        <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 space-y-1.5">
          {navLinks.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setShowMobileMenu(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                  isActive
                    ? 'text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};
