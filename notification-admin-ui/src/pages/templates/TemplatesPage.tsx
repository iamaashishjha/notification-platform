import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { Button, RowActionButton } from '../../components/Button';
import { SearchSelect } from '../../components/SearchSelect';
import { TenantFilter } from '../../components/TenantFilter';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import {
  AlertTriangle,
  Braces,
  Eye,
  FileText,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';

type Template = {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  template_key: string;
  channel: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
};

type Tenant = { id: string; name: string; slug?: string; status: string };
type ModalState =
  | { mode: 'create' }
  | { mode: 'view'; template: Template }
  | { mode: 'edit'; template: Template }
  | { mode: 'delete'; template: Template }
  | null;

type FormValues = {
  tenantId: string;
  templateKey: string;
  channel: string;
  subject: string;
  body: string;
};
type PreviewMode = 'text' | 'markdown' | 'html';

const emptyForm: FormValues = { tenantId: '', templateKey: '', channel: 'email', subject: '', body: '' };

function renderMarkdownLite(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

function Modal({ title, description, children, onClose, width = 'max-w-3xl' }: { title: string; description?: string; children: ReactNode; onClose: () => void; width?: string }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="template-modal-root" role="dialog" aria-modal="true" aria-label={title}>
      <button className="template-modal-backdrop" onClick={onClose} aria-label="Close modal" />
      <section className={`template-modal-panel ${width}`}>
        <header className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button onClick={onClose} className="focus-ring rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function ChannelBadge({ channel }: { channel: string }) {
  const config: Record<string, { icon: ReactNode; classes: string }> = {
    email: { icon: <Mail size={13} />, classes: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
    sms: { icon: <MessageSquare size={13} />, classes: 'bg-violet-50 text-violet-700 ring-violet-600/20' },
    fcm: { icon: <Smartphone size={13} />, classes: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  };
  const item = config[channel] ?? { icon: <FileText size={13} />, classes: 'bg-slate-50 text-slate-700 ring-slate-600/20' };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${item.classes}`}>{item.icon}{channel}</span>;
}

export function TemplatesPage() {
  const { user, can } = useAuth();
  const toast = useToast();
  const isPlatform = user?.is_platform_admin ?? false;
  const [items, setItems] = useState<Template[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [formPreviewMode, setFormPreviewMode] = useState<PreviewMode>('text');

  function load() {
    setLoading(true);
    setError('');
    const endpoint = '/admin/api/v1/templates' + (tenantFilter ? `?tenant_id=${encodeURIComponent(tenantFilter)}` : '');
    list<Template>(endpoint)
      .then((res) => setItems(res.data))
      .catch((err) => toast.error('Unable to load templates', err instanceof Error ? err.message : 'Load failed'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [tenantFilter]);
  useEffect(() => {
    if (isPlatform) list<Tenant>('/admin/api/v1/tenants').then((res) => setTenants(res.data)).catch(() => undefined);
  }, [isPlatform]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !query || [item.template_key, item.subject, item.tenant_name, item.body].some((value) => value?.toLowerCase().includes(query));
      return matchesSearch && (!channelFilter || item.channel === channelFilter);
    });
  }, [items, search, channelFilter]);

  function openCreate() {
    setForm({ ...emptyForm, tenantId: tenantFilter });
    setError('');
    setModal({ mode: 'create' });
  }

  function openEdit(template: Template) {
    setForm({ tenantId: template.tenant_id, templateKey: template.template_key, channel: template.channel || 'email', subject: template.subject || '', body: template.body || '' });
    setError('');
    setModal({ mode: 'edit', template });
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    if (!form.templateKey.trim() || !form.channel || !form.body.trim() || (isPlatform && modal?.mode === 'create' && !form.tenantId)) {
      setError('Complete all required fields before saving.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { tenant_id: form.tenantId, template_key: form.templateKey.trim(), channel: form.channel, subject: form.subject.trim(), body: form.body };
      if (modal?.mode === 'edit') {
        await apiRequest(`/admin/api/v1/templates/${modal.template.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast.success('Template updated', form.templateKey);
      } else {
        await apiRequest('/admin/api/v1/templates', { method: 'POST', body: JSON.stringify(payload) });
        toast.success('Template created', form.templateKey);
      }
      setModal(null);
      load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save template.';
      setError(msg);
      toast.error('Unable to save template', msg);
    } finally {
      setSaving(false);
    }
  }

  async function removeTemplate(template: Template) {
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/admin/api/v1/templates/${template.id}`, { method: 'DELETE' });
      setModal(null);
      toast.success('Template deleted', template.template_key);
      load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to delete template.';
      setError(msg);
      toast.error('Unable to delete template', msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Panel
        title="Templates"
        actions={can('templates.create') ? (
          <Button onClick={openCreate} variant="primary" icon={Plus}>New template</Button>
        ) : undefined}
      >
        <div className="mb-5 flex flex-col gap-1">
          <p className="text-sm text-slate-500">Manage reusable content for every notification channel and tenant.</p>
        </div>

        <div className="template-toolbar">
          <div className="template-search-control">
            <label htmlFor="template-search">Search templates</label>
            <div className="template-control-input">
              <Search aria-hidden="true" size={16} />
              <input id="template-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Key, subject, tenant, or content" />
            </div>
          </div>
          <div className="template-filter-control">
            <label htmlFor="template-channel">Channel</label>
            <SearchSelect value={channelFilter} onChange={setChannelFilter} options={[{value:'',label:'All channels'},{value:'email',label:'Email'},{value:'sms',label:'SMS'},{value:'fcm',label:'FCM'}]}/>
          </div>
          {isPlatform && (
            <TenantFilter className="template-filter-control template-tenant-control" value={tenantFilter} onChange={setTenantFilter} tenants={tenants} />
          )}
          {(search || channelFilter || tenantFilter) && (
            <Button size="sm" icon={X} onClick={() => { setSearch(''); setChannelFilter(''); setTenantFilter(''); }} className="template-clear-filters">Clear filters</Button>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Template</th>{isPlatform && <th className="px-4 py-3">Tenant</th>}<th className="px-4 py-3">Channel</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr><td colSpan={isPlatform ? 6 : 5} className="px-4 py-16 text-center text-slate-400">Loading templates…</td></tr>
                ) : filteredItems.length === 0 ? (
                  <tr><td colSpan={isPlatform ? 6 : 5} className="px-4 py-16 text-center"><FileText className="mx-auto mb-3 text-slate-300" size={30} /><p className="font-medium text-slate-600">No templates found</p><p className="mt-1 text-xs text-slate-400">Try changing your filters or create a new template.</p></td></tr>
                ) : filteredItems.map((item) => (
                  <tr key={item.id} className="group hover:bg-slate-50/70">
                    <td className="px-4 py-3.5"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Braces size={17} /></span><div><div className="font-semibold text-slate-800">{item.template_key}</div><div className="mt-0.5 text-xs text-slate-400">Updated template</div></div></div></td>
                    {isPlatform && <td className="px-4 py-3.5 text-slate-600">{item.tenant_name || '—'}</td>}
                    <td className="px-4 py-3.5"><ChannelBadge channel={item.channel} /></td>
                    <td className="max-w-xs truncate px-4 py-3.5 text-slate-600">{item.subject || <span className="text-slate-400">No subject</span>}</td>
                    <td className="px-4 py-3.5"><span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{item.status}</span></td>
                    <td className="px-4 py-3.5"><div className="flex justify-end gap-1">
                      <RowActionButton onClick={() => setModal({ mode: 'view', template: item })} icon={Eye} tone="neutral" title="View template">View</RowActionButton>
                      {can('templates.update') && <RowActionButton onClick={() => openEdit(item)} icon={Pencil} title="Edit template">Edit</RowActionButton>}
                      {can('templates.delete') && <RowActionButton onClick={() => setModal({ mode: 'delete', template: item })} icon={Trash2} tone="danger" title="Delete template">Delete</RowActionButton>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && filteredItems.length > 0 && <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">Showing {filteredItems.length} of {items.length} templates</div>}
        </div>
      </Panel>

      {(modal?.mode === 'create' || modal?.mode === 'edit') && (
        <Modal title={modal.mode === 'create' ? 'Create notification template' : 'Edit notification template'} description={modal.mode === 'create' ? 'Build reusable content with variables such as {{customer_name}}.' : `Editing ${modal.template.template_key}`} onClose={() => setModal(null)}>
          <form onSubmit={saveTemplate}>
            <div className="max-h-[calc(92vh-160px)] space-y-5 overflow-y-auto px-6 py-5">
              {error && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertTriangle className="mt-0.5 shrink-0" size={15} />{error}</div>}
              {isPlatform && modal.mode === 'create' && <FormField label="Tenant" required hint="The tenant that owns this template."><SearchSelect value={form.tenantId} onChange={(value)=>setForm({...form,tenantId:value})} placeholder="Select a tenant" options={tenants.filter((tenant)=>tenant.status==='active').map((tenant)=>({value:tenant.id,label:tenant.name}))}/></FormField>}
              <div className="grid gap-5 md:grid-cols-2">
                <FormField label="Template key" required hint="Stable identifier used by the API."><input value={form.templateKey} onChange={(e) => setForm({ ...form, templateKey: e.target.value })} placeholder="order_confirmation" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2.5 font-mono text-sm" required /></FormField>
                <FormField label="Channel" required hint="Delivery channel for this content."><SearchSelect value={form.channel} onChange={(value)=>setForm({...form,channel:value})} options={[{value:'email',label:'Email'},{value:'sms',label:'SMS'},{value:'fcm',label:'FCM push'}]}/></FormField>
              </div>
              <FormField label="Subject" hint={form.channel === 'email' ? 'Email subject line. Variables are supported.' : 'Optional for this channel.'}><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Your order {{order_id}} is confirmed" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" /></FormField>
              <FormField label="Message body" required hint="Use double braces for variables, for example {{customer_name}}."><textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={9} placeholder="Hello {{customer_name}},\n\nYour notification content goes here." className="focus-ring w-full resize-y rounded-md border border-slate-300 px-3 py-2.5 font-mono text-sm leading-6" required /></FormField>
              <TemplatePreviewPanel subject={form.subject} body={form.body} mode={formPreviewMode} onModeChange={setFormPreviewMode} />
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4"><Button type="button" onClick={() => setModal(null)} icon={X}>Cancel</Button><Button disabled={saving} variant="primary" icon={modal.mode === 'create' ? Plus : Pencil}>{saving ? 'Saving…' : modal.mode === 'create' ? 'Create template' : 'Save changes'}</Button></footer>
          </form>
        </Modal>
      )}

      {modal?.mode === 'view' && <TemplatePreview template={modal.template} onClose={() => setModal(null)} onEdit={can('templates.update') ? () => openEdit(modal.template) : undefined} />}

      {modal?.mode === 'delete' && (
        <Modal title="Delete template" description="This action cannot be undone." onClose={() => setModal(null)} width="max-w-md">
          <div className="px-6 py-5"><div className="flex gap-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600"><AlertTriangle size={20} /></span><p className="text-sm leading-6 text-slate-600">Delete <strong className="font-semibold text-slate-900">{modal.template.template_key}</strong>? Applications using this key may no longer be able to send notifications.</p></div></div>
          {error && <div className="mx-6 mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4"><Button onClick={() => setModal(null)} icon={X}>Cancel</Button><Button onClick={() => removeTemplate(modal.template)} disabled={saving} variant="danger" icon={Trash2}>{saving ? 'Deleting…' : 'Delete template'}</Button></footer>
        </Modal>
      )}
    </>
  );
}

function FormField({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}{required && <span className="ml-1 text-red-500">*</span>}</span>{children}{hint && <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>}</label>;
}

function PreviewModeTabs({ value, onChange }: { value: PreviewMode; onChange: (value: PreviewMode) => void }) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
      {(['text', 'markdown', 'html'] as PreviewMode[]).map((mode) => (
        <button key={mode} type="button" onClick={() => onChange(mode)} className={`focus-ring rounded px-3 py-1.5 text-xs font-medium capitalize ${value === mode ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{mode}</button>
      ))}
    </div>
  );
}

function TemplatePreviewPanel({ subject, body, mode, onModeChange }: { subject?: string; body?: string; mode: PreviewMode; onModeChange: (mode: PreviewMode) => void }) {
  const content = body || '';
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Preview</h3>
          <p className="mt-0.5 text-xs text-slate-500">Switch between text, markdown, and HTML output.</p>
        </div>
        <PreviewModeTabs value={mode} onChange={onModeChange} />
      </div>
      <div className="space-y-3 p-4">
        {subject && <div className="rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">{subject}</div>}
        {mode === 'html' ? (
          <iframe title="Template HTML preview" className="h-64 w-full rounded-md border border-slate-200 bg-white" srcDoc={content || '<p></p>'} />
        ) : mode === 'markdown' ? (
          <div className="min-h-32 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">{renderMarkdownLite(content) || 'No body content'}</div>
        ) : (
          <pre className="min-h-32 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-100">{content || 'No body content'}</pre>
        )}
      </div>
    </div>
  );
}

function TemplatePreview({ template, onClose, onEdit }: { template: Template; onClose: () => void; onEdit?: () => void }) {
  const [mode, setMode] = useState<PreviewMode>('text');
  return (
    <Modal title={template.template_key} description="Template details and rendered content preview." onClose={onClose}>
      <div className="max-h-[calc(92vh-160px)] overflow-y-auto px-6 py-5">
        <dl className="mb-5 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Channel</dt><dd className="mt-2"><ChannelBadge channel={template.channel} /></dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Tenant</dt><dd className="mt-2 text-sm font-medium text-slate-700">{template.tenant_name || 'Current tenant'}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Status</dt><dd className="mt-2 text-sm font-medium capitalize text-emerald-700">{template.status}</dd></div>
        </dl>
        <TemplatePreviewPanel subject={template.subject} body={template.body} mode={mode} onModeChange={setMode} />
      </div>
      <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4"><Button onClick={onClose} icon={X}>Close</Button>{onEdit && <Button onClick={onEdit} variant="primary" icon={Pencil}>Edit template</Button>}</footer>
    </Modal>
  );
}
