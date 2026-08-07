import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { notificationsApi, AppNotification } from '../api/notifications';

function formatNotifTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function notifAccent(type: string): string {
  if (type.startsWith('substitute')) return 'bg-amber-100 text-amber-800';
  if (type.startsWith('task')) return 'bg-sky-100 text-sky-800';
  return 'bg-primary-100 text-primary-800';
}

function notifKindLabel(type: string): string {
  if (type.startsWith('substitute')) return 'Dạy thay';
  if (type.startsWith('task')) return 'Công việc';
  return 'Hệ thống';
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [panelTop, setPanelTop] = useState(64);

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
    const updateTop = () => {
      const header = document.querySelector('header');
      const bottom = header?.getBoundingClientRect().bottom ?? 64;
      setPanelTop(Math.max(56, bottom + 8));
    };
    updateTop();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('resize', updateTop);
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('resize', updateTop);
      document.removeEventListener('keydown', onKey);
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
        <div className="px-5 py-14 text-center">
          <p className="text-sm text-gray-400">Đang tải thông báo...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <div className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 11-6 0m6 0H9"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700">Chưa có thông báo</p>
          <p className="text-xs text-gray-400 mt-1">Mọi cập nhật mới sẽ hiện tại đây</p>
        </div>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id} className="border-b border-gray-100 last:border-b-0">
              <button
                type="button"
                onClick={() => void handleOpenItem(item)}
                className={`group w-full text-left px-4 sm:px-5 py-3.5 transition-colors ${
                  item.is_read
                    ? 'bg-white hover:bg-gray-50'
                    : 'bg-primary-50/60 hover:bg-primary-50'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={`mt-0.5 shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-semibold tracking-wide ${notifAccent(item.type)}`}
                  >
                    {notifKindLabel(item.type).slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 leading-snug break-words">
                        {item.title}
                      </p>
                      {!item.is_read && (
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-primary-600 shrink-0" />
                      )}
                    </div>
                    {item.body && (
                      <p className="text-[13px] text-gray-600 mt-1 leading-relaxed break-words [overflow-wrap:anywhere] line-clamp-3">
                        {item.body}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-400">
                      <span className={`px-1.5 py-0.5 rounded-md font-medium ${notifAccent(item.type)}`}>
                        {notifKindLabel(item.type)}
                      </span>
                      <span>{formatNotifTime(item.created_at)}</span>
                    </div>
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
        <div className="fixed inset-0 z-[90]" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 border-0 cursor-default"
            aria-label="Đóng thông báo"
            onClick={() => setOpen(false)}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Thông báo"
            className="absolute left-3 right-3 sm:left-auto sm:right-4 sm:w-[26rem] bg-white rounded-2xl shadow-2xl border border-gray-200/80 overflow-hidden flex flex-col"
            style={{
              top: panelTop,
              maxHeight: `min(calc(100dvh - ${panelTop + 12}px), 34rem)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-4 sm:px-5 py-3.5 border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-gray-900 tracking-tight">Thông báo</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {unread > 0 ? `${unread} chưa đọc` : 'Đã xem hết'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {unread > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAll}
                      className="px-2.5 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
                    >
                      Đọc hết
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-xl leading-none"
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
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative p-2.5 sm:p-2 rounded-xl transition-colors ${
          open
            ? 'bg-primary-50 text-primary-700'
            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
        }`}
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
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {panel}
    </div>
  );
}
