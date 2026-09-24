import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, CheckCheck } from 'lucide-react';
import { notificationApi } from '@/api/services';
import { ApiRequestError } from '@/api/client';
import { Button, Card, EmptyState, ErrorState, PageHeader, PaginationBar, TableSkeleton } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { formatRelative } from '@/utils/format';
import type { AppNotification, Pagination } from '@/types';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await notificationApi.list({ page, pageSize: 20, unread: unreadOnly ? 'true' : undefined });
      setItems(result.data);
      setPagination(result.pagination ?? null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, [page, unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(notification: AppNotification) {
    if (!notification.isRead) {
      try {
        await notificationApi.markRead(notification.id);
      } catch {
        /* the navigation still matters more than the read flag */
      }
    }
    if (notification.entityType === 'LEAD' && notification.entityId) navigate(`/leads/${notification.entityId}`);
    else if (notification.entityType === 'FOLLOW_UP') navigate('/followups');
    else void load();
  }

  async function markAll() {
    try {
      await notificationApi.markAllRead();
      toast.success('All notifications marked as read');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not update notifications.');
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description="Assignments, due follow-ups and pipeline changes."
        action={
          <>
            <Button variant="secondary" onClick={() => { setPage(1); setUnreadOnly((value) => !value); }}>{unreadOnly ? 'Show all' : 'Unread only'}</Button>
            <Button variant="secondary" onClick={markAll}><CheckCheck className="h-4 w-4" /> Mark all read</Button>
          </>
        }
      />

      <Card className="p-0">
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={5} columns={2} />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState title="You're all caught up" description="No notifications to show." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => void open(notification)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                    notification.isRead ? '' : 'bg-brand-50/60'
                  }`}
                >
                  <BellRing className={`mt-0.5 h-4 w-4 ${notification.isRead ? 'text-slate-400' : 'text-brand-600'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{notification.title}</p>
                    <p className="text-sm text-slate-600">{notification.message}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{formatRelative(notification.createdAt)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {pagination && pagination.totalPages > 1 && <PaginationBar pagination={pagination} onPageChange={setPage} />}
      </Card>
    </div>
  );
}
