import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MessageCircle, Search } from 'lucide-react';
import { customerApi, userApi } from '@/api/services';
import { ApiRequestError } from '@/api/client';
import { Card, EmptyState, ErrorState, PageHeader, PaginationBar, Select, TableSkeleton, TextInput } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { formatDate, gmailComposeUrl, whatsAppUrl } from '@/utils/format';
import type { AssignableUser, Customer, Pagination } from '@/types';

export default function CustomersPage() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [assignedBdeId, setAssignedBdeId] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Customer[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bdes, setBdes] = useState<AssignableUser[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await customerApi.list({
        page,
        pageSize: 20,
        search: debounced || undefined,
        assignedBdeId: assignedBdeId || undefined,
      });
      setRows(result.data);
      setPagination(result.pagination ?? null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load customers.');
    } finally {
      setLoading(false);
    }
  }, [page, debounced, assignedBdeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (isAdmin) void userApi.assignable().then((r) => setBdes(r.data)).catch(() => undefined);
  }, [isAdmin]);

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Customer base" title="Customers" description="Leads that turned into paying relationships." />

      <Card className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <TextInput
            className="pl-9"
            placeholder="Search company, contact, email or phone"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {isAdmin && (
          <div className="w-56">
            <Select
              value={assignedBdeId}
              onChange={(event) => {
                setPage(1);
                setAssignedBdeId(event.target.value);
              }}
            >
              <option value="">All BDEs</option>
              {bdes.map((bde) => (
                <option key={bde.id} value={bde.id}>
                  {bde.fullName}
                </option>
              ))}
            </Select>
          </div>
        )}
      </Card>

      <Card className="p-0">
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={6} columns={5} />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : rows.length === 0 ? (
          <EmptyState title="No customers yet" description="Convert a qualified lead to create your first customer." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Contact</th>
                  <th className="px-4 py-2.5">Location</th>
                  <th className="px-4 py-2.5">Owner</th>
                  <th className="px-4 py-2.5">Since</th>
                  <th className="px-4 py-2.5 text-right">Reach out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((customer) => {
                  const whatsapp = whatsAppUrl(customer.phone);
                  const gmail = gmailComposeUrl(customer.email, `Hello from our team`);
                  return (
                    <tr key={customer.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <Link to={`/customers/${customer.id}`} className="font-medium text-brand-700 hover:underline">
                          {customer.companyName}
                        </Link>
                        <div className="font-mono text-xs text-slate-400">{customer.customerCode}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-slate-800">{customer.contactName ?? '—'}</div>
                        <div className="text-xs text-slate-500">{customer.email ?? customer.phone ?? ''}</div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {[customer.city, customer.country].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {customer.assignedBde ? `${customer.assignedBde.firstName} ${customer.assignedBde.lastName}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{formatDate(customer.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-2">
                          {whatsapp && (
                            <a href={whatsapp} target="_blank" rel="noopener noreferrer" title="WhatsApp">
                              <MessageCircle className="h-4 w-4 text-emerald-600" />
                            </a>
                          )}
                          {gmail && (
                            <a href={gmail} target="_blank" rel="noopener noreferrer" title="Email">
                              <Mail className="h-4 w-4 text-sky-600" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pagination && pagination.totalPages > 1 && <PaginationBar pagination={pagination} onPageChange={setPage} />}
      </Card>
    </div>
  );
}
