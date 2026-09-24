import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { Loader2, Search, X, AlertCircle, ChevronDown, Inbox, type LucideIcon } from 'lucide-react';
import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import type { FollowUpStatus, LeadPriority, LeadStatus } from '@/types';
import { STATUS_LABELS } from '@/utils/format';

/* --------------------------------- button --------------------------------- */
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  variant = 'primary',
  loading = false,
  small = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean; small?: boolean }) {
  const base =
    variant === 'primary'
      ? 'btn-primary'
      : variant === 'secondary'
        ? 'btn-secondary'
        : variant === 'danger'
          ? 'btn-danger'
          : 'btn-ghost';
  return (
    <button {...props} disabled={disabled || loading} className={clsx(base, small && 'btn-sm', className)}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  bordered = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; bordered?: boolean }) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={clsx(bordered ? 'icon-btn-bordered' : 'icon-btn', className)}
    >
      {children}
    </button>
  );
}

/* --------------------------------- fields --------------------------------- */
export function Field({
  label,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className="label">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx('field', props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx('field min-h-24', props.className)} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={clsx('field appearance-none pr-9', props.className)}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  shortcut,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  shortcut?: string;
  className?: string;
}) {
  return (
    <div className={clsx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <TextInput value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9 pr-16" />
      {shortcut && (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 sm:block">
          {shortcut}
        </kbd>
      )}
    </div>
  );
}

/* --------------------------------- badges --------------------------------- */
const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: 'bg-slate-100 text-slate-700 border-slate-200',
  CONTACTED: 'bg-sky-50 text-sky-700 border-sky-200',
  FOLLOW_UP: 'bg-amber-50 text-amber-700 border-amber-200',
  QUALIFIED: 'bg-violet-50 text-violet-700 border-violet-200',
  WON: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  LOST: 'bg-red-50 text-red-700 border-red-200',
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', STATUS_STYLES[status])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {STATUS_LABELS[status]}
    </span>
  );
}

const PRIORITY_STYLES: Record<LeadPriority, string> = {
  LOW: 'bg-slate-100 text-slate-600 border-slate-200',
  MEDIUM: 'bg-blue-50 text-blue-700 border-blue-200',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
};

export function PriorityBadge({ priority }: { priority: LeadPriority }) {
  return (
    <span className={clsx('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', PRIORITY_STYLES[priority])}>
      {priority.charAt(0) + priority.slice(1).toLowerCase()}
    </span>
  );
}

const FOLLOWUP_STYLES: Record<FollowUpStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function FollowUpBadge({ status }: { status: FollowUpStatus }) {
  return (
    <span className={clsx('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', FOLLOWUP_STYLES[status])}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

/* ------------------------------ page primitives ---------------------------- */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('card p-5', className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  action,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-subtitle max-w-2xl">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  to,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  to?: string;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneClasses = {
    default: 'bg-brand-50 text-brand-700',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-red-50 text-red-700',
  }[tone];
  const content = (
    <div className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        {Icon && <span className={clsx('flex h-10 w-10 items-center justify-center rounded-xl', toneClasses)}><Icon className="h-5 w-5" /></span>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="card block transition hover:-translate-y-0.5 hover:shadow-md">{content}</Link> : <div className="card">{content}</div>;
}

export function SectionTitle({ title, action, description }: { title: string; action?: ReactNode; description?: string }) {
  return (
    <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div>
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-t border-slate-100">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <td key={colIndex} className="px-4 py-4">
              <div className={clsx('h-3 animate-pulse rounded-full bg-slate-100', colIndex === 1 ? 'w-40' : 'w-20')} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return <div className={clsx('h-28 animate-pulse rounded-xl border border-slate-200 bg-white', className)} />;
}

export function EmptyState({ title, description, action, icon: Icon = Inbox }: { title: string; description?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertCircle className="h-5 w-5" />
      </span>
      <p className="max-w-md text-sm text-red-700">{message}</p>
      {onRetry && <Button variant="secondary" small onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/* --------------------------------- modal ---------------------------------- */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = bodyOverflow;
      window.removeEventListener('keydown', handler);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl',
          wide ? 'sm:max-w-4xl' : 'sm:max-w-lg',
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <h2 className="text-base font-bold text-slate-950">{title}</h2>
          <IconButton label="Close dialog" onClick={onClose}><X className="h-4 w-4" /></IconButton>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm leading-6 text-slate-600">{message}</p>
      {children && <div className="mt-4">{children}</div>}
    </Modal>
  );
}

/* ------------------------------- pagination -------------------------------- */
export function PaginationBar(props: {
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}) {
  const { onPageChange, onPageSizeChange } = props;
  const page = props.pagination?.page ?? props.page ?? 1;
  const pageSize = props.pagination?.pageSize ?? props.pageSize ?? 20;
  const total = props.pagination?.total ?? props.total ?? 0;
  const totalPages = props.pagination?.totalPages ?? props.totalPages ?? 1;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 sm:flex-row">
      <div className="flex items-center gap-2">
        <span className="font-medium">{from}–{to} <span className="font-normal text-slate-400">of</span> {total}</span>
        {onPageSizeChange && (
          <Select aria-label="Rows per page" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="min-h-8 py-1.5 text-xs">
            {[25, 50, 100].map((size) => <option key={size} value={size}>{size} / page</option>)}
          </Select>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" small disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
        <span className="min-w-24 text-center text-xs font-medium">Page {page} of {totalPages}</span>
        <Button variant="secondary" small disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
