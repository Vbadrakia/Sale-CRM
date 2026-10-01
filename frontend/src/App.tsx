import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { AdminRoute, ProtectedRoute, PublicOnlyRoute } from '@/routes/ProtectedRoute';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const VerifyOtpPage = lazy(() => import('@/pages/auth/VerifyOtpPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const LeadsPage = lazy(() => import('@/pages/LeadsPage'));
const LeadDetailsPage = lazy(() => import('@/pages/LeadDetailsPage'));
const CustomersPage = lazy(() => import('@/pages/CustomersPage'));
const CustomerDetailsPage = lazy(() => import('@/pages/CustomerDetailsPage'));
const FollowUpsPage = lazy(() => import('@/pages/FollowUpsPage'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'));
const ImportsPage = lazy(() => import('@/pages/admin/ImportsPage'));
const ReportsPage = lazy(() => import('@/pages/admin/ReportsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

function PageFallback() {
  return (
    <div className="flex h-[50vh] w-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

export default function App() {
  return (
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
  );
}
