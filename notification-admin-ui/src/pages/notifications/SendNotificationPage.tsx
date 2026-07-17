import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';
import { SearchSelect } from '../../components/SearchSelect';

type TenantOption = { id: string; name: string; slug: string };
type ContactOption = { id: string; name: string; email: string; phone: string };
type GroupOption = { id: string; name: string };
type TemplateOption = { id: string; template_key: string; channel: string; subject?: string };
type ChannelOption = { channel: string; enabled: boolean };

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
      list<ChannelOption>(`/admin/api/v1/channels?tenant_id=${effectiveTenant}`).then((r) => setAvailableChannels([...new Set(r.data.filter((c) => c.enabled).map((c) => c.channel))])).catch(() => setAvailableChannels([])),
    ]).finally(() => setLoadingTenant(false));
  }, [effectiveTenant]);

  useEffect(() => { setSelectedChannels((current) => current.filter((channel) => availableChannels.includes(channel))); }, [availableChannels]);

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
      <div className="mb-6 border-b border-slate-200 pb-5"><p className="text-sm leading-6 text-slate-600">Compose a transactional notification, select its audience and delivery channels, then send immediately or schedule it for later.</p></div>
      <form onSubmit={submit} className="grid items-start gap-6 xl:grid-cols-2">
        <section className="space-y-4 rounded-lg border border-slate-200 p-5">
          <div><h3 className="font-semibold text-slate-900">Recipient and delivery</h3><p className="mt-1 text-sm text-slate-500">Choose who receives this notification and how it is delivered.</p></div>
        {isPlatform ? (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Tenant</span>
            <SearchSelect value={tenantId} onChange={setTenantId} placeholder="Select tenant" options={tenants.map((t) => ({value:t.id,label:`${t.name} (${t.slug})`}))} />
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
              <SearchSelect value={mode} onChange={(value) => setMode(value as RecipientMode)} options={RECIPIENT_MODES} />
            </label>

            {mode === 'contact' && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Contact</span>
                <SearchSelect value={contactId} onChange={setContactId} placeholder="Select contact" options={contacts.map((c) => ({value:c.id,label:`${c.name} (${c.email || c.phone})`}))} />
              </label>
            )}
            {mode === 'group' && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Group</span>
                <SearchSelect value={groupId} onChange={setGroupId} placeholder="Select group" options={groups.map((g) => ({value:g.id,label:g.name}))} />
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
              <SearchSelect value={templateKey} onChange={setTemplateKey} placeholder="No template (event only)" options={[{value:'',label:'No template (event only)'}, ...templates.map((t) => ({value:t.template_key,label:`${t.subject?.trim() || t.template_key} (${t.channel || 'template'}: ${t.template_key})`}))]} />
            </label>

            <label className="block text-sm">
              <div className="mb-2 flex items-center justify-between"><span className="font-medium">Delivery channels</span><button type="button" disabled={!availableChannels.length} onClick={() => setSelectedChannels(selectedChannels.length === availableChannels.length ? [] : availableChannels)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">{selectedChannels.length === availableChannels.length ? 'Clear all' : 'Select all'}</button></div>
              <div className="grid gap-2 sm:grid-cols-2">
                {availableChannels.map((ch) => (
                  <label key={ch} className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-sm ${selectedChannels.includes(ch) ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white'}`}>
                    <span className="font-medium capitalize">{ch.replace('_',' ')}</span><button type="button" role="switch" aria-checked={selectedChannels.includes(ch)} onClick={() => toggleChannel(ch)} className={`relative h-5 w-9 rounded-full transition ${selectedChannels.includes(ch) ? 'bg-blue-600' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${selectedChannels.includes(ch) ? 'left-[18px]' : 'left-0.5'}`}/></button>
                  </label>
                ))}
                {!availableChannels.length && <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">No globally active channels are enabled for this tenant.</div>}
              </div>
            </label>
          </>
        )}

        </section>
        <section className="space-y-4 rounded-lg border border-slate-200 p-5">
          <div><h3 className="font-semibold text-slate-900">Message and scheduling</h3><p className="mt-1 text-sm text-slate-500">Define the event payload, delivery priority, and timing.</p></div>
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
        </section>
      </form>
    </Panel>
  );
}
