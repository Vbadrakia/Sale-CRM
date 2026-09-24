export type UserRole = 'ADMIN' | 'BDE';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'FOLLOW_UP' | 'QUALIFIED' | 'WON' | 'LOST';
export type LeadPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type FollowUpStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedLeadCount?: number;
  temporaryPassword?: string;
  stats?: {
    assignedLeads: number;
    wonLeads: number;
    customers: number;
    completedFollowUps: number;
  };
}

export interface AssignableUser {
  id: number;
  fullName: string;
  email: string;
}

export interface Lead {
  id: number;
  leadCode: string;
  companyName: string;
  contactName: string | null;
  designation: string | null;
  phone: string | null;
  alternatePhone: string | null;
  email: string | null;
  alternateEmail: string | null;
  website: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  industry: string | null;
  companySize: string | null;
  serviceRequired: string | null;
  leadSource: string | null;
  status: LeadStatus;
  priority: LeadPriority;
  assignedBdeId: number | null;
  createdById: number | null;
  importedById: number | null;
  importJobId: number | null;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  convertedAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  tags: string | null;
  notes: string | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  assignedBde?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'> | null;
  creator?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'> | null;
  importer?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'> | null;
}

export interface FollowUp {
  id: number;
  leadId: number;
  createdById: number | null;
  assignedToId: number | null;
  title: string;
  description: string | null;
  dueDate: string;
  dueTime: string | null;
  dueAt: string;
  status: FollowUpStatus;
  outcome: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lead?: Pick<Lead, 'id' | 'leadCode' | 'companyName' | 'contactName' | 'phone' | 'email' | 'status'>;
  assignedTo?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'> | null;
}

export interface Customer {
  id: number;
  customerCode: string;
  sourceLeadId: number | null;
  companyName: string;
  contactName: string | null;
  designation: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  service: string | null;
  assignedBdeId: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  assignedBde?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'> | null;
  sourceLead?: Lead | null;
}

export interface Activity {
  id: number;
  leadId: number | null;
  userId: number | null;
  activityType: string;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'> | null;
}

export interface AppNotification {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: number | null;
  isRead: boolean;
  createdAt: string;
}

export interface ImportJob {
  id: number;
  createdById: number | null;
  fileName: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED' | 'CANCELLED';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  importedRows: number;
  skippedRows: number;
  duplicateStrategy: string;
  createdAt: string;
  creator?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'> | null;
}

export interface ImportRowPreview {
  rowNumber: number;
  data: Record<string, string | null>;
  raw: Record<string, unknown>;
  errors: string[];
  state: 'VALID' | 'INVALID' | 'DUPLICATE';
  reason: string | null;
  existing: { id: number; leadCode: string; companyName: string } | null;
}

export interface ImportPreview {
  fileName: string;
  headers: string[];
  mapping: Record<string, string>;
  importableFields: string[];
  summary: { totalRows: number; validRows: number; invalidRows: number; duplicateRows: number };
  rows: ImportRowPreview[];
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
  pagination?: Pagination;
}

export interface DashboardSummary {
  leads: {
    total: number;
    NEW: number;
    CONTACTED: number;
    FOLLOW_UP: number;
    QUALIFIED: number;
    WON: number;
    LOST: number;
  };
  followUps: { today: number; upcoming: number; overdue: number; completed: number };
  customers: { total: number; newThisMonth: number; conversionRate: number };
  winRate: number;
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface BdePerformance {
  bdeId: number;
  name: string;
  email: string;
  isActive: boolean;
  assigned: number;
  contacted: number;
  followUp: number;
  qualified: number;
  won: number;
  lost: number;
  followUpsCompleted: number;
  conversionRate: number;
}

export interface MonthlyTrendPoint {
  month: string;
  leads: number;
  customers: number;
}

export interface FollowUpTrendPoint {
  day: string;
  completed: number;
  pending: number;
  cancelled: number;
}

export interface LeadFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: LeadStatus | '';
  priority?: LeadPriority | '';
  assignedBdeId?: string;
  leadSource?: string;
  country?: string;
  state?: string;
  city?: string;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: string;
  sortDir?: 'ASC' | 'DESC';
}
