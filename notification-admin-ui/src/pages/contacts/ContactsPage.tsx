import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list, listPage } from '../../api/client';
import { Panel } from '../../components/Panel';
import { Modal, ModalButton } from '../../components/Modal';
import { Button, RowActionButton } from '../../components/Button';
import { SearchSelect } from '../../components/SearchSelect';
import { TenantFilter } from '../../components/TenantFilter';
import { TablePagination } from '../../components/TablePagination';
import { FilterToolbar, SearchControl } from '../../components/ListFilters';
import { useAuth } from '../../auth/AuthContext';
import { AlertTriangle, Eye, Mail, Pencil, Phone, Plus, Trash2, UserRound } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { usePagination } from '../../hooks/usePagination';
import type { PaginationMeta } from '../../types/api';

type Contact = { id: string; tenant_id: string; name: string; email: string; phone: string; status: string; created_at: string; external_ref?: string; tenant_name?: string };
type Tenant = { id: string; name: string; status: string };
type Mode = { type: 'create' } | { type: 'view' | 'edit' | 'delete'; contact: Contact } | null;
type FormData = { tenantId: string; name: string; email: string; phone: string; externalRef: string };
const emptyForm: FormData = { tenantId: '', name: '', email: '', phone: '', externalRef: '' };

export function ContactsPage() {
  const { user, can } = useAuth();
  const toast = useToast();
  const isPlatform = user?.is_platform_admin ?? false;
  const [items, setItems] = useState<Contact[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [mode, setMode] = useState<Mode>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [meta, setMeta] = useState<PaginationMeta>();
  const { page, perPage, setPage, setPerPage } = usePagination([tenantFilter, search]);

  function load() {
    setLoading(true); setError('');
    listPage<Contact>('/admin/api/v1/contacts', { tenant_id: tenantFilter, q: search, page, per_page: perPage })
      .then((res) => { setItems(res.data); setMeta(res.meta); }).catch((err) => toast.error('Unable to load contacts', err instanceof Error ? err.message : 'Load failed')).finally(() => setLoading(false));
  }
  useEffect(load, [tenantFilter, search, page, perPage]);
  useEffect(() => { if (isPlatform) list<Tenant>('/admin/api/v1/tenants').then((res) => setTenants(res.data)).catch(() => undefined); }, [isPlatform]);

  function edit(contact: Contact) { setForm({ tenantId: contact.tenant_id, name: contact.name, email: contact.email || '', phone: contact.phone || '', externalRef: contact.external_ref || '' }); setMode({ type: 'edit', contact }); setError(''); }
  function create() { setForm({ ...emptyForm, tenantId: tenantFilter }); setMode({ type: 'create' }); setError(''); }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || (!form.email.trim() && !form.phone.trim()) || (isPlatform && mode?.type === 'create' && !form.tenantId)) { setError('Name, tenant, and at least one delivery address are required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = { tenant_id: form.tenantId, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), external_ref: form.externalRef.trim() || undefined };
      if (mode?.type === 'edit') { await apiRequest(`/admin/api/v1/contacts/${mode.contact.id}`, { method: 'PUT', body: JSON.stringify(payload) }); toast.success('Contact updated'); }
      else { await apiRequest('/admin/api/v1/contacts', { method: 'POST', body: JSON.stringify(payload) }); toast.success('Contact created'); }
      setMode(null); load();
    } catch (err) { const msg = err instanceof Error ? err.message : 'Unable to save contact.'; setError(msg); toast.error('Unable to save contact', msg); }
    finally { setSaving(false); }
  }

  async function remove(contact: Contact) {
    setSaving(true); setError('');
    try { await apiRequest(`/admin/api/v1/contacts/${contact.id}`, { method: 'DELETE' }); setMode(null); toast.success('Contact deleted', contact.name); load(); }
    catch (err) { const msg = err instanceof Error ? err.message : 'Unable to delete contact.'; setError(msg); toast.error('Unable to delete contact', msg); }
    finally { setSaving(false); }
  }

  return <>
    <Panel title="Contacts" actions={can('contacts.create') ? <Button onClick={create} variant="primary" icon={Plus}>New contact</Button> : undefined}>
      <p className="mb-5 text-sm text-slate-500">Manage recipient identities and delivery addresses.</p>
      <FilterToolbar>
        <SearchControl id="contact-search" label="Search contacts" value={search} onChange={setSearch} placeholder="Name, email, phone, or reference" />
        {isPlatform && <TenantFilter value={tenantFilter} onChange={setTenantFilter} tenants={tenants} />}
      </FilterToolbar>
      <div className="overflow-hidden rounded-lg border border-slate-200"><table data-no-datatable="true" className="w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Phone</th>{isPlatform && <th className="px-4 py-3">Tenant</th>}<th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={isPlatform ? 6 : 5} className="py-14 text-center text-slate-400">Loading contacts…</td></tr> : items.length === 0 ? <tr><td colSpan={isPlatform ? 6 : 5} className="py-14 text-center text-slate-400">No contacts found</td></tr> : items.map((item) => <tr key={item.id} className="hover:bg-slate-50/70"><td className="px-4 py-3.5"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 font-semibold text-blue-700">{item.name.charAt(0).toUpperCase()}</span><div><div className="font-semibold text-slate-900">{item.name}</div>{item.external_ref && <div className="text-xs text-slate-400">Ref: {item.external_ref}</div>}</div></div></td><td className="px-4 py-3.5 text-slate-600">{item.email || '—'}</td><td className="px-4 py-3.5 text-slate-600">{item.phone || '—'}</td>{isPlatform && <td className="px-4 py-3.5 text-slate-600">{item.tenant_name || '—'}</td>}<td className="px-4 py-3.5"><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium capitalize text-emerald-700">{item.status}</span></td><td className="px-4 py-3.5"><div className="flex justify-end gap-1"><RowActionButton onClick={() => setMode({ type: 'view', contact: item })} icon={Eye} tone="neutral">View</RowActionButton>{can('contacts.update') && <RowActionButton onClick={() => edit(item)} icon={Pencil}>Edit</RowActionButton>}{can('contacts.delete') && <RowActionButton onClick={() => setMode({ type: 'delete', contact: item })} icon={Trash2} tone="danger">Delete</RowActionButton>}</div></td></tr>)}</tbody>
      </table></div>
      {!loading && <TablePagination meta={meta} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={setPerPage} />}
    </Panel>

    {(mode?.type === 'create' || mode?.type === 'edit') && <Modal title={mode.type === 'create' ? 'Create contact' : 'Edit contact'} description="Store a recipient identity and one or more delivery addresses." onClose={() => setMode(null)} width="max-w-2xl" footer={<><ModalButton onClick={() => setMode(null)}>Cancel</ModalButton><ModalButton variant="primary" disabled={saving} type="submit" onClick={() => document.getElementById('contact-modal-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))}>{saving ? 'Saving…' : mode.type === 'create' ? 'Create contact' : 'Save changes'}</ModalButton></>}>
      <form id="contact-modal-form" onSubmit={save} className="space-y-5 px-6 py-5">
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {isPlatform && mode.type === 'create' && <Field label="Tenant" required><SearchSelect value={form.tenantId} onChange={(value)=>setForm({...form,tenantId:value})} placeholder="Select tenant" options={tenants.filter((t)=>t.status==='active').map((t)=>({value:t.id,label:t.name}))}/></Field>}
        <Field label="Full name" required><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" required /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Email address"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" /></Field><Field label="Phone number"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 202 555 0123" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" /></Field></div>
        <Field label="External reference" hint="Optional identifier from your CRM or source system."><input value={form.externalRef} onChange={(e) => setForm({ ...form, externalRef: e.target.value })} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2.5 font-mono text-sm" /></Field>
      </form>
    </Modal>}

    {mode?.type === 'view' && <Modal title={mode.contact.name} description="Contact profile and available delivery addresses." onClose={() => setMode(null)} width="max-w-2xl" footer={<><ModalButton onClick={() => setMode(null)}>Close</ModalButton>{can('contacts.update') && <ModalButton variant="primary" onClick={() => edit(mode.contact)}>Edit contact</ModalButton>}</>}><div className="px-6 py-5"><div className="mb-5 flex items-center gap-4"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600"><UserRound size={25} /></span><div><div className="font-semibold text-slate-900">{mode.contact.name}</div><div className="mt-1 text-xs text-slate-500">{mode.contact.tenant_name || 'Current tenant'} · {mode.contact.status}</div></div></div><dl className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"><Detail icon={<Mail size={15} />} label="Email" value={mode.contact.email || 'Not provided'} /><Detail icon={<Phone size={15} />} label="Phone" value={mode.contact.phone || 'Not provided'} /><Detail label="External reference" value={mode.contact.external_ref || 'Not provided'} /><Detail label="Created" value={new Date(mode.contact.created_at).toLocaleString()} /></dl></div></Modal>}

    {mode?.type === 'delete' && <Modal title="Delete contact" description="This action cannot be undone." onClose={() => setMode(null)} width="max-w-md" footer={<><ModalButton onClick={() => setMode(null)}>Cancel</ModalButton><ModalButton variant="danger" disabled={saving} onClick={() => remove(mode.contact)}>{saving ? 'Deleting…' : 'Delete contact'}</ModalButton></>}><div className="flex gap-4 px-6 py-5"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600"><AlertTriangle size={20} /></span><p className="text-sm leading-6 text-slate-600">Delete <strong className="text-slate-900">{mode.contact.name}</strong>? They will no longer be available as a notification recipient.</p></div></Modal>}
  </>;
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}{required && <span className="ml-1 text-red-500">*</span>}</span>{children}{hint && <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>}</label>; }
function Detail({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) { return <div><dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">{icon}{label}</dt><dd className="mt-1.5 break-all text-sm font-medium text-slate-700">{value}</dd></div>; }
