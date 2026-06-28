import { useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';

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

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      <div className="grid grid-cols-4 gap-4">
        {primaryCards.map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 bg-white p-4">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold">{value ?? '-'}</div>
          </div>
        ))}
      </div>
      {stats && stats.channels && stats.channels.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Channel Activity (24h)</h2>
          <div className="grid grid-cols-4 gap-4">
            {stats.channels.map((ch) => (
              <div key={ch.channel} className="rounded-md border border-slate-100 p-4">
                <div className="text-sm capitalize text-slate-500">{ch.channel}</div>
                <div className="mt-2 text-2xl font-semibold">{ch.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
