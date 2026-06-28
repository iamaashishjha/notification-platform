import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';

type Tenant = { id: string; name: string; slug: string; status: string; created_at: string };

export function TenantsPage() {
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const isPlatform = user?.is_platform_admin;
  if (!can('tenants.view')) return <Navigate to="/" replace />;

  const [items, setItems] = useState<Tenant[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createErr, setCreateErr] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');

  function load() {
    setLoading(true);
    list<Tenant>('/admin/api/v1/tenants').then((res) => setItems(res.data)).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function handleCreate() {
    setCreateErr('');
    try {
      await apiRequest('/admin/api/v1/tenants', { method: 'POST', body: JSON.stringify({ name: createName, slug: createSlug }) });
      setShowCreate(false); setCreateName(''); setCreateSlug(''); load();
    } catch (err: any) { setCreateErr(err.message); }
  }

  async function handleEdit(id: string) {
    const body: Record<string, string> = {};
    if (editName) body.name = editName;
    if (editSlug) body.slug = editSlug;
    if (!Object.keys(body).length) { setEditId(null); return; }
    try {
      await apiRequest(`/admin/api/v1/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setEditId(null); load();
    } catch (err: any) { setError(err.message); }
  }

  async function toggleStatus(item: Tenant) {
    const newStatus = item.status === 'active' ? 'disabled' : 'active';
    try {
      await apiRequest(`/admin/api/v1/tenants/${item.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      load();
    } catch (err: any) { setError(err.message); }
  }

  return (
    <Panel
      title="Tenants"
      actions={isPlatform ? <button onClick={() => setShowCreate(!showCreate)} className="focus-ring rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">Create Tenant</button> : undefined}
    >
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {showCreate && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-4">
          <h3 className="mb-2 text-sm font-semibold">New Tenant</h3>
          {createErr && <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600">{createErr}</div>}
          <div className="flex gap-2">
            <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Name" className="focus-ring w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <input value={createSlug} onChange={(e) => setCreateSlug(e.target.value)} placeholder="Slug" className="focus-ring w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <button onClick={handleCreate} className="focus-ring rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">Create</button>
            <button onClick={() => setShowCreate(false)} className="focus-ring rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No tenants found</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Name</th><th>Slug</th><th>Status</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-3 font-medium">
                  {editId === item.id ? <input value={editName || item.name} onChange={(e) => setEditName(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1 text-sm" /> : item.name}
                </td>
                <td>
                  {editId === item.id ? <input value={editSlug || item.slug} onChange={(e) => setEditSlug(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1 text-sm" /> : item.slug}
                </td>
                <td>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.status}</span>
                </td>
                <td className="text-slate-500">{item.created_at}</td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => navigate(`/tenants/${item.id}`)} className="focus-ring rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">View</button>
                    {isPlatform && (
                      <>
                        {editId === item.id ? (
                          <>
                            <button onClick={() => handleEdit(item.id)} className="focus-ring rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50">Save</button>
                            <button onClick={() => setEditId(null)} className="focus-ring rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => { setEditId(item.id); setEditName(item.name); setEditSlug(item.slug); }} className="focus-ring rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">Edit</button>
                        )}
                        <button onClick={() => toggleStatus(item)} className={`focus-ring rounded px-2 py-1 text-xs ${item.status === 'active' ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}>
                          {item.status === 'active' ? 'Disable' : 'Enable'}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
