import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest, getErrorMessage, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal, ModalButton } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { useAuth } from '../../auth/AuthContext';
import { Activity, Bell, CheckCircle2, Eye, FileText, Info, KeyRound, Layers3, LayoutDashboard, Megaphone, Plug, ScrollText, Users, UserRound, XCircle } from 'lucide-react';

type Tenant = { id: string; name: string; slug: string; status: string; created_at: string; updated_at: string };
type Feature = { id: string; identifier: string; feature_key: string; name: string; description: string; category: string; enabled: boolean; created_at: string };
type Channel = { id: string; channel: string; enabled: boolean; direction: string; rate_limit_per_second: number; daily_quota: number; created_at: string };
type Provider = { id: string; channel: string; provider: string; is_default: boolean; status: string; created_at: string };
type Contact = { id: string; name: string; email: string; phone: string; status: string };
type Group = { id: string; name: string; description: string; member_count: number; status: string };
type Template = { id: string; template_key: string; channel: string; subject: string; body?: string; status: string };
type Campaign = { id: string; name: string; status: string; scheduled_at: string; created_at: string };
type ApiKey = { id: string; name: string; status: string; last_used_at: string; created_at: string };
type AuditLog = { id: string; action: string; actor_type: string; resource_type: string; created_at: string };
type PreviewMode = 'text' | 'markdown' | 'html';
type Overview = {
  tenant: Tenant;
  features: Feature[];
  channels: Channel[];
  providers: Provider[];
  counts: { users: number; contacts: number; templates: number; campaigns: number; api_keys: number };
};

function Toggle({ value, onChange, label }: { value: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={value} aria-label={label} onClick={onChange} className={`focus-ring relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${value ? 'bg-blue-600' : 'bg-slate-300'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

function StatusAction({ active, label, onConfirm }: { active: boolean; label: string; onConfirm: () => void }) {
  return (
    <div className="flex shrink-0 items-center">
      <Toggle value={active} label={label} onChange={onConfirm} />
    </div>
  );
}

function EmptyOptions({ icon: Icon, title, message }: { icon: typeof Activity; title: string; message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center">
      <Icon className="mx-auto mb-2 text-slate-300" size={28} />
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="mt-1 text-xs text-slate-400">{message}</p>
    </div>
  );
}

function renderMarkdownLite(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

function OptionCard({
  active,
  icon: Icon,
  title,
  badges,
  description,
  code,
  action,
  footer,
}: {
  active: boolean;
  icon: typeof Activity;
  title: string;
  badges: string[];
  description: string;
  code: string;
  action: ReactNode;
  footer: ReactNode;
}) {
  return (
    <article className={`rounded-lg border p-4 transition-colors ${active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50/70'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-blue-50 text-blue-600' : 'bg-slate-200 text-slate-500'}`}>
            <Icon size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-900">{title}</h3>
              {badges.map((badge) => (
                <span key={badge} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-500">{badge}</span>
              ))}
            </div>
            <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
            <code className="mt-2 block break-all text-xs text-slate-400">{code}</code>
          </div>
        </div>
        {action}
      </div>
      <div className={`mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs font-medium ${active ? 'text-emerald-700' : 'text-slate-500'}`}>
        {footer}
      </div>
    </article>
  );
}

function OverviewSection({ overview }: { overview: Overview }) {
  const t = overview.tenant;
  const enabledFeatures = overview.features.filter((item) => item.enabled).length;
  const enabledChannels = overview.channels.filter((item) => item.enabled).length;
  const activeProviders = overview.providers.filter((item) => item.status === 'active').length;
  const summaryCards = [
    { label: 'Contacts', value: overview.counts.contacts, icon: UserRound, tone: 'blue' },
    { label: 'Campaigns', value: overview.counts.campaigns, icon: Megaphone, tone: 'violet' },
    { label: 'Templates', value: overview.counts.templates, icon: FileText, tone: 'amber' },
    { label: 'API keys', value: overview.counts.api_keys, icon: KeyRound, tone: 'emerald' },
    { label: 'Users', value: overview.counts.users, icon: Users, tone: 'slate' },
  ];
  const healthCards = [
    { label: 'Enabled capabilities', value: `${enabledFeatures}/${overview.features.length}`, icon: Layers3, tone: 'blue' },
    { label: 'Enabled channels', value: `${enabledChannels}/${overview.channels.length}`, icon: Bell, tone: 'emerald' },
    { label: 'Active providers', value: `${activeProviders}/${overview.providers.length}`, icon: Plug, tone: 'amber' },
  ];
  const toneClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    violet: 'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="space-y-5">
      <div className="grid gap-4 text-sm lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4"><span className="text-slate-500">Name</span><p className="mt-1 font-medium">{t.name}</p></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><span className="text-slate-500">Slug</span><p className="mt-1 font-mono font-medium">{t.slug}</p></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><span className="text-slate-500">Status</span><p className="mt-2"><StatusBadge status={t.status}/></p></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4"><span className="text-slate-500">Created</span><p className="mt-1 font-medium">{new Date(t.created_at).toLocaleString()}</p></div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Workspace activity</h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between"><div className="text-sm font-medium text-slate-500">{card.label}</div><span className={`rounded-lg p-2 ${toneClasses[card.tone]}`}><Icon size={16}/></span></div>
                <div className="mt-3 text-2xl font-semibold text-slate-900">{card.value}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Configuration health</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {healthCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between"><div className="text-sm font-medium text-slate-500">{card.label}</div><span className={`rounded-lg p-2 ${toneClasses[card.tone]}`}><Icon size={16}/></span></div>
                <div className="mt-3 text-2xl font-semibold text-slate-900">{card.value}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Channel capacity</h3>
            <p className="text-xs text-slate-500">Configured tenant channel limits</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{enabledChannels} active</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {overview.channels.map((channel) => (
            <div key={channel.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center justify-between"><span className="font-medium capitalize text-slate-800">{channel.channel.replace('_', ' ')}</span><StatusBadge status={channel.enabled}/></div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
                <span>Rate/s <b className="text-slate-800">{channel.rate_limit_per_second}</b></span>
                <span>Daily <b className="text-slate-800">{channel.daily_quota}</b></span>
              </div>
            </div>
          ))}
          {overview.channels.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400 md:col-span-2 xl:col-span-3">No channels configured</div>}
        </div>
      </div>
    </div>
  );
}

function GenericTable({ columns, rows }: { columns: { key: string; label: string }[]; rows: Record<string, any>[] }) {
  if (rows.length === 0) return <p className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">No data</p>;
  const [primaryColumn, ...detailColumns] = columns;
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {rows.map((row, i) => (
        <article key={row.id || i} className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-blue-200 hover:bg-blue-50/20">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{primaryColumn.label}</p>
              <h3 className="mt-1 truncate font-semibold text-slate-900">{row[primaryColumn.key] ?? '-'}</h3>
            </div>
            {row.status !== undefined && <StatusBadge status={row.status} />}
          </div>
          <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
            {detailColumns.map((column) => (
              <div key={column.key}>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{column.label}</dt>
                <dd className="mt-1 break-all text-sm font-medium text-slate-700">
                  {column.key === 'status' || column.key === 'enabled' ? <StatusBadge status={row[column.key]} /> : row[column.key] || '-'}
                </dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
  );
}

function TenantTemplates({ templates, onPreview }: { templates: Template[]; onPreview: (template: Template) => void }) {
  if (templates.length === 0) return <p className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">No templates</p>;
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {templates.map((template) => (
        <article key={template.id} className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-blue-200 hover:bg-blue-50/20">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Template</p>
              <h3 className="mt-1 truncate font-semibold text-slate-900">{template.template_key}</h3>
            </div>
            <StatusBadge status={template.status} />
          </div>
          <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Channel</dt><dd className="mt-1 text-sm font-medium capitalize text-slate-700">{template.channel || '-'}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Subject</dt><dd className="mt-1 truncate text-sm font-medium text-slate-700">{template.subject || '-'}</dd></div>
          </dl>
          <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
            <button type="button" onClick={() => onPreview(template)} className="focus-ring inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-white hover:text-blue-700">
              <Eye size={14} /> Preview
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function TenantTemplatePreview({ template, onClose }: { template: Template; onClose: () => void }) {
  const [mode, setMode] = useState<PreviewMode>('text');
  const body = template.body || '';
  const width: 'max-w-4xl' | 'max-w-2xl' = body.length > 1200 || mode === 'html' ? 'max-w-4xl' : 'max-w-2xl';
  return (
    <Modal title={template.template_key} description="Tenant template preview." onClose={onClose} width={width} footer={<ModalButton onClick={onClose}>Close</ModalButton>}>
      <div className="space-y-4 px-6 py-5">
        <dl className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Channel</dt><dd className="mt-1 text-sm font-medium capitalize text-slate-700">{template.channel || '-'}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Status</dt><dd className="mt-1"><StatusBadge status={template.status} /></dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Mode</dt><dd className="mt-1 text-sm font-medium capitalize text-slate-700">{mode}</dd></div>
        </dl>
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Preview</h3>
              <p className="mt-0.5 text-xs text-slate-500">View this tenant template as text, markdown, or HTML.</p>
            </div>
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
              {(['text', 'markdown', 'html'] as PreviewMode[]).map((item) => (
                <button key={item} type="button" onClick={() => setMode(item)} className={`focus-ring rounded px-3 py-1.5 text-xs font-medium capitalize ${mode === item ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{item}</button>
              ))}
            </div>
          </div>
          <div className="space-y-3 p-4">
            {template.subject && <div className="rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">{template.subject}</div>}
            {mode === 'html' ? (
              <iframe title="Tenant template HTML preview" className="h-72 w-full rounded-md border border-slate-200 bg-white" srcDoc={body || '<p></p>'} />
            ) : mode === 'markdown' ? (
              <div className="min-h-32 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">{renderMarkdownLite(body) || 'No body content'}</div>
            ) : (
              <pre className="min-h-32 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-100">{body || 'No body content'}</pre>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirmDialog, requestConfirm } = useConfirmDialog();
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
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiRequest<{ data: Overview }>(`/admin/api/v1/tenants/${id}/overview`)
      .then((res) => { setOverview(res.data); setError(''); })
      .catch((err) => setError(getErrorMessage(err, 'Unable to load tenant detail')))
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
    } catch (err) {
      toast.error('Unable to load tenant data', getErrorMessage(err));
    }
    finally { setSubLoading(false); }
  }, [toast]);

  useEffect(() => {
    if (!id || tab === 'overview' || tab === 'features' || tab === 'channels' || tab === 'providers') return;
    loadSubData(tab, id);
  }, [id, tab, loadSubData]);

  async function toggleFeature(featureId: string, enabled: boolean) {
    try {
      await apiRequest(`/admin/api/v1/features/${featureId}`, { method: 'PUT', body: JSON.stringify({ enabled }) });
      setOverview((prev) => prev ? { ...prev, features: prev.features.map((f) => f.id === featureId ? { ...f, enabled } : f) } : prev);
      toast.success(enabled ? 'Capability enabled' : 'Capability disabled');
    } catch (err) {
      toast.error('Unable to update capability', getErrorMessage(err));
    }
  }

  async function toggleChannelFn(channelId: string, enabled: boolean) {
    try {
      await apiRequest(`/admin/api/v1/channels/${channelId}`, { method: 'PUT', body: JSON.stringify({ enabled }) });
      setOverview((prev) => prev ? { ...prev, channels: prev.channels.map((c) => c.id === channelId ? { ...c, enabled } : c) } : prev);
      toast.success(enabled ? 'Channel enabled' : 'Channel disabled');
    } catch (err) {
      toast.error('Unable to update channel', getErrorMessage(err));
    }
  }

  async function toggleProviderFn(providerId: string, active: boolean) {
    try {
      await apiRequest(`/admin/api/v1/providers/${providerId}`, { method: 'PUT', body: JSON.stringify({ status: active ? 'active' : 'disabled' }) });
      setOverview((prev) => prev ? { ...prev, providers: prev.providers.map((p) => p.id === providerId ? { ...p, status: active ? 'active' : 'disabled' } : p) } : prev);
      toast.success(active ? 'Provider enabled' : 'Provider disabled');
    } catch (err) {
      toast.error('Unable to update provider', getErrorMessage(err));
    }
  }

  function confirmToggle(kind: string, name: string, active: boolean, onConfirm: () => void) {
    requestConfirm({
      title: `${active ? 'Enable' : 'Disable'} ${kind}`,
      description: 'Confirm status change',
      body: <>Change <strong className="text-slate-900">{name}</strong> to <strong className="text-slate-900">{active ? 'enabled' : 'disabled'}</strong>?</>,
      confirmLabel: active ? 'Enable' : 'Disable',
      variant: active ? 'primary' : 'danger',
      onConfirm,
    });
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
              <OptionCard
                key={f.id}
                active={f.enabled}
                icon={Layers3}
                title={f.name}
                badges={[f.category]}
                description={f.description}
                code={f.identifier || f.feature_key}
                action={<StatusAction active={f.enabled} label={`${f.enabled ? 'Disable' : 'Enable'} ${f.name}`} onConfirm={() => confirmToggle('capability', f.name, !f.enabled, () => toggleFeature(f.id, !f.enabled))} />}
                footer={<>{f.enabled ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{f.enabled ? `Available to ${ov.tenant.name}` : `Not available to ${ov.tenant.name}`}</>}
              />
            ))}
          </div>
          {ov.features.length === 0 && <EmptyOptions icon={Layers3} title="No capabilities assigned" message="This tenant does not have any catalog features configured." />}
        </div>
      );
      case 'channels': return (
        <div>
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <Info className="mt-0.5 shrink-0 text-blue-600" size={18} />
            <div><div className="text-sm font-semibold text-blue-900">Tenant channels</div><p className="mt-0.5 text-sm leading-5 text-blue-700">Enable or disable delivery channels for {ov.tenant.name}. Channel limits remain visible so capacity can be reviewed before enabling.</p></div>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {ov.channels.map((c) => (
              <OptionCard
                key={c.id}
                active={c.enabled}
                icon={Bell}
                title={c.channel.replace(/_/g, ' ')}
                badges={[c.direction]}
                description={`Rate limit ${c.rate_limit_per_second}/s · Daily quota ${c.daily_quota}`}
                code={c.channel}
                action={<StatusAction active={c.enabled} label={`${c.enabled ? 'Disable' : 'Enable'} ${c.channel} channel`} onConfirm={() => confirmToggle('channel', c.channel.replace(/_/g, ' '), !c.enabled, () => toggleChannelFn(c.id, !c.enabled))} />}
                footer={<>{c.enabled ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{c.enabled ? `Available to ${ov.tenant.name}` : `Not available to ${ov.tenant.name}`}</>}
              />
            ))}
          </div>
          {ov.channels.length === 0 && <EmptyOptions icon={Bell} title="No channels configured" message="This tenant does not have any delivery channels configured." />}
        </div>
      );
      case 'providers': {
        const grouped: Record<string, Provider[]> = {};
        for (const p of ov.providers) {
          if (!grouped[p.channel]) grouped[p.channel] = [];
          grouped[p.channel].push(p);
        }
        return (
          <div className="space-y-3">
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <Info className="mt-0.5 shrink-0 text-blue-600" size={18} />
              <div><div className="text-sm font-semibold text-blue-900">Tenant providers</div><p className="mt-0.5 text-sm leading-5 text-blue-700">Review providers grouped by channel and disable tenant-specific provider configs without exposing provider credentials.</p></div>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {Object.entries(grouped).map(([channel, prows]) => (
                <div key={channel} className="space-y-3">
                  <h4 className="text-sm font-semibold capitalize text-slate-600">{channel.replace(/_/g, ' ')}</h4>
                  <div className="grid gap-3">
                    {prows.map((p) => {
                      const active = p.status === 'active';
                      return (
                        <OptionCard
                          key={p.id}
                          active={active}
                          icon={Plug}
                          title={p.provider}
                          badges={[p.channel, ...(p.is_default ? ['default'] : [])]}
                          description={p.is_default ? 'Default provider for this channel.' : 'Configured provider available for this tenant.'}
                          code={p.id}
                          action={<StatusAction active={active} label={`${active ? 'Disable' : 'Enable'} ${p.provider} provider`} onConfirm={() => confirmToggle('provider', p.provider, !active, () => toggleProviderFn(p.id, !active))} />}
                          footer={<>{active ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{active ? 'Provider is active for this tenant' : 'Provider is disabled for this tenant'}</>}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {ov.providers.length === 0 && <EmptyOptions icon={Plug} title="No providers configured" message="This tenant does not have any provider configs yet." />}
          </div>
        );
      }
      case 'contacts': return <GenericTable columns={[{key:'name',label:'Name'},{key:'email',label:'Email'},{key:'phone',label:'Phone'},{key:'status',label:'Status'}]} rows={contacts} />;
      case 'groups': return <GenericTable columns={[{key:'name',label:'Name'},{key:'description',label:'Description'},{key:'member_count',label:'Members'},{key:'status',label:'Status'}]} rows={groups} />;
      case 'templates': return <TenantTemplates templates={templates} onPreview={setPreviewTemplate} />;
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
      {previewTemplate && <TenantTemplatePreview template={previewTemplate} onClose={() => setPreviewTemplate(null)} />}
      {confirmDialog}
    </div>
  );
}
