import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from './AuthShell';
import { Button, Field, TextInput } from '@/components/ui';
import { authApi } from '@/api/services';
import { ApiRequestError } from '@/api/client';
import { useToast } from '@/context/ToastContext';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Use at least 8 characters, including a letter and a number');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      toast.success('Password updated. Please sign in.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reset the password.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="Reset link problem" subtitle="This link is missing its security token">
        <p className="text-sm text-slate-700">
          Open the reset link directly from your email, or request a new one.
        </p>
        <Link to="/forgot-password" className="btn-secondary mt-4 w-full">
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="At least 8 characters with a letter and a number">
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <Field label="New password" required>
          <TextInput
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Field label="Confirm new password" required>
          <TextInput
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>
        <Button type="submit" loading={loading} className="w-full">
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
