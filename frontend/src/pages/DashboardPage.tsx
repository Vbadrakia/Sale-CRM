import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Target,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dashboardApi } from '@/api/services';
import { useApiResource } from '@/hooks/useApiResource';
import { Card, CardSkeleton, ErrorState, PageHeader, SectionTitle, StatCard } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { STATUS_LABELS } from '@/utils/format';
import type { LeadStatus } from '@/types';

const STATUS_COLORS: Record<string, string> = {
  NEW: '#94a3b8',
  CONTACTED: '#0ea5e9',
  FOLLOW_UP: '#f59e0b',
  QUALIFIED: '#8b5cf6',
  WON: '#10b981',
  LOST: '#ef4444',
};

export default function DashboardPage() {
  const { isAdmin, user } = useAuth();
  const summary = useApiResource(async () => (await dashboardApi.summary()).data, []);
  const bySource = useApiResource(async () => (await dashboardApi.leadsBySource()).data, []);
  const byBde = useApiResource(async () => (await dashboardApi.leadsByBde()).data, []);
  const trend = useApiResource(async () => (await dashboardApi.monthlyTrend()).data, []);
  const funnel = useApiResource(async () => (await dashboardApi.conversion()).data, []);

  if (summary.error) return <ErrorState message={summary.error} onRetry={summary.reload} />;

  const data = summary.data;
  const statusData = data
    ? (Object.keys(STATUS_LABELS) as LeadStatus[]).map((status) => ({
        label: STATUS_LABELS[status],
        key: status,
        value: data.leads[status],
      }))
    : [];

  const displayName = user?.firstName || user?.fullName?.split(' ')[0] || 'there';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title={isAdmin ? `Good morning, ${displayName}` : `Welcome back, ${displayName}`}
        description={isAdmin ? 'A live snapshot of your team, pipeline, and follow-up workload.' : 'Your assigned pipeline and today’s follow-up workload at a glance.'}
        action={
          <>
            <Link to="/followups?view=today" className="btn-secondary"><CalendarClock className="h-4 w-4" /> Today’s follow-ups</Link>
            {isAdmin && <Link to="/leads" className="btn-primary"><Target className="h-4 w-4" /> Open pipeline</Link>}
          </>
        }
      />

      {summary.loading || !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => <CardSkeleton key={index} />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total leads" value={data.leads.total} icon={Target} to="/leads" hint="Across active pipeline" />
          <StatCard label="New leads" value={data.leads.NEW} icon={TrendingUp} to="/leads?status=NEW" hint="Ready for first contact" />
          <StatCard label="Qualified" value={data.leads.QUALIFIED} icon={CheckCircle2} to="/leads?status=QUALIFIED" tone="success" hint="Sales-ready opportunities" />
          <StatCard label="Won" value={data.leads.WON} icon={WalletCards} to="/leads?status=WON" tone="success" hint={`${data.winRate}% win rate`} />
          <StatCard label="Follow-ups today" value={data.followUps.today} icon={CalendarClock} to="/followups?view=today" hint="Due today" />
          <StatCard label="Overdue" value={data.followUps.overdue} icon={Clock3} to="/followups?view=overdue" tone={data.followUps.overdue ? 'danger' : 'default'} hint="Need attention" />
          <StatCard label="Customers" value={data.customers.total} icon={Users} to="/customers" hint={`${data.customers.newThisMonth} added this month`} />
          <StatCard label="Conversion rate" value={`${data.customers.conversionRate}%`} icon={BarChart3} tone="success" hint="Lead → customer" />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionTitle title="Pipeline trend" description="Monthly leads and converted customers" />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend.data ?? []} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', boxShadow: '0 12px 28px rgba(15,23,42,.08)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="leads" name="Leads" stroke="#3767f0" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="customers" name="Customers" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Conversion funnel" description="Current pipeline movement" />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel.data ?? []} layout="vertical" margin={{ top: 8, right: 10, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={78} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }} />
                <Bar dataKey="value" name="Leads" fill="#3767f0" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Leads by status" description="Current volume by stage" action={<Link to="/leads" className="text-xs font-semibold text-brand-600 hover:text-brand-700">View all</Link>} />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }} />
                <Bar dataKey="value" name="Leads" radius={[6, 6, 0, 0]}>
                  {statusData.map((entry) => <Cell key={entry.key} fill={STATUS_COLORS[entry.key]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Lead sources" description="Where your pipeline is coming from" />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={bySource.data ?? []} dataKey="value" nameKey="label" innerRadius={62} outerRadius={95} paddingAngle={2} label={{ fontSize: 10 }}>
                  {(bySource.data ?? []).map((entry, index) => (
                    <Cell key={entry.label} fill={['#3767f0', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'][index % 7]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {isAdmin && (
        <Card className="overflow-hidden p-0">
          <div className="px-5 pt-5">
            <SectionTitle
              title="BDE performance"
              description="Assigned leads and outcomes by team member"
              action={<Link to="/reports" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">Full report <ArrowUpRight className="h-3.5 w-3.5" /></Link>}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="border-y border-slate-100 bg-slate-50/80">
                <tr>
                  <th className="table-head">BDE</th><th className="table-head">Assigned</th><th className="table-head">Contacted</th><th className="table-head">Qualified</th><th className="table-head">Won</th><th className="table-head">Lost</th><th className="table-head">Follow-ups</th><th className="table-head">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {(byBde.data ?? []).map((row) => (
                  <tr key={row.bdeId} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="table-cell font-semibold text-slate-900">{row.name}</td>
                    <td className="table-cell">{row.assigned}</td>
                    <td className="table-cell">{row.contacted}</td>
                    <td className="table-cell"><span className="font-semibold text-violet-700">{row.qualified}</span></td>
                    <td className="table-cell"><span className="font-semibold text-emerald-700">{row.won}</span></td>
                    <td className="table-cell"><span className="font-semibold text-red-600">{row.lost}</span></td>
                    <td className="table-cell">{row.followUpsCompleted}</td>
                    <td className="table-cell"><span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{row.conversionRate}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
