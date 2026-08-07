import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { notificationsApi, AppNotification } from '../api/notifications';

function formatNotifTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [desktopPos, setDesktopPos] = useState<{ top: number; right: number }>({
    top: 64,
    right: 16,
  });

  useEffect(() => {
    if (!open || !rootRef.current) return;
    const updatePos = () => {
      const rect = rootRef.current!.getBoundingClientRect();
      setDesktopPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open]);

  const load = useCallback(async () => {
    try {
      const data = await notificationsApi.list(15);
      setItems(data.items || []);
      setUnread(data.unread_count ?? 0);
    } catch {
      /* ignore poll errors */
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 45000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDoc = (e: MouseEvent) => {
      // Desktop dropdown only — mobile uses backdrop
      if (window.matchMedia('(min-width: 640px)').matches) {
        if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open]);

  const handleOpenItem = async (item: AppNotification) => {
    try {
      if (!item.is_read) {
        await notificationsApi.markRead(item.id);
        setItems((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)),
        );
        setUnread((c) => Math.max(0, c - 1));
      }
    } catch {
      /* still navigate */
    }
    setOpen(false);
    const link = item.link || '/';
    navigate(link.startsWith('/') ? link : `/${link}`);
  };

  const handleMarkAll = async () => {
    try {
      await notificationsApi.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnread(0);
    } catch {
      /* ignore */
    }
  };

  const listContent = (
    <>
      {loading && items.length === 0 ? (
        <p className="px-4 py-10 text-sm text-gray-400 text-center">Đang tải...</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-10 text-sm text-gray-400 text-center">Chưa có thông báo</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => void handleOpenItem(item)}
                className={`w-full text-left px-4 py-3.5 active:bg-gray-100 hover:bg-gray-50 transition-colors ${
                  item.is_read ? 'bg-white' : 'bg-primary-50/50'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                      item.is_read ? 'bg-transparent' : 'bg-primary-600'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 leading-snug break-words">
                      {item.title}
                    </p>
                    {item.body && (
                      <p className="text-xs text-gray-600 mt-1 leading-relaxed break-words [overflow-wrap:anywhere]">
                        {item.body}
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      {formatNotifTime(item.created_at)}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const panel = open
    ? createPortal(
        <>
          {/* Mobile: bottom sheet full-bleed */}
          <div className="sm:hidden fixed inset-0 z-[90] flex flex-col justify-end">
            <button
              type="button"
              className="absolute inset-0 bg-black/45 border-0 cursor-default"
              aria-label="Đóng thông báo"
              onClick={() => setOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Thông báo"
              className="relative bg-white rounded-t-2xl shadow-xl max-h-[min(88dvh,88vh)] flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]"
            >
              <div className="shrink-0 pt-3 pb-2 px-4 border-b border-gray-100">
                <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto mb-3" />
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-gray-900">Thông báo</p>
                    {unread > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">{unread} chưa đọc</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {unread > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAll}
                        className="px-2.5 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 rounded-lg"
                      >
                        Đọc hết
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-xl leading-none"
                      aria-label="Đóng"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                {listContent}
              </div>
            </div>
          </div>

          {/* Desktop: anchored dropdown */}
          <div
            role="dialog"
            aria-label="Thông báo"
            className="hidden sm:block fixed z-[90] w-[22rem] max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
            style={{
              top: desktopPos.top,
              right: desktopPos.right,
            }}
          >
            <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900">Thông báo</p>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAll}
                  className="text-xs font-medium text-primary-700 hover:underline"
                >
                  Đánh dấu tất cả đã đọc
                </button>
              )}
            </div>
            <div className="max-h-[min(60vh,24rem)] overflow-y-auto overscroll-contain">
              {listContent}
            </div>
          </div>
        </>,
        document.body,
      )
    : null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2.5 sm:p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors"
        aria-label="Thông báo"
        aria-expanded={open}
      >
        <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 11-6 0m6 0H9"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {panel}
    </div>
  );
}
