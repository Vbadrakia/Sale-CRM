import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthShell } from './AuthShell';
import { Button, Field, TextInput } from '@/components/ui';
import { authApi } from '@/api/services';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

export default function VerifyOtpPage() {
  const location = useLocation();
  const stateEmail = (location.state as { email?: string } | null)?.email ?? '';
  const [email, setEmail] = useState(stateEmail);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const { signIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from your email');
      return;
    }
    setLoading(true);
    try {
      const result = await authApi.verifyOtp(email.trim().toLowerCase(), code.trim());
      signIn(result.data.token, result.data.user);
      toast.success('Your account is verified.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Verification failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError('');
    try {
      await authApi.resendOtp(email.trim().toLowerCase());
      toast.notify('If your account needs verification, a new code has been sent.');
      setCooldown(60);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not resend the code.');
    }
  }

  return (
    <AuthShell title="Verify your account" subtitle="Enter the 6-digit code we emailed you">
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <Field label="Email" required>
          <TextInput type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Verification code" hint="The code expires 10 minutes after it is sent." required>
          <TextInput
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            className="field tracking-[0.4em]"
          />
        </Field>
        <Button type="submit" loading={loading} className="w-full">
          Verify and continue
        </Button>
      </form>
      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0}
          className="text-brand-600 hover:underline disabled:text-slate-400 disabled:no-underline"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
        <Link to="/login" className="text-slate-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}
