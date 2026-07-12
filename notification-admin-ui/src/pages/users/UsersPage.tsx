import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { Modal, ModalButton } from '../../components/Modal';
import { SearchSelect } from '../../components/SearchSelect';
import { StatusBadge } from '../../components/StatusBadge';
import { useAuth } from '../../auth/AuthContext';
import { Plus, Power, Pencil, Eye, Trash2 } from 'lucide-react';

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

  const editingUser = items.find((item) => item.id === editingId);
  const viewingUser = items.find((item) => item.id === viewingId);
  return (<>
    <Panel title="Users" actions={can('users.create') ? <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">{showForm ? 'Cancel' : <><Plus size={14} /> Add User</>}</button> : undefined}>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      {isPlatform && (
        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-medium">Tenant Filter</span>
          <input value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} placeholder="Filter by tenant ID (optional)" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
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
                    <td className="py-3 font-medium">{item.name}</td>
                    <td>{item.email}</td>
                    <td>{item.is_platform_admin ? 'Platform Admin' : 'User'}</td>
                    <td><StatusBadge status={item.status}/></td>
                    {isPlatform && <td className="text-xs text-slate-500">{item.tenants || '-'}</td>}
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => setViewingId(item.id)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"><Eye size={12} />View</button>
                        {can('users.update') && <button onClick={() => startEdit(item)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"><Pencil size={12} />Edit</button>}
                        {can('users.update') && <button onClick={() => toggleUserStatus(item)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"><Power size={12} />{item.status === 'active' ? 'Disable' : 'Enable'}</button>}
                        {can('users.delete') && <button onClick={() => remove(item.id)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"><Trash2 size={12} />Delete</button>}
                      </div>
                    </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

    </Panel>
    {showForm && <Modal title="Add user" description="Create an account for the notification administration workspace." onClose={() => setShowForm(false)} width="max-w-2xl" footer={<><ModalButton onClick={() => setShowForm(false)}>Cancel</ModalButton><ModalButton variant="primary" disabled={saving} onClick={() => document.getElementById('user-create-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))}>{saving?'Creating...':'Create user'}</ModalButton></>}><form id="user-create-form" onSubmit={submit} className="space-y-4 px-6 py-5"><label className="block text-sm"><span className="mb-1 block font-medium">Full name</span><input value={name} onChange={(e)=>setName(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" required/></label><label className="block text-sm"><span className="mb-1 block font-medium">Email address</span><input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" required/></label><label className="block text-sm"><span className="mb-1 block font-medium">Temporary password</span><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" required/></label></form></Modal>}
    {editingUser && <Modal title="Edit user" description={`Update ${editingUser.name}'s account and role assignment.`} onClose={()=>setEditingId(null)} width="max-w-2xl" footer={<><ModalButton onClick={()=>setEditingId(null)}>Cancel</ModalButton><ModalButton variant="primary" disabled={saving} onClick={()=>saveEdit(editingUser.id)}>{saving?'Saving...':'Save changes'}</ModalButton></>}><div className="space-y-4 px-6 py-5"><label className="block text-sm"><span className="mb-1 block font-medium">Full name</span><input value={editName} onChange={(e)=>setEditName(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm"><span className="mb-1 block font-medium">Email address</span><input value={editEmail} onChange={(e)=>setEditEmail(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2"/></label>{isPlatform&&<label className="block text-sm"><span className="mb-1 block font-medium">Assign role</span><SearchSelect value={editRoleId} onChange={setEditRoleId} placeholder="No role change" options={[{value:'',label:'No role change'},...roles.map((r)=>({value:r.id,label:`${r.name} (${r.scope})`}))]}/></label>}</div></Modal>}
    {viewingUser && <Modal title="User details" description="Account identity, access level, and status." onClose={()=>setViewingId(null)} width="max-w-2xl" footer={<><ModalButton onClick={()=>setViewingId(null)}>Close</ModalButton>{can('users.update')&&<ModalButton variant="primary" onClick={()=>{setViewingId(null);startEdit(viewingUser)}}>Edit user</ModalButton>}</>}><dl className="grid gap-4 px-6 py-5 sm:grid-cols-2">{[['Name',viewingUser.name],['Email',viewingUser.email],['Role',viewingUser.is_platform_admin?'Platform Admin':'User'],['Status',viewingUser.status],['Created',viewingUser.created_at],...(isPlatform?[['Tenants',viewingUser.tenants||'-']]:[])].map(([label,value])=><div key={label} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-medium uppercase text-slate-400">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}</dl></Modal>}
  </>);
}
