import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: number; kind: ToastKind; title: string; message?: string };
type ToastContextValue = {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const styles: Record<ToastKind, { icon: typeof Info; className: string; iconClass: string }> = {
  success: { icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-900', iconClass: 'text-emerald-600' },
  error: { icon: AlertTriangle, className: 'border-red-200 bg-red-50 text-red-900', iconClass: 'text-red-600' },
  info: { icon: Info, className: 'border-blue-200 bg-blue-50 text-blue-900', iconClass: 'text-blue-600' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, title: string, message?: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setItems((current) => [...current, { id, kind, title, message }].slice(-4));
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 5000);
  }, []);

  const value = useMemo(() => ({
    success: (title: string, message?: string) => push('success', title, message),
    error: (title: string, message?: string) => push('error', title, message),
    info: (title: string, message?: string) => push('info', title, message),
  }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-5 top-5 z-[100] flex w-[min(420px,calc(100vw-2.5rem))] flex-col gap-3">
        {items.map((item) => {
          const cfg = styles[item.kind];
          const Icon = cfg.icon;
          return (
            <div key={item.id} className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${cfg.className}`}>
              <Icon size={18} className={`mt-0.5 shrink-0 ${cfg.iconClass}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{item.title}</div>
                {item.message && <div className="mt-0.5 break-words text-sm opacity-80">{item.message}</div>}
              </div>
              <button onClick={() => setItems((current) => current.filter((x) => x.id !== item.id))} className="focus-ring rounded p-1 opacity-60 hover:bg-white/60 hover:opacity-100" aria-label="Dismiss notification">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
