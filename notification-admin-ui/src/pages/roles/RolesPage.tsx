import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';
import { Plus, Trash2, Pencil, X, Eye, Save } from 'lucide-react';

type Role = { id: string; tenant_id: string; name: string; key: string; scope: string; status: string; created_at: string };
type Permission = { id: string; key: string; description: string };
type RoleDetail = Role & { permissions: Permission[] };

const CATEGORIES = ['users', 'roles', 'permissions', 'tenants', 'providers', 'contacts', 'campaigns', 'templates', 'notifications', 'audit', 'api_keys', 'channels', 'features', 'settings', 'groups'];

function permissionCategory(key: string): string {
  for (const cat of CATEGORIES) {
    if (key.startsWith(cat)) return cat;
  }
  return 'other';
}

export function RolesPage() {
  const { user, can } = useAuth();
  const isPlatform = user?.is_platform_admin ?? false;
  const [items, setItems] = useState<Role[]>([]);
  const [allPerms, setAllPerms] = useState<Permission[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set());
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewDetail, setViewDetail] = useState<RoleDetail | null>(null);

  const load = () => { setLoading(true); Promise.all([
    list<Role>('/admin/api/v1/roles').then((r) => setItems(r.data)),
    list<Permission>('/admin/api/v1/permissions').then((r) => setAllPerms(r.data)),
  ]).catch((err) => setError(err.message)).finally(() => setLoading(false)); };

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

  async function startEdit(item: Role) {
    setEditingId(item.id);
    setEditName(item.name);
    try {
      const res = await apiRequest<{ data: RoleDetail }>(`/admin/api/v1/roles/${item.id}`);
      setEditPerms(new Set((res.data?.permissions || []).map((p: any) => p.id)));
    } catch { setEditPerms(new Set()); }
  }

  async function saveEdit(id: string) {
    setSaving(true); setError('');
    try {
      await apiRequest(`/admin/api/v1/roles/${id}`, { method: 'PUT', body: JSON.stringify({ name: editName }) });
      await apiRequest(`/admin/api/v1/roles/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ permission_ids: Array.from(editPerms) }) });
      setEditingId(null); setMessage('Role updated'); load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Update failed'); }
    finally { setSaving(false); }
  }

  async function viewRole(id: string) {
    try {
      const res = await apiRequest<{ data: RoleDetail }>(`/admin/api/v1/roles/${id}`);
      setViewDetail(res.data);
      setViewingId(id);
    } catch { setError('Failed to load role details'); }
  }

  function togglePerm(pid: string) {
    setEditPerms((prev) => { const next = new Set(prev); if (next.has(pid)) next.delete(pid); else next.add(pid); return next; });
  }

  const groupedPerms: Record<string, Permission[]> = {};
  for (const p of allPerms) {
    const cat = permissionCategory(p.key);
    if (!groupedPerms[cat]) groupedPerms[cat] = [];
    groupedPerms[cat].push(p);
  }

  return (
    <Panel title="Roles" actions={can('roles.manage') ? <button onClick={() => { setShowForm(!showForm); setEditingId(null); }} className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">{showForm ? 'Cancel' : <><Plus size={14} /> Create Role</>}</button> : undefined}>
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
                {editingId === item.id ? (
                  <>
                    <td className="py-3" colSpan={4}>
                      <div className="space-y-2">
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded border px-2 py-1 text-xs" placeholder="Role name" />
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {Object.entries(groupedPerms).map(([cat, perms]) => (
                            <div key={cat}>
                              <p className="text-xs font-semibold uppercase text-slate-400 mb-1">{cat}</p>
                              <div className="flex flex-wrap gap-2 ml-1">
                                {perms.map((p) => (
                                  <label key={p.id} className="flex items-center gap-1 text-xs">
                                    <input type="checkbox" checked={editPerms.has(p.id)} onChange={() => togglePerm(p.id)} className="rounded" />
                                    {p.key}
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => saveEdit(item.id)} disabled={saving} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50"><Save size={12} />Save</button>
                        <button onClick={() => setEditingId(null)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"><X size={12} />Cancel</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-3 font-medium">{item.name}</td>
                    <td>{item.key}</td>
                    <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.scope === 'platform' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{item.scope}</span></td>
                    <td>{item.status}</td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => viewRole(item.id)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"><Eye size={12} />View</button>
                        {can('roles.manage') && <button onClick={() => startEdit(item)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"><Pencil size={12} />Edit</button>}
                        {can('roles.manage') && <button onClick={() => remove(item.id)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"><Trash2 size={12} />Delete</button>}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {viewDetail && viewingId && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">{viewDetail.name}</h3>
            <button onClick={() => { setViewingId(null); setViewDetail(null); }} className="text-xs text-slate-500 hover:underline">Close</button>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div><span className="text-slate-500">Key:</span> {viewDetail.key}</div>
            <div><span className="text-slate-500">Scope:</span> {viewDetail.scope}</div>
            <div><span className="text-slate-500">Status:</span> {viewDetail.status}</div>
            <div><span className="text-slate-500">Created:</span> {viewDetail.created_at}</div>
          </div>
          {viewDetail.permissions && viewDetail.permissions.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400 mb-1">Permissions</p>
              <div className="flex flex-wrap gap-1">
                {viewDetail.permissions.map((p: any) => (
                  <span key={p.id} className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">{p.key}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
