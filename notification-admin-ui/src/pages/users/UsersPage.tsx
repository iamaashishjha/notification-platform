import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';

type User = { id: string; email: string; name: string; is_platform_admin: boolean; status: string; created_at: string };

export function UsersPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => list<User>('/admin/api/v1/users').then((res) => setItems(res.data)).catch((err) => setError(err.message));

  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      await apiRequest('/admin/api/v1/users', { method: 'POST', body: JSON.stringify({ email, name, password }) });
      setEmail(''); setName(''); setPassword('');
      setShowForm(false); setMessage('User created');
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Create failed'); }
    finally { setSaving(false); }
  }

  return (
    <Panel title="Users" actions={can('users.create') ? <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">{showForm ? 'Cancel' : 'Add User'}</button> : undefined}>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      {showForm && (
        <form onSubmit={submit} className="mb-6 max-w-lg space-y-3 rounded-md border border-slate-200 p-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <button disabled={saving} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Saving...' : 'Create'}</button>
        </form>
      )}

      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr><th className="py-2">Name</th><th>Email</th><th>Role</th><th>Status</th></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-slate-100">
              <td className="py-3 font-medium">{item.name}</td>
              <td>{item.email}</td>
              <td>{item.is_platform_admin ? 'Platform Admin' : 'User'}</td>
              <td>{item.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
