import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { StatusBadge } from '../../components/StatusBadge';
import { useAuth } from '../../auth/AuthContext';
import { Activity, Bell, CheckCircle2, FileText, Info, KeyRound, Layers3, LayoutDashboard, Megaphone, Plug, ScrollText, Users, UserRound, XCircle } from 'lucide-react';

type Tenant = { id: string; name: string; slug: string; status: string; created_at: string; updated_at: string };
type Feature = { id: string; identifier: string; feature_key: string; name: string; description: string; category: string; enabled: boolean; created_at: string };
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
        <div><span className="text-slate-500">Status</span><p className="mt-1"><StatusBadge status={t.status}/></p></div>
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
            {columns.map((c) => <td key={c.key} className="py-2">{c.key === 'status' || c.key === 'enabled' ? <StatusBadge status={row[c.key]} /> : row[c.key] ?? '-'}</td>)}
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
  const tabMeta: Record<string, { label: string; icon: typeof Activity }> = { overview:{label:'Overview',icon:LayoutDashboard}, features:{label:'Capabilities',icon:Layers3}, channels:{label:'Channels',icon:Bell}, providers:{label:'Providers',icon:Plug}, contacts:{label:'Contacts',icon:UserRound}, groups:{label:'Groups',icon:Users}, templates:{label:'Templates',icon:FileText}, campaigns:{label:'Campaigns',icon:Megaphone}, 'api-keys':{label:'API keys',icon:KeyRound}, audit:{label:'Audit log',icon:ScrollText} };

  if (loading) return <Panel title="Tenant Detail"><div className="py-8 text-center text-slate-400">Loading...</div></Panel>;
  if (error) return <Panel title="Tenant Detail"><div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div></Panel>;
  if (!overview) return <Panel title="Tenant Detail"><div className="py-8 text-center text-slate-400">Tenant not found</div></Panel>;
  const ov = overview;

  function renderTabContent() {
    if (subLoading) return <div className="py-8 text-center text-slate-400">Loading...</div>;
    switch (tab) {
      case 'overview': return <OverviewSection overview={ov} />;
      case 'features': return (
        <div>
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <Info className="mt-0.5 shrink-0 text-blue-600" size={18} />
            <div><div className="text-sm font-semibold text-blue-900">Tenant capabilities</div><p className="mt-0.5 text-sm leading-5 text-blue-700">Turn capabilities on or off for {ov.tenant.name}. Changes take effect immediately and may affect what tenant users can access.</p></div>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {ov.features.map((f) => (
              <article key={f.id} className={`rounded-lg border p-4 transition-colors ${f.enabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50/70'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${f.enabled ? 'bg-blue-50 text-blue-600' : 'bg-slate-200 text-slate-500'}`}><Layers3 size={18} /></span>
                    <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{f.name}</h3><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{f.category}</span></div><p className="mt-1 text-sm leading-5 text-slate-600">{f.description}</p><code className="mt-2 block text-xs text-slate-400">{f.identifier || f.feature_key}</code></div>
                  </div>
                  <Toggle value={f.enabled} onChange={() => toggleFeature(f.id, !f.enabled)} />
                </div>
                <div className={`mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs font-medium ${f.enabled ? 'text-emerald-700' : 'text-slate-500'}`}>{f.enabled ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{f.enabled ? `Available to ${ov.tenant.name}` : `Not available to ${ov.tenant.name}`}</div>
              </article>
            ))}
          </div>
          {ov.features.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center"><Layers3 className="mx-auto mb-2 text-slate-300" size={28} /><p className="text-sm font-medium text-slate-600">No capabilities assigned</p><p className="mt-1 text-xs text-slate-400">This tenant does not have any catalog features configured.</p></div>}
        </div>
      );
      case 'channels': return (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500"><tr><th className="py-2">Channel</th><th>Enabled</th><th>Direction</th><th>Rate/s</th><th>Daily Quota</th><th>Action</th></tr></thead>
          <tbody>
            {ov.channels.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="py-3 font-medium capitalize">{c.channel}</td><td><StatusBadge status={c.enabled}/></td><td>{c.direction}</td><td>{c.rate_limit_per_second}</td><td>{c.daily_quota}</td>
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
                      <tr key={p.id} className="border-b border-slate-100"><td className="py-2">{p.provider}</td><td><StatusBadge status={p.is_default}/></td><td><StatusBadge status={p.status}/></td></tr>
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
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex sm:items-center sm:justify-between">
        <div>
          <button onClick={() => navigate('/tenants')} className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-600 hover:text-blue-700">&larr; Tenant directory</button>
          <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 font-bold text-white">{ov.tenant.name.slice(0,2).toUpperCase()}</span><div><h1 className="text-xl font-semibold">{ov.tenant.name}</h1><p className="text-sm text-slate-500">{ov.tenant.slug} · Tenant administration workspace</p></div></div>
        </div>
        <StatusBadge status={ov.tenant.status}/>
      </div>

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm" aria-label="Tenant sections">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`focus-ring inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-sm font-medium transition ${tab === t ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>{(() => { const Icon = tabMeta[t].icon; return <Icon size={15}/>; })()}{tabMeta[t].label}</button>
        ))}
      </nav>

      <Panel title={tabMeta[tab].label}>
        {renderTabContent()}
      </Panel>
    </div>
  );
}
