import { useEffect, useState } from 'react';
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
import { ApiRequestError } from '@/api/client';
import { Card, CardSkeleton, ErrorState, PageHeader, SectionTitle } from '@/components/ui';
import type { BdePerformance, ChartPoint, FollowUpTrendPoint, MonthlyTrendPoint } from '@/types';

const COLORS = ['#2563eb', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

export default function ReportsPage() {
  const [status, setStatus] = useState<ChartPoint[]>([]);
  const [source, setSource] = useState<ChartPoint[]>([]);
  const [bde, setBde] = useState<BdePerformance[]>([]);
  const [monthly, setMonthly] = useState<MonthlyTrendPoint[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, src, b, m, f] = await Promise.all([
        dashboardApi.leadsByStatus(),
        dashboardApi.leadsBySource(),
        dashboardApi.leadsByBde(),
        dashboardApi.monthlyTrend(),
        dashboardApi.followUps(),
      ]);
      setStatus(s.data);
      setSource(src.data);
      setBde(b.data);
      setMonthly(m.data);
      setFollowUps(f.data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the reports.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton className="h-72" />
        <CardSkeleton className="h-72" />
        <CardSkeleton className="h-72" />
        <CardSkeleton className="h-72" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={load} />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Analytics" title="Reports" description="Pipeline health, sources and team performance." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Leads by status" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={status}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {status.map((entry, index) => (
                    <Cell key={entry.label} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Leads by source" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={source} dataKey="value" nameKey="label" outerRadius={90} label>
                  {source.map((entry, index) => (
                    <Cell key={entry.label} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Leads and customers over 12 months" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="leads" stroke="#2563eb" strokeWidth={2} />
                <Line type="monotone" dataKey="customers" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle title="Follow-ups over 30 days" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={followUps}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="completed" stackId="a" fill="#10b981" />
                <Bar dataKey="pending" stackId="a" fill="#f59e0b" />
                <Bar dataKey="cancelled" stackId="a" fill="#cbd5e1" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-0">
        <div className="px-4 pt-4">
          <SectionTitle title="BDE performance" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">BDE</th>
                <th className="px-4 py-2.5">Assigned</th>
                <th className="px-4 py-2.5">Contacted</th>
                <th className="px-4 py-2.5">Qualified</th>
                <th className="px-4 py-2.5">Won</th>
                <th className="px-4 py-2.5">Lost</th>
                <th className="px-4 py-2.5">Follow-ups done</th>
                <th className="px-4 py-2.5">Conversion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bde.map((row) => (
                <tr key={row.bdeId} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900">{row.name}</div>
                    <div className="text-xs text-slate-500">{row.email}</div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{row.assigned}</td>
                  <td className="px-4 py-2.5 text-slate-700">{row.contacted}</td>
                  <td className="px-4 py-2.5 text-slate-700">{row.qualified}</td>
                  <td className="px-4 py-2.5 font-medium text-emerald-700">{row.won}</td>
                  <td className="px-4 py-2.5 text-red-600">{row.lost}</td>
                  <td className="px-4 py-2.5 text-slate-700">{row.followUpsCompleted}</td>
                  <td className="px-4 py-2.5 text-slate-700">{row.conversionRate}%</td>
                </tr>
              ))}
              {bde.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                    No BDE activity recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
