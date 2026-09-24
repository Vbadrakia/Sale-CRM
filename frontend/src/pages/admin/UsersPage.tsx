import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, Search, UserCog } from 'lucide-react';
import { userApi } from '@/api/services';
import { ApiRequestError } from '@/api/client';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  Field,
  Modal,
  PaginationBar,
  Select,
  TableSkeleton,
  TextInput,
} from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { formatDateTime } from '@/utils/format';
import type { Pagination, User } from '@/types';

const EMPTY_FORM = { firstName: '', lastName: '', email: '', phone: '', role: 'BDE', password: '' };

export default function UsersPage() {
  const toast = useToast();
  const [rows, setRows] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [toggling, setToggling] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await userApi.list({
        page,
        pageSize: 20,
        search: debounced || undefined,
        role: role || undefined,
        isActive: status || undefined,
      });
      setRows(result.data);
      setPagination(result.pagination ?? null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the team.');
    } finally {
      setLoading(false);
    }
  }, [page, debounced, role, status]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setFormError('');
    setShowForm(true);
  }

  function openEdit(user: User) {
    setEditing(user);
    setForm({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? '',
      role: user.role,
      password: '',
    });
    setFormErrors({});
    setFormError('');
    setShowForm(true);
  }

  async function submit() {
    const errors: Record<string, string> = {};
    if (!form.firstName.trim()) errors.firstName = 'First name is required';
    if (!form.lastName.trim()) errors.lastName = 'Last name is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address';
    if (form.password && form.password.length < 8) errors.password = 'Use at least 8 characters';
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await userApi.update(editing.id, {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim() || null,
          role: form.role,
        });
        toast.success('User updated');
      } else {
        const result = await userApi.create({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || null,
          role: form.role,
          password: form.password || undefined,
        });
        if (result.data.temporaryPassword) setTemporaryPassword(result.data.temporaryPassword);
        toast.success('User created — they must verify their email at first sign-in');
      }
      setShowForm(false);
      await load();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setFormErrors(err.fieldErrors);
        setFormError(err.message);
      } else setFormError('Could not save this user.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    if (!toggling) return;
    setBusy(true);
    try {
      await userApi.setStatus(toggling.id, !toggling.isActive);
      toast.success(toggling.isActive ? 'Account disabled' : 'Account enabled');
      setToggling(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not update the account.');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!resetting) return;
    setBusy(true);
    try {
      const result = await userApi.resetPassword(resetting.id);
      setResetting(null);
      if (result.data.temporaryPassword) setTemporaryPassword(result.data.temporaryPassword);
      toast.success('Password reset');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not reset the password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Administration"
        title="Team"
        description="Administrators and business development executives."
        action={<Button onClick={openCreate}><Plus className="h-4 w-4" /> New user</Button>}
      />

      <Card className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <TextInput className="pl-9" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-40">
          <Select value={role} onChange={(e) => { setPage(1); setRole(e.target.value); }}>
            <option value="">All roles</option>
            <option value="ADMIN">Admin</option>
            <option value="BDE">BDE</option>
          </Select>
        </div>
        <div className="w-40">
          <Select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">Any status</option>
            <option value="true">Active</option>
            <option value="false">Disabled</option>
          </Select>
        </div>
      </Card>

      <Card className="p-0">
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={6} columns={5} />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : rows.length === 0 ? (
          <EmptyState title="No users found" description="Try a different search or add a new team member." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Leads</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Last sign-in</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">{user.fullName}</div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{user.role}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{user.assignedLeadCount ?? 0}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {user.isActive ? 'Active' : 'Disabled'}
                      </span>
                      {!user.emailVerified && <span className="ml-1 text-xs text-amber-600">unverified</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-2">
                        <Button small variant="secondary" onClick={() => openEdit(user)}>
                          <UserCog className="h-4 w-4" />
                        </Button>
                        <Button small variant="secondary" onClick={() => setResetting(user)}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button small variant={user.isActive ? 'danger' : 'primary'} onClick={() => setToggling(user)}>
                          {user.isActive ? 'Disable' : 'Enable'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pagination && pagination.totalPages > 1 && <PaginationBar pagination={pagination} onPageChange={setPage} />}
      </Card>

      <Modal
        open={showForm}
        title={editing ? 'Edit user' : 'New user'}
        onClose={() => setShowForm(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              {editing ? 'Save changes' : 'Create user'}
            </Button>
          </>
        }
      >
        {formError && (
          <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" error={formErrors.firstName} required>
            <TextInput value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </Field>
          <Field label="Last name" error={formErrors.lastName} required>
            <TextInput value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </Field>
          <Field label="Email" error={formErrors.email} required>
            <TextInput type="email" value={form.email} disabled={!!editing} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Role" required>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="BDE">BDE</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </Field>
          {!editing && (
            <Field label="Password" error={formErrors.password} hint="Leave empty to generate a temporary password.">
              <TextInput type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
          )}
        </div>
      </Modal>

      <Modal
        open={!!temporaryPassword}
        title="Temporary password"
        onClose={() => setTemporaryPassword(null)}
        footer={<Button onClick={() => setTemporaryPassword(null)}>Done</Button>}
      >
        <p className="text-sm text-slate-600">Share this password with the user. It is shown only once.</p>
        <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm">{temporaryPassword}</p>
      </Modal>

      <ConfirmDialog
        open={!!toggling}
        destructive={toggling?.isActive}
        title={toggling?.isActive ? 'Disable this account?' : 'Enable this account?'}
        message={
          toggling?.isActive
            ? 'They will be signed out and cannot sign in again until the account is re-enabled.'
            : 'They will be able to sign in again.'
        }
        confirmLabel={toggling?.isActive ? 'Disable' : 'Enable'}
        loading={busy}
        onCancel={() => setToggling(null)}
        onConfirm={toggleStatus}
      />

      <ConfirmDialog
        open={!!resetting}
        title="Reset this password?"
        message="A new temporary password will be generated and shown to you once."
        confirmLabel="Reset password"
        loading={busy}
        onCancel={() => setResetting(null)}
        onConfirm={resetPassword}
      />
    </div>
  );
}
