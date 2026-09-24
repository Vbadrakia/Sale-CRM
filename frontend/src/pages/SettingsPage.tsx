import { useState } from 'react';
import { authApi } from '@/api/services';
import { ApiRequestError } from '@/api/client';
import { Button, Card, Field, PageHeader, SectionTitle, TextInput } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const toast = useToast();

  const [profile, setProfile] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    phone: user?.phone ?? '',
  });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveProfile() {
    const errors: Record<string, string> = {};
    if (!profile.firstName.trim()) errors.firstName = 'First name is required';
    if (!profile.lastName.trim()) errors.lastName = 'Last name is required';
    setProfileErrors(errors);
    if (Object.keys(errors).length) return;

    setSavingProfile(true);
    try {
      await authApi.updateProfile({
        firstName: profile.firstName.trim(),
        lastName: profile.lastName.trim(),
        phone: profile.phone.trim() || null,
      });
      await refresh();
      toast.success('Profile updated');
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setProfileErrors(error.fieldErrors);
        toast.error(error.message);
      } else toast.error('Could not save your profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    const errors: Record<string, string> = {};
    if (!passwords.current) errors.current = 'Enter your current password';
    if (passwords.next.length < 8) errors.next = 'Use at least 8 characters';
    if (passwords.next !== passwords.confirm) errors.confirm = 'The two passwords do not match';
    setPasswordErrors(errors);
    if (Object.keys(errors).length) return;

    setSavingPassword(true);
    try {
      await authApi.changePassword(passwords.current, passwords.next);
      setPasswords({ current: '', next: '', confirm: '' });
      toast.success('Password changed');
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setPasswordErrors(error.fieldErrors);
        toast.error(error.message);
      } else toast.error('Could not change your password.');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Account" title="Settings" description="Manage your profile and sign-in details." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Profile" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" error={profileErrors.firstName} required>
              <TextInput value={profile.firstName} onChange={(event) => setProfile({ ...profile, firstName: event.target.value })} />
            </Field>
            <Field label="Last name" error={profileErrors.lastName} required>
              <TextInput value={profile.lastName} onChange={(event) => setProfile({ ...profile, lastName: event.target.value })} />
            </Field>
          </div>
          <Field label="Phone" className="mt-3">
            <TextInput value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} />
          </Field>
          <Field label="Email" hint="Ask an administrator if your email address needs to change." className="mt-3">
            <TextInput value={user?.email ?? ''} disabled />
          </Field>
          <div className="mt-3">
            <Button onClick={saveProfile} loading={savingProfile}>
              Save profile
            </Button>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Change password" />
          <div className="space-y-3">
            <Field label="Current password" error={passwordErrors.current} required>
              <TextInput
                type="password"
                autoComplete="current-password"
                value={passwords.current}
                onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
              />
            </Field>
            <Field label="New password" error={passwordErrors.next} hint="At least 8 characters." required>
              <TextInput
                type="password"
                autoComplete="new-password"
                value={passwords.next}
                onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
              />
            </Field>
            <Field label="Confirm new password" error={passwordErrors.confirm} required>
              <TextInput
                type="password"
                autoComplete="new-password"
                value={passwords.confirm}
                onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
              />
            </Field>
            <Button onClick={changePassword} loading={savingPassword}>
              Change password
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
