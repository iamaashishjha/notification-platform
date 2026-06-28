import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';

type Tenant = { id: string; name: string; slug: string; status: string; created_at: string; updated_at: string };
type Feature = { id: string; feature_key: string; enabled: boolean; created_at: string };
type Channel = { id: string; channel: string; enabled: boolean; direction: string; rate_limit_per_second: number; daily_quota: number; created_at: string };
type Provider = { id: string; channel: string; provider: string; is_default: boolean; status: string; created_at: string };
type Contact = { id: string; name: string; email: string; phone: string; status: string };
type Group = { id: string; name: string; description: string; member_count: number; status: string };
type Template = { id: string; template_key: string; channel: string; subject: string; status: string };
type Campaign = { id: string; name: string; status: string; scheduled_at: string; created_at: string };
type ApiKey = { id: string; name: string; status: string; last_used_at: string; created_at: string };
type AuditLog = { id: string; action: string; actor_type: string; resource_type: string; created_at: string };
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
            <div className="text-2xl font-bold text-blue-700">{val as number}</div>
            <div className="text-xs text-slate-500">{key.replace(/_/g, ' ')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GenericTable({ columns, rows }: { columns: { key: string; label: string }[]; rows: Record<string, any>[] }) {
  if (rows.length === 0) return <p className="py-4 text-center text-sm text-slate-400">No data</p>;
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-slate-200 text-slate-500">
        <tr>{columns.map((c) => <th key={c.key} className="py-2">{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.id || i} className="border-b border-slate-100">
            {columns.map((c) => <td key={c.key} className="py-2">{row[c.key] ?? '-'}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPlatform = user?.is_platform_admin;
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [subLoading, setSubLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiRequest<{ data: Overview }>(`/admin/api/v1/tenants/${id}/overview`)
      .then((res) => { setOverview(res.data); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const loadSubData = useCallback(async (tabName: string, tenantId: string) => {
    setSubLoading(true);
    try {
      switch (tabName) {
        case 'contacts': {
          const res = await list<Contact>(`/admin/api/v1/contacts?tenant_id=${tenantId}`);
          setContacts(res.data.filter((c: any) => c.tenant_id === tenantId));
          break;
        }
        case 'groups': {
          const res = await list<Group>(`/admin/api/v1/groups?tenant_id=${tenantId}`);
          setGroups(res.data.filter((g: any) => g.tenant_id === tenantId));
          break;
        }
        case 'templates': {
          const res = await list<Template>(`/admin/api/v1/templates?tenant_id=${tenantId}`);
          setTemplates(res.data.filter((t: any) => t.tenant_id === tenantId));
          break;
        }
        case 'campaigns': {
          const res = await list<Campaign>(`/admin/api/v1/campaigns?tenant_id=${tenantId}`);
          setCampaigns(res.data.filter((c: any) => c.tenant_id === tenantId));
          break;
        }
        case 'api-keys': {
          const res = await list<ApiKey>(`/admin/api/v1/api-keys`);
          setApiKeys(res.data.filter((k: any) => k.tenant_id === tenantId));
          break;
        }
        case 'audit': {
          const res = await list<AuditLog>(`/admin/api/v1/audit-logs`);
          setAuditLogs(res.data.filter((a: any) => a.tenant_id === tenantId || !a.tenant_id));
          break;
        }
      }
    } catch { /* ignore */ }
    finally { setSubLoading(false); }
  }, []);

  useEffect(() => {
    if (!id || tab === 'overview' || tab === 'features' || tab === 'channels' || tab === 'providers') return;
    loadSubData(tab, id);
  }, [id, tab, loadSubData]);

  async function toggleFeature(featureId: string, enabled: boolean) {
    try {
      await apiRequest(`/admin/api/v1/features/${featureId}`, { method: 'PUT', body: JSON.stringify({ enabled }) });
      setOverview((prev) => prev ? { ...prev, features: prev.features.map((f) => f.id === featureId ? { ...f, enabled } : f) } : prev);
    } catch { /* ignore */ }
  }

  async function toggleChannelFn(channelId: string, enabled: boolean) {
    try {
      await apiRequest(`/admin/api/v1/channels/${channelId}`, { method: 'PUT', body: JSON.stringify({ enabled }) });
      setOverview((prev) => prev ? { ...prev, channels: prev.channels.map((c) => c.id === channelId ? { ...c, enabled } : c) } : prev);
    } catch { /* ignore */ }
  }

  const tabs = ['overview', isPlatform && 'features', isPlatform && 'channels', isPlatform && 'providers', 'contacts', 'groups', 'templates', 'campaigns', 'api-keys', 'audit'].filter(Boolean) as string[];

  if (loading) return <Panel title="Tenant Detail"><div className="py-8 text-center text-slate-400">Loading...</div></Panel>;
  if (error) return <Panel title="Tenant Detail"><div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div></Panel>;
  if (!overview) return <Panel title="Tenant Detail"><div className="py-8 text-center text-slate-400">Tenant not found</div></Panel>;
  const ov = overview;

  function renderTabContent() {
    if (subLoading) return <div className="py-8 text-center text-slate-400">Loading...</div>;
    switch (tab) {
      case 'overview': return <OverviewSection overview={ov} />;
      case 'features': return (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500"><tr><th className="py-2">Feature</th><th>Enabled</th><th>Action</th></tr></thead>
          <tbody>
            {ov.features.map((f) => (
              <tr key={f.id} className="border-b border-slate-100"><td className="py-3 font-medium">{f.feature_key}</td><td>{f.enabled ? 'Yes' : 'No'}</td><td><Toggle value={f.enabled} onChange={() => toggleFeature(f.id, !f.enabled)} /></td></tr>
            ))}
            {ov.features.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-400">No features configured</td></tr>}
          </tbody>
        </table>
      );
      case 'channels': return (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500"><tr><th className="py-2">Channel</th><th>Enabled</th><th>Direction</th><th>Rate/s</th><th>Daily Quota</th><th>Action</th></tr></thead>
          <tbody>
            {ov.channels.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="py-3 font-medium capitalize">{c.channel}</td><td>{c.enabled ? 'Yes' : 'No'}</td><td>{c.direction}</td><td>{c.rate_limit_per_second}</td><td>{c.daily_quota}</td>
                <td><Toggle value={c.enabled} onChange={() => toggleChannelFn(c.id, !c.enabled)} /></td>
              </tr>
            ))}
            {ov.channels.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-slate-400">No channels configured</td></tr>}
          </tbody>
        </table>
      );
      case 'providers': {
        const grouped: Record<string, Provider[]> = {};
        for (const p of ov.providers) {
          if (!grouped[p.channel]) grouped[p.channel] = [];
          grouped[p.channel].push(p);
        }
        return (
          <div className="space-y-3">
            {Object.entries(grouped).map(([channel, prows]) => (
              <div key={channel}>
                <h4 className="mb-1 text-sm font-semibold text-slate-600 capitalize">{channel}</h4>
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
            {ov.providers.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No providers configured</p>}
          </div>
        );
      }
      case 'contacts': return <GenericTable columns={[{key:'name',label:'Name'},{key:'email',label:'Email'},{key:'phone',label:'Phone'},{key:'status',label:'Status'}]} rows={contacts} />;
      case 'groups': return <GenericTable columns={[{key:'name',label:'Name'},{key:'description',label:'Description'},{key:'member_count',label:'Members'},{key:'status',label:'Status'}]} rows={groups} />;
      case 'templates': return <GenericTable columns={[{key:'template_key',label:'Key'},{key:'channel',label:'Channel'},{key:'subject',label:'Subject'},{key:'status',label:'Status'}]} rows={templates} />;
      case 'campaigns': return <GenericTable columns={[{key:'name',label:'Name'},{key:'status',label:'Status'},{key:'scheduled_at',label:'Scheduled'},{key:'created_at',label:'Created'}]} rows={campaigns} />;
      case 'api-keys': return <GenericTable columns={[{key:'name',label:'Name'},{key:'status',label:'Status'},{key:'last_used_at',label:'Last Used'},{key:'created_at',label:'Created'}]} rows={apiKeys} />;
      case 'audit': return <GenericTable columns={[{key:'action',label:'Action'},{key:'actor_type',label:'Actor'},{key:'resource_type',label:'Resource'},{key:'created_at',label:'Time'}]} rows={auditLogs} />;
      default: return null;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => navigate('/tenants')} className="mb-1 text-sm text-blue-600 hover:underline">&larr; Back to Tenants</button>
          <h1 className="text-xl font-semibold">{ov.tenant.name}</h1>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ov.tenant.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{ov.tenant.status}</span>
      </div>

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`focus-ring whitespace-nowrap rounded-t-md px-4 py-2 text-sm font-medium capitalize ${tab === t ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}>{t.replace(/-/g, ' ')}</button>
        ))}
      </div>

      <Panel title={tab.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}>
        {renderTabContent()}
      </Panel>
    </div>
  );
}
