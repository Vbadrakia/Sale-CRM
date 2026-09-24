import { useState } from 'react';
import { Button, Field, Modal, Select, TextArea, TextInput } from '@/components/ui';
import { leadApi } from '@/api/services';
import { ApiRequestError } from '@/api/client';
import { useToast } from '@/context/ToastContext';
import type { AssignableUser, Lead } from '@/types';

type FormState = Record<string, string>;

const EMPTY: FormState = {
  companyName: '',
  contactName: '',
  designation: '',
  phone: '',
  email: '',
  alternatePhone: '',
  alternateEmail: '',
  website: '',
  country: '',
  state: '',
  city: '',
  industry: '',
  companySize: '',
  serviceRequired: '',
  leadSource: '',
  priority: 'MEDIUM',
  tags: '',
  remarks: '',
  assignedBdeId: '',
};

function toPayload(form: FormState, includeAssignment: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(form)) {
    if (key === 'assignedBdeId') continue;
    payload[key] = value.trim() === '' ? null : value.trim();
  }
  payload.companyName = form.companyName.trim();
  if (includeAssignment) payload.assignedBdeId = form.assignedBdeId ? Number(form.assignedBdeId) : null;
  return payload;
}

/** Create or edit a lead. Duplicate warnings from the API are shown inline. */
export function LeadFormModal({
  open,
  onClose,
  onSaved,
  bdes = [],
  lead,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (lead: Lead) => void;
  bdes?: AssignableUser[];
  lead?: Lead;
}) {
  const editing = !!lead;
  const [form, setForm] = useState<FormState>(() => {
    if (!lead) return { ...EMPTY };
    const next: FormState = { ...EMPTY };
    for (const key of Object.keys(EMPTY)) {
      const value = (lead as unknown as Record<string, unknown>)[key];
      next[key] = value === null || value === undefined ? '' : String(value);
    }
    return next;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  function set(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.companyName.trim()) next.companyName = 'Company name is required';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) next.email = 'Enter a valid email address';
    if (form.alternateEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.alternateEmail.trim()))
      next.alternateEmail = 'Enter a valid email address';
    if (form.phone && form.phone.replace(/\D/g, '').length < 7) next.phone = 'Enter a valid phone number';
    if (!form.phone.trim() && !form.email.trim()) next.phone = 'Provide at least a phone number or an email address';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    setFormError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const payload = toPayload(form, !editing);
      if (!editing && allowDuplicate) payload.allowDuplicate = true;
      const result = editing ? await leadApi.update(lead!.id, payload) : await leadApi.create(payload);
      toast.success(editing ? 'Lead updated' : 'Lead created');
      onSaved(result.data);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrors(error.fieldErrors);
        if (error.status === 409) {
          setDuplicateWarning(error.errors.map((e) => e.message).join(' ') || error.message);
          setFormError('A matching lead already exists.');
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError('Could not save the lead.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      wide
      title={editing ? `Edit ${lead?.companyName}` : 'New lead'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading}>
            {editing ? 'Save changes' : 'Create lead'}
          </Button>
        </>
      }
    >
      {formError && (
        <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}
      {duplicateWarning && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="font-medium">Possible duplicate</p>
          <p className="mt-0.5">{duplicateWarning}</p>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={allowDuplicate} onChange={(event) => setAllowDuplicate(event.target.checked)} />
            Create it anyway — I have reviewed the existing lead
          </label>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company name" error={errors.companyName} required>
          <TextInput value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
        </Field>
        <Field label="Contact name" error={errors.contactName}>
          <TextInput value={form.contactName} onChange={(e) => set('contactName', e.target.value)} />
        </Field>
        <Field label="Designation">
          <TextInput value={form.designation} onChange={(e) => set('designation', e.target.value)} />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <TextInput value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98765 43210" />
        </Field>
        <Field label="Email" error={errors.email}>
          <TextInput type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Alternate phone">
          <TextInput value={form.alternatePhone} onChange={(e) => set('alternatePhone', e.target.value)} />
        </Field>
        <Field label="Alternate email" error={errors.alternateEmail}>
          <TextInput type="email" value={form.alternateEmail} onChange={(e) => set('alternateEmail', e.target.value)} />
        </Field>
        <Field label="Website">
          <TextInput value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="example.com" />
        </Field>
        <Field label="Country">
          <TextInput value={form.country} onChange={(e) => set('country', e.target.value)} />
        </Field>
        <Field label="State">
          <TextInput value={form.state} onChange={(e) => set('state', e.target.value)} />
        </Field>
        <Field label="City">
          <TextInput value={form.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="Industry">
          <TextInput value={form.industry} onChange={(e) => set('industry', e.target.value)} />
        </Field>
        <Field label="Company size">
          <TextInput value={form.companySize} onChange={(e) => set('companySize', e.target.value)} placeholder="11-50" />
        </Field>
        <Field label="Service required">
          <TextInput value={form.serviceRequired} onChange={(e) => set('serviceRequired', e.target.value)} />
        </Field>
        <Field label="Lead source">
          <TextInput value={form.leadSource} onChange={(e) => set('leadSource', e.target.value)} placeholder="Website" />
        </Field>
        <Field label="Priority">
          <Select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
            {['LOW', 'MEDIUM', 'HIGH'].map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </Select>
        </Field>
        {!editing && (
          <Field label="Assign to BDE">
            <Select value={form.assignedBdeId} onChange={(e) => set('assignedBdeId', e.target.value)}>
              <option value="">Unassigned</option>
              {bdes.map((bde) => (
                <option key={bde.id} value={bde.id}>
                  {bde.fullName}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Tags">
          <TextInput value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="enterprise, priority" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Remarks">
            <TextArea rows={3} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
