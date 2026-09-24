export type UserRole = 'ADMIN' | 'BDE';

export type LeadStatus = 'NEW' | 'CONTACTED' | 'FOLLOW_UP' | 'QUALIFIED' | 'WON' | 'LOST';

export type LeadPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type FollowUpStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

export type NotificationType =
  | 'LEAD_ASSIGNED'
  | 'LEAD_STATUS_CHANGED'
  | 'LEAD_CONVERTED'
  | 'FOLLOWUP_REMINDER'
  | 'FOLLOWUP_OVERDUE';

export type ActivityType =
  | 'LEAD_CREATED'
  | 'LEAD_UPDATED'
  | 'LEAD_ASSIGNED'
  | 'LEAD_REASSIGNED'
  | 'STATUS_CHANGED'
  | 'NOTE_ADDED'
  | 'FOLLOWUP_CREATED'
  | 'FOLLOWUP_UPDATED'
  | 'FOLLOWUP_COMPLETED'
  | 'FOLLOWUP_CANCELLED'
  | 'LEAD_CONVERTED'
  | 'LEAD_WON'
  | 'LEAD_LOST'
  | 'LEAD_DELETED'
  | 'LEAD_IMPORTED';

export type ImportJobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED' | 'CANCELLED';

export interface AuthUserPayload {
  id: number;
  role: UserRole;
  email: string;
  tokenVersion?: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
