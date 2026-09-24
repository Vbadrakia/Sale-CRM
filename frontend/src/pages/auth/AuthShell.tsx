import type { ReactNode } from 'react';
import { BarChart3, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden overflow-hidden bg-slate-950 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(55,103,240,.28),transparent_34%),radial-gradient(circle_at_80%_80%,rgba(14,165,233,.18),transparent_30%)]" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-sm font-black text-white shadow-lg shadow-brand-600/25">CR</span>
              <div><p className="text-sm font-bold text-white">Sales CRM</p><p className="text-xs text-slate-400">Lead operations</p></div>
            </div>
            <div className="mt-20 max-w-xl">
              <p className="eyebrow !text-brand-300">One workspace</p>
              <h2 className="mt-3 text-4xl font-bold tracking-tight text-white xl:text-5xl">Keep every lead, follow-up, and customer in sync.</h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">A focused sales workspace for managing pipeline, assignments, follow-ups, and customer conversion without spreadsheet clutter.</p>
              <div className="mt-9 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur"><BarChart3 className="h-5 w-5 text-brand-300" /><p className="mt-5 text-sm font-semibold text-white">Live pipeline</p><p className="mt-1 text-xs text-slate-400">See movement at a glance.</p></div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur"><CheckCircle2 className="h-5 w-5 text-emerald-300" /><p className="mt-5 text-sm font-semibold text-white">Follow-up control</p><p className="mt-1 text-xs text-slate-400">Never lose the next action.</p></div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur"><ShieldCheck className="h-5 w-5 text-sky-300" /><p className="mt-5 text-sm font-semibold text-white">Role-aware access</p><p className="mt-1 text-xs text-slate-400">Admins and BDEs stay scoped.</p></div>
              </div>
            </div>
          </div>
          <div className="relative flex items-center gap-2 text-xs text-slate-500"><Sparkles className="h-3.5 w-3.5" /> Built for focused sales teams</div>
        </div>

        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 sm:px-6">
          <div className="w-full max-w-md">
            <div className="mb-7 lg:hidden">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-sm font-black text-white shadow-sm">CR</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8">
              <div className="mb-7">
                <h1 className="text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>
              </div>
              {children}
            </div>
            <p className="mt-5 text-center text-xs text-slate-400">Sales CRM · Local development workspace</p>
          </div>
        </div>
      </div>
    </div>
  );
}
