import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';

type TenantOption = { id: string; name: string; slug: string };
type ContactOption = { id: string; name: string; email: string; phone: string };
type GroupOption = { id: string; name: string };
type TemplateOption = { id: string; template_key: string; name: string };
type ChannelOption = { channel: string };

type RecipientMode = 'contact' | 'group' | 'direct_email' | 'direct_phone' | 'fcm_token' | 'fcm_topic' | 'websocket_user' | 'in_app_user';

const RECIPIENT_MODES: { value: RecipientMode; label: string }[] = [
  { value: 'contact', label: 'Contact' },
  { value: 'group', label: 'Contact Group' },
  { value: 'direct_email', label: 'Direct Email' },
  { value: 'direct_phone', label: 'Direct Phone/SMS' },
  { value: 'fcm_token', label: 'FCM Token' },
  { value: 'fcm_topic', label: 'FCM Topic' },
  { value: 'websocket_user', label: 'WebSocket User' },
  { value: 'in_app_user', label: 'In-App User' },
];

export function SendNotificationPage() {
  const { user, can } = useAuth();
  const isPlatform = user?.is_platform_admin ?? false;
  const myTenantId = user?.tenant_id ?? '';
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState(isPlatform ? '' : myTenantId);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [availableChannels, setAvailableChannels] = useState<string[]>([]);
  const [mode, setMode] = useState<RecipientMode>('direct_email');
  const [recipientValue, setRecipientValue] = useState('');
  const [contactId, setContactId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [event, setEvent] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['email']);
  const [templateKey, setTemplateKey] = useState('');
  const [payload, setPayload] = useState('{\n  \n}');
  const [priority, setPriority] = useState(5);
  const [sendAt, setSendAt] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingTenant, setLoadingTenant] = useState(false);

  useEffect(() => {
    if (isPlatform) {
      list<TenantOption>('/admin/api/v1/tenants').then((res) => {
        setTenants(res.data);
        if (res.data.length && !tenantId) setTenantId(res.data[0].id);
      }).catch(() => {});
    }
  }, [isPlatform, tenantId]);

  const effectiveTenant = tenantId || myTenantId;

  useEffect(() => {
    if (!effectiveTenant) return;
    setLoadingTenant(true);
    Promise.all([
      list<ContactOption>(`/admin/api/v1/contacts?tenant_id=${effectiveTenant}`).then((r) => setContacts(r.data)).catch(() => {}),
      list<GroupOption>(`/admin/api/v1/groups?tenant_id=${effectiveTenant}`).then((r) => setGroups(r.data)).catch(() => {}),
      list<TemplateOption>(`/admin/api/v1/templates?tenant_id=${effectiveTenant}`).then((r) => setTemplates(r.data)).catch(() => {}),
      list<ChannelOption>(`/admin/api/v1/channels?tenant_id=${effectiveTenant}`).then((r) => setAvailableChannels([...new Set(r.data.map((c: any) => c.channel))])).catch(() => setAvailableChannels(['email', 'sms', 'fcm', 'websocket'])),
    ]).finally(() => setLoadingTenant(false));
  }, [effectiveTenant]);

  function toggleChannel(ch: string) {
    setSelectedChannels((prev) => prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]);
  }

  function buildTarget() {
    switch (mode) {
      case 'contact': {
        const c = contacts.find((x) => x.id === contactId);
        return { type: 'contact', id: contactId, recipient: { email: c?.email || '', phone: c?.phone || '' } };
      }
      case 'group':
        return { type: 'group', id: groupId, recipient: {} };
      case 'direct_email':
        return { type: 'direct_email', recipient: { email: recipientValue } };
      case 'direct_phone':
        return { type: 'direct_phone', recipient: { phone: recipientValue } };
      case 'fcm_token':
        return { type: 'fcm_token', recipient: { fcm_token: recipientValue } };
      case 'fcm_topic':
        return { type: 'fcm_topic', recipient: { fcm_topic: recipientValue } };
      case 'websocket_user':
        return { type: 'websocket_user', recipient: { external_user_id: recipientValue } };
      case 'in_app_user':
        return { type: 'in_app_user', recipient: { external_user_id: recipientValue } };
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true); setError(''); setResult('');
    if (!event.trim()) { setError('Event is required'); setSending(false); return; }
    if (selectedChannels.length === 0) { setError('At least one channel must be selected'); setSending(false); return; }
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(payload); } catch { setError('Invalid JSON in payload'); setSending(false); return; }
    const body: Record<string, unknown> = {
      event,
      channels: selectedChannels,
      template: templateKey,
      target: buildTarget(),
      data: parsed,
      priority,
    };
    if (sendAt.trim()) {
      body.schedule = { type: 'scheduled', send_at: sendAt };
    }
    if (isPlatform) body.tenant_id = tenantId;
    try {
      const res = await apiRequest<{ notification_id: string }>('/admin/api/v1/notifications/send', {
        method: 'POST', body: JSON.stringify(body),
      });
      setResult(res.notification_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally { setSending(false); }
  }

  return (
    <Panel title="Send Notification">
      <form onSubmit={submit} className="max-w-2xl space-y-4">
        {isPlatform ? (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Tenant</span>
            <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="">-- Select Tenant --</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>)}
            </select>
          </label>
        ) : (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Sending as tenant: <strong>{myTenantId}</strong>
          </div>
        )}

        {loadingTenant && <div className="text-sm text-slate-400">Loading tenant data...</div>}

        {effectiveTenant && !loadingTenant && (
          <>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Recipient Mode</span>
              <select value={mode} onChange={(e) => setMode(e.target.value as RecipientMode)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2">
                {RECIPIENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>

            {mode === 'contact' && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Contact</span>
                <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2">
                  <option value="">-- Select Contact --</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.email || c.phone})</option>)}
                </select>
              </label>
            )}
            {mode === 'group' && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Group</span>
                <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2">
                  <option value="">-- Select Group --</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
            )}
            {mode !== 'contact' && mode !== 'group' && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{mode === 'direct_email' ? 'Email Address' : mode === 'direct_phone' ? 'Phone Number' : mode === 'fcm_token' ? 'FCM Token' : mode === 'fcm_topic' ? 'FCM Topic' : mode === 'websocket_user' ? 'WebSocket User ID' : 'In-App User ID'}</span>
                <input value={recipientValue} onChange={(e) => setRecipientValue(e.target.value)} placeholder={mode === 'direct_email' ? 'user@example.com' : mode === 'direct_phone' ? '+12025551212' : mode === 'fcm_topic' ? 'global_alerts' : 'user_id'} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" />
              </label>
            )}

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Template</span>
              <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2">
                <option value="">-- None (event-only) --</option>
                {templates.map((t) => <option key={t.id} value={t.template_key}>{t.name} ({t.template_key})</option>)}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Channels</span>
              <div className="flex flex-wrap gap-3">
                {availableChannels.map((ch) => (
                  <label key={ch} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={selectedChannels.includes(ch)} onChange={() => toggleChannel(ch)} className="rounded border-slate-300" />
                    <span className="capitalize">{ch}</span>
                  </label>
                ))}
              </div>
            </label>
          </>
        )}

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Event</span>
          <input value={event} onChange={(e) => setEvent(e.target.value)} placeholder="e.g. order.confirmed" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" required />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Payload JSON</span>
          <textarea value={payload} onChange={(e) => setPayload(e.target.value)} rows={4} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Priority (1-10)</span>
          <input type="number" min={1} max={10} value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Schedule (optional)</span>
          <input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>

        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {result && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">Queued as {result}</div>}

        {can('notifications.send') && (
          <button disabled={sending} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {sending ? 'Sending...' : 'Queue Notification'}
          </button>
        )}
      </form>
    </Panel>
  );
}
