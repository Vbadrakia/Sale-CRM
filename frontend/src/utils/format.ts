import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import type { LeadStatus } from '@/types';

export function formatDate(value?: string | null, pattern = 'dd MMM yyyy'): string {
  if (!value) return '—';
  const date = parseISO(value);
  return isValid(date) ? format(date, pattern) : '—';
}

export function formatDateTime(value?: string | null): string {
  return formatDate(value, 'dd MMM yyyy, HH:mm');
}

export function formatRelative(value?: string | null): string {
  if (!value) return '—';
  const date = parseISO(value);
  return isValid(date) ? formatDistanceToNow(date, { addSuffix: true }) : '—';
}

export const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  FOLLOW_UP: 'Follow-up',
  QUALIFIED: 'Qualified',
  WON: 'Won',
  LOST: 'Lost',
};

export const STATUS_ORDER: LeadStatus[] = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'QUALIFIED', 'WON', 'LOST'];

/** Mirrors the transitions the backend allows, so the UI never offers an invalid move. */
export const ALLOWED_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ['CONTACTED', 'FOLLOW_UP', 'QUALIFIED', 'LOST'],
  CONTACTED: ['FOLLOW_UP', 'QUALIFIED', 'LOST'],
  FOLLOW_UP: ['CONTACTED', 'QUALIFIED', 'LOST'],
  QUALIFIED: ['WON', 'LOST', 'FOLLOW_UP'],
  WON: [],
  LOST: ['FOLLOW_UP'],
};

/** Digits only, keeping a leading country code. Never rewrites the number. */
export function normalizePhone(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
}

export function whatsAppUrl(phone?: string | null, message?: string): string | null {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${digits}${text}`;
}

export function gmailComposeUrl(email?: string | null, subject?: string): string | null {
  if (!email) return null;
  const subjectPart = subject ? `&su=${encodeURIComponent(subject)}` : '';
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}${subjectPart}`;
}

export function mailtoUrl(email?: string | null): string | null {
  return email ? `mailto:${encodeURIComponent(email)}` : null;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
