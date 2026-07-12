import { useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Radio, Send } from 'lucide-react';

type ChannelStat = {
  channel: string;
  count: number;
};

type DashboardStats = {
  queued: number;
  sent_today: number;
  failed: number;
  retry_count: number;
  dead_letter_count: number;
  active_campaigns: number;
  ws_connections: number;
  success_rate: number;
  channels: ChannelStat[];
};

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiRequest<DashboardStats>('/admin/api/v1/dashboard/stats')
      .then(setStats)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="animate-pulse rounded-md border border-slate-200 bg-white p-4">
              <div className="h-3 w-16 rounded bg-slate-200" />
              <div className="mt-2 h-6 w-12 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const primaryCards = [
    ['Queued', stats?.queued],
    ['Sent today', stats?.sent_today],
    ['Failed', stats?.failed],
    ['Success rate', stats ? `${stats.success_rate.toFixed(1)}%` : '-'],
    ['Retries', stats?.retry_count],
    ['Dead letter', stats?.dead_letter_count],
    ['Active campaigns', stats?.active_campaigns],
    ['WS connections', stats?.ws_connections],
  ];
  const maxChannel = Math.max(1, ...(stats?.channels || []).map((item) => item.count));
  const total = (stats?.sent_today || 0) + (stats?.failed || 0) + (stats?.queued || 0);
  const icons = [Clock3, Send, AlertTriangle, CheckCircle2, Activity, AlertTriangle, Radio, Radio];

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      <div><h1 className="text-2xl font-semibold text-slate-900">Operations overview</h1><p className="mt-1 text-sm text-slate-500">Live notification health and delivery performance across your workspace.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {primaryCards.map(([label, value], index) => { const Icon = icons[index]; return (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><div className="text-sm font-medium text-slate-500">{label}</div><span className="rounded-lg bg-blue-50 p-2 text-blue-600"><Icon size={17}/></span></div>
            <div className="mt-3 text-2xl font-semibold">{value ?? '-'}</div>
          </div>
        )})}
      </div>
      {stats && <div className="grid gap-5 xl:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">Channel activity</h2><p className="text-sm text-slate-500">Deliveries during the last 24 hours</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">24 hours</span></div>
          <div className="mt-6 space-y-4">{stats.channels.length ? stats.channels.map((ch) => <div key={ch.channel} className="grid grid-cols-[100px_1fr_45px] items-center gap-3"><span className="text-sm font-medium capitalize">{ch.channel.replace('_',' ')}</span><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" style={{width:`${Math.max(4, ch.count/maxChannel*100)}%`}} /></div><span className="text-right text-sm font-semibold">{ch.count}</span></div>) : <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">Channel activity will appear after the first delivery.</div>}</div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-900">Delivery outcome</h2><p className="text-sm text-slate-500">Current delivery distribution</p><div className="mx-auto mt-5 flex h-36 w-36 items-center justify-center rounded-full" style={{background: total ? `conic-gradient(#10b981 0 ${stats.sent_today/total*100}%, #ef4444 0 ${(stats.sent_today+stats.failed)/total*100}%, #3b82f6 0)` : '#f1f5f9'}}><div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white"><strong className="text-2xl">{total}</strong><span className="text-xs text-slate-500">deliveries</span></div></div><div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs"><div><b className="block text-emerald-600">{stats.sent_today}</b>Sent</div><div><b className="block text-red-600">{stats.failed}</b>Failed</div><div><b className="block text-blue-600">{stats.queued}</b>Queued</div></div>
        </section>
      </div>}
    </div>
  );
}
