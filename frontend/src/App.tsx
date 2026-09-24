import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { AdminRoute, ProtectedRoute, PublicOnlyRoute } from '@/routes/ProtectedRoute';
import LoginPage from '@/pages/auth/LoginPage';
import VerifyOtpPage from '@/pages/auth/VerifyOtpPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import DashboardPage from '@/pages/DashboardPage';
import LeadsPage from '@/pages/LeadsPage';
import LeadDetailsPage from '@/pages/LeadDetailsPage';
import CustomersPage from '@/pages/CustomersPage';
import CustomerDetailsPage from '@/pages/CustomerDetailsPage';
import FollowUpsPage from '@/pages/FollowUpsPage';
import NotificationsPage from '@/pages/NotificationsPage';
import SettingsPage from '@/pages/SettingsPage';
import UsersPage from '@/pages/admin/UsersPage';
import ImportsPage from '@/pages/admin/ImportsPage';
import ReportsPage from '@/pages/admin/ReportsPage';
import NotFoundPage from '@/pages/NotFoundPage';

export default function App() {
  return (
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
  );
}
