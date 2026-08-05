import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export type ToastItem = {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
};

type ToastApi = {
  success: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
  /** Show API failure with extracted reason when possible. */
  apiError: (err: unknown, fallback: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

let toastSeq = 0;

export function extractApiError(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: unknown }).msg);
        }
        return '';
      })
      .filter(Boolean);
    if (parts.length) return parts.join('; ');
  }
  if (detail && typeof detail === 'object') {
    try {
      return JSON.stringify(detail);
    } catch {
      /* ignore */
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, title: string, detail?: string) => {
    const id = ++toastSeq;
    setItems((prev) => [...prev, { id, kind, title, detail: detail || undefined }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, kind === 'error' ? 6500 : 4200);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, detail) => push('success', title, detail),
      error: (title, detail) => push('error', title, detail),
      info: (title, detail) => push('info', title, detail),
      apiError: (err, fallback) => push('error', fallback, extractApiError(err, fallback)),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[min(100vw-2rem,24rem)] pointer-events-none"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border shadow-lg px-4 py-3 text-sm bg-white ${
              t.kind === 'success'
                ? 'border-green-200'
                : t.kind === 'error'
                  ? 'border-red-200'
                  : 'border-sky-200'
            }`}
          >
            <div className="flex items-start gap-2">
              <span
                className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${
                  t.kind === 'success' ? 'bg-green-500' : t.kind === 'error' ? 'bg-red-500' : 'bg-sky-500'
                }`}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`font-medium ${
                    t.kind === 'success'
                      ? 'text-green-900'
                      : t.kind === 'error'
                        ? 'text-red-900'
                        : 'text-sky-900'
                  }`}
                >
                  {t.title}
                </p>
                {t.detail && t.detail !== t.title ? (
                  <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap break-words">{t.detail}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-gray-400 hover:text-gray-700 text-xs px-1"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
