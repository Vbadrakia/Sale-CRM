import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  variant: ToastVariant;
  message: string;
}

interface ToastContextValue {
  notify: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const notify = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id, variant, message }]);
    window.setTimeout(() => dismiss(id), 4500);
  }, [dismiss]);

  const value = useMemo<ToastContextValue>(() => ({
    notify,
    success: (message: string) => notify(message, 'success'),
    error: (message: string) => notify(message, 'error'),
  }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-end px-4 sm:right-4 sm:left-auto sm:w-[420px] sm:px-0" aria-live="polite">
        <div className="flex w-full flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role={toast.variant === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-3.5 shadow-xl shadow-slate-900/10 ${
                toast.variant === 'success' ? 'border-emerald-200' : toast.variant === 'error' ? 'border-red-200' : 'border-slate-200'
              }`}
            >
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                toast.variant === 'success' ? 'bg-emerald-50 text-emerald-600' : toast.variant === 'error' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'
              }`}>
                {toast.variant === 'success' ? <CheckCircle2 className="h-4 w-4" /> : toast.variant === 'error' ? <AlertCircle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
              </span>
              <span className="flex-1 pt-1 text-sm font-medium leading-5 text-slate-700">{toast.message}</span>
              <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)} className="icon-btn h-7 w-7">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
