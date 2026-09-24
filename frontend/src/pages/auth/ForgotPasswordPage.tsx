import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthShell } from './AuthShell';
import { Button, Field, TextInput } from '@/components/ui';
import { authApi } from '@/api/services';
import { ApiRequestError } from '@/api/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError('Enter a valid email address');
      return;
    }
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not send the reset email.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a secure reset link">
      {sent ? (
        <div className="space-y-4 text-sm text-slate-700">
          <p>If an account exists for that address, a password reset link is on its way. The link expires in 30 minutes.</p>
          <Link to="/login" className="btn-secondary w-full">
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} noValidate className="space-y-3">
            {error && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <Field label="Email" required>
              <TextInput
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
              />
            </Field>
            <Button type="submit" loading={loading} className="w-full">
              Send reset link
            </Button>
          </form>
          <div className="mt-4 text-center">
            <Link to="/login" className="text-sm text-slate-600 hover:underline">
              Back to sign in
            </Link>
          </div>
        </>
      )}
    </AuthShell>
  );
}
