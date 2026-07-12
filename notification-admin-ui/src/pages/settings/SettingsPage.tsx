import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { SearchSelect } from '../../components/SearchSelect';
import { useAuth } from '../../auth/AuthContext';
import { Save } from 'lucide-react';

type TenantOption = { id: string; name: string; slug: string };

export function SettingsPage() {
  const { user, can } = useAuth();
  const isPlatform = user?.is_platform_admin ?? false;
  const myTenantId = user?.tenant_id ?? '';
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState(isPlatform ? '' : myTenantId);
  const [timezone, setTimezone] = useState('');
  const [country, setCountry] = useState('');
  const [defaultSender, setDefaultSender] = useState('');
  const [defaultSms, setDefaultSms] = useState('');
  const [brandingLogo, setBrandingLogo] = useState('');
  const [metadata, setMetadata] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isPlatform) {
      list<TenantOption>('/admin/api/v1/tenants').then((res) => {
        setTenants(res.data);
        if (res.data.length && !selectedTenantId) setSelectedTenantId(res.data[0].id);
      }).catch(() => {});
    }
  }, [isPlatform, selectedTenantId]);

  useEffect(() => {
    if (!selectedTenantId) { setLoading(false); return; }
    setLoading(true);
    apiRequest<{ data: Record<string, any> }>(`/admin/api/v1/tenants/${selectedTenantId}/settings`).then((res) => {
      const d = res.data || {};
      setTimezone(d.timezone || '');
      setCountry(d.country || '');
      setDefaultSender(d.default_sender || '');
      setDefaultSms(d.default_sms || '');
      setBrandingLogo(d.branding_logo || '');
      setMetadata(d.metadata ? JSON.stringify(d.metadata, null, 2) : '');
    }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [selectedTenantId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selectedTenantId) return;
    setSaving(true); setError(''); setMessage('');
    const body: Record<string, unknown> = {
      timezone: timezone || null,
      country: country || null,
      default_sender: defaultSender || null,
      default_sms: defaultSms || null,
      branding_logo: brandingLogo || null,
    };
    if (metadata.trim()) {
      try { body.metadata = JSON.parse(metadata); }
      catch { setError('Invalid JSON in metadata'); setSaving(false); return; }
    }
    try {
      await apiRequest(`/admin/api/v1/tenants/${selectedTenantId}/settings`, { method: 'PUT', body: JSON.stringify(body) });
      setMessage('Settings saved');
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  if (!selectedTenantId) return <Panel title="Settings"><div className="py-8 text-center text-slate-400">Select a tenant to manage settings</div></Panel>;

  return (
    <Panel title="Settings" actions={can('settings.update') ? <button onClick={submit} disabled={saving} className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"><Save size={14} />{saving ? 'Saving...' : 'Save'}</button> : undefined}>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      <div className="mb-6 border-b border-slate-200 pb-5">
        <p className="text-sm leading-6 text-slate-600">Configure tenant-wide localization, sender identities, and customer-facing branding. These defaults are applied when a notification does not provide an explicit override.</p>
      </div>

      {isPlatform && (
        <label className="mb-5 block max-w-xl text-sm">
          <span className="mb-1 block font-medium">Tenant</span>
          <SearchSelect value={selectedTenantId} onChange={setSelectedTenantId} placeholder="Select tenant" options={tenants.map((t)=>({value:t.id,label:`${t.name} (${t.slug})`}))}/>
        </label>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading settings...</div>
      ) : (
        <form onSubmit={submit} className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-5">
            <h3 className="text-base font-semibold text-slate-900">Regional settings</h3>
            <p className="mb-4 mt-1 text-sm text-slate-500">Control how dates, times, and regional content are interpreted.</p>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Timezone</span>
                <SearchSelect value={timezone} onChange={setTimezone} placeholder="Default (UTC)" options={['','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Europe/London','Europe/Berlin','Asia/Shanghai','Asia/Tokyo','Asia/Kolkata','Australia/Sydney','Pacific/Auckland'].map((value)=>({value,label:value||'Default (UTC)'}))}/>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Country</span>
                <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="US" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-5">
            <h3 className="text-base font-semibold text-slate-900">Sender identities</h3>
            <p className="mb-4 mt-1 text-sm text-slate-500">Default identities recipients see when messages are delivered.</p>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Default Email Sender</span>
                <input value={defaultSender} onChange={(e) => setDefaultSender(e.target.value)} placeholder="noreply@example.com" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Default SMS Sender</span>
                <input value={defaultSms} onChange={(e) => setDefaultSms(e.target.value)} placeholder="+12025551212" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-5">
            <h3 className="text-base font-semibold text-slate-900">Branding</h3>
            <p className="mb-4 mt-1 text-sm text-slate-500">Apply tenant branding to supported notification experiences.</p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Logo URL</span>
              <input value={brandingLogo} onChange={(e) => setBrandingLogo(e.target.value)} placeholder="https://example.com/logo.png" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
          </div>

          {isPlatform && (
            <div className="rounded-lg border border-slate-200 p-5">
              <h3 className="text-base font-semibold text-slate-900">Advanced metadata</h3>
              <p className="mb-4 mt-1 text-sm text-slate-500">Optional structured configuration for platform integrations.</p>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Custom JSON</span>
                <textarea value={metadata} onChange={(e) => setMetadata(e.target.value)} rows={4} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs" />
              </label>
            </div>
          )}
        </form>
      )}
    </Panel>
  );
}
