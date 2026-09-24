import { request } from './client';
import type {
  Activity,
  AppNotification,
  AssignableUser,
  BdePerformance,
  ChartPoint,
  Customer,
  DashboardSummary,
  FollowUp,
  FollowUpTrendPoint,
  ImportJob,
  ImportPreview,
  Lead,
  LeadFilters,
  MonthlyTrendPoint,
  Pagination,
  User,
} from '@/types';

/* ---------------------------------- auth ---------------------------------- */
export const authApi = {
  login: (email: string, password: string) =>
    request<{ token?: string; user?: User; requiresVerification: boolean; email?: string }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  verifyOtp: (email: string, code: string) =>
    request<{ token: string; user: User }>('/auth/verify-otp', { method: 'POST', body: { email, code } }),
  resendOtp: (email: string) => request<{ sent: boolean }>('/auth/resend-otp', { method: 'POST', body: { email } }),
  forgotPassword: (email: string) =>
    request<{ sent: boolean }>('/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (token: string, password: string) =>
    request<{ reset: boolean }>('/auth/reset-password', { method: 'POST', body: { token, password } }),
  logout: () => request<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<User>('/auth/me'),
  updateProfile: (body: { firstName: string; lastName: string; phone?: string | null }) =>
    request<User>('/auth/me', { method: 'PATCH', body }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ changed: boolean }>('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
};

/* ---------------------------------- users --------------------------------- */
export const userApi = {
  list: (query: { page?: number; pageSize?: number; search?: string; role?: string; isActive?: string }) =>
    request<User[]>('/users', { query }),
  assignable: () => request<AssignableUser[]>('/users/assignable'),
  get: (id: number) => request<User>(`/users/${id}`),
  create: (body: { firstName: string; lastName: string; email: string; phone?: string | null; role: string; password?: string }) =>
    request<User>('/users', { method: 'POST', body }),
  update: (id: number, body: Record<string, unknown>) => request<User>(`/users/${id}`, { method: 'PATCH', body }),
  setStatus: (id: number, isActive: boolean) =>
    request<User>(`/users/${id}/status`, { method: 'PATCH', body: { isActive } }),
  resetPassword: (id: number, password?: string) =>
    request<{ temporaryPassword?: string }>(`/users/${id}/reset-password`, { method: 'POST', body: { password } }),
};

/* ---------------------------------- leads --------------------------------- */
export const leadApi = {
  list: (filters: LeadFilters) =>
    request<Lead[]>('/leads', { query: filters as Record<string, string | number | undefined> }),
  get: (id: number) =>
    request<{ lead: Lead; followUps: FollowUp[]; activities: Activity[]; customer: Customer | null }>(`/leads/${id}`),
  create: (body: Record<string, unknown>) => request<Lead>('/leads', { method: 'POST', body }),
  update: (id: number, body: Record<string, unknown>) => request<Lead>(`/leads/${id}`, { method: 'PATCH', body }),
  remove: (id: number) => request<{ id: number }>(`/leads/${id}`, { method: 'DELETE' }),
  setStatus: (id: number, body: { status: string; lostReason?: string | null; note?: string | null }) =>
    request<Lead>(`/leads/${id}/status`, { method: 'PATCH', body }),
  assign: (id: number, assignedBdeId: number | null) =>
    request<Lead>(`/leads/${id}/assign`, { method: 'PATCH', body: { assignedBdeId } }),
  addNote: (id: number, note: string) => request<Activity>(`/leads/${id}/notes`, { method: 'POST', body: { note } }),
  activities: (id: number) => request<Activity[]>(`/leads/${id}/activities`),
  convert: (id: number, body: { service?: string | null; notes?: string | null }) =>
    request<Customer>(`/leads/${id}/convert`, { method: 'POST', body }),
  filterOptions: () =>
    request<{ sources: string[]; countries: string[]; states: string[]; cities: string[] }>('/leads/filters/options'),
  checkDuplicates: (body: Record<string, unknown>) =>
    request<{ duplicates: { reason: string; lead: Lead }[] }>('/leads/check-duplicates', { method: 'POST', body }),
};

/* --------------------------------- imports -------------------------------- */
export const importApi = {
  preview: (file: File, mapping?: Record<string, string>) => {
    const formData = new FormData();
    formData.append('file', file);
    if (mapping) formData.append('mapping', JSON.stringify(mapping));
    return request<ImportPreview>('/leads/import/preview', { method: 'POST', formData });
  },
  confirm: (file: File, mapping: Record<string, string>, duplicateStrategy: 'SKIP' | 'IMPORT', assignedBdeId?: number | null) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mapping', JSON.stringify(mapping));
    formData.append('duplicateStrategy', duplicateStrategy);
    if (assignedBdeId) formData.append('assignedBdeId', String(assignedBdeId));
    return request<ImportJob>('/leads/import/confirm', { method: 'POST', formData });
  },
  jobs: () => request<ImportJob[]>('/leads/import/jobs'),
  job: (id: number) =>
    request<{ job: ImportJob; errors: { id: number; rowNumber: number; reason: string }[] }>(`/leads/import/${id}`),
};

/* -------------------------------- followups ------------------------------- */
export const followUpApi = {
  list: (query: Record<string, string | number | undefined>) => request<FollowUp[]>('/followups', { query }),
  get: (id: number) => request<FollowUp>(`/followups/${id}`),
  create: (body: Record<string, unknown>) => request<FollowUp>('/followups', { method: 'POST', body }),
  update: (id: number, body: Record<string, unknown>) => request<FollowUp>(`/followups/${id}`, { method: 'PATCH', body }),
  complete: (id: number, outcome?: string | null) =>
    request<FollowUp>(`/followups/${id}/complete`, { method: 'PATCH', body: { outcome } }),
  cancel: (id: number, reason?: string | null) =>
    request<FollowUp>(`/followups/${id}/cancel`, { method: 'PATCH', body: { reason } }),
};

/* -------------------------------- customers ------------------------------- */
export const customerApi = {
  list: (query: Record<string, string | number | undefined>) => request<Customer[]>('/customers', { query }),
  get: (id: number) => request<Customer>(`/customers/${id}`),
  update: (id: number, body: Record<string, unknown>) => request<Customer>(`/customers/${id}`, { method: 'PATCH', body }),
};

/* ------------------------------ notifications ----------------------------- */
export const notificationApi = {
  list: (query: { page?: number; pageSize?: number; unread?: string }) =>
    request<AppNotification[]>('/notifications', { query }),
  unreadCount: () => request<{ count: number }>('/notifications/unread-count'),
  markRead: (id: number) => request<AppNotification>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => request<{ updated: boolean }>('/notifications/read-all', { method: 'PATCH' }),
};

/* -------------------------------- dashboard ------------------------------- */
export const dashboardApi = {
  summary: () => request<DashboardSummary>('/dashboard/summary'),
  leadsByStatus: () => request<ChartPoint[]>('/dashboard/leads-by-status'),
  leadsBySource: () => request<ChartPoint[]>('/dashboard/leads-by-source'),
  leadsByBde: () => request<BdePerformance[]>('/dashboard/leads-by-bde'),
  monthlyTrend: () => request<MonthlyTrendPoint[]>('/dashboard/monthly-trend'),
  conversion: () => request<ChartPoint[]>('/dashboard/conversion'),
  followUps: () => request<FollowUpTrendPoint[]>('/dashboard/followups'),
};

export type { Pagination };
