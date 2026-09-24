import { PaginationMeta } from '../types';

const ALLOWED_PAGE_SIZES = [25, 50, 100];

export function parsePagination(query: Record<string, unknown>): {
  page: number;
  pageSize: number;
  offset: number;
} {
  const page = Math.max(1, Number(query.page) || 1);
  const requested = Number(query.pageSize) || 25;
  const pageSize = ALLOWED_PAGE_SIZES.includes(requested) ? requested : 25;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function buildPaginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
