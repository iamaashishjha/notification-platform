import { useEffect, useState } from 'react';
import { apiRequest, listPage } from '../../api/client';
import { Panel } from '../../components/Panel';
import { Button } from '../../components/Button';
import { Modal, ModalButton } from '../../components/Modal';
import { TablePagination } from '../../components/TablePagination';
import { StatusToggle } from '../../components/StatusToggle';
import { FilterToolbar, SearchControl, SelectFilter } from '../../components/ListFilters';
import { Info, Pencil, Plug, Plus, Users, X } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { useAuth } from '../../auth/AuthContext';
import { usePagination } from '../../hooks/usePagination';
import type { PaginationMeta } from '../../types/api';

type ProviderTypeItem = {
  provider: string;
  channel: string;
  description: string;
  tenant_count: number;
  enabled: boolean;
};
type TenantProviderConfig = { id: string; channel: string; provider: string; is_default: boolean; status: string; tenant_name?: string };
type TenantChannel = { id: string; channel: string; enabled: boolean };
type ProviderConfigField = { key: string; label: string; type?: 'text' | 'number' | 'password' | 'textarea' | 'select'; required?: boolean; placeholder?: string; help?: string; options?: string[]; sensitive?: boolean };
type ProviderConfigSchema = { title: string; docs?: string; fields: ProviderConfigField[] };

const DEFAULT_PROVIDER_SCHEMAS: Record<string, ProviderConfigSchema> = {
  mock_email: { title: 'Mock email', fields: [] },
  mock_sms: { title: 'Mock SMS', fields: [] },
  mock_fcm: { title: 'Mock FCM', fields: [] },
  websocket: { title: 'Internal WebSocket', fields: [] },
  in_app: { title: 'In-app inbox', fields: [] },
  database_inbox: { title: 'Database inbox', fields: [] },
  smtp: { title: 'SMTP', docs: 'Uses the platform SMTP adapter.', fields: [
    { key: 'host', label: 'SMTP host', required: true, placeholder: 'smtp.example.com' },
    { key: 'port', label: 'Port', type: 'number', required: true, placeholder: '587' },
    { key: 'username', label: 'Username', placeholder: 'smtp-user' },
    { key: 'password', label: 'Password', type: 'password', sensitive: true },
    { key: 'from', label: 'From address', required: true, placeholder: 'notifications@example.com' },
  ] },
  sendgrid: { title: 'SendGrid', docs: 'SendGrid Mail Send API uses Bearer API-key authentication.', fields: [
    { key: 'api_key', label: 'API key', type: 'password', required: true, sensitive: true, placeholder: 'SG.xxxxx' },
    { key: 'from', label: 'Verified sender email', required: true, placeholder: 'notifications@example.com' },
    { key: 'from_name', label: 'Sender name', placeholder: 'Notifications' },
    { key: 'base_url', label: 'Base URL', placeholder: 'https://api.sendgrid.com' },
  ] },
  mailgun: { title: 'Mailgun', docs: 'Mailgun messages API sends through /v3/{domain_name}/messages using API key credentials.', fields: [
    { key: 'api_key', label: 'API key or domain sending key', type: 'password', required: true, sensitive: true },
    { key: 'domain', label: 'Sending domain', required: true, placeholder: 'mg.example.com' },
    { key: 'region', label: 'Region', type: 'select', options: ['US', 'EU'], required: true },
    { key: 'from', label: 'From address', required: true, placeholder: 'Notifications <notifications@example.com>' },
  ] },
  postmark: { title: 'Postmark', docs: 'Postmark authenticates with X-Postmark-Server-Token.', fields: [
    { key: 'server_token', label: 'Server token', type: 'password', required: true, sensitive: true },
    { key: 'from', label: 'From address', required: true, placeholder: 'sender@example.com' },
    { key: 'message_stream', label: 'Message stream', placeholder: 'outbound' },
  ] },
  brevo: { title: 'Brevo', docs: 'Brevo transactional email uses api-key header and /v3/smtp/email.', fields: [
    { key: 'api_key', label: 'API key', type: 'password', required: true, sensitive: true },
    { key: 'sender_email', label: 'Sender email', required: true, placeholder: 'hello@example.com' },
    { key: 'sender_name', label: 'Sender name', placeholder: 'Notifications' },
    { key: 'template_id', label: 'Default template ID', type: 'number' },
  ] },
  resend: { title: 'Resend', docs: 'Resend send email API uses Bearer API-key authentication.', fields: [
    { key: 'api_key', label: 'API key', type: 'password', required: true, sensitive: true },
    { key: 'from', label: 'From address', required: true, placeholder: 'Acme <onboarding@resend.dev>' },
  ] },
  generic_http_sms: { title: 'Generic HTTP SMS', docs: 'Uses the platform generic HTTP SMS adapter.', fields: [
    { key: 'url', label: 'Endpoint URL', required: true, placeholder: 'https://sms.example.com/send' },
    { key: 'method', label: 'Method', type: 'select', options: ['POST', 'PUT'], required: true },
    { key: 'token', label: 'Token', type: 'password', sensitive: true },
    { key: 'token_header', label: 'Token header', placeholder: 'Authorization' },
    { key: 'phone_key', label: 'Phone field key', placeholder: 'phone' },
    { key: 'message_key', label: 'Message field key', placeholder: 'message' },
    { key: 'timeout_seconds', label: 'Timeout seconds', type: 'number', placeholder: '30' },
    { key: 'body_pattern', label: 'Body pattern JSON', type: 'textarea', placeholder: '{"to":"{{phone}}","message":"{{message}}"}' },
  ] },
  sparrow: { title: 'Sparrow SMS', fields: [
    { key: 'url', label: 'Endpoint URL', required: true, placeholder: 'https://api.sparrowsms.com/v2/sms/' },
    { key: 'token', label: 'Token', type: 'password', required: true, sensitive: true },
    { key: 'from', label: 'Identity / sender', placeholder: 'YourBrand' },
    { key: 'body_pattern', label: 'Body pattern JSON', type: 'textarea', placeholder: '{"token":"YOUR_TOKEN","from":"YourBrand","to":"{{phone}}","text":"{{message}}"}' },
  ] },
  twilio: { title: 'Twilio SMS', docs: 'Twilio Messages API uses Account SID, Auth Token, From, To, and Body.', fields: [
    { key: 'account_sid', label: 'Account SID', required: true, placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    { key: 'auth_token', label: 'Auth token', type: 'password', required: true, sensitive: true },
    { key: 'from', label: 'From number or messaging service SID', required: true, placeholder: '+15551234567' },
    { key: 'status_callback', label: 'Status callback URL', placeholder: 'https://example.com/twilio/status' },
  ] },
  infobip: { title: 'Infobip SMS', docs: 'Infobip SMS API uses base URL, API key, sender, destinations, and text.', fields: [
    { key: 'base_url', label: 'Base URL', required: true, placeholder: 'https://xxxx.api.infobip.com' },
    { key: 'api_key', label: 'API key', type: 'password', required: true, sensitive: true },
    { key: 'from', label: 'Sender', required: true, placeholder: 'CompanyName' },
  ] },
  fcm: { title: 'Firebase Cloud Messaging HTTP v1', docs: 'FCM HTTP v1 uses a Firebase service account JSON or service account path.', fields: [
    { key: 'service_account_json', label: 'Service account JSON', type: 'textarea', sensitive: true, placeholder: '{"type":"service_account","project_id":"..."}' },
    { key: 'service_account_path', label: 'Service account path', placeholder: '/run/secrets/fcm-service-account.json' },
  ] },
  onesignal: { title: 'OneSignal', fields: [
    { key: 'app_id', label: 'App ID', required: true },
    { key: 'rest_api_key', label: 'REST API key', type: 'password', required: true, sensitive: true },
  ] },
  web_push_vapid: { title: 'Web Push VAPID', fields: [
    { key: 'subject', label: 'VAPID subject', required: true, placeholder: 'mailto:admin@example.com' },
    { key: 'public_key', label: 'VAPID public key', required: true },
    { key: 'private_key', label: 'VAPID private key', type: 'password', required: true, sensitive: true },
  ] },
};

export function ProvidersPage() {
  const { can, user } = useAuth();
  const toast = useToast();
  const { confirmDialog, requestConfirm } = useConfirmDialog();
  const isPlatform = user?.is_platform_admin ?? false;
  const [items, setItems] = useState<ProviderTypeItem[]>([]);
  const [tenantConfigs, setTenantConfigs] = useState<TenantProviderConfig[]>([]);
  const [channels, setChannels] = useState<TenantChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [editing, setEditing] = useState<TenantProviderConfig | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ channel: '', provider: '', status: 'active', is_default: false, config_json: '{\n  \n}' });
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [customRows, setCustomRows] = useState<{ key: string; value: string }[]>([{ key: '', value: '' }]);
  const [meta, setMeta] = useState<PaginationMeta>();
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { page, perPage, setPage, setPerPage } = usePagination([search, channelFilter, statusFilter]);

  useEffect(() => {
    setLoading(true);
    if (isPlatform) {
      listPage<ProviderTypeItem>('/admin/api/v1/provider-types', { q: search, filter_channel: channelFilter, filter_enabled: statusFilter, page, per_page: perPage })
        .then((res) => { setItems(res.data); setMeta(res.meta); })
        .catch((err) => toast.error('Unable to load provider catalog', err instanceof Error ? err.message : 'Load failed'))
        .finally(() => setLoading(false));
    } else {
      Promise.all([
        listPage<TenantProviderConfig>('/admin/api/v1/providers', { page, per_page: perPage }),
        listPage<TenantChannel>('/admin/api/v1/channels', { per_page: 100 }),
      ]).then(([providers, channelRes]) => {
        setTenantConfigs(providers.data);
        setMeta(providers.meta);
        setChannels(channelRes.data.filter((item) => item.enabled));
      }).catch((err) => toast.error('Unable to load provider settings', err instanceof Error ? err.message : 'Load failed'))
        .finally(() => setLoading(false));
    }
  }, [toast, isPlatform, search, channelFilter, statusFilter, page, perPage]);

  async function toggle(item: ProviderTypeItem) {
    const enabled = !item.enabled;
    setSaving(item.provider);
    try {
      await apiRequest(`/admin/api/v1/provider-types/${encodeURIComponent(item.provider)}`, { method: 'PUT', body: JSON.stringify({ enabled }) });
      setItems((current) => current.map((provider) => provider.provider === item.provider ? { ...provider, enabled } : provider));
      toast.success(enabled ? 'Provider enabled globally' : 'Provider disabled globally', item.provider.replace(/_/g, ' '));
    } catch (err) {
      toast.error('Unable to update provider', err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving('');
    }
  }

  function openProviderForm(item?: TenantProviderConfig) {
    if (item) {
      setEditing(item);
      setForm({ channel: item.channel, provider: item.provider, status: item.status, is_default: item.is_default, config_json: '' });
      setConfigValues({});
      setCustomRows([{ key: '', value: '' }]);
    } else {
      setEditing(null);
      setForm({ channel: channels[0]?.channel || '', provider: '', status: 'active', is_default: false, config_json: '' });
      setConfigValues({});
      setCustomRows([{ key: '', value: '' }]);
    }
    setShowForm(true);
  }

  async function saveTenantProvider() {
    if (!form.channel || !form.provider) {
      toast.error('Provider and channel are required');
      return;
    }
    const config = providerConfigFromForm(form.provider, configValues, customRows);
    const hasConfig = Object.keys(config).length > 0;
    if (!editing) {
      const missing = missingRequiredProviderFields(form.provider, configValues);
      if (missing.length > 0) {
        toast.error('Missing provider settings', missing.join(', '));
        return;
      }
    }
    setSaving(editing?.id || 'new-provider');
    try {
      const body = JSON.stringify({ channel: form.channel, provider: form.provider, status: form.status, is_default: form.is_default, ...(hasConfig ? { config_json: JSON.stringify(config) } : {}) });
      if (editing) {
        await apiRequest(`/admin/api/v1/providers/${editing.id}`, { method: 'PUT', body });
      } else {
        await apiRequest('/admin/api/v1/providers', { method: 'POST', body });
      }
      toast.success(editing ? 'Provider settings updated' : 'Provider settings created');
      setShowForm(false);
      setEditing(null);
      const providers = await listPage<TenantProviderConfig>('/admin/api/v1/providers', { page, per_page: perPage });
      setTenantConfigs(providers.data);
      setMeta(providers.meta);
    } catch (err) {
      toast.error('Unable to save provider settings', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving('');
    }
  }

  async function setTenantProviderStatus(item: TenantProviderConfig, status: string) {
    setSaving(item.id);
    try {
      await apiRequest(`/admin/api/v1/providers/${item.id}`, { method: 'PUT', body: JSON.stringify({ status }) });
      setTenantConfigs((current) => current.map((provider) => provider.id === item.id ? { ...provider, status } : provider));
      toast.success(status === 'active' ? 'Provider enabled' : 'Provider disabled');
    } catch (err) {
      toast.error('Unable to update provider', err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving('');
    }
  }

  if (!isPlatform) {
    return (
      <>
      <Panel title="Provider Settings" actions={can('providers.create') ? <Button variant="primary" icon={Plus} onClick={() => openProviderForm()}>Add provider</Button> : undefined}>
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <Info className="mt-0.5 shrink-0 text-blue-600" size={18} />
          <div>
            <div className="text-sm font-semibold text-blue-900">Tenant provider settings</div>
            <p className="mt-0.5 text-sm leading-5 text-blue-700">Add provider configs only for channels enabled for your tenant. Existing secrets are never shown again; paste config JSON only when creating or rotating settings.</p>
          </div>
        </div>
        {loading ? <div className="py-8 text-center text-slate-400">Loading...</div> : tenantConfigs.length === 0 ? <div className="py-8 text-center text-slate-400">No provider settings configured</div> : (
          <>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500"><tr><th className="py-2">Provider</th><th>Channel</th><th>Default</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{tenantConfigs.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-3 font-medium">{item.provider}</td>
                <td className="capitalize">{item.channel.replace(/_/g, ' ')}</td>
                <td>{item.is_default ? 'Yes' : 'No'}</td>
                <td><StatusToggle value={item.status === 'active'} disabled={!can('providers.update') || saving === item.id} label={item.status === 'active' ? 'Enabled' : 'Disabled'} onToggle={() => setTenantProviderStatus(item, item.status === 'active' ? 'disabled' : 'active')} /></td>
                <td><Button size="sm" icon={Pencil} onClick={() => openProviderForm(item)} disabled={!can('providers.update')}>Edit</Button></td>
              </tr>
            ))}</tbody>
          </table>
          <TablePagination meta={meta} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={setPerPage} />
          </>
        )}
      </Panel>
      {showForm && <Modal title={editing ? 'Update provider settings' : 'Add provider settings'} description="Config JSON is encrypted at rest and is never returned by read APIs." onClose={() => setShowForm(false)} width="max-w-2xl" footer={<><ModalButton onClick={() => setShowForm(false)}>Cancel</ModalButton><ModalButton variant="primary" disabled={saving !== ''} onClick={saveTenantProvider}>{saving ? 'Saving...' : 'Save provider'}</ModalButton></>}>
        <div className="space-y-4 px-6 py-5">
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Allowed channel</span><select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })} disabled={!!editing} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm">{channels.map((channel) => <option key={channel.id} value={channel.channel}>{channel.channel}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Provider identifier</span><ProviderSelect channel={form.channel} value={form.provider} onChange={(provider) => { setForm({ ...form, provider }); setConfigValues({}); setCustomRows([{ key: '', value: '' }]); }} /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="active">Active</option><option value="disabled">Disabled</option></select></label><label className="flex items-center gap-2 pt-7 text-sm font-medium text-slate-700"><input type="checkbox" checked={form.is_default} onChange={(event) => setForm({ ...form, is_default: event.target.checked })} /> Default for channel</label></div>
          <ProviderConfigEditor provider={form.provider} editing={!!editing} values={configValues} onChange={setConfigValues} customRows={customRows} onCustomRowsChange={setCustomRows} />
        </div>
      </Modal>}
      {confirmDialog}
      </>
    );
  }

  return (
    <Panel title="Provider Type Catalog">
      <div className="mb-5 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <Info className="mt-0.5 shrink-0 text-blue-600" size={18} />
        <div>
          <div className="text-sm font-semibold text-blue-900">Tenant-specific provider configs</div>
          <p className="mt-0.5 text-sm leading-5 text-blue-700">Configure and enable tenant provider instances from Tenants, open the tenant, then use the Providers tab.</p>
        </div>
      </div>
      <p className="mb-4 text-sm text-slate-500">Platform-level provider types available for tenant provider configuration.</p>
      <FilterToolbar>
        <SearchControl id="provider-search" label="Search providers" value={search} onChange={setSearch} placeholder="Provider, channel, or purpose" />
        <SelectFilter id="provider-channel" label="Channel" value={channelFilter} onChange={setChannelFilter}>
          <option value="">All channels</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="fcm">FCM</option>
          <option value="websocket">WebSocket</option>
        </SelectFilter>
        <SelectFilter id="provider-status" label="Status" value={statusFilter} onChange={setStatusFilter}>
          <option value="">All statuses</option>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </SelectFilter>
        {(search || channelFilter || statusFilter) && <Button size="sm" icon={X} onClick={() => { setSearch(''); setChannelFilter(''); setStatusFilter(''); }} className="template-clear-filters">Clear filters</Button>}
      </FilterToolbar>

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No providers found</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Provider type</th><th className="px-4 py-3">Business purpose</th><th className="px-4 py-3">Channel</th><th className="px-4 py-3">Adoption</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={`${item.channel}-${item.provider}`} className="hover:bg-slate-50/70">
                  <td className="px-4 py-4"><div className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Plug size={17} /></span><div><div className="font-semibold capitalize text-slate-900">{item.provider.replace(/_/g, ' ')}</div><code className="mt-1 block text-xs text-slate-400">{item.provider}</code></div></div></td>
                  <td className="max-w-xl px-4 py-4 leading-5 text-slate-600">{item.description || '-'}</td>
                  <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600">{item.channel.replace(/_/g, ' ')}</span></td>
                  <td className="px-4 py-4"><div className="flex items-center gap-2 font-medium text-slate-700"><Users size={15} className="text-slate-400" />{item.tenant_count} tenant{item.tenant_count === 1 ? '' : 's'}</div></td>
                  <td className="px-4 py-4">
                    <StatusToggle
                      value={item.enabled}
                      disabled={!can('providers.update') || saving === item.provider}
                      label={`${item.enabled ? 'Disable' : 'Enable'} ${item.provider}`}
                      onToggle={() => {
                        if (!can('providers.update')) return;
                        requestConfirm({
                          title: `${item.enabled ? 'Disable' : 'Enable'} provider globally`,
                          description: 'Confirm global provider status change',
                          body: <>Change <strong className="text-slate-900">{item.provider.replace(/_/g, ' ')}</strong> for every tenant?</>,
                          confirmLabel: item.enabled ? 'Disable globally' : 'Enable globally',
                          variant: item.enabled ? 'danger' : 'primary',
                          onConfirm: () => toggle(item),
                        });
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && <TablePagination meta={meta} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={setPerPage} />}
      {confirmDialog}
    </Panel>
  );
}

const PROVIDERS_BY_CHANNEL: Record<string, string[]> = {
  email: ['mock_email', 'smtp', 'sendgrid', 'mailgun', 'postmark', 'brevo', 'mailjet', 'sparkpost', 'resend', 'mandrill', 'ses'],
  sms: ['mock_sms', 'generic_http_sms', 'sparrow', 'twilio', 'infobip', 'messagebird', 'vonage', 'plivo', 'telnyx', 'sinch', 'aakash_sms', 'quickconnect', 'bangalink', 'ncell', 'ntc'],
  fcm: ['mock_fcm', 'fcm', 'onesignal', 'expo', 'apns', 'hms_push'],
  websocket: ['websocket', 'pusher', 'ably', 'socketio'],
  in_app: ['in_app', 'database_inbox'],
  web_push: ['web_push_vapid', 'onesignal_web_push'],
  whatsapp: ['whatsapp_cloud', 'twilio_whatsapp', 'messagebird_whatsapp'],
};

function ProviderSelect({ channel, value, onChange }: { channel: string; value: string; onChange: (value: string) => void }) {
  const providers = PROVIDERS_BY_CHANNEL[channel] || Object.keys(DEFAULT_PROVIDER_SCHEMAS);
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
      <option value="">Select provider</option>
      {providers.map((provider) => <option key={provider} value={provider}>{providerLabel(provider)}</option>)}
    </select>
  );
}

function ProviderConfigEditor({
  provider,
  editing,
  values,
  onChange,
  customRows,
  onCustomRowsChange,
}: {
  provider: string;
  editing: boolean;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  customRows: { key: string; value: string }[];
  onCustomRowsChange: (rows: { key: string; value: string }[]) => void;
}) {
  const schema = DEFAULT_PROVIDER_SCHEMAS[provider];
  if (!provider) return <div className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">Select a provider to configure fields.</div>;
  if (!schema) {
    return (
      <div className="space-y-3 rounded-md border border-slate-200 p-4">
        <div><h3 className="text-sm font-semibold text-slate-900">Custom provider fields</h3><p className="mt-1 text-xs text-slate-500">No public schema is configured for this provider yet. Add key/value pairs supplied by the provider documentation.</p></div>
        {customRows.map((row, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
            <input value={row.key} onChange={(event) => onCustomRowsChange(customRows.map((item, i) => i === index ? { ...item, key: event.target.value } : item))} placeholder="config_key" className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <input value={row.value} onChange={(event) => onCustomRowsChange(customRows.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} placeholder="value" className="focus-ring rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <Button size="sm" icon={X} onClick={() => onCustomRowsChange(customRows.filter((_, i) => i !== index))}>Remove</Button>
          </div>
        ))}
        <Button size="sm" icon={Plus} onClick={() => onCustomRowsChange([...customRows, { key: '', value: '' }])}>Add field</Button>
      </div>
    );
  }
  if (schema.fields.length === 0) return <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{schema.title} does not require provider credentials.</div>;
  return (
    <div className="space-y-4 rounded-md border border-slate-200 p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{schema.title} settings</h3>
        {schema.docs && <p className="mt-1 text-xs text-slate-500">{schema.docs}</p>}
        {editing && <p className="mt-1 text-xs text-amber-700">Existing secrets are not shown. Leave secret fields blank unless you are rotating them.</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {schema.fields.map((field) => (
          <label key={field.key} className={field.type === 'textarea' ? 'block sm:col-span-2' : 'block'}>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">{field.label}{field.required && !editing && <span className="text-red-500"> *</span>}</span>
            {field.type === 'textarea' ? (
              <textarea rows={field.sensitive ? 7 : 4} value={values[field.key] || ''} onChange={(event) => onChange({ ...values, [field.key]: event.target.value })} placeholder={field.placeholder} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm" />
            ) : field.type === 'select' ? (
              <select value={values[field.key] || ''} onChange={(event) => onChange({ ...values, [field.key]: event.target.value })} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">Select</option>
                {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
              <input type={field.type || 'text'} value={values[field.key] || ''} onChange={(event) => onChange({ ...values, [field.key]: event.target.value })} placeholder={field.placeholder || (field.sensitive && editing ? 'Leave blank to keep existing value' : '')} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            )}
            {field.help && <span className="mt-1 block text-xs text-slate-500">{field.help}</span>}
          </label>
        ))}
      </div>
    </div>
  );
}

function providerConfigFromForm(provider: string, values: Record<string, string>, customRows: { key: string; value: string }[]) {
  const schema = DEFAULT_PROVIDER_SCHEMAS[provider];
  const out: Record<string, string | number> = {};
  if (schema) {
    for (const field of schema.fields) {
      const value = values[field.key]?.trim();
      if (!value) continue;
      out[field.key] = field.type === 'number' ? Number(value) : value;
    }
    return out;
  }
  for (const row of customRows) {
    const key = row.key.trim();
    if (!key) continue;
    out[key] = row.value;
  }
  return out;
}

function missingRequiredProviderFields(provider: string, values: Record<string, string>) {
  const schema = DEFAULT_PROVIDER_SCHEMAS[provider];
  if (!schema) return [];
  return schema.fields.filter((field) => field.required && !values[field.key]?.trim()).map((field) => field.label);
}

function providerLabel(provider: string) {
  return DEFAULT_PROVIDER_SCHEMAS[provider]?.title || provider.replace(/_/g, ' ');
}
