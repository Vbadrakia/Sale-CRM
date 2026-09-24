import { useState } from 'react';
import { Button, Field, Modal, Select, TextArea, TextInput } from '@/components/ui';
import { followUpApi } from '@/api/services';
import { ApiRequestError } from '@/api/client';
import { useToast } from '@/context/ToastContext';
import type { AssignableUser, FollowUp } from '@/types';

export function FollowUpFormModal({
  open,
  leadId,
  followUp,
  bdes = [],
  canAssign = false,
  onClose,
  onSaved,
}: {
  open: boolean;
  leadId?: number;
  followUp?: FollowUp;
  bdes?: AssignableUser[];
  canAssign?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!followUp;
  const [title, setTitle] = useState(followUp?.title ?? '');
  const [description, setDescription] = useState(followUp?.description ?? '');
  const [dueDate, setDueDate] = useState(followUp?.dueDate ?? new Date().toISOString().slice(0, 10));
  const [dueTime, setDueTime] = useState(followUp?.dueTime?.slice(0, 5) ?? '10:00');
  const [assignedToId, setAssignedToId] = useState(followUp?.assignedToId ? String(followUp.assignedToId) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  async function submit() {
    const nextErrors: Record<string, string> = {};
    if (!title.trim()) nextErrors.title = 'A title is required';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) nextErrors.dueDate = 'Choose a due date';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setLoading(true);
    setFormError('');
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        dueDate,
        dueTime: dueTime || null,
      };
      if (canAssign && assignedToId) payload.assignedToId = Number(assignedToId);

      if (editing) await followUpApi.update(followUp!.id, payload);
      else await followUpApi.create({ ...payload, leadId });

      toast.success(editing ? 'Follow-up updated' : 'Follow-up created');
      onSaved();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrors(error.fieldErrors);
        setFormError(error.message);
      } else {
        setFormError('Could not save the follow-up.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      title={editing ? 'Edit follow-up' : 'New follow-up'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading}>
            {editing ? 'Save changes' : 'Create follow-up'}
          </Button>
        </>
      }
    >
      {formError && (
        <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}
      <div className="space-y-3">
        <Field label="Title" error={errors.title} required>
          <TextInput value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Send the proposal" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date" error={errors.dueDate} required>
            <TextInput type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
          <Field label="Due time" hint="Times are handled in UTC.">
            <TextInput type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} />
          </Field>
        </div>
        {canAssign && (
          <Field label="Assign to">
            <Select value={assignedToId} onChange={(event) => setAssignedToId(event.target.value)}>
              <option value="">The lead's assigned BDE</option>
              {bdes.map((bde) => (
                <option key={bde.id} value={bde.id}>
                  {bde.fullName}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Notes">
          <TextArea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
