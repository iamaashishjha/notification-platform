import { useEffect, useState } from 'react';
import { Panel } from '../../components/Panel';
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<DashboardStats>('/admin/api/v1/dashboard/stats')
      .then(setStats)
      .catch((err) => setError(err.message));
  }, []);

  const primaryCards = [
    ['Queued', stats?.queued ?? '-'],
    ['Sent today', stats?.sent_today ?? '-'],
    ['Failed', stats?.failed ?? '-'],
    ['Success rate', stats ? `${stats.success_rate.toFixed(1)}%` : '-'],
    ['Retries', stats?.retry_count ?? '-'],
    ['Dead letter', stats?.dead_letter_count ?? '-'],
    ['Active campaigns', stats?.active_campaigns ?? '-'],
    ['WS connections', stats?.ws_connections ?? '-'],
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
            <div className="mt-2 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>
      {stats && stats.channels && stats.channels.length > 0 && (
        <Panel title="Channel Activity (24h)">
          <div className="grid grid-cols-4 gap-4">
            {stats.channels.map((ch) => (
              <div key={ch.channel} className="rounded-md border border-slate-200 bg-white p-4">
                <div className="text-sm capitalize text-slate-500">{ch.channel}</div>
                <div className="mt-2 text-2xl font-semibold">{ch.count}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Panel title="Operations">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="rounded-md border border-slate-200 p-4">Feature flags and channel checks run at send time.</div>
          <div className="rounded-md border border-slate-200 p-4">Mock providers keep local delivery testable without credentials.</div>
          <div className="rounded-md border border-slate-200 p-4">Workers can scale independently through Docker Compose.</div>
        </div>
      </Panel>
    </div>
  );
}
