import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { notificationApi } from '@/api/services';
import { formatRelative } from '@/utils/format';
import type { AppNotification } from '@/types';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [count, setCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(async () => {
    try {
      const result = await notificationApi.unreadCount();
      setCount(result.data?.count ?? 0);
    } catch {
      /* the badge is non-critical */
    }
  }, []);

  const loadItems = useCallback(async () => {
    try {
      const result = await notificationApi.list({ pageSize: 25 });
      setItems(result.data ?? []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void loadCount();
    const interval = window.setInterval(loadCount, 60_000);
    return () => window.clearInterval(interval);
  }, [loadCount]);

  useEffect(() => {
    if (open) void loadItems();
  }, [open, loadItems]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function markAll() {
    try {
      await notificationApi.markAllRead();
      setCount(0);
      setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    } catch {
      /* non-critical update error */
    }
  }

  async function markOne(id: number) {
    try {
      await notificationApi.markRead(id);
      setItems((current) => current.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
      setCount((current) => Math.max(0, current - 1));
    } catch {
      /* non-critical update error */
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
        onClick={() => setOpen((value) => !value)}
        className="icon-btn-bordered relative"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white ring-2 ring-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-bold text-slate-900">Notifications</span>
            <button type="button" onClick={markAll} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">You have no notifications yet.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void markOne(item.id)}
                  className={`block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50 ${
                    item.isRead ? '' : 'bg-brand-50/50'
                  }`}
                >
                  <p className="text-sm font-medium text-slate-800">{item.title}</p>
                  <p className="text-xs text-slate-600">{item.message}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{formatRelative(item.createdAt)}</p>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-slate-200 px-3 py-2 text-center">
            <Link to="/notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
