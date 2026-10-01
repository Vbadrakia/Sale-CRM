import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CheckCircle2, MessageCircle, Pencil, XCircle } from 'lucide-react';
import { followUpApi, userApi } from '@/api/services';
import { ApiRequestError } from '@/api/client';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  FollowUpBadge,
  Modal,
  PageHeader,
  PaginationBar,
  Select,
  TableSkeleton,
  TextArea,
} from '@/components/ui';
import { FollowUpFormModal } from '@/components/FollowUpFormModal';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { formatDate, whatsAppUrl } from '@/utils/format';
import type { AssignableUser, FollowUp, Pagination } from '@/types';

const VIEWS = [
  { key: 'today', label: 'Today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
] as const;

type ViewKey = (typeof VIEWS)[number]['key'];

export default function FollowUpsPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [view, setView] = useState<ViewKey>('today');
  const [page, setPage] = useState(1);
  const [assignedToId, setAssignedToId] = useState('');
  const [items, setItems] = useState<FollowUp[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bdes, setBdes] = useState<AssignableUser[]>([]);

  const [editing, setEditing] = useState<FollowUp | null>(null);
  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [outcome, setOutcome] = useState('');
  const [cancelling, setCancelling] = useState<FollowUp | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await followUpApi.list({ view, page, pageSize: 20, assignedToId: assignedToId || undefined });
      setItems(result.data);
      setPagination(result.pagination ?? null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load follow-ups.');
    } finally {
      setLoading(false);
    }
  }, [view, page, assignedToId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (isAdmin) void userApi.assignable().then((r) => setBdes(r.data)).catch(() => undefined);
  }, [isAdmin]);

  const grouped = useMemo(() => items, [items]);

  async function complete() {
    if (!completing) return;
    setBusy(true);
    try {
      await followUpApi.complete(completing.id, outcome.trim() || null);
      toast.success('Follow-up completed');
      setCompleting(null);
      setOutcome('');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not complete the follow-up.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!cancelling) return;
    setBusy(true);
    try {
      await followUpApi.cancel(cancelling.id, null);
      toast.success('Follow-up cancelled');
      setCancelling(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not cancel the follow-up.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Sales activity"
        title="Follow-ups"
        description="Everything you promised to do, in date order."
        action={isAdmin ? (
          <div className="w-56">
            <Select value={assignedToId} onChange={(event) => { setPage(1); setAssignedToId(event.target.value); }}>
              <option value="">Everyone</option>
              {bdes.map((bde) => <option key={bde.id} value={bde.id}>{bde.fullName}</option>)}
            </Select>
          </div>
        ) : undefined}
      />

      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {VIEWS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setPage(1);
              setView(item.key);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === item.key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Card className="p-0">
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={5} columns={4} />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : grouped.length === 0 ? (
          <EmptyState title="Nothing here" description="No follow-ups match this view." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {grouped.map((followUp) => {
              const overdue = followUp.status === 'PENDING' && new Date(followUp.dueAt) < new Date();
              const whatsapp = whatsAppUrl(followUp.lead?.phone, `Hello ${followUp.lead?.contactName ?? ''}`.trim());
              return (
                <li key={followUp.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-900">{followUp.title}</p>
                      <FollowUpBadge status={followUp.status} />
                      {overdue && <span className="text-xs font-semibold text-red-600">Overdue</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      <CalendarClock className="mr-1 inline h-3.5 w-3.5" />
                      {formatDate(followUp.dueDate)} {followUp.dueTime?.slice(0, 5) ?? ''}
                      {followUp.assignedTo ? ` · ${followUp.assignedTo.firstName} ${followUp.assignedTo.lastName}` : ''}
                    </p>
                    {followUp.lead && (
                      <Link to={`/leads/${followUp.leadId}`} className="text-xs text-brand-600 hover:underline">
                        {followUp.lead.companyName} ({followUp.lead.leadCode})
                      </Link>
                    )}
                    {followUp.description && <p className="mt-1 text-sm text-slate-600">{followUp.description}</p>}
                    {followUp.outcome && <p className="mt-1 text-sm text-emerald-700">Outcome: {followUp.outcome}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {whatsapp && (
                      <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                        <MessageCircle className="h-4 w-4 text-emerald-600" />
                      </a>
                    )}
                    {followUp.status === 'PENDING' && (
                      <>
                        <Button small variant="secondary" onClick={() => setEditing(followUp)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button small onClick={() => setCompleting(followUp)}>
                          <CheckCircle2 className="h-4 w-4" /> Complete
                        </Button>
                        <Button small variant="secondary" onClick={() => setCancelling(followUp)}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {pagination && pagination.totalPages > 1 && (
          <PaginationBar pagination={pagination} onPageChange={setPage} />
        )}
      </Card>

      {editing && (
        <FollowUpFormModal
          open
          followUp={editing}
          bdes={bdes}
          canAssign={isAdmin}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      <Modal
        open={!!completing}
        title="Complete follow-up"
        onClose={() => setCompleting(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompleting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={complete} loading={busy}>
              Mark completed
            </Button>
          </>
        }
      >
        <Field label="What was the outcome?" hint="Optional, but useful for the next person who picks this up.">
          <TextArea rows={3} value={outcome} onChange={(event) => setOutcome(event.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={!!cancelling}
        title="Cancel this follow-up?"
        message="It will be marked cancelled and stay in the history."
        confirmLabel="Cancel follow-up"
        loading={busy}
        onCancel={() => setCancelling(null)}
        onConfirm={cancel}
      />
    </div>
  );
}
