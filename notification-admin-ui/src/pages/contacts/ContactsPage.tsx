import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';

type Contact = { id: string; tenant_id: string; name: string; email: string; phone: string; status: string; created_at: string };

export function ContactsPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<Contact[]>([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => list<Contact>('/admin/api/v1/contacts').then((res) => setItems(res.data)).catch((err) => setError(err.message));

  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      await apiRequest('/admin/api/v1/contacts', { method: 'POST', body: JSON.stringify({ name, email, phone }) });
      setName(''); setEmail(''); setPhone('');
      setShowForm(false);
      setMessage('Contact created');
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Create failed'); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this contact?')) return;
    try {
      await apiRequest(`/admin/api/v1/contacts/${id}`, { method: 'DELETE' });
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Delete failed'); }
  }

  return (
    <Panel title="Contacts" actions={can('contacts.create') ? <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">{showForm ? 'Cancel' : 'Add Contact'}</button> : undefined}>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      {showForm && (
        <form onSubmit={submit} className="mb-6 max-w-lg space-y-3 rounded-md border border-slate-200 p-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={saving} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Saving...' : 'Create'}</button>
        </form>
      )}

      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr><th className="py-2">Name</th><th>Email</th><th>Phone</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-slate-100">
              <td className="py-3 font-medium">{item.name}</td>
              <td>{item.email || '-'}</td>
              <td>{item.phone || '-'}</td>
              <td>{item.status}</td>
              <td>{can('contacts.delete') && <button onClick={() => remove(item.id)} className="text-red-600 hover:underline">Delete</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
