import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">
      <p className="text-4xl font-semibold text-slate-900">404</p>
      <p className="text-sm text-slate-600">That page does not exist.</p>
      <Link to="/dashboard" className="btn-primary">
        Go to dashboard
      </Link>
    </div>
  );
}
