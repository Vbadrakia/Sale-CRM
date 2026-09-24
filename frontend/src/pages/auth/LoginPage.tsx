import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthShell } from './AuthShell';
import { Button, Field, TextInput } from '@/components/ui';
import { authApi } from '@/api/services';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!email.trim()) next.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) next.email = 'Enter a valid email address';
    if (!password) next.password = 'Password is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const result = await authApi.login(email.trim().toLowerCase(), password);
      if (result.data.requiresVerification) {
        toast.notify('We emailed you a 6-digit verification code.');
        navigate('/verify-otp', { state: { email: email.trim().toLowerCase() } });
        return;
      }
      if (result.data.token && result.data.user) {
        signIn(result.data.token, result.data.user);
        navigate('/dashboard', { replace: true });
      }
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrors(error.fieldErrors);
        setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue to your sales workspace.">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {formError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700">
            <p className="font-semibold">Sign-in failed</p>
            <p className="mt-0.5">{formError}</p>
          </div>
        )}

        <Field label="Work email" error={errors.email} required>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <TextInput type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="pl-9" />
          </div>
        </Field>

        <Field label="Password" error={errors.password} required>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <TextInput type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className="pl-9 pr-11" />
            <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <div className="flex items-center justify-between gap-3 text-xs">
          <label className="flex items-center gap-2 text-slate-500">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
            Remember me
          </label>
          <Link to="/forgot-password" className="font-semibold text-brand-600 hover:text-brand-700">Forgot password?</Link>
        </div>

        <Button type="submit" loading={loading} className="min-h-11 w-full text-sm">
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  );
}
