import React from 'react';
import { Subject } from '../../types';

interface FooterProps {
  subjects?: Subject[];
  onNavigate: (tab: string, param?: any) => void;
}

export const Footer: React.FC<FooterProps> = ({ subjects = [], onNavigate }) => {
  return (
    <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 text-xs py-10 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Col 1: University Identity & Official Logo */}
          <div className="md:col-span-1 space-y-3">
            <div className="flex items-center gap-3">
              <img
                src="/assets/aistudio/dhhp-logo_dbc8bacc.png"
                alt="Logo Trường Đại học Hải Phòng"
                className="w-12 h-12 object-contain shrink-0"
              />
              <div>
                <div className="text-xs font-bold uppercase text-white tracking-wide">
                  Trường Đại Học Hải Phòng
                </div>
                <div className="text-xs text-blue-400 font-semibold">
                  Khoa Công Nghệ Thông Tin
                </div>
              </div>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Nền tảng ôn tập trực tuyến và đánh giá năng lực học phần chuyên ngành Công nghệ Thông tin. Phục vụ học tập chủ động cho sinh viên và quản lý khảo thí của giảng viên.
            </p>
          </div>

          {/* Col 2: Dynamic Subjects */}
          <div>
            <h4 className="text-white font-bold mb-3 uppercase tracking-wider text-[11px]">
              Học phần chuyên ngành
            </h4>
            <ul className="space-y-2 text-xs">
              {subjects.slice(0, 6).map((s, idx) => (
                <li key={s.id}>
                  <button
                    onClick={() => onNavigate('subject_detail', s.id)}
                    className="hover:text-white transition-colors text-left"
                  >
                    {idx + 1}. {s.name} ({s.code})
                  </button>
                </li>
              ))}
              {subjects.length > 6 && (
                <li>
                  <button
                    onClick={() => onNavigate('subjects')}
                    className="text-blue-400 hover:text-white transition-colors text-left font-semibold"
                  >
                    Xem toàn bộ {subjects.length} môn học &rarr;
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* Col 3: System Features */}
          <div>
            <h4 className="text-white font-bold mb-3 uppercase tracking-wider text-[11px]">
              Chức năng hệ thống
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button onClick={() => onNavigate('practice')} className="hover:text-white transition-colors">
                  Ôn tập trắc nghiệm theo chương & độ khó
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('exams')} className="hover:text-white transition-colors">
                  Phòng thi thử trực tuyến có đếm ngược
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('materials')} className="hover:text-white transition-colors">
                  Đề cương chi tiết học phần & bài giảng
                </button>
              </li>
            </ul>
          </div>

          {/* Col 4: Faculty Contact */}
          <div>
            <h4 className="text-white font-bold mb-3 uppercase tracking-wider text-[11px]">
              Liên hệ khoa CNTT
            </h4>
            <div className="space-y-2 text-[11px] text-slate-400">
              <p>
                <strong className="text-white block">Địa chỉ:</strong>
                Số 171 Phan Đăng Lưu, Quận Kiến An, Thành phố Hải Phòng
              </p>
              <p>
                <strong className="text-white block">Văn phòng khoa:</strong>
                Nhà A1, Trường Đại học Hải Phòng
              </p>
              <p>
                <strong className="text-white block">Email hỗ trợ:</strong>
                <a href="mailto:fit@dhhp.edu.vn" className="hover:text-white transition-colors">
                  fit@dhhp.edu.vn
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-slate-800 flex items-center justify-center sm:justify-between text-[11px] text-slate-500">
          <div>
            &copy; {new Date().getFullYear()} Khoa Công nghệ Thông tin - Trường Đại học Hải Phòng. Tất cả quyền được bảo lưu.
          </div>
        </div>
      </div>
    </footer>
  );
};
