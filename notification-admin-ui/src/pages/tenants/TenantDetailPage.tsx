import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';

type Tenant = { id: string; name: string; slug: string; status: string; created_at: string; updated_at: string };
type Feature = { id: string; feature_key: string; enabled: boolean; created_at: string };
type Channel = { id: string; channel: string; enabled: boolean; direction: string; rate_limit_per_second: number; daily_quota: number; created_at: string };
type Provider = { id: string; channel: string; provider: string; is_default: boolean; status: string; created_at: string };
type Overview = {
  tenant: Tenant;
  features: Feature[];
  channels: Channel[];
  providers: Provider[];
  counts: { users: number; contacts: number; templates: number; campaigns: number; api_keys: number };
};

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className={`focus-ring relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${value ? 'bg-blue-600' : 'bg-slate-300'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

function OverviewSection({ overview }: { overview: Overview }) {
  const t = overview.tenant;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div><span className="text-slate-500">Name</span><p className="font-medium">{t.name}</p></div>
        <div><span className="text-slate-500">Slug</span><p className="font-medium">{t.slug}</p></div>
        <div><span className="text-slate-500">Status</span><p className="font-medium">{t.status}</p></div>
        <div><span className="text-slate-500">Created</span><p className="font-medium">{t.created_at}</p></div>
      </div>
      <div className="grid grid-cols-5 gap-4">
        {Object.entries(overview.counts).map(([key, val]) => (
          <div key={key} className="rounded-md border border-slate-200 p-3 text-center">
            <div className="text-2xl font-bold text-blue-700">{val}</div>
            <div className="text-xs text-slate-500">{key.replace(/_/g, ' ')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeaturesSection({ tenantId, features, onToggle }: { tenantId: string; features: Feature[]; onToggle: (id: string, enabled: boolean) => void }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-slate-200 text-slate-500"><tr><th className="py-2">Feature</th><th>Enabled</th><th>Action</th></tr></thead>
      <tbody>
        {features.map((f) => (
          <tr key={f.id} className="border-b border-slate-100"><td className="py-3 font-medium">{f.feature_key}</td><td>{f.enabled ? 'Yes' : 'No'}</td><td><Toggle value={f.enabled} onChange={() => onToggle(f.id, !f.enabled)} /></td></tr>
        ))}
        {features.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-400">No features configured</td></tr>}
      </tbody>
    </table>
  );
}

function ChannelsSection({ tenantId, channels, onToggle }: { tenantId: string; channels: Channel[]; onToggle: (id: string, enabled: boolean) => void }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-slate-200 text-slate-500"><tr><th className="py-2">Channel</th><th>Enabled</th><th>Direction</th><th>Rate/s</th><th>Daily Quota</th><th>Action</th></tr></thead>
      <tbody>
        {channels.map((c) => (
          <tr key={c.id} className="border-b border-slate-100">
            <td className="py-3 font-medium">{c.channel}</td><td>{c.enabled ? 'Yes' : 'No'}</td><td>{c.direction}</td><td>{c.rate_limit_per_second}</td><td>{c.daily_quota}</td>
            <td><Toggle value={c.enabled} onChange={() => onToggle(c.id, !c.enabled)} /></td>
          </tr>
        ))}
        {channels.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-slate-400">No channels configured</td></tr>}
      </tbody>
    </table>
  );
}

function ProvidersSection({ tenantId, providers }: { tenantId: string; providers: Provider[] }) {
  const grouped: Record<string, Provider[]> = {};
  for (const p of providers) {
    if (!grouped[p.channel]) grouped[p.channel] = [];
    grouped[p.channel].push(p);
  }
  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([channel, prows]) => (
        <div key={channel}>
          <h4 className="mb-1 text-sm font-semibold text-slate-600">{channel}</h4>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500"><tr><th className="py-1">Provider</th><th>Default</th><th>Status</th></tr></thead>
            <tbody>
              {prows.map((p) => (
                <tr key={p.id} className="border-b border-slate-100"><td className="py-2">{p.provider}</td><td>{p.is_default ? 'Yes' : 'No'}</td><td>{p.status}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {providers.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No providers configured</p>}
    </div>
  );
}

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const isPlatform = user?.is_platform_admin;
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiRequest<{ data: Overview }>(`/admin/api/v1/tenants/${id}/overview`)
      .then((res) => { setOverview(res.data); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function toggleFeature(featureId: string, enabled: boolean) {
    try {
      await apiRequest(`/admin/api/v1/features/${featureId}`, { method: 'PUT', body: JSON.stringify({ enabled }) });
      setOverview((prev) => prev ? { ...prev, features: prev.features.map((f) => f.id === featureId ? { ...f, enabled } : f) } : prev);
    } catch { /* ignore */ }
  }

  async function toggleChannel(channelId: string, enabled: boolean) {
    try {
      await apiRequest(`/admin/api/v1/channels/${channelId}`, { method: 'PUT', body: JSON.stringify({ enabled }) });
      setOverview((prev) => prev ? { ...prev, channels: prev.channels.map((c) => c.id === channelId ? { ...c, enabled } : c) } : prev);
    } catch { /* ignore */ }
  }

  const tabs = ['overview', 'features', 'channels', 'providers'];

  if (loading) return <Panel title="Tenant Detail"><div className="py-8 text-center text-slate-400">Loading...</div></Panel>;
  if (error) return <Panel title="Tenant Detail"><div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div></Panel>;
  if (!overview) return <Panel title="Tenant Detail"><div className="py-8 text-center text-slate-400">Tenant not found</div></Panel>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => navigate('/tenants')} className="mb-1 text-sm text-blue-600 hover:underline">&larr; Back to Tenants</button>
          <h1 className="text-xl font-semibold">{overview.tenant.name}</h1>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${overview.tenant.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{overview.tenant.status}</span>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`focus-ring rounded-t-md px-4 py-2 text-sm font-medium capitalize ${tab === t ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}>{t}</button>
        ))}
      </div>

      <Panel title={tab.charAt(0).toUpperCase() + tab.slice(1)}>
        {tab === 'overview' && <OverviewSection overview={overview} />}
        {tab === 'features' && isPlatform && <FeaturesSection tenantId={id!} features={overview.features} onToggle={toggleFeature} />}
        {tab === 'channels' && isPlatform && <ChannelsSection tenantId={id!} channels={overview.channels} onToggle={toggleChannel} />}
        {tab === 'providers' && <ProvidersSection tenantId={id!} providers={overview.providers} />}
      </Panel>
    </div>
  );
}
