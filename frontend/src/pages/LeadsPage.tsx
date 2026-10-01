import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  Filter,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { leadApi, userApi } from '@/api/services';
import { ApiRequestError } from '@/api/client';
import {
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  PaginationBar,
  PriorityBadge,
  SearchInput,
  Select,
  StatusBadge,
  TableSkeleton,
} from '@/components/ui';
import { LeadFormModal } from '@/components/LeadFormModal';
import { useAuth } from '@/context/AuthContext';
import { formatDate, gmailComposeUrl, whatsAppUrl } from '@/utils/format';
import type { AssignableUser, Lead, LeadFilters, LeadStatus, Pagination } from '@/types';

const STATUS_OPTIONS: LeadStatus[] = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'QUALIFIED', 'WON', 'LOST'];

export default function LeadsPage() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bdes, setBdes] = useState<AssignableUser[]>([]);
  const [options, setOptions] = useState<{ sources: string[]; countries: string[]; states: string[]; cities: string[] }>({
    sources: [], countries: [], states: [], cities: [],
  });
  const [showCreate, setShowCreate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');

  const query = useMemo(() => ({
    page: Number(params.get('page') ?? 1),
    pageSize: Number(params.get('pageSize') ?? 25),
    search: params.get('search') ?? '',
    status: (params.get('status') ?? '') as LeadFilters['status'],
    priority: (params.get('priority') ?? '') as LeadFilters['priority'],
    assignedBdeId: params.get('assignedBdeId') ?? '',
    leadSource: params.get('leadSource') ?? '',
    country: params.get('country') ?? '',
    state: params.get('state') ?? '',
    city: params.get('city') ?? '',
    createdFrom: params.get('createdFrom') ?? '',
    createdTo: params.get('createdTo') ?? '',
    sortBy: params.get('sortBy') ?? 'createdAt',
    sortDir: (params.get('sortDir') as 'ASC' | 'DESC') ?? 'DESC',
  }), [params]);

  const setParam = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }, [params, setParams]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await leadApi.list(query);
      setLeads(result.data);
      setPagination(result.pagination ?? null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load leads.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void userApi.assignable().then((result) => setBdes(result.data)).catch(() => undefined);
    void leadApi.filterOptions().then((result) => setOptions(result.data)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput !== (params.get('search') ?? '')) setParam('search', searchInput.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput, params, setParam]);

  function toggleSort(column: string) {
    const dir = query.sortBy === column && query.sortDir === 'ASC' ? 'DESC' : 'ASC';
    const next = new URLSearchParams(params);
    next.set('sortBy', column); next.set('sortDir', dir); setParams(next);
  }

  function resetFilters() {
    setSearchInput(''); setParams(new URLSearchParams());
  }

  const activeFilters = ['status', 'priority', 'assignedBdeId', 'leadSource', 'country', 'state', 'city', 'createdFrom', 'createdTo', 'search'].filter((key) => params.get(key)).length;
  const countLabel = pagination ? `${pagination.total.toLocaleString()} ${pagination.total === 1 ? 'lead' : 'leads'}` : 'Loading…';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pipeline"
        title={isAdmin ? 'All leads' : 'My leads'}
        description={`${countLabel}. Search, filter, and open a lead to manage the full sales workflow.`}
        action={isAdmin ? <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New lead</Button> : undefined}
      />

      <div className="card p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search company, contact, phone, email…" shortcut="/" className="w-full lg:max-w-xl" />
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <Button variant="secondary" small onClick={() => setShowFilters((open) => !open)}>
              <SlidersHorizontal className="h-4 w-4" /> Filters {activeFilters > 0 && <span className="rounded-full bg-brand-100 px-1.5 text-brand-700">{activeFilters}</span>}
            </Button>
            <Button variant="secondary" small onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
            </Button>
            {activeFilters > 0 && <Button variant="ghost" small onClick={resetFilters}><RotateCcw className="h-4 w-4" /> Clear</Button>}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setParam('status', '')} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${!query.status ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>All</button>
          {STATUS_OPTIONS.map((status) => (
            <button key={status} type="button" onClick={() => setParam('status', status)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${query.status === status ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>

        {showFilters && (
          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Select aria-label="Filter by priority" value={query.priority} onChange={(e) => setParam('priority', e.target.value)}>
              <option value="">All priorities</option>
              {['LOW', 'MEDIUM', 'HIGH'].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </Select>
            {isAdmin && (
              <Select aria-label="Filter by BDE" value={query.assignedBdeId} onChange={(e) => setParam('assignedBdeId', e.target.value)}>
                <option value="">All BDEs</option><option value="unassigned">Unassigned</option>
                {bdes.map((bde) => <option key={bde.id} value={bde.id}>{bde.fullName}</option>)}
              </Select>
            )}
            <Select aria-label="Filter by source" value={query.leadSource} onChange={(e) => setParam('leadSource', e.target.value)}>
              <option value="">All sources</option>{options.sources.map((source) => <option key={source} value={source}>{source}</option>)}
            </Select>
            <Select aria-label="Filter by country" value={query.country} onChange={(e) => setParam('country', e.target.value)}>
              <option value="">All countries</option>{options.countries.map((country) => <option key={country} value={country}>{country}</option>)}
            </Select>
            <Select aria-label="Filter by state" value={query.state} onChange={(e) => setParam('state', e.target.value)}>
              <option value="">All states</option>{options.states.map((state) => <option key={state} value={state}>{state}</option>)}
            </Select>
            <Select aria-label="Filter by city" value={query.city} onChange={(e) => setParam('city', e.target.value)}>
              <option value="">All cities</option>{options.cities.map((city) => <option key={city} value={city}>{city}</option>)}
            </Select>
            <input type="date" aria-label="Created from" className="field" value={query.createdFrom} onChange={(e) => setParam('createdFrom', e.target.value)} />
            <input type="date" aria-label="Created to" className="field" value={query.createdTo} onChange={(e) => setParam('createdTo', e.target.value)} />
          </div>
        )}
      </div>

      {error ? (
        <CardError message={error} onRetry={load} />
      ) : (
        <>
          <div className="card min-w-0 overflow-hidden p-0 hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left align-middle border-collapse">
                <thead className="border-b border-slate-100 bg-slate-50/80">
                  <tr>
                    <th className="table-head w-32 whitespace-nowrap">
                      <button type="button" onClick={() => toggleSort('leadCode')} className="inline-flex items-center gap-1 hover:text-slate-900">
                        Code{query.sortBy === 'leadCode' && <ChevronDown className={`h-3.5 w-3.5 ${query.sortDir === 'ASC' ? 'rotate-180' : ''}`} />}
                      </button>
                    </th>
                    <th className="table-head min-w-[220px]">
                      <button type="button" onClick={() => toggleSort('companyName')} className="inline-flex items-center gap-1 hover:text-slate-900">
                        Company{query.sortBy === 'companyName' && <ChevronDown className={`h-3.5 w-3.5 ${query.sortDir === 'ASC' ? 'rotate-180' : ''}`} />}
                      </button>
                    </th>
                    <th className="table-head min-w-[150px] whitespace-nowrap">Contact</th>
                    <th className="table-head min-w-[140px] whitespace-nowrap">Phone</th>
                    <th className="table-head min-w-[140px] whitespace-nowrap">
                      <button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center gap-1 hover:text-slate-900">
                        Status{query.sortBy === 'status' && <ChevronDown className={`h-3.5 w-3.5 ${query.sortDir === 'ASC' ? 'rotate-180' : ''}`} />}
                      </button>
                    </th>
                    <th className="table-head min-w-[110px] whitespace-nowrap">
                      <button type="button" onClick={() => toggleSort('priority')} className="inline-flex items-center gap-1 hover:text-slate-900">
                        Priority{query.sortBy === 'priority' && <ChevronDown className={`h-3.5 w-3.5 ${query.sortDir === 'ASC' ? 'rotate-180' : ''}`} />}
                      </button>
                    </th>
                    <th className="table-head min-w-[140px] whitespace-nowrap">Assigned</th>
                    {isAdmin && <th className="table-head min-w-[140px] whitespace-nowrap">Imported by</th>}
                    <th className="table-head min-w-[140px] whitespace-nowrap">
                      <button type="button" onClick={() => toggleSort('nextFollowUpAt')} className="inline-flex items-center gap-1 hover:text-slate-900">
                        Next follow-up{query.sortBy === 'nextFollowUpAt' && <ChevronDown className={`h-3.5 w-3.5 ${query.sortDir === 'ASC' ? 'rotate-180' : ''}`} />}
                      </button>
                    </th>
                    <th className="table-head min-w-[120px] whitespace-nowrap">
                      <button type="button" onClick={() => toggleSort('createdAt')} className="inline-flex items-center gap-1 hover:text-slate-900">
                        Created{query.sortBy === 'createdAt' && <ChevronDown className={`h-3.5 w-3.5 ${query.sortDir === 'ASC' ? 'rotate-180' : ''}`} />}
                      </button>
                    </th>
                    <th className="table-head w-28 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                {loading ? <TableSkeleton columns={isAdmin ? 11 : 10} /> : (
                  <tbody>
                    {leads.map((lead) => {
                      const whatsapp = whatsAppUrl(lead.phone, `Hello ${lead.contactName ?? ''}`.trim());
                      const gmail = gmailComposeUrl(lead.email, `Regarding ${lead.companyName}`);
                      return (
                        <tr key={lead.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                          <td className="table-cell font-mono text-[11px] font-semibold text-slate-400 whitespace-nowrap">{lead.leadCode}</td>
                          <td className="table-cell min-w-[220px] max-w-[280px]">
                            <Link to={`/leads/${lead.id}`} className="block truncate font-semibold text-slate-900 hover:text-brand-700" title={lead.companyName}>{lead.companyName}</Link>
                            <p className="mt-0.5 truncate text-xs text-slate-400">{[lead.city, lead.country].filter(Boolean).join(', ') || 'Location not provided'}</p>
                          </td>
                          <td className="table-cell whitespace-nowrap font-medium text-slate-800">{lead.contactName ?? '—'}</td>
                          <td className="table-cell whitespace-nowrap font-mono text-xs text-slate-600">{lead.phone ?? '—'}</td>
                          <td className="table-cell whitespace-nowrap"><StatusBadge status={lead.status} /></td>
                          <td className="table-cell whitespace-nowrap"><PriorityBadge priority={lead.priority} /></td>
                          <td className="table-cell whitespace-nowrap">{lead.assignedBde ? `${lead.assignedBde.firstName} ${lead.assignedBde.lastName}` : <span className="text-slate-400">Unassigned</span>}</td>
                          {isAdmin && <td className="table-cell whitespace-nowrap">{lead.importer ? `${lead.importer.firstName} ${lead.importer.lastName}` : <span className="text-slate-400">—</span>}</td>}
                          <td className="table-cell whitespace-nowrap">{lead.nextFollowUpAt ? <span className="font-medium text-slate-700">{formatDate(lead.nextFollowUpAt)}</span> : <span className="text-slate-400">None</span>}</td>
                          <td className="table-cell whitespace-nowrap text-slate-500">{formatDate(lead.createdAt)}</td>
                          <td className="table-cell whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="icon-btn" aria-label={`Open WhatsApp chat with ${lead.companyName}`} title="WhatsApp"><MessageCircle className="h-4 w-4 text-emerald-600" /></a>}
                              {gmail && <a href={gmail} target="_blank" rel="noopener noreferrer" className="icon-btn" aria-label={`Email ${lead.companyName}`} title="Email"><Mail className="h-4 w-4 text-sky-600" /></a>}
                              <Link to={`/leads/${lead.id}`} className="btn-secondary btn-sm">Open</Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                )}
              </table>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {loading && Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white" />)}
            {!loading && leads.map((lead) => {
              const whatsapp = whatsAppUrl(lead.phone, `Hello ${lead.contactName ?? ''}`.trim());
              const gmail = gmailComposeUrl(lead.email, `Regarding ${lead.companyName}`);
              return (
                <div key={lead.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/leads/${lead.id}`} className="line-clamp-1 text-sm font-bold text-slate-900">{lead.companyName}</Link>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{lead.leadCode} · {[lead.city, lead.country].filter(Boolean).join(', ') || 'No location'}</p>
                    </div>
                    <IconButton label="More actions"><MoreHorizontal className="h-4 w-4" /></IconButton>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2"><StatusBadge status={lead.status} /><PriorityBadge priority={lead.priority} /></div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div><span className="block text-slate-400">Contact</span><span className="mt-0.5 block font-semibold text-slate-700">{lead.contactName ?? '—'}</span></div>
                    <div><span className="block text-slate-400">Next follow-up</span><span className="mt-0.5 block font-semibold text-slate-700">{formatDate(lead.nextFollowUpAt)}</span></div>
                  </div>
                  <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                    <Link to={`/leads/${lead.id}`} className="btn-primary btn-sm flex-1">Open lead</Link>
                    {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm" title="WhatsApp"><MessageCircle className="h-4 w-4 text-emerald-600" /></a>}
                    {gmail && <a href={gmail} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm" title="Email"><Mail className="h-4 w-4 text-sky-600" /></a>}
                  </div>
                </div>
              );
            })}
          </div>

          {!loading && leads.length === 0 && (
            <div className="card">
              <EmptyState title="No leads match these filters" description={activeFilters ? 'Clear some filters to widen your search.' : 'Imported or newly created leads will appear here.'} action={activeFilters ? <Button variant="secondary" small onClick={resetFilters}><Filter className="h-4 w-4" /> Clear filters</Button> : isAdmin ? <Button small onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Add first lead</Button> : undefined} />
            </div>
          )}

          {pagination && pagination.total > 0 && <div className="card overflow-hidden"><PaginationBar pagination={pagination} onPageChange={(page) => setParam('page', String(page))} onPageSizeChange={(size) => setParam('pageSize', String(size))} /></div>}
        </>
      )}

      {showCreate && <LeadFormModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); void load(); }} bdes={bdes} />}
    </div>
  );
}

function CardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="card"><ErrorState message={message} onRetry={onRetry} /></div>;
}
