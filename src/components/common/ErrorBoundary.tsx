import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const rawMsg = error instanceof Error ? error.message : String(error);
    let friendly = 'Đã xảy ra sự cố hiển thị hoặc kết nối cơ sở dữ liệu Firebase.';
    try {
      const parsed = JSON.parse(rawMsg);
      if (parsed && typeof parsed.error === 'string') {
        if (parsed.error.toLowerCase().includes('permission') || parsed.error.toLowerCase().includes('insufficient')) {
          friendly = `Thiếu quyền truy cập Firestore (${parsed.operationType || 'read'} tại "${parsed.path || 'database'}"). Vui lòng đăng nhập đúng tài khoản Quản trị hoặc Google đã xác thực.`;
        } else if (parsed.error.toLowerCase().includes('quota')) {
          friendly = 'Hệ thống Firestore đã đạt giới hạn đọc/ghi miễn phí trong ngày. Vui lòng thử lại vào ngày mai.';
        } else {
          friendly = parsed.error;
        }
      }
    } catch {
      if (rawMsg) friendly = rawMsg;
    }

    return {
      hasError: true,
      errorMessage: friendly,
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-rose-200 rounded-2xl p-6 shadow-lg space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-lg">
              !
            </div>
            <h2 className="text-base font-bold text-slate-900">
              Thông báo sự cố hệ thống
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed break-words">
              {this.state.errorMessage}
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, errorMessage: '' });
                }}
                className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-900 text-white text-xs font-bold transition"
              >
                Thử lại
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition"
              >
                Tải lại trang
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
