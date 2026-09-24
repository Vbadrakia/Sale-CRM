import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { followUpApi, leadApi, userApi } from '@/api/services';
import { ApiRequestError } from '@/api/client';
import {
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Field,
  FollowUpBadge,
  PriorityBadge,
  Select,
  StatusBadge,
  TextArea,
  SectionTitle,
} from '@/components/ui';
import { LeadFormModal } from '@/components/LeadFormModal';
import { FollowUpFormModal } from '@/components/FollowUpFormModal';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { ALLOWED_TRANSITIONS, STATUS_LABELS, formatDate, formatDateTime, gmailComposeUrl, mailtoUrl, whatsAppUrl } from '@/utils/format';
import type { Activity, AssignableUser, Customer, FollowUp, Lead, LeadStatus } from '@/types';

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1 border-b border-slate-100 py-3 last:border-0 sm:grid-cols-[9rem,minmax(0,1fr)] sm:items-start sm:gap-3">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-sm leading-6 text-slate-800 [overflow-wrap:anywhere]">{value ?? '—'}</span>
    </div>
  );
}

export default function LeadDetailsPage() {
  const { id } = useParams();
  const leadId = Number(id);
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const toast = useToast();

  const [lead, setLead] = useState<Lead | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [bdes, setBdes] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [statusTarget, setStatusTarget] = useState<LeadStatus | ''>('');
  const [lostReason, setLostReason] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await leadApi.get(leadId);
      setLead(result.data.lead);
      setFollowUps(result.data.followUps);
      setActivities(result.data.activities);
      setCustomer(result.data.customer);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.status === 404
            ? 'This lead does not exist, or it is not assigned to you.'
            : err.message
          : 'Could not load this lead.',
      );
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (isAdmin) void userApi.assignable().then((r) => setBdes(r.data)).catch(() => undefined);
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-64 animate-pulse rounded-lg bg-slate-100" />
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="card">
        <ErrorState message={error ?? 'Lead not found.'} onRetry={load} />
        <div className="pb-6 text-center">
          <Link to="/leads" className="text-sm text-brand-600 hover:underline">
            Back to leads
          </Link>
        </div>
      </div>
    );
  }

  const whatsapp = whatsAppUrl(lead.phone, `Hello ${lead.contactName ?? ''}`.trim());
  const gmail = gmailComposeUrl(lead.email, `Regarding ${lead.companyName}`);
  const mailto = mailtoUrl(lead.email);
  const transitions = ALLOWED_TRANSITIONS[lead.status];
  const pending = followUps.filter((f) => f.status === 'PENDING');
  const overdue = pending.filter((f) => new Date(f.dueAt) < new Date());
  const upcoming = pending.filter((f) => new Date(f.dueAt) >= new Date());
  const completed = followUps.filter((f) => f.status !== 'PENDING');

  async function submitStatus() {
    if (!statusTarget) return;
    setStatusSaving(true);
    try {
      await leadApi.setStatus(leadId, { status: statusTarget, lostReason: statusTarget === 'LOST' ? lostReason : null });
      toast.success(`Lead moved to ${STATUS_LABELS[statusTarget]}`);
      setStatusTarget('');
      setLostReason('');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not update the status.');
    } finally {
      setStatusSaving(false);
    }
  }

  async function assign(value: string) {
    setBusy(true);
    try {
      await leadApi.assign(leadId, value ? Number(value) : null);
      toast.success('Assignment updated');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not reassign this lead.');
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    setSavingNote(true);
    try {
      await leadApi.addNote(leadId, note.trim());
      setNote('');
      toast.success('Note added');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not add the note.');
    } finally {
      setSavingNote(false);
    }
  }

  async function convert() {
    setBusy(true);
    try {
      const result = await leadApi.convert(leadId, {});
      toast.success('Lead converted to a customer');
      setConfirmConvert(false);
      navigate(`/customers/${result.data.id}`);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not convert this lead.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await leadApi.remove(leadId);
      toast.success('Lead deleted');
      navigate('/leads');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not delete this lead.');
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  async function completeFollowUp(followUp: FollowUp) {
    try {
      await followUpApi.complete(followUp.id);
      toast.success('Follow-up completed');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not complete the follow-up.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link to="/leads" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to leads
          </Link>
          <h1 className="text-lg font-semibold text-slate-900">{lead.companyName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono">{lead.leadCode}</span>
            <StatusBadge status={lead.status} />
            <PriorityBadge priority={lead.priority} />
            {customer && (
              <Link to={`/customers/${customer.id}`} className="text-brand-600 hover:underline">
                Customer {customer.customerCode}
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp
            </a>
          )}
          {gmail && (
            <a href={gmail} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              <Mail className="h-4 w-4 text-sky-600" /> Gmail
            </a>
          )}
          {!gmail && mailto && (
            <a href={mailto} className="btn-secondary">
              <Mail className="h-4 w-4" /> Email
            </a>
          )}
          <Button variant="secondary" onClick={() => setShowEdit(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          <Button variant="secondary" onClick={() => setShowFollowUp(true)}>
            <Plus className="h-4 w-4" /> Follow-up
          </Button>
          {(lead.status === 'QUALIFIED' || lead.status === 'WON') && !customer && (
            <Button onClick={() => setConfirmConvert(true)}>Convert to customer</Button>
          )}
          {isAdmin && (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <SectionTitle title="Lead information" />
            <div className="grid min-w-0 gap-6 sm:grid-cols-2">
              <div className="min-w-0">
                <DetailRow label="Contact" value={lead.contactName} />
                <DetailRow label="Designation" value={lead.designation} />
                <DetailRow label="Phone" value={lead.phone} />
                <DetailRow label="Alternate phone" value={lead.alternatePhone} />
                <DetailRow label="Email" value={lead.email} />
                <DetailRow label="Alternate email" value={lead.alternateEmail} />
                <DetailRow
                  label="Website"
                  value={
                    lead.website ? (
                      <a
                        href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:underline"
                      >
                        {lead.website}
                      </a>
                    ) : null
                  }
                />
                <DetailRow label="Tags" value={lead.tags} />
              </div>
              <div className="min-w-0">
                <DetailRow label="Country" value={lead.country} />
                <DetailRow label="State" value={lead.state} />
                <DetailRow label="City" value={lead.city} />
                <DetailRow label="Industry" value={lead.industry} />
                <DetailRow label="Company size" value={lead.companySize} />
                <DetailRow label="Service required" value={lead.serviceRequired} />
                <DetailRow label="Source" value={lead.leadSource} />
                <DetailRow label="Created" value={formatDateTime(lead.createdAt)} />
                <DetailRow label="Last contacted" value={formatDateTime(lead.lastContactedAt)} />
                {lead.lostReason && <DetailRow label="Lost reason" value={lead.lostReason} />}
              </div>
            </div>
            {lead.remarks && (
              <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700">{lead.remarks}</div>
            )}
          </Card>

          <Card>
            <SectionTitle title="Follow-ups" action={<Button small variant="secondary" onClick={() => setShowFollowUp(true)}>Add</Button>} />
            {followUps.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">No follow-ups scheduled yet.</p>
            ) : (
              <div className="space-y-3">
                {[
                  { title: 'Overdue', items: overdue, tone: 'text-red-600' },
                  { title: 'Upcoming', items: upcoming, tone: 'text-slate-700' },
                  { title: 'Completed / cancelled', items: completed, tone: 'text-slate-500' },
                ]
                  .filter((group) => group.items.length)
                  .map((group) => (
                    <div key={group.title}>
                      <p className={`mb-1 text-xs font-semibold uppercase tracking-wide ${group.tone}`}>{group.title}</p>
                      <ul className="space-y-1.5">
                        {group.items.map((followUp) => (
                          <li
                            key={followUp.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium text-slate-800">{followUp.title}</p>
                              <p className="text-xs text-slate-500">
                                Due {formatDate(followUp.dueDate)} {followUp.dueTime?.slice(0, 5) ?? ''}
                                {followUp.assignedTo ? ` · ${followUp.assignedTo.firstName}` : ''}
                              </p>
                              {followUp.outcome && <p className="mt-0.5 text-xs text-slate-600">{followUp.outcome}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <FollowUpBadge status={followUp.status} />
                              {followUp.status === 'PENDING' && (
                                <Button small variant="secondary" onClick={() => void completeFollowUp(followUp)}>
                                  Complete
                                </Button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle title="Activity history" />
            {activities.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">No activity recorded yet.</p>
            ) : (
              <ol className="relative space-y-3 border-l border-slate-200 pl-4">
                {activities.map((activity) => (
                  <li key={activity.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-brand-500" />
                    <p className="text-sm text-slate-800">{activity.description}</p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(activity.createdAt)}
                      {activity.user ? ` · ${activity.user.firstName} ${activity.user.lastName}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <SectionTitle title="Update status" />
            {transitions.length === 0 ? (
              <p className="text-sm text-slate-500">This lead is closed as won; no further status changes are allowed.</p>
            ) : (
              <div className="space-y-2">
                <Select value={statusTarget} onChange={(event) => setStatusTarget(event.target.value as LeadStatus)}>
                  <option value="">Choose a new status…</option>
                  {transitions.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </Select>
                {statusTarget === 'LOST' && (
                  <Field label="Reason for losing this lead" required>
                    <TextArea rows={2} value={lostReason} onChange={(event) => setLostReason(event.target.value)} />
                  </Field>
                )}
                <Button
                  className="w-full"
                  loading={statusSaving}
                  disabled={!statusTarget || (statusTarget === 'LOST' && !lostReason.trim())}
                  onClick={submitStatus}
                >
                  Apply status change
                </Button>
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle title="Assignment" />
            {lead.importedById && lead.importedById === lead.assignedBdeId && (
              <div className="mb-3 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-800">
                Imported by <span className="font-semibold">{lead.importer ? `${lead.importer.firstName} ${lead.importer.lastName}` : `BDE #${lead.importedById}`}</span>. This lead stays private to that BDE and admins.
              </div>
            )}
            {isAdmin && !(lead.importedById && lead.importedById === lead.assignedBdeId) ? (
              <Select
                value={lead.assignedBdeId ? String(lead.assignedBdeId) : ''}
                disabled={busy}
                onChange={(event) => void assign(event.target.value)}
              >
                <option value="">Unassigned</option>
                {bdes.map((bde) => (
                  <option key={bde.id} value={bde.id}>
                    {bde.fullName}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="text-sm text-slate-700">
                {lead.assignedBde ? `${lead.assignedBde.firstName} ${lead.assignedBde.lastName}` : 'Unassigned'}
                {lead.assignedBdeId === user?.id ? ' (you)' : ''}
              </p>
            )}
          </Card>

          <Card>
            <SectionTitle title="Add a note" />
            <TextArea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What happened on this call?" />
            <Button className="mt-2 w-full" loading={savingNote} disabled={!note.trim()} onClick={addNote}>
              Save note
            </Button>
          </Card>
        </div>
      </div>

      {showEdit && (
        <LeadFormModal
          open={showEdit}
          lead={lead}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            void load();
          }}
        />
      )}

      {showFollowUp && (
        <FollowUpFormModal
          open={showFollowUp}
          leadId={lead.id}
          bdes={bdes}
          canAssign={isAdmin}
          onClose={() => setShowFollowUp(false)}
          onSaved={() => {
            setShowFollowUp(false);
            void load();
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        destructive
        title="Delete this lead?"
        message="The lead will be removed from the pipeline. Its activity history is preserved for auditing."
        confirmLabel="Delete lead"
        loading={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />

      <ConfirmDialog
        open={confirmConvert}
        title="Convert to customer?"
        message="A customer record will be created from this lead. The original lead is kept and stamped with the conversion date."
        confirmLabel="Convert"
        loading={busy}
        onCancel={() => setConfirmConvert(false)}
        onConfirm={convert}
      />

    </div>
  );
}
