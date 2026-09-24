/** Normalization helpers used for duplicate detection and safe link generation. */

export function normalizeEmail(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = String(value).trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

export function normalizeText(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).replace(/\s+/g, ' ').trim();
  return trimmed.length ? trimmed : null;
}

export function normalizeCompareText(value?: string | null): string | null {
  const text = normalizeText(value);
  return text ? text.toLowerCase() : null;
}

/**
 * Keeps digits only, preserving a leading +. Never invents or rewrites digits.
 */
export function normalizePhone(value?: string | null): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  return (hasPlus ? '+' : '') + digits;
}

/** Digits-only comparison key so "+91 98765 43210" matches "9876543210". */
export function phoneCompareKey(value?: string | null): string | null {
  const normalized = normalizePhone(value);
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : digits;
}

export function normalizeWebsite(value?: string | null): string | null {
  if (!value) return null;
  let text = String(value).trim().toLowerCase();
  if (!text) return null;
  text = text.replace(/^https?:\/\//, '').replace(/^www\./, '');
  text = text.split('/')[0].split('?')[0];
  return text || null;
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value?: string | null): boolean {
  const email = normalizeEmail(value);
  return !!email && EMAIL_REGEX.test(email);
}

export function isValidPhone(value?: string | null): boolean {
  const phone = normalizePhone(value);
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}
