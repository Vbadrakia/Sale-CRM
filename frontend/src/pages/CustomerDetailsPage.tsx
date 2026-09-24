import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, MessageCircle } from 'lucide-react';
import { customerApi } from '@/api/services';
import { ApiRequestError } from '@/api/client';
import { Button, Card, ErrorState, Field, SectionTitle, TextArea, TextInput } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { formatDateTime, gmailComposeUrl, whatsAppUrl } from '@/utils/format';
import type { Customer } from '@/types';

export default function CustomerDetailsPage() {
  const { id } = useParams();
  const customerId = Number(id);
  const toast = useToast();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ contactName: '', phone: '', email: '', service: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await customerApi.get(customerId);
      setCustomer(result.data);
      setForm({
        contactName: result.data.contactName ?? '',
        phone: result.data.phone ?? '',
        email: result.data.email ?? '',
        service: result.data.service ?? '',
        notes: result.data.notes ?? '',
      });
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.status === 404
          ? 'This customer does not exist, or it is not assigned to you.'
          : 'Could not load this customer.',
      );
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const result = await customerApi.update(customerId, {
        contactName: form.contactName.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        service: form.service.trim() || null,
        notes: form.notes.trim() || null,
      });
      setCustomer(result.data);
      toast.success('Customer updated');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not save the changes.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-64 animate-pulse rounded-lg bg-slate-100" />;
  if (error || !customer)
    return (
      <Card>
        <ErrorState message={error ?? 'Customer not found.'} onRetry={load} />
      </Card>
    );

  const whatsapp = whatsAppUrl(customer.phone);
  const gmail = gmailComposeUrl(customer.email, `Hello ${customer.contactName ?? customer.companyName}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link to="/customers" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to customers
          </Link>
          <h1 className="text-lg font-semibold text-slate-900">{customer.companyName}</h1>
          <p className="font-mono text-xs text-slate-400">{customer.customerCode}</p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle title="Customer details" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contact person">
              <TextInput value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} />
            </Field>
            <Field label="Phone">
              <TextInput value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </Field>
            <Field label="Email">
              <TextInput type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </Field>
            <Field label="Service">
              <TextInput value={form.service} onChange={(event) => setForm({ ...form, service: event.target.value })} />
            </Field>
          </div>
          <Field label="Notes" className="mt-3">
            <TextArea rows={4} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </Field>
          <div className="mt-3">
            <Button onClick={save} loading={saving}>
              Save changes
            </Button>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Record" />
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Location</dt>
              <dd className="text-slate-800">{[customer.city, customer.state, customer.country].filter(Boolean).join(', ') || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Account owner</dt>
              <dd className="text-slate-800">
                {customer.assignedBde ? `${customer.assignedBde.firstName} ${customer.assignedBde.lastName}` : 'Unassigned'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Customer since</dt>
              <dd className="text-slate-800">{formatDateTime(customer.createdAt)}</dd>
            </div>
            {customer.sourceLeadId && (
              <div>
                <dt className="text-xs text-slate-500">Originated from</dt>
                <dd>
                  <Link to={`/leads/${customer.sourceLeadId}`} className="text-brand-600 hover:underline">
                    View the original lead
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </Card>
      </div>
    </div>
  );
}
