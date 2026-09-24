import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { tokenStore } from '@/api/client';

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
    </div>
  );
}

function ConnectionErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-md border border-gray-200 text-center">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Connection Issue</h2>
        <p className="text-sm text-gray-600 mb-6">{message}</p>
        <button
          onClick={onRetry}
          className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 transition-colors"
        >
          Retry Connection
        </button>
      </div>
    </div>
  );
}

/** Blocks unauthenticated access. The backend enforces the same rules again. */
export function ProtectedRoute() {
  const { user, loading, sessionError, retrySession } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;

  if (!user && sessionError && tokenStore.get()) {
    return <ConnectionErrorView message={sessionError} onRetry={() => void retrySession()} />;
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Admin-only section of the app. */
export function AdminRoute() {
  const { user, loading, sessionError, retrySession } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user && sessionError && tokenStore.get()) {
    return <ConnectionErrorView message={sessionError} onRetry={() => void retrySession()} />;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

/** Keeps signed-in users out of the auth screens. */
export function PublicOnlyRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
