import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';
import { Plus, Power, Pencil, Eye, Trash2, X, Save } from 'lucide-react';

type User = { id: string; email: string; name: string; is_platform_admin: boolean; status: string; created_at: string; tenants?: string };
type Role = { id: string; name: string; key: string; scope: string };

export function UsersPage() {
  const { user, can } = useAuth();
  const isPlatform = user?.is_platform_admin ?? false;
  const [items, setItems] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRoleId, setEditRoleId] = useState('');
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [tenantFilter, setTenantFilter] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      list<User>('/admin/api/v1/users' + (tenantFilter ? `?tenant_id=${tenantFilter}` : '')).then((res) => setItems(res.data)),
      list<Role>('/admin/api/v1/roles').then((res) => setRoles(res.data)),
    ]).catch((err) => setError(err.message)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantFilter]);

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

  async function toggleUserStatus(u: User) {
    const newStatus = u.status === 'active' ? 'disabled' : 'active';
    try { await apiRequest(`/admin/api/v1/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) }); load(); }
    catch (err: any) { setError(err.message); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this user?')) return;
    try { await apiRequest(`/admin/api/v1/users/${id}`, { method: 'DELETE' }); load(); }
    catch (err: any) { setError(err.message); }
  }

  function startEdit(item: User) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditEmail(item.email);
    setEditRoleId('');
  }

  async function saveEdit(id: string) {
    setSaving(true); setError('');
    try {
      const body: Record<string, string> = { name: editName, email: editEmail };
      await apiRequest(`/admin/api/v1/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      if (editRoleId && isPlatform) {
        await apiRequest(`/admin/api/v1/users/${id}/roles`, { method: 'POST', body: JSON.stringify({ role_id: editRoleId }) });
      }
      setEditingId(null); setMessage('User updated'); load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Update failed'); }
    finally { setSaving(false); }
  }

  return (
    <Panel title="Users" actions={can('users.create') ? <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">{showForm ? 'Cancel' : <><Plus size={14} /> Add User</>}</button> : undefined}>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      {isPlatform && (
        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-medium">Tenant Filter</span>
          <input value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} placeholder="Filter by tenant ID (optional)" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
      )}

      {showForm && (
        <form onSubmit={submit} className="mb-6 max-w-lg space-y-3 rounded-md border border-slate-200 p-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <button disabled={saving} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Saving...' : 'Create'}</button>
        </form>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No users found</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Name</th><th>Email</th><th>Role</th><th>Status</th>{isPlatform && <th>Tenants</th>}<th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                {editingId === item.id ? (
                  <>
                    <td className="py-3"><input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded border px-2 py-1 text-xs" /></td>
                    <td><input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="w-full rounded border px-2 py-1 text-xs" /></td>
                    <td>
                      {isPlatform && (
                        <select value={editRoleId} onChange={(e) => setEditRoleId(e.target.value)} className="rounded border px-2 py-1 text-xs">
                          <option value="">No change</option>
                          {roles.filter((r) => r.scope === 'platform' || r.scope === 'tenant').map((r) => <option key={r.id} value={r.id}>{r.name} ({r.scope})</option>)}
                        </select>
                      )}
                    </td>
                    <td>{item.status}</td>
                    {isPlatform && <td>{item.tenants || '-'}</td>}
                    <td>
                      <button onClick={() => saveEdit(item.id)} disabled={saving} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50"><Save size={12} />Save</button>
                      <button onClick={() => setEditingId(null)} className="ml-1 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"><X size={12} />Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-3 font-medium">{item.name}</td>
                    <td>{item.email}</td>
                    <td>{item.is_platform_admin ? 'Platform Admin' : 'User'}</td>
                    <td>{item.status}</td>
                    {isPlatform && <td className="text-xs text-slate-500">{item.tenants || '-'}</td>}
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => setViewingId(viewingId === item.id ? null : item.id)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"><Eye size={12} />View</button>
                        {can('users.update') && <button onClick={() => startEdit(item)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"><Pencil size={12} />Edit</button>}
                        {can('users.update') && <button onClick={() => toggleUserStatus(item)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"><Power size={12} />{item.status === 'active' ? 'Disable' : 'Enable'}</button>}
                        {can('users.delete') && <button onClick={() => remove(item.id)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"><Trash2 size={12} />Delete</button>}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {viewingId && items.find((i) => i.id === viewingId) && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
          <h3 className="mb-2 font-semibold">User Details</h3>
          {(() => {
            const u = items.find((i) => i.id === viewingId)!;
            return (
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-slate-500">Name:</span> {u.name}</div>
                <div><span className="text-slate-500">Email:</span> {u.email}</div>
                <div><span className="text-slate-500">Role:</span> {u.is_platform_admin ? 'Platform Admin' : 'User'}</div>
                <div><span className="text-slate-500">Status:</span> {u.status}</div>
                <div><span className="text-slate-500">Created:</span> {u.created_at}</div>
                {isPlatform && <div><span className="text-slate-500">Tenants:</span> {u.tenants || '-'}</div>}
              </div>
            );
          })()}
        </div>
      )}
    </Panel>
  );
}
