import React, { useState } from 'react';
import { Subject, Exam, User, Chapter, Question } from '../../types';
import { hasUnlockedSubjectExam } from '../../services/storageService';
import {
  Megaphone, Phone, Mail, Copy, Check,
  ExternalLink, Landmark, X
} from 'lucide-react';

interface HomePageProps {
  currentUser: User | null;
  subjects: Subject[];
  exams: Exam[];
  chapters?: Chapter[];
  questions?: Question[];
  onNavigate: (tab: string, param?: any) => void;
  onOpenAuthModal?: (mode?: 'login' | 'register') => void;
}

const GITHUB_REPO_URL = 'https://github.com/xkien2k4/';
const GITHUB_PROFILE_URL = 'https://github.com/xkien2k4/';

// Tự động bật thông báo mỗi khi người dùng mở/tải lại website
let hasDismissedNoticeThisLoad = false;

export const HomePage: React.FC<HomePageProps> = ({
  currentUser,
  subjects,
  exams,
  chapters = [],
  questions = [],
  onNavigate,
  onOpenAuthModal,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [announcementTab, setAnnouncementTab] = useState<'overview' | 'github' | 'contact'>('overview');
  const [isNoticePopupOpen, setIsNoticePopupOpen] = useState<boolean>(() => !hasDismissedNoticeThisLoad);

  const handleCloseNoticePopup = () => {
    hasDismissedNoticeThisLoad = true;
    setIsNoticePopupOpen(false);
  };

  const activeExams = exams.filter(e => e.status === 'published');
  const totalChaptersCount = chapters.length > 0
    ? chapters.length
    : subjects.reduce((sum, s) => sum + (s.chaptersCount || 0), 0);
  const totalQuestionsCount = questions.length > 0
    ? questions.length
    : subjects.reduce((sum, s) => sum + (s.questionsCount || 0), 0);

  const examSubjects = subjects.filter(s => s.subjectType !== 'project');
  const projectSubjects = subjects.filter(s => s.subjectType === 'project');

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const renderSubjectCard = (sub: Subject, idx: number) => {
    const isProject = sub.subjectType === 'project';
    const isPractical = sub.subjectType === 'practical';

    return (
      <div
        key={sub.id}
        className={`bg-white dark:bg-slate-900 border rounded-xl p-5 flex flex-col justify-between transition ${
          isProject
            ? 'border-indigo-200 dark:border-indigo-900/60 hover:border-indigo-500'
            : isPractical
            ? 'border-emerald-200 dark:border-emerald-900/60 hover:border-emerald-500'
            : 'border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-700'
        }`}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                {sub.code}
              </span>
              {sub.isHot && (
                <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
                  HOT
                </span>
              )}
            </div>
            <span className={`text-[11px] font-semibold ${
              isPractical
                ? 'text-emerald-700 dark:text-emerald-400'
                : isProject
                ? 'text-indigo-700 dark:text-indigo-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}>
              {isPractical ? 'Thực hành' : isProject ? 'Đồ án học phần' : `Trắc nghiệm · ${sub.credits} TC`}
            </span>
          </div>

          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-snug">
              {idx + 1}. {sub.name}
            </h3>
            {sub.nameEn && <div className="text-[11px] text-slate-400 italic mt-0.5">{sub.nameEn}</div>}
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed">
            {sub.description}
          </p>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Giảng viên phụ trách:</span>
              <strong className="text-slate-800 dark:text-slate-200">{sub.assignedLecturerName || 'Bộ môn phân công'}</strong>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Số tín chỉ:</span>
              <span className="font-mono">{sub.credits} tín chỉ</span>
            </div>
          </div>
        </div>

        <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex gap-2">
          <button
            onClick={() => onNavigate('subject_detail', sub.id)}
            className="flex-1 py-1.5 px-3 rounded text-center text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
          >
            {isProject ? 'Đề cương & Hướng dẫn' : 'Đề cương & Bài giảng'}
          </button>
          <button
            onClick={() => {
              if (isProject) {
                onNavigate('subject_detail', sub.id);
              } else {
                onNavigate('practice', sub.id);
              }
            }}
            className={`flex-1 py-1.5 px-3 rounded text-center text-xs font-bold text-white ${
              isProject
                ? 'bg-indigo-700 hover:bg-indigo-800'
                : isPractical
                ? 'bg-emerald-700 hover:bg-emerald-800'
                : 'bg-blue-800 hover:bg-blue-900'
            }`}
          >
            {isProject ? 'Đăng ký đề tài' : isPractical ? 'Thi thử / Ôn tập' : 'Vào ôn luyện'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-16">
      {/* University Banner Header */}
      <section className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-start gap-5">
            <img
              src="/assets/aistudio/dhhp-logo_dbc8bacc.png"
              alt="Logo Trường Đại học Hải Phòng"
              className="w-20 h-20 object-contain shrink-0"
            />
            <div className="space-y-1.5">
              <div className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-400">
                Trường Đại Học Hải Phòng · Khoa Công Nghệ Thông Tin
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Hệ Thống Ôn Tập & Khảo Thí Trực Tuyến
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
                Nền tảng học tập và ôn luyện kiến thức các học phần chuyên ngành Công nghệ Thông tin. Ôn tập theo chương miễn phí 100% và truy cập hệ thống thi thử (đề cương học phần) theo từng môn học.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsNoticePopupOpen(true)}
              className="px-4 py-2.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold text-xs transition"
            >
              Thông báo
            </button>
            {currentUser ? (
              <>
                <button
                  onClick={() => onNavigate('practice')}
                  className="px-4 py-2.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold text-xs transition"
                >
                  Vào phòng ôn tập trắc nghiệm
                </button>
                <button
                  onClick={() => onNavigate('exams')}
                  className="px-4 py-2.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold text-xs transition"
                >
                  Danh sách đề thi thử
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onOpenAuthModal?.('login')}
                  className="px-4 py-2.5 rounded-lg bg-blue-800 hover:bg-blue-900 text-white font-bold text-xs shadow-sm transition"
                >
                  Đăng nhập hệ thống
                </button>
                <button
                  onClick={() => onOpenAuthModal?.('register')}
                  className="px-4 py-2.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800 font-bold text-xs transition"
                >
                  Đăng ký tài khoản Sinh viên
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
        {/* Auto-opening Announcement Tab Modal when entering HomePage */}
        {isNoticePopupOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Thông báo Trang chủ"
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          >
            <div className="rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto bg-white text-slate-900">
              {/* Announcement Header & Tab Switcher */}
              <div className="px-6 py-5 sm:px-8 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-900 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Megaphone className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest text-blue-900">
                      <span>Thông báo chính thức · Hệ thống Khoa CNTT ĐH Hải Phòng</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 mt-0.5">
                      Thông Tin Liên Hệ Trực Tiếp & Mã Nguồn Mở GitHub Tham Khảo
                    </h2>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <div className="flex flex-wrap items-center gap-1 bg-slate-200/80 p-1 rounded-xl border border-slate-200">
                    {[
                      { id: 'overview', label: 'Thông báo tổng quan' },
                      { id: 'github', label: 'Code GitHub tham khảo' },
                      { id: 'contact', label: 'Thông tin liên hệ & CK' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setAnnouncementTab(t.id as any)}
                        className={`px-3.5 py-2 rounded-lg text-xs font-bold transition ${
                          announcementTab === t.id
                            ? 'bg-blue-900 text-white shadow-sm'
                            : 'text-slate-700 hover:text-slate-950 hover:bg-white'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleCloseNoticePopup}
                    className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition"
                    title="Đóng thông báo"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Announcement Body */}
              <div className="p-6 sm:p-8 space-y-6 bg-white text-slate-900">
                {announcementTab === 'overview' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left: Direct Contact */}
                    <div className="lg:col-span-7 space-y-4">
                      {/* Contact Info Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                          <div className="text-slate-500 font-bold uppercase text-[10px]">
                            Tác giả & Quản trị hệ thống
                          </div>
                          <div className="text-sm font-extrabold text-slate-900">
                            Nguyễn Vũ Xuân Kiên
                          </div>
                          <div className="flex items-center gap-2 text-slate-700">
                            <Phone className="w-3.5 h-3.5 text-blue-800" />
                            <span>SĐT / Zalo: <strong className="text-slate-900 font-mono">0334613184</strong></span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-700">
                            <Mail className="w-3.5 h-3.5 text-blue-800" />
                            <a href="mailto:nguyenvxkien@gmail.com" className="hover:underline text-blue-800 font-semibold">
                              nguyenvxkien@gmail.com
                            </a>
                          </div>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                          <div className="text-slate-500 font-bold uppercase text-[10px] flex items-center gap-1">
                            <Landmark className="w-3.5 h-3.5 text-emerald-700" />
                            Tài khoản nhận chuyển khoản (10k/môn)
                          </div>
                          <div className="text-sm font-extrabold text-emerald-700">
                            VietinBank (ICB)
                          </div>
                          <div className="flex items-center justify-between gap-2 text-slate-800">
                            <span>STK: <strong className="font-mono text-slate-950 text-sm">10387719154</strong></span>
                            <button
                              type="button"
                              onClick={() => void handleCopy('stk', '10387719154')}
                              className="px-2 py-1 rounded bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-[11px] font-semibold inline-flex items-center gap-1"
                            >
                              {copiedKey === 'stk' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedKey === 'stk' ? 'Đã chép' : 'Chép'}</span>
                            </button>
                          </div>
                          <div className="text-[11px] text-slate-700 font-semibold uppercase">
                            Chủ TK: NGUYEN VU XUAN KIEN
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right: Highlighted GitHub Repository Card */}
                    <div className="lg:col-span-5 flex flex-col justify-between p-6 rounded-2xl bg-slate-50 border-2 border-blue-900/20 shadow-xs space-y-5">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-blue-900 text-white text-xs font-extrabold">
                            <span>MÃ NGUỒN MỞ GITHUB</span>
                          </div>
                          <span className="text-[11px] font-mono text-emerald-700 font-bold">Public Repo</span>
                        </div>

                        <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                          Tham khảo toàn bộ Source Code dự án trực tiếp trên GitHub
                        </h3>

                        <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                          <div className="text-[10px] font-bold uppercase text-slate-500">Link GitHub code tổng chính thức</div>
                          <div className="flex items-center justify-between gap-2">
                            <a
                              href={GITHUB_REPO_URL}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs sm:text-sm font-bold text-blue-800 hover:text-blue-950 underline break-all"
                            >
                              {GITHUB_REPO_URL}
                            </a>
                            <button
                              type="button"
                              onClick={() => void handleCopy('github', GITHUB_REPO_URL)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 shrink-0"
                              title="Sao chép link GitHub"
                            >
                              {copiedKey === 'github' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                          <div className="text-[11px] text-slate-600">
                            Trang tổng hợp mã nguồn của tác giả <span className="font-mono font-semibold text-slate-900">@xkien2k4</span>.
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <a
                          href={GITHUB_PROFILE_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 py-3 px-4 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition shadow-sm"
                        >
                          <span>Vào GitHub tham khảo code (@xkien2k4)</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {announcementTab === 'github' && (
                  <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-2 text-xs font-extrabold text-blue-900 uppercase">
                          Kho mã nguồn mở tham khảo
                        </div>
                        <h3 className="text-xl font-extrabold text-slate-900">
                          {GITHUB_REPO_URL}
                        </h3>
                      </div>
                      <a
                        href={GITHUB_REPO_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-5 py-3 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-extrabold text-sm inline-flex items-center gap-2 shrink-0 shadow-sm"
                      >
                        <span>Mở GitHub ngay</span>
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                )}

                {announcementTab === 'contact' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs sm:text-sm">
                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="text-blue-900 font-extrabold uppercase text-xs">Liên hệ Admin / Tác giả</div>
                      <div className="text-base font-extrabold text-slate-900">Nguyễn Vũ Xuân Kiên</div>
                      <p className="text-slate-600 text-xs">Khoa Công nghệ Thông tin · Trường Đại học Hải Phòng</p>
                      <div className="pt-2 space-y-1.5 text-xs text-slate-800">
                        <div>SĐT / Zalo: <strong className="font-mono text-slate-950">0334613184</strong></div>
                        <div>Email cá nhân: <strong className="text-blue-800">nguyenvxkien@gmail.com</strong></div>
                        <div>Email quản trị: <strong className="text-blue-800">admin@dhhp.edu.vn</strong></div>
                      </div>
                    </div>

                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="text-emerald-700 font-extrabold uppercase text-xs">Chuyển khoản mở khóa môn thi</div>
                      <div className="text-base font-extrabold text-slate-900">VietinBank (ICB)</div>
                      <div className="space-y-1.5 text-xs text-slate-800 pt-1">
                        <div>Số tài khoản: <strong className="font-mono text-slate-950 text-sm">10387719154</strong></div>
                        <div>Chủ tài khoản: <strong className="uppercase text-slate-950">NGUYEN VU XUAN KIEN</strong></div>
                        <div>Mức phí: <strong className="text-blue-900">10.000đ / 1 môn thi thử</strong></div>
                        <div className="text-[11px] text-slate-600">Không dùng xác nhận tự động — Admin hoặc Giảng viên sẽ xác nhận mở khóa trực tiếp cho bạn.</div>
                      </div>
                    </div>

                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                      <div className="text-blue-900 font-extrabold uppercase text-xs">Mã nguồn & Cộng đồng học tập</div>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        Mở repository GitHub để xem toàn bộ code mẫu, đóng góp ý kiến hoặc báo lỗi trực tiếp cho tác giả:
                      </p>
                      <a
                        href={GITHUB_REPO_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2.5 px-4 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-extrabold text-xs inline-flex items-center justify-center gap-2"
                      >
                        <span>github.com/xkien2k4/</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-slate-600">
                    Bạn có thể bấm nút <strong>Thông báo</strong> ở đầu Trang chủ để mở lại thông báo bất kỳ lúc nào.
                  </span>
                  <button
                    type="button"
                    onClick={handleCloseNoticePopup}
                    className="px-5 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-extrabold text-xs sm:text-sm transition shadow-sm"
                  >
                    Đã hiểu · Vào Trang chủ
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!currentUser && (
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="text-amber-900 dark:text-amber-200">
              <strong className="font-bold">Chế độ Khách (Chưa đăng nhập):</strong> Bạn chỉ có thể xem tổng quan Trang chủ. Vui lòng{' '}
              <button
                onClick={() => onOpenAuthModal?.('login')}
                className="font-bold underline text-blue-700 dark:text-blue-300"
              >
                đăng nhập
              </button>{' '}
              hoặc{' '}
              <button
                onClick={() => onOpenAuthModal?.('register')}
                className="font-bold underline text-blue-700 dark:text-blue-300"
              >
                đăng ký tài khoản Sinh viên
              </button>{' '}
              để truy cập Môn học, Ôn tập, Thi thử và Tài liệu học phần.
            </div>
          </div>
        )}

        {/* Statistics Bar */}
        <section className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 text-center">
            <div className="pt-2 sm:pt-0">
              <div className="text-2xl font-extrabold font-mono text-blue-800 dark:text-blue-400">{subjects.length}</div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase mt-0.5">Môn học chuyên ngành</div>
            </div>
            <div className="pt-2 sm:pt-0">
              <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">{totalChaptersCount}</div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase mt-0.5">Chương học phần</div>
            </div>
            <div className="pt-2 sm:pt-0">
              <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">{totalQuestionsCount}</div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase mt-0.5">Câu hỏi khảo thí</div>
            </div>
            <div className="pt-2 sm:pt-0">
              <div className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white">{activeExams.length}</div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase mt-0.5">Đề thi thử mở</div>
            </div>
            <div className="pt-2 sm:pt-0 col-span-2 sm:col-span-1">
              <div className="text-2xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">100%</div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase mt-0.5">Chuẩn đầu ra CLO</div>
            </div>
          </div>
        </section>

        {/* Section 1: Theory & Practical Subjects */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                Học Phần Lý Thuyết & Thực Hành ({examSubjects.length} môn)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Ôn luyện câu hỏi trắc nghiệm miễn phí và tham gia hệ thống thi thử (đề cương học phần) (10.000đ/môn)
              </p>
            </div>
            <button
              onClick={() => onNavigate('subjects')}
              className="text-xs font-bold text-blue-700 dark:text-blue-400 hover:underline"
            >
              Xem tất cả chi tiết & đề cương &rarr;
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {examSubjects.map((sub, idx) => renderSubjectCard(sub, idx))}
          </div>
        </section>

        {/* Section 2: Dedicated Project Subjects */}
        {projectSubjects.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-indigo-200 dark:border-indigo-900/60 pb-3">
              <div>
                <h2 className="text-lg font-bold text-indigo-800 dark:text-indigo-400 uppercase tracking-wide">
                  Đồ Án Học Phần Chuyên Ngành ({projectSubjects.length} môn)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Phân tách riêng cho các học phần đánh giá theo đồ án: xem đề cương hướng dẫn, đăng ký đề tài và nộp mã nguồn
                </p>
              </div>
              <button
                onClick={() => onNavigate('subjects')}
                className="text-xs font-bold text-indigo-700 dark:text-indigo-400 hover:underline"
              >
                Danh mục Đồ án &rarr;
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {projectSubjects.map((sub, idx) => renderSubjectCard(sub, idx))}
            </div>
          </section>
        )}

        {/* Active Mock Exams Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                Hệ Thống Thi Thử (Đề Cương Học Phần) Đang Mở (10.000đ / Môn)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Hệ thống thi thử (đề cương học phần) có đếm ngược thời gian và chấm điểm tự động · Chuyển khoản môn nào thi thử môn đó
              </p>
            </div>
            <button
              onClick={() => onNavigate('exams')}
              className="text-xs font-bold text-blue-700 dark:text-blue-400 hover:underline"
            >
              Xem tất cả đề thi &rarr;
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeExams.map((ex) => {
              const unlocked = !currentUser || hasUnlockedSubjectExam(currentUser, ex.subjectId);
              return (
                <div
                  key={ex.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {ex.code}
                      </span>
                      {currentUser?.role === 'student' ? (
                        unlocked ? (
                          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                            [Đã mở khóa môn]
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                            [10.000đ / môn · Đề cương học phần]
                          </span>
                        )
                      ) : (
                        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          [Đang mở thi thử]
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">{ex.title}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{ex.description}</p>
                    <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
                      <span>Thời gian: <strong className="text-slate-800 dark:text-slate-200">{ex.durationMinutes} phút</strong></span>
                      <span>Số câu: <strong className="text-slate-800 dark:text-slate-200">{ex.examFormat === 'practical' ? 2 : ex.totalQuestions} câu</strong></span>
                      <span>Thang điểm tối đa: <strong className="text-slate-800 dark:text-slate-200">{ex.maxScore} điểm</strong></span>
                    </div>
                  </div>

                  <div className="pt-4 mt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                    <button
                      onClick={() => onNavigate('exam_room', ex.id)}
                      className={`px-4 py-1.5 rounded-lg text-white font-bold text-xs ${
                        currentUser?.role === 'student' && !unlocked
                          ? 'bg-amber-600 hover:bg-amber-700'
                          : 'bg-blue-800 hover:bg-blue-900'
                      }`}
                    >
                      {currentUser?.role === 'student' && !unlocked
                        ? 'Mở khóa môn (10.000đ) để thi'
                        : 'Bắt đầu làm bài thi'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
