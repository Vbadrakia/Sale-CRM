import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { AdminRoute, ProtectedRoute, PublicOnlyRoute } from '@/routes/ProtectedRoute';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import { lazyWithRetry } from '@/utils/lazyRetry';

const LoginPage = lazyWithRetry(() => import('@/pages/auth/LoginPage'));
const VerifyOtpPage = lazyWithRetry(() => import('@/pages/auth/VerifyOtpPage'));
const ForgotPasswordPage = lazyWithRetry(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazyWithRetry(() => import('@/pages/auth/ResetPasswordPage'));
const DashboardPage = lazyWithRetry(() => import('@/pages/DashboardPage'));
const LeadsPage = lazyWithRetry(() => import('@/pages/LeadsPage'));
const LeadDetailsPage = lazyWithRetry(() => import('@/pages/LeadDetailsPage'));
const CustomersPage = lazyWithRetry(() => import('@/pages/CustomersPage'));
const CustomerDetailsPage = lazyWithRetry(() => import('@/pages/CustomerDetailsPage'));
const FollowUpsPage = lazyWithRetry(() => import('@/pages/FollowUpsPage'));
const NotificationsPage = lazyWithRetry(() => import('@/pages/NotificationsPage'));
const SettingsPage = lazyWithRetry(() => import('@/pages/SettingsPage'));
const UsersPage = lazyWithRetry(() => import('@/pages/admin/UsersPage'));
const ImportsPage = lazyWithRetry(() => import('@/pages/admin/ImportsPage'));
const ReportsPage = lazyWithRetry(() => import('@/pages/admin/ReportsPage'));
const NotFoundPage = lazyWithRetry(() => import('@/pages/NotFoundPage'));

function PageFallback() {
  return (
    <div className="flex h-[50vh] w-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

export default function App() {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/verify-otp" element={<VerifyOtpPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/leads" element={<LeadsPage />} />
              {/* BDEs reach the same list; the backend scopes it to their leads. */}
              <Route path="/my-leads" element={<Navigate to="/leads" replace />} />
              <Route path="/leads/:id" element={<LeadDetailsPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/customers/:id" element={<CustomerDetailsPage />} />
              <Route path="/followups" element={<FollowUpsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/settings" element={<SettingsPage />} />

              <Route path="/imports" element={<ImportsPage />} />
              <Route element={<AdminRoute />}>
                <Route path="/users" element={<UsersPage />} />
                <Route path="/reports" element={<ReportsPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}
