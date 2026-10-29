import React, { StrictMode, Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerBackgroundSyncWorker, requestAllBackgroundAndSyncPermissions, initBackgroundSync, enableForegroundService, isKeepAliveModeEnabled, setFieldKeepAliveMode } from './lib/offlineQueue';

// Register background sync service worker and initialize background listeners safely
try {
  registerBackgroundSyncWorker();
  initBackgroundSync();
  setFieldKeepAliveMode(true).catch(() => {});
  if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
      setTimeout(() => {
        requestAllBackgroundAndSyncPermissions().catch(() => {});
        enableForegroundService().catch(() => {});
        setFieldKeepAliveMode(true).catch(() => {});
      }, 1000);
    });
  }
} catch (swErr) {
  console.warn('Service worker registration notice:', swErr);
}

// Global crash protection for native webview / Android wrapper
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.warn('Caught global window error:', event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('Caught unhandled promise rejection:', event.reason);
  });
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Captured React rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center dir-rtl">
          <div className="max-w-md w-full bg-slate-800 border border-slate-700 p-8 rounded-3xl shadow-2xl space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-2xl font-bold border border-rose-500/30">
              ⚠️
            </div>
            <h2 className="text-xl font-black text-slate-100">حدث خطأ أثناء تشغيل التطبيق</h2>
            <p className="text-xs text-slate-400 leading-relaxed dir-rtl">
              حدث خطأ غير متوقع أثناء تحميل الشاشة. يرجى الضغط على الزر أدناه لإعادة تنشيط التطبيق.
            </p>
            {this.state.error?.message && (
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-700 text-[11px] font-mono text-rose-300 text-left dir-ltr overflow-x-auto max-h-32">
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={() => {
                try {
                  sessionStorage.clear();
                  localStorage.removeItem('sami_installments_rep');
                } catch (e) {
                  // ignore
                }
                window.location.reload();
              }}
              className="w-full py-3.5 px-6 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
            >
              إعادة تحميل التطبيق (تحديث)
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
