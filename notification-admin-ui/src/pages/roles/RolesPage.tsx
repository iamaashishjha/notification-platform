import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';

type Role = { id: string; tenant_id: string; name: string; key: string; scope: string; status: string; created_at: string };

export function RolesPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<Role[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => { setLoading(true); list<Role>('/admin/api/v1/roles').then((res) => setItems(res.data)).catch((err) => setError(err.message)).finally(() => setLoading(false)); };

  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      await apiRequest('/admin/api/v1/roles', { method: 'POST', body: JSON.stringify({ name, key }) });
      setName(''); setKey('');
      setShowForm(false); setMessage('Role created');
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Create failed'); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this role?')) return;
    try {
      await apiRequest(`/admin/api/v1/roles/${id}`, { method: 'DELETE' });
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Delete failed'); }
  }

  return (
    <Panel title="Roles" actions={can('roles.manage') ? <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">{showForm ? 'Cancel' : 'Create Role'}</button> : undefined}>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      {showForm && (
        <form onSubmit={submit} className="mb-6 max-w-lg space-y-3 rounded-md border border-slate-200 p-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Role name" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Role key (e.g. tenant_admin)" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <button disabled={saving} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Saving...' : 'Create'}</button>
        </form>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No roles found</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Name</th><th>Key</th><th>Scope</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-3 font-medium">{item.name}</td>
                <td>{item.key}</td>
                <td>{item.scope}</td>
                <td>{item.status}</td>
                <td>{can('roles.manage') && <button onClick={() => remove(item.id)} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">Delete</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
