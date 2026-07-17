import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';
import { SearchSelect } from '../../components/SearchSelect';
import { Button } from '../../components/Button';
import { AlertTriangle, CalendarClock, CheckSquare, Eye, Mail, MessageSquare, Pencil, Send, Settings2, Smartphone, XSquare } from 'lucide-react';
import { useToast } from '../../components/Toast';

type TenantOption = { id: string; name: string; slug: string };
type ContactOption = { id: string; name: string; email: string; phone: string };
type GroupOption = { id: string; name: string };
type TemplateOption = { id: string; template_key: string; channel: string; subject?: string; body?: string };
type ChannelOption = { channel: string; enabled: boolean };
type PreviewMode = 'text' | 'markdown' | 'html';
type FieldErrors = Record<string, string>;
type ChannelOptions = {
  email: { from_name: string; from_email: string; reply_to: string; preheader: string };
  sms: { sender_id: string; unicode: boolean; callback_url: string };
  fcm: { title: string; image_url: string; click_action: string; collapse_key: string };
  websocket: { event_name: string; room: string };
  in_app: { title: string; category: string; expires_at: string };
};

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

function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => values[key] || `{{${key}}}`);
}

function renderMarkdownLite(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

function smsStats(value: string, unicode: boolean) {
  const single = unicode ? 70 : 160;
  const multipart = unicode ? 67 : 153;
  const length = value.length;
  return { length, segments: length <= single ? 1 : Math.ceil(length / multipart), limit: length <= single ? single : multipart };
}

const emptyChannelOptions: ChannelOptions = {
  email: { from_name: '', from_email: '', reply_to: '', preheader: '' },
  sms: { sender_id: '', unicode: false, callback_url: '' },
  fcm: { title: '', image_url: '', click_action: '', collapse_key: '' },
  websocket: { event_name: '', room: '' },
  in_app: { title: '', category: '', expires_at: '' },
};

export function SendNotificationPage() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
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
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const [previewMode, setPreviewMode] = useState<PreviewMode>('text');
  const [priority, setPriority] = useState(5);
  const [sendAt, setSendAt] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [channelOptions, setChannelOptions] = useState<ChannelOptions>(emptyChannelOptions);
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

  const selectedTemplate = useMemo(() => templates.find((template) => template.template_key === templateKey), [templates, templateKey]);
  const templateVariables = useMemo(() => {
    const source = `${selectedTemplate?.subject || ''}\n${selectedTemplate?.body || ''}`;
    return [...new Set(Array.from(source.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)).map((match) => match[1]))];
  }, [selectedTemplate]);
  const renderedSubject = renderTemplate(selectedTemplate?.subject || '', templateValues);
  const renderedBody = renderTemplate(selectedTemplate?.body || '', templateValues);
  const activeChannelOptions = useMemo(() => {
    const options: Record<string, unknown> = {};
    if (selectedChannels.includes('email')) options.email = channelOptions.email;
    if (selectedChannels.includes('sms')) options.sms = channelOptions.sms;
    if (selectedChannels.includes('fcm')) options.fcm = channelOptions.fcm;
    if (selectedChannels.includes('websocket')) options.websocket = channelOptions.websocket;
    if (selectedChannels.includes('in_app')) options.in_app = channelOptions.in_app;
    return options;
  }, [selectedChannels, channelOptions]);
  const smsSummary = smsStats(renderedBody, channelOptions.sms.unicode);

  useEffect(() => {
    setTemplateValues((current) => {
      const next: Record<string, string> = {};
      for (const key of templateVariables) next[key] = current[key] || '';
      return next;
    });
  }, [templateVariables]);

  useEffect(() => {
    if (selectedTemplate?.channel && availableChannels.includes(selectedTemplate.channel)) {
      setSelectedChannels((current) => current.includes(selectedTemplate.channel) ? current : [...current, selectedTemplate.channel]);
    }
    if (selectedTemplate && !event) setEvent(selectedTemplate.template_key);
  }, [selectedTemplate, availableChannels, event]);

  function toggleChannel(ch: string) {
    setSelectedChannels((prev) => prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]);
  }

  function clearFieldError(name: string) {
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function validateForm() {
    const next: FieldErrors = {};
    if (isPlatform && !tenantId) next.tenant = 'Select a tenant before sending.';
    if (!event.trim()) next.event = 'Event is required.';
    if (selectedChannels.length === 0) next.channels = 'Select at least one delivery channel.';
    if (mode === 'contact' && !contactId) next.recipient = 'Select a contact.';
    if (mode === 'group' && !groupId) next.recipient = 'Select a group.';
    if (mode !== 'contact' && mode !== 'group' && !recipientValue.trim()) next.recipient = 'Enter a recipient value.';
    if (!selectedTemplate) next.template = 'Select a template to preview and send client-ready content.';
    for (const key of templateVariables) {
      if (!templateValues[key]?.trim()) next[`var.${key}`] = `${key} is required.`;
    }
    if (selectedChannels.includes('email') && channelOptions.email.from_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(channelOptions.email.from_email)) next.email_from = 'Enter a valid sender email.';
    if (selectedChannels.includes('email') && channelOptions.email.reply_to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(channelOptions.email.reply_to)) next.email_reply = 'Enter a valid reply-to email.';
    if (selectedChannels.includes('sms') && channelOptions.sms.sender_id.length > 11) next.sms_sender = 'Sender ID should be 11 characters or fewer.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
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
    setError('');
    if (!validateForm()) return;
    setSending(true);
    const body: Record<string, unknown> = {
      event,
      channels: selectedChannels,
      template: templateKey,
      target: buildTarget(),
      data: { ...templateValues, channel_options: activeChannelOptions },
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
      toast.success('Notification queued', res.notification_id);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.status === 422)) setError(err.detail);
      else toast.error('Unable to queue notification', err instanceof Error ? err.message : 'Send failed');
    } finally { setSending(false); }
  }

  return (
    <Panel title="Send Notification">
      <div className="mb-6 grid gap-4 border-b border-slate-200 pb-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-400">Operations console</p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Compose a governed transactional notification with tenant context, channel overrides, template preview, and delivery controls.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-center text-xs">
          <div className="rounded bg-white px-3 py-2"><div className="font-semibold text-slate-900">{selectedChannels.length}</div><div className="text-slate-500">Channels</div></div>
          <div className="rounded bg-white px-3 py-2"><div className="font-semibold text-slate-900">{templateVariables.length}</div><div className="text-slate-500">Variables</div></div>
          <div className="rounded bg-white px-3 py-2"><div className="font-semibold text-slate-900">{priority}</div><div className="text-slate-500">Priority</div></div>
        </div>
      </div>
      <form onSubmit={submit} className="grid items-start gap-6 xl:grid-cols-[minmax(360px,0.9fr)_minmax(520px,1.1fr)]">
        <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-start gap-3"><span className="rounded-lg bg-blue-50 p-2 text-blue-600"><Settings2 size={18}/></span><div><h3 className="font-semibold text-slate-900">Audience and routing</h3><p className="mt-1 text-sm text-slate-500">Choose the tenant, recipient, template, and delivery channels.</p></div></div>
        {isPlatform ? (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Tenant</span>
            <SearchSelect value={tenantId} onChange={(value) => { setTenantId(value); clearFieldError('tenant'); }} placeholder="Select tenant" options={tenants.map((t) => ({value:t.id,label:`${t.name} (${t.slug})`}))} />
            {fieldErrors.tenant && <span className="mt-1 block text-xs text-red-600">{fieldErrors.tenant}</span>}
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
              <SearchSelect value={mode} onChange={(value) => { setMode(value as RecipientMode); clearFieldError('recipient'); }} options={RECIPIENT_MODES} />
            </label>

            {mode === 'contact' && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Contact</span>
                <SearchSelect value={contactId} onChange={(value) => { setContactId(value); clearFieldError('recipient'); }} placeholder="Select contact" options={contacts.map((c) => ({value:c.id,label:`${c.name} (${c.email || c.phone})`}))} />
                {fieldErrors.recipient && <span className="mt-1 block text-xs text-red-600">{fieldErrors.recipient}</span>}
              </label>
            )}
            {mode === 'group' && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Group</span>
                <SearchSelect value={groupId} onChange={(value) => { setGroupId(value); clearFieldError('recipient'); }} placeholder="Select group" options={groups.map((g) => ({value:g.id,label:g.name}))} />
                {fieldErrors.recipient && <span className="mt-1 block text-xs text-red-600">{fieldErrors.recipient}</span>}
              </label>
            )}
            {mode !== 'contact' && mode !== 'group' && (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{mode === 'direct_email' ? 'Email Address' : mode === 'direct_phone' ? 'Phone Number' : mode === 'fcm_token' ? 'FCM Token' : mode === 'fcm_topic' ? 'FCM Topic' : mode === 'websocket_user' ? 'WebSocket User ID' : 'In-App User ID'}</span>
                <input value={recipientValue} onChange={(e) => { setRecipientValue(e.target.value); clearFieldError('recipient'); }} placeholder={mode === 'direct_email' ? 'user@example.com' : mode === 'direct_phone' ? '+12025551212' : mode === 'fcm_topic' ? 'global_alerts' : 'user_id'} className={`focus-ring w-full rounded-md border px-3 py-2 ${fieldErrors.recipient ? 'border-red-300' : 'border-slate-300'}`} />
                {fieldErrors.recipient && <span className="mt-1 block text-xs text-red-600">{fieldErrors.recipient}</span>}
              </label>
            )}

            <div className="space-y-2">
              <label className="block text-sm">
              <span className="mb-1 block font-medium">Template</span>
              <SearchSelect value={templateKey} onChange={(value) => { setTemplateKey(value); clearFieldError('template'); }} placeholder="No template (event only)" options={[{value:'',label:'No template (event only)'}, ...templates.map((t) => ({value:t.template_key,label:`${t.subject?.trim() || t.template_key} (${t.channel || 'template'}: ${t.template_key})`}))]} />
              {fieldErrors.template && <span className="mt-1 block text-xs text-red-600">{fieldErrors.template}</span>}
              </label>
              {selectedTemplate && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" icon={Pencil} onClick={() => navigate('/templates')}>Edit template</Button>
                  <Button type="button" size="sm" icon={Eye} onClick={() => document.getElementById('template-preview-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Preview</Button>
                </div>
              )}
            </div>

            <label className="block text-sm">
              <div className="mb-2 flex items-center justify-between"><span className="font-medium">Delivery channels</span><Button type="button" size="sm" variant="ghost" disabled={!availableChannels.length} onClick={() => setSelectedChannels(selectedChannels.length === availableChannels.length ? [] : availableChannels)} icon={selectedChannels.length === availableChannels.length ? XSquare : CheckSquare}>{selectedChannels.length === availableChannels.length ? 'Clear all' : 'Select all'}</Button></div>
              <div className="grid gap-2 sm:grid-cols-2">
                {availableChannels.map((ch) => (
                  <label key={ch} className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-sm ${selectedChannels.includes(ch) ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white'}`}>
                    <span className="font-medium capitalize">{ch.replace('_',' ')}</span><button type="button" role="switch" aria-checked={selectedChannels.includes(ch)} onClick={() => { toggleChannel(ch); clearFieldError('channels'); }} className={`relative h-5 w-9 rounded-full transition ${selectedChannels.includes(ch) ? 'bg-blue-600' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${selectedChannels.includes(ch) ? 'left-[18px]' : 'left-0.5'}`}/></button>
                  </label>
                ))}
                {!availableChannels.length && <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">No globally active channels are enabled for this tenant.</div>}
              </div>
              {fieldErrors.channels && <span className="mt-2 block text-xs text-red-600">{fieldErrors.channels}</span>}
            </label>
            <ChannelConfiguration selectedChannels={selectedChannels} options={channelOptions} onChange={setChannelOptions} errors={fieldErrors} smsSummary={smsSummary} />
          </>
        )}

        </section>
        <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-start gap-3"><span className="rounded-lg bg-emerald-50 p-2 text-emerald-600"><Mail size={18}/></span><div><h3 className="font-semibold text-slate-900">Message and controls</h3><p className="mt-1 text-sm text-slate-500">Configure content variables, channel overrides, preview, and delivery timing.</p></div></div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Event</span>
          <input value={event} onChange={(e) => { setEvent(e.target.value); clearFieldError('event'); }} placeholder="e.g. order.confirmed" className={`focus-ring w-full rounded-md border px-3 py-2 ${fieldErrors.event ? 'border-red-300' : 'border-slate-300'}`} />
          {fieldErrors.event && <span className="mt-1 block text-xs text-red-600">{fieldErrors.event}</span>}
        </label>

        {selectedTemplate ? (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Template variables</h4>
              <p className="mt-1 text-sm text-slate-500">Enter values for the selected template. The preview updates immediately.</p>
            </div>
            {templateVariables.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">This template has no variables.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {templateVariables.map((key) => (
                  <label key={key} className="block text-sm">
                    <span className="mb-1 block font-medium">{key}</span>
                    <input value={templateValues[key] || ''} onChange={(e) => { setTemplateValues((current) => ({ ...current, [key]: e.target.value })); clearFieldError(`var.${key}`); }} className={`focus-ring w-full rounded-md border px-3 py-2 ${fieldErrors[`var.${key}`] ? 'border-red-300' : 'border-slate-300'}`} />
                    {fieldErrors[`var.${key}`] && <span className="mt-1 block text-xs text-red-600">{fieldErrors[`var.${key}`]}</span>}
                  </label>
                ))}
              </div>
            )}
            <div id="template-preview-panel" className="rounded-lg border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Template preview</h4>
                  <p className="mt-0.5 text-xs text-slate-500">{selectedTemplate.template_key}</p>
                </div>
                <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
                  {(['text', 'markdown', 'html'] as PreviewMode[]).map((mode) => (
                    <button key={mode} type="button" onClick={() => setPreviewMode(mode)} className={`focus-ring rounded px-3 py-1.5 text-xs font-medium capitalize ${previewMode === mode ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{mode}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-3 p-4">
                {renderedSubject && <div className="rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">{renderedSubject}</div>}
                {previewMode === 'html' ? (
                  <iframe title="Template HTML preview" className="h-56 w-full rounded-md border border-slate-200 bg-white" srcDoc={renderedBody || '<p></p>'} />
                ) : previewMode === 'markdown' ? (
                  <div className="min-h-32 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">{renderMarkdownLite(renderedBody) || 'No body content'}</div>
                ) : (
                  <pre className="min-h-32 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-100">{renderedBody || 'No body content'}</pre>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">Select a template to enter variables and preview the message.</div>
        )}
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Priority (1-10)</span>
          <input type="number" min={1} max={10} value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 flex items-center gap-1 font-medium"><CalendarClock size={14}/> Schedule (optional)</span>
          <input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>

        {error && <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertTriangle className="mt-0.5 shrink-0" size={15}/>{error}</div>}

        {can('notifications.send') && (
          <Button disabled={sending} variant="primary" icon={Send}>
            {sending ? 'Sending...' : 'Queue Notification'}
          </Button>
        )}
        </section>
      </form>
    </Panel>
  );
}

function ChannelConfiguration({ selectedChannels, options, onChange, errors, smsSummary }: { selectedChannels: string[]; options: ChannelOptions; onChange: (value: ChannelOptions) => void; errors: FieldErrors; smsSummary: { length: number; segments: number; limit: number } }) {
  const update = <K extends keyof ChannelOptions>(channel: K, patch: Partial<ChannelOptions[K]>) => onChange({ ...options, [channel]: { ...options[channel], ...patch } });
  if (!selectedChannels.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-4 flex items-start gap-2">
        <Settings2 className="mt-0.5 text-slate-500" size={16} />
        <div><h4 className="text-sm font-semibold text-slate-900">Channel configuration</h4><p className="mt-0.5 text-xs text-slate-500">Optional per-send overrides. Provider defaults remain unchanged.</p></div>
      </div>
      <div className="space-y-4">
        {selectedChannels.includes('email') && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h5 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><Mail size={15}/> Email headers</h5>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm"><span className="mb-1 block font-medium">From name</span><input value={options.email.from_name} onChange={(e)=>update('email',{from_name:e.target.value})} placeholder="Acme Notifications" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2"/></label>
              <label className="text-sm"><span className="mb-1 block font-medium">From email</span><input value={options.email.from_email} onChange={(e)=>update('email',{from_email:e.target.value})} placeholder="notifications@acme.com" className={`focus-ring w-full rounded-md border px-3 py-2 ${errors.email_from ? 'border-red-300' : 'border-slate-300'}`}/>{errors.email_from && <span className="mt-1 block text-xs text-red-600">{errors.email_from}</span>}</label>
              <label className="text-sm"><span className="mb-1 block font-medium">Reply-to</span><input value={options.email.reply_to} onChange={(e)=>update('email',{reply_to:e.target.value})} placeholder="support@acme.com" className={`focus-ring w-full rounded-md border px-3 py-2 ${errors.email_reply ? 'border-red-300' : 'border-slate-300'}`}/>{errors.email_reply && <span className="mt-1 block text-xs text-red-600">{errors.email_reply}</span>}</label>
              <label className="text-sm"><span className="mb-1 block font-medium">Preheader</span><input value={options.email.preheader} onChange={(e)=>update('email',{preheader:e.target.value})} placeholder="Short inbox preview text" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2"/></label>
            </div>
          </div>
        )}
        {selectedChannels.includes('sms') && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h5 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><MessageSquare size={15}/> SMS controls</h5>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{smsSummary.length} chars · {smsSummary.segments} segment{smsSummary.segments === 1 ? '' : 's'}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm"><span className="mb-1 block font-medium">Sender ID</span><input value={options.sms.sender_id} onChange={(e)=>update('sms',{sender_id:e.target.value.toUpperCase()})} placeholder="ACME" className={`focus-ring w-full rounded-md border px-3 py-2 uppercase ${errors.sms_sender ? 'border-red-300' : 'border-slate-300'}`}/>{errors.sms_sender && <span className="mt-1 block text-xs text-red-600">{errors.sms_sender}</span>}</label>
              <label className="text-sm"><span className="mb-1 block font-medium">Callback URL</span><input value={options.sms.callback_url} onChange={(e)=>update('sms',{callback_url:e.target.value})} placeholder="https://example.com/sms/status" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2"/></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={options.sms.unicode} onChange={(e)=>update('sms',{unicode:e.target.checked})}/>Unicode content</label>
            </div>
          </div>
        )}
        {selectedChannels.includes('fcm') && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h5 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><Smartphone size={15}/> Push notification</h5>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm"><span className="mb-1 block font-medium">Push title override</span><input value={options.fcm.title} onChange={(e)=>update('fcm',{title:e.target.value})} placeholder="Optional title" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2"/></label>
              <label className="text-sm"><span className="mb-1 block font-medium">Image URL</span><input value={options.fcm.image_url} onChange={(e)=>update('fcm',{image_url:e.target.value})} placeholder="https://example.com/image.png" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2"/></label>
              <label className="text-sm"><span className="mb-1 block font-medium">Click action</span><input value={options.fcm.click_action} onChange={(e)=>update('fcm',{click_action:e.target.value})} placeholder="/orders/{{order_id}}" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2"/></label>
              <label className="text-sm"><span className="mb-1 block font-medium">Collapse key</span><input value={options.fcm.collapse_key} onChange={(e)=>update('fcm',{collapse_key:e.target.value})} placeholder="order_updates" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2"/></label>
            </div>
          </div>
        )}
        {(selectedChannels.includes('websocket') || selectedChannels.includes('in_app')) && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h5 className="mb-3 text-sm font-semibold text-slate-800">Realtime and in-app</h5>
            <div className="grid gap-3 sm:grid-cols-2">
              {selectedChannels.includes('websocket') && <><label className="text-sm"><span className="mb-1 block font-medium">Socket event</span><input value={options.websocket.event_name} onChange={(e)=>update('websocket',{event_name:e.target.value})} placeholder="notification.created" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="text-sm"><span className="mb-1 block font-medium">Room/channel</span><input value={options.websocket.room} onChange={(e)=>update('websocket',{room:e.target.value})} placeholder="tenant:{{tenant_id}}" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2"/></label></>}
              {selectedChannels.includes('in_app') && <><label className="text-sm"><span className="mb-1 block font-medium">Inbox title</span><input value={options.in_app.title} onChange={(e)=>update('in_app',{title:e.target.value})} placeholder="Notification title" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="text-sm"><span className="mb-1 block font-medium">Expires at</span><input type="datetime-local" value={options.in_app.expires_at} onChange={(e)=>update('in_app',{expires_at:e.target.value})} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2"/></label></>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
