import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';
import { Plus, Trash2, Pencil, X } from 'lucide-react';

type Contact = { id: string; tenant_id: string; name: string; email: string; phone: string; status: string; created_at: string; external_ref?: string; tenant_name?: string };

export function ContactsPage() {
  const { user, can } = useAuth();
  const isPlatform = user?.is_platform_admin ?? false;
  const [items, setItems] = useState<Contact[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tenantFilter, setTenantFilter] = useState('');

  const load = () => {
    setLoading(true);
    list<Contact>('/admin/api/v1/contacts' + (tenantFilter ? `?tenant_id=${tenantFilter}` : ''))
      .then((res) => setItems(res.data))
      .catch((err) => setError(err.message)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantFilter]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      await apiRequest('/admin/api/v1/contacts', { method: 'POST', body: JSON.stringify({ name, email, phone, external_ref: externalRef || undefined }) });
      setName(''); setEmail(''); setPhone(''); setExternalRef('');
      setShowForm(false);
      setMessage('Contact created');
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Create failed'); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this contact?')) return;
    try { await apiRequest(`/admin/api/v1/contacts/${id}`, { method: 'DELETE' }); load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Delete failed'); }
  }

  async function saveEdit(id: string) {
    setSaving(true); setError('');
    try {
      await apiRequest(`/admin/api/v1/contacts/${id}`, { method: 'PUT', body: JSON.stringify({ name, email, phone, external_ref: externalRef || undefined }) });
      setEditingId(null); setMessage('Contact updated'); load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Update failed'); }
    finally { setSaving(false); }
  }

  function startEdit(item: Contact) {
    setEditingId(item.id);
    setName(item.name);
    setEmail(item.email || '');
    setPhone(item.phone || '');
    setExternalRef(item.external_ref || '');
  }

  return (
    <Panel title="Contacts" actions={can('contacts.create') ? <button onClick={() => { setShowForm(!showForm); setEditingId(null); }} className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">{showForm ? 'Cancel' : <><Plus size={14} /> Add Contact</>}</button> : undefined}>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      {showForm && (
        <form onSubmit={submit} className="mb-6 max-w-lg space-y-3 rounded-md border border-slate-200 p-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input value={externalRef} onChange={(e) => setExternalRef(e.target.value)} placeholder="External Ref" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={saving} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Saving...' : 'Create'}</button>
        </form>
      )}

      {isPlatform && (
        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-medium">Tenant Filter</span>
          <input value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} placeholder="Filter by tenant ID (optional)" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No contacts found</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Name</th><th>Email</th><th>Phone</th><th>Status</th>{isPlatform && <th>Tenant</th>}<th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                {editingId === item.id ? (
                  <>
                    <td className="py-3"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-2 py-1 text-xs" /></td>
                    <td><input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded border px-2 py-1 text-xs" /></td>
                    <td><input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded border px-2 py-1 text-xs" /></td>
                    <td>{item.status}</td>
                    {isPlatform && <td>{item.tenant_name || '-'}</td>}
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => saveEdit(item.id)} disabled={saving} className="rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50">Save</button>
                        <button onClick={() => setEditingId(null)} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"><X size={12} />Cancel</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-3 font-medium">{item.name}</td>
                    <td>{item.email || '-'}</td>
                    <td>{item.phone || '-'}</td>
                    <td>{item.status}</td>
                    {isPlatform && <td className="text-xs text-slate-500">{item.tenant_name || '-'}</td>}
                    <td>
                      <div className="flex gap-1">
                        {can('contacts.update') && <button onClick={() => startEdit(item)} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"><Pencil size={12} />Edit</button>}
                        {can('contacts.delete') && <button onClick={() => remove(item.id)} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"><Trash2 size={12} />Delete</button>}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
