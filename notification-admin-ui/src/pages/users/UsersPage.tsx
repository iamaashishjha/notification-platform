import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { Modal, ModalButton } from '../../components/Modal';
import { Button, RowActionButton } from '../../components/Button';
import { SearchSelect } from '../../components/SearchSelect';
import { TenantFilter } from '../../components/TenantFilter';
import { StatusBadge } from '../../components/StatusBadge';
import { TablePagination } from '../../components/TablePagination';
import { StatusToggle } from '../../components/StatusToggle';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { useAuth } from '../../auth/AuthContext';
import { Eye, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { usePagination } from '../../hooks/usePagination';
import type { PaginationMeta } from '../../types/api';

type User = { id: string; email: string; name: string; is_platform_admin: boolean; status: string; created_at: string; roles?: string; tenants?: string };
type Role = { id: string; tenant_id?: string; name: string; key: string; scope: string };
type Tenant = { id: string; name: string; slug: string; status: string };

export function UsersPage() {
  const { user, can } = useAuth();
  const { confirmDialog, requestConfirm } = useConfirmDialog();
  const toast = useToast();
  const isPlatform = user?.is_platform_admin ?? false;
  const [items, setItems] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [createScope, setCreateScope] = useState<'tenant' | 'platform'>('tenant');
  const [createTenantId, setCreateTenantId] = useState('');
  const [createRoleId, setCreateRoleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRoleId, setEditRoleId] = useState('');
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [userListScope, setUserListScope] = useState<'platform' | 'tenant'>('platform');
  const [tenantFilter, setTenantFilter] = useState('');
  const [meta, setMeta] = useState<PaginationMeta>();
  const { page, perPage, setPage, setPerPage } = usePagination([tenantFilter, userListScope]);

  const load = () => {
    setLoading(true);
    const userParams = new URLSearchParams();
    if (isPlatform) userParams.set('scope', userListScope);
    if (isPlatform && userListScope === 'tenant' && tenantFilter) userParams.set('tenant_id', tenantFilter);
    userParams.set('page', String(page));
    userParams.set('per_page', String(perPage));
    const requests = [
      list<User>('/admin/api/v1/users?' + userParams.toString()).then((res) => { setItems(res.data); setMeta(res.meta); }),
      list<Role>('/admin/api/v1/roles').then((res) => setRoles(res.data)),
    ];
    if (isPlatform) {
      requests.push(list<Tenant>('/admin/api/v1/tenants').then((res) => setTenants(res.data.filter((tenant) => tenant.status === 'active'))));
    }
    Promise.all(requests).catch((err) => toast.error('Unable to load users', err instanceof Error ? err.message : 'Load failed')).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantFilter, userListScope, isPlatform, page, perPage]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const isPlatformUser = isPlatform && createScope === 'platform';
      const tenantId = isPlatform ? createTenantId : user?.tenant_id || '';
      const created = await apiRequest<{ id: string }>('/admin/api/v1/users', {
        method: 'POST',
        body: JSON.stringify({
          email,
          name,
          password,
          is_platform_admin: isPlatformUser,
          ...(!isPlatformUser && tenantId ? { tenant_id: tenantId } : {}),
        }),
      });
      if (createRoleId) {
        await apiRequest(`/admin/api/v1/users/${created.id}/roles`, {
          method: 'POST',
          body: JSON.stringify({ role_id: createRoleId, ...(!isPlatformUser && tenantId ? { tenant_id: tenantId } : {}) }),
        });
      }
      setEmail(''); setName(''); setPassword(''); setCreateScope('tenant'); setCreateTenantId(''); setCreateRoleId('');
      setShowForm(false); toast.success('User created', email);
      load();
    } catch (err) { toast.error('Unable to create user', err instanceof Error ? err.message : 'Create failed'); }
    finally { setSaving(false); }
  }

  async function toggleUserStatus(u: User) {
    const newStatus = u.status === 'active' ? 'disabled' : 'active';
    try { await apiRequest(`/admin/api/v1/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) }); toast.success(`User ${newStatus}`, u.email); load(); }
    catch (err: any) { toast.error('Unable to update user status', err.message); }
  }

  async function remove(id: string) {
    try { await apiRequest(`/admin/api/v1/users/${id}`, { method: 'DELETE' }); toast.success('User deleted'); load(); }
    catch (err: any) { toast.error('Unable to delete user', err.message); }
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
        const role = roles.find((item) => item.id === editRoleId);
        await apiRequest(`/admin/api/v1/users/${id}/roles`, { method: 'POST', body: JSON.stringify({ role_id: editRoleId, ...(role?.scope === 'tenant' && role.tenant_id ? { tenant_id: role.tenant_id } : {}) }) });
      }
      setEditingId(null); toast.success('User updated', editEmail); load();
    } catch (err) { toast.error('Unable to update user', err instanceof Error ? err.message : 'Update failed'); }
    finally { setSaving(false); }
  }

  const editingUser = items.find((item) => item.id === editingId);
  const viewingUser = items.find((item) => item.id === viewingId);
  const editRoleOptions = roles
    .filter((role) => !editingUser || editingUser.is_platform_admin ? role.scope === 'platform' : role.scope === 'tenant' && Boolean(role.tenant_id))
    .map((role) => ({ value: role.id, label: `${role.name} (${role.scope})` }));
  const createTenantRoles = roles.filter((role) => role.scope === 'tenant' && (!isPlatform || !role.tenant_id || role.tenant_id === createTenantId));
  const createPlatformRoles = roles.filter((role) => role.scope === 'platform');
  const createRoleOptions = (createScope === 'platform' ? createPlatformRoles : createTenantRoles).map((role) => ({
    value: role.id,
    label: `${role.name} (${role.key})`,
  }));
  const createTenantRequired = isPlatform && createScope === 'tenant';
  const createRoleRequired = createScope === 'platform' || !isPlatform || Boolean(createTenantId);
  const createDisabled = saving || createTenantRequired && !createTenantId || createRoleRequired && !createRoleId;
  const visibleItems = items;
  return (<>
    <Panel title="Users" actions={can('users.create') ? <Button onClick={() => setShowForm(!showForm)} variant="primary" icon={showForm ? X : Plus}>{showForm ? 'Cancel' : 'Add user'}</Button> : undefined}>
      {isPlatform && (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
            <button type="button" onClick={() => { setUserListScope('platform'); setTenantFilter(''); }} className={`focus-ring rounded px-3 py-1.5 text-sm font-medium ${userListScope === 'platform' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Platform users</button>
            <button type="button" onClick={() => setUserListScope('tenant')} className={`focus-ring rounded px-3 py-1.5 text-sm font-medium ${userListScope === 'tenant' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Tenant users</button>
          </div>
          {userListScope === 'tenant' && <TenantFilter className="w-full sm:w-72" value={tenantFilter} onChange={setTenantFilter} tenants={tenants} />}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : visibleItems.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No users found</div>
      ) : (
        <>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Name</th><th>Email</th><th>Role</th><th>Status</th>{isPlatform && <th>Tenants</th>}<th>Actions</th></tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-3 font-medium">{item.name}</td>
                    <td>{item.email}</td>
                    <td>{item.roles || (item.is_platform_admin ? 'Platform user' : 'Tenant user')}</td>
                    <td>
                      {can('users.update') ? (
                        <StatusToggle
                          value={item.status === 'active'}
                          label={`${item.status === 'active' ? 'Disable' : 'Enable'} ${item.email}`}
                          onToggle={() => requestConfirm({
                            title: `${item.status === 'active' ? 'Disable' : 'Enable'} user`,
                            description: 'Confirm user status change',
                            body: <>Change <strong className="text-slate-900">{item.email}</strong> to <strong className="text-slate-900">{item.status === 'active' ? 'disabled' : 'enabled'}</strong>?</>,
                            confirmLabel: item.status === 'active' ? 'Disable' : 'Enable',
                            variant: item.status === 'active' ? 'danger' : 'primary',
                            onConfirm: () => toggleUserStatus(item),
                          })}
                        />
                      ) : <StatusBadge status={item.status}/>}
                    </td>
                    {isPlatform && <td className="text-xs text-slate-500">{item.tenants || '-'}</td>}
                    <td>
                      <div className="flex gap-1">
                        <RowActionButton onClick={() => setViewingId(item.id)} icon={Eye}>View</RowActionButton>
                        {can('users.update') && <RowActionButton onClick={() => startEdit(item)} icon={Pencil}>Edit</RowActionButton>}
                        {can('users.delete') && <RowActionButton onClick={() => requestConfirm({
                          title: 'Delete user',
                          description: 'This action cannot be undone',
                          body: <>Delete <strong className="text-slate-900">{item.email}</strong>?</>,
                          confirmLabel: 'Delete user',
                          variant: 'danger',
                          onConfirm: () => remove(item.id),
                        })} icon={Trash2} tone="danger">Delete</RowActionButton>}
                      </div>
                    </td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination meta={meta} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={setPerPage} />
        </>
      )}

    </Panel>
    {showForm && <Modal title="Add user" description="Create an account for the notification administration workspace." onClose={() => setShowForm(false)} width="max-w-4xl" footer={<><ModalButton onClick={() => setShowForm(false)}>Cancel</ModalButton><ModalButton variant="primary" disabled={createDisabled} onClick={() => document.getElementById('user-create-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))}>{saving?'Creating...':'Create user'}</ModalButton></>}>
      <form id="user-create-form" onSubmit={submit} className="space-y-4 px-6 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm"><span className="mb-1 block font-medium">Full name</span><input value={name} onChange={(e)=>setName(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" required/></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">Email address</span><input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" required/></label>
        </div>
        <label className="block text-sm"><span className="mb-1 block font-medium">Temporary password</span><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" required/></label>
        {isPlatform ? <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm"><span className="mb-1 block font-medium">Account type</span><SearchSelect value={createScope} onChange={(value)=>{setCreateScope(value as 'tenant'|'platform');setCreateTenantId('');setCreateRoleId('')}} options={[{value:'tenant',label:'Tenant user'},{value:'platform',label:'Admin user'}]}/></label>
          {createScope === 'platform'
            ? <label className="block text-sm"><span className="mb-1 block font-medium">Role</span><SearchSelect value={createRoleId} onChange={setCreateRoleId} placeholder="Select role" options={createRoleOptions}/></label>
            : <label className="block text-sm"><span className="mb-1 block font-medium">Tenant</span><SearchSelect value={createTenantId} onChange={(value)=>{setCreateTenantId(value);setCreateRoleId('')}} placeholder="Select tenant" options={tenants.map((tenant)=>({value:tenant.id,label:`${tenant.name} (${tenant.slug})`}))}/></label>}
        </div> : null}
        {(!isPlatform || createScope === 'tenant') && <label className="block text-sm"><span className="mb-1 block font-medium">Role</span><SearchSelect value={createRoleId} onChange={setCreateRoleId} placeholder={createScope === 'tenant' && isPlatform && !createTenantId ? 'Select tenant first' : 'Select role'} options={createRoleOptions}/></label>}
      </form>
    </Modal>}
    {editingUser && <Modal title="Edit user" description={`Update ${editingUser.name}'s account and role assignment.`} onClose={()=>setEditingId(null)} width="max-w-2xl" footer={<><ModalButton onClick={()=>setEditingId(null)}>Cancel</ModalButton><ModalButton variant="primary" disabled={saving} onClick={()=>saveEdit(editingUser.id)}>{saving?'Saving...':'Save changes'}</ModalButton></>}><div className="space-y-4 px-6 py-5"><label className="block text-sm"><span className="mb-1 block font-medium">Full name</span><input value={editName} onChange={(e)=>setEditName(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2"/></label><label className="block text-sm"><span className="mb-1 block font-medium">Email address</span><input value={editEmail} onChange={(e)=>setEditEmail(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2"/></label>{isPlatform&&<label className="block text-sm"><span className="mb-1 block font-medium">Assign role</span><SearchSelect value={editRoleId} onChange={setEditRoleId} placeholder="No role change" options={[{value:'',label:'No role change'},...editRoleOptions]}/></label>}</div></Modal>}
    {viewingUser && <Modal title="User details" description="Account identity, access level, and status." onClose={()=>setViewingId(null)} width="max-w-2xl" footer={<><ModalButton onClick={()=>setViewingId(null)}>Close</ModalButton>{can('users.update')&&<ModalButton variant="primary" onClick={()=>{setViewingId(null);startEdit(viewingUser)}}>Edit user</ModalButton>}</>}><dl className="grid gap-4 px-6 py-5 sm:grid-cols-2">{[['Name',viewingUser.name],['Email',viewingUser.email],['Role',viewingUser.roles || (viewingUser.is_platform_admin?'Platform user':'Tenant user')],['Status',viewingUser.status],['Created',viewingUser.created_at],...(isPlatform?[['Tenants',viewingUser.tenants||'-']]:[])].map(([label,value])=><div key={label} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-medium uppercase text-slate-400">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}</dl></Modal>}
    {confirmDialog}
  </>);
}
