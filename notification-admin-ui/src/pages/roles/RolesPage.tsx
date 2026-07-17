import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { Modal, ModalButton } from '../../components/Modal';
import { Button, RowActionButton } from '../../components/Button';
import { SearchSelect } from '../../components/SearchSelect';
import { TenantFilter } from '../../components/TenantFilter';
import { StatusBadge } from '../../components/StatusBadge';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { useAuth } from '../../auth/AuthContext';
import { Eye, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useToast } from '../../components/Toast';

type Role = { id: string; tenant_id: string; name: string; key: string; scope: string; status: string; created_at: string };
type Permission = { id: string; key: string; description: string };
type RoleDetail = Role & { permissions: Permission[] };
type Tenant = { id: string; name: string; slug: string; status: string };

const CATEGORIES = ['users', 'roles', 'permissions', 'tenants', 'providers', 'contacts', 'campaigns', 'templates', 'notifications', 'audit', 'api_keys', 'channels', 'features', 'settings', 'groups'];

function permissionCategory(key: string): string {
  for (const cat of CATEGORIES) {
    if (key.startsWith(cat)) return cat;
  }
  return 'other';
}

export function RolesPage() {
  const { user, can } = useAuth();
  const { confirmDialog, requestConfirm } = useConfirmDialog();
  const toast = useToast();
  const isPlatform = user?.is_platform_admin ?? false;
  const [items, setItems] = useState<Role[]>([]);
  const [allPerms, setAllPerms] = useState<Permission[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [createPerms, setCreatePerms] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set());
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewDetail, setViewDetail] = useState<RoleDetail | null>(null);
  const [roleView, setRoleView] = useState<'platform' | 'tenant_defaults' | 'tenant_custom'>('platform');
  const [tenantFilter, setTenantFilter] = useState('');

  const load = () => { setLoading(true); Promise.all([
    list<Role>('/admin/api/v1/roles').then((r) => setItems(r.data)),
    list<Permission>('/admin/api/v1/permissions').then((r) => setAllPerms(r.data)),
  ]).catch((err) => toast.error('Unable to load roles', err instanceof Error ? err.message : 'Load failed')).finally(() => setLoading(false)); };

  useEffect(() => { load(); if (isPlatform) list<Tenant>('/admin/api/v1/tenants').then((r)=>setTenants(r.data.filter((t)=>t.status==='active'))).catch(()=>{}); }, [isPlatform]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const createScope = isPlatform && roleView === 'platform' ? 'platform' : 'tenant';
      const createTenantId = isPlatform && roleView === 'tenant_custom' ? tenantId : '';
      const created = await apiRequest<{id:string}>('/admin/api/v1/roles', { method: 'POST', body: JSON.stringify({ name, key, scope: createScope, ...(createTenantId?{tenant_id:createTenantId}:{}) }) });
      if (createPerms.size) await apiRequest(`/admin/api/v1/roles/${created.id}/permissions`, { method: 'PUT', body: JSON.stringify({ permission_ids: Array.from(createPerms) }) });
      setName(''); setKey('');
      setTenantId(''); setCreatePerms(new Set());
      setShowForm(false); toast.success('Role created', name);
      load();
    } catch (err) { toast.error('Unable to create role', err instanceof Error ? err.message : 'Create failed'); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    try {
      await apiRequest(`/admin/api/v1/roles/${id}`, { method: 'DELETE' });
      toast.success('Role deleted');
      load();
    } catch (err) { toast.error('Unable to delete role', err instanceof Error ? err.message : 'Delete failed'); }
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
      setEditingId(null); toast.success('Role updated', editName); load();
    } catch (err) { toast.error('Unable to update role', err instanceof Error ? err.message : 'Update failed'); }
    finally { setSaving(false); }
  }

  async function viewRole(id: string) {
    try {
      const res = await apiRequest<{ data: RoleDetail }>(`/admin/api/v1/roles/${id}`);
      setViewDetail(res.data);
      setViewingId(id);
    } catch { toast.error('Unable to load role details'); }
  }

  function togglePerm(pid: string) {
    setEditPerms((prev) => { const next = new Set(prev); if (next.has(pid)) next.delete(pid); else next.add(pid); return next; });
  }
  function toggleCreatePerm(pid: string) { setCreatePerms((old)=>{const next=new Set(old);next.has(pid)?next.delete(pid):next.add(pid);return next;}); }

  const groupedPerms: Record<string, Permission[]> = {};
  for (const p of allPerms) {
    const cat = permissionCategory(p.key);
    if (!groupedPerms[cat]) groupedPerms[cat] = [];
    groupedPerms[cat].push(p);
  }

  const editingRole = items.find((item) => item.id === editingId);
  const visibleRoles = isPlatform
    ? items.filter((item) => {
      if (roleView === 'platform') return item.scope === 'platform';
      if (roleView === 'tenant_defaults') return item.scope === 'tenant' && !item.tenant_id;
      return item.scope === 'tenant' && Boolean(item.tenant_id) && (!tenantFilter || item.tenant_id === tenantFilter);
    })
    : items.filter((item) => item.scope === 'tenant');
  const createNeedsTenant = isPlatform && roleView === 'tenant_custom';
  const createDisabled = saving || createNeedsTenant && !tenantId;
  const tenantName = (tenantID: string) => tenants.find((tenant) => tenant.id === tenantID)?.name || '';
  return (<>
    <Panel title="Roles" actions={can('roles.manage') ? <Button onClick={() => { setShowForm(!showForm); setEditingId(null); }} variant="primary" icon={showForm ? X : Plus}>{showForm ? 'Cancel' : 'Create role'}</Button> : undefined}>
      {isPlatform && (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
            <button type="button" onClick={() => { setRoleView('platform'); setTenantFilter(''); }} className={`focus-ring rounded px-3 py-1.5 text-sm font-medium ${roleView === 'platform' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Platform roles</button>
            <button type="button" onClick={() => { setRoleView('tenant_defaults'); setTenantFilter(''); }} className={`focus-ring rounded px-3 py-1.5 text-sm font-medium ${roleView === 'tenant_defaults' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Default tenant roles</button>
            <button type="button" onClick={() => setRoleView('tenant_custom')} className={`focus-ring rounded px-3 py-1.5 text-sm font-medium ${roleView === 'tenant_custom' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Tenant custom roles</button>
          </div>
          {roleView === 'tenant_custom' && <TenantFilter className="w-full sm:w-72" value={tenantFilter} onChange={setTenantFilter} tenants={tenants} />}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : visibleRoles.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No roles found</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Name</th><th>Key</th><th>Scope</th>{isPlatform && <th>Tenant</th>}<th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {visibleRoles.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-3 font-medium">{item.name}</td>
                    <td>{item.key}</td>
                    <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.scope === 'platform' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{item.scope}</span></td>
                    {isPlatform && <td className="text-xs text-slate-500">{item.tenant_id ? tenantName(item.tenant_id) || item.tenant_id : item.scope === 'tenant' ? 'All tenants' : '-'}</td>}
                    <td><StatusBadge status={item.status}/></td>
                    <td>
                      <div className="flex gap-1">
                        <RowActionButton onClick={() => viewRole(item.id)} icon={Eye}>View</RowActionButton>
                        {can('roles.manage') && <RowActionButton onClick={() => startEdit(item)} icon={Pencil}>Edit</RowActionButton>}
                        {can('roles.manage') && <RowActionButton onClick={() => requestConfirm({
                          title: 'Delete role',
                          description: 'This action cannot be undone',
                          body: <>Delete <strong className="text-slate-900">{item.name}</strong>?</>,
                          confirmLabel: 'Delete role',
                          variant: 'danger',
                          onConfirm: () => remove(item.id),
                        })} icon={Trash2} tone="danger">Delete</RowActionButton>}
                      </div>
                    </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

    </Panel>
    {showForm && <Modal title="Create role" description="Define its permissions for the selected role group." onClose={()=>setShowForm(false)} footer={<><ModalButton onClick={()=>setShowForm(false)}>Cancel</ModalButton><ModalButton variant="primary" disabled={createDisabled} onClick={()=>document.getElementById('role-create-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))}>{saving?'Creating...':'Create role'}</ModalButton></>}><form id="role-create-form" onSubmit={submit} className="space-y-5 px-6 py-5"><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm"><span className="mb-1 block font-medium">Role group</span><input value={isPlatform ? roleView === 'platform' ? 'Platform role' : roleView === 'tenant_defaults' ? 'Default tenant role' : 'Tenant custom role' : 'Tenant custom role'} readOnly className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"/></label>{createNeedsTenant&&<label className="block text-sm"><span className="mb-1 block font-medium">Tenant</span><SearchSelect value={tenantId} onChange={setTenantId} placeholder="Select tenant" options={tenants.map((t)=>({value:t.id,label:`${t.name} (${t.slug})`}))}/></label>}</div><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm"><span className="mb-1 block font-medium">Role name</span><input value={name} onChange={(e)=>setName(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" required/></label><label className="block text-sm"><span className="mb-1 block font-medium">Role key</span><input value={key} onChange={(e)=>setKey(e.target.value)} placeholder={roleView === 'platform' ? 'platform_support' : 'tenant_support'} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 font-mono" required/></label></div><div><div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">Permissions</span><button type="button" onClick={()=>setCreatePerms(createPerms.size===allPerms.length?new Set():new Set(allPerms.map((p)=>p.id)))} className="text-xs font-semibold text-blue-600">{createPerms.size===allPerms.length?'Clear all':'Select all'}</button></div><div className="max-h-[38vh] space-y-4 overflow-y-auto rounded-lg border border-slate-200 p-4">{Object.entries(groupedPerms).map(([cat,perms])=><section key={cat}><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{cat.replace(/_/g,' ')}</h3><div className="grid gap-2 sm:grid-cols-2">{perms.map((p)=><label key={p.id} className={`flex cursor-pointer gap-2 rounded-md border p-2.5 text-xs ${createPerms.has(p.id)?'border-blue-200 bg-blue-50':'border-slate-200'}`}><input type="checkbox" checked={createPerms.has(p.id)} onChange={()=>toggleCreatePerm(p.id)} className="rounded"/><span><b className="block font-mono">{p.key}</b><span className="text-slate-500">{p.description}</span></span></label>)}</div></section>)}</div></div></form></Modal>}
    {editingRole && <Modal title="Edit role" description="Update the role name and its permission policy." onClose={()=>setEditingId(null)} footer={<><ModalButton onClick={()=>setEditingId(null)}>Cancel</ModalButton><ModalButton variant="primary" disabled={saving} onClick={()=>saveEdit(editingRole.id)}>{saving?'Saving...':'Save changes'}</ModalButton></>}><div className="space-y-5 px-6 py-5"><label className="block text-sm"><span className="mb-1 block font-medium">Role name</span><input value={editName} onChange={(e)=>setEditName(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2"/></label><div className="max-h-[50vh] space-y-4 overflow-y-auto rounded-lg border border-slate-200 p-4">{Object.entries(groupedPerms).map(([cat,perms])=><section key={cat}><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{cat}</h3><div className="grid gap-2 sm:grid-cols-2">{perms.map((p)=><label key={p.id} className={`flex cursor-pointer gap-2 rounded-md border p-2.5 text-xs ${editPerms.has(p.id)?'border-blue-200 bg-blue-50':'border-slate-200'}`}><input type="checkbox" checked={editPerms.has(p.id)} onChange={()=>togglePerm(p.id)} className="rounded"/><span><b className="block font-mono text-slate-800">{p.key}</b><span className="text-slate-500">{p.description}</span></span></label>)}</div></section>)}</div></div></Modal>}
    {viewDetail && viewingId && <Modal title={viewDetail.name} description="Role configuration and effective permissions." onClose={()=>{setViewingId(null);setViewDetail(null)}} footer={<><ModalButton onClick={()=>{setViewingId(null);setViewDetail(null)}}>Close</ModalButton>{can('roles.manage')&&<ModalButton variant="primary" onClick={()=>{const role=viewDetail;setViewingId(null);setViewDetail(null);startEdit(role)}}>Edit role</ModalButton>}</>}><div className="px-6 py-5 text-sm"><div className="mb-4 grid grid-cols-2 gap-3">
            <div><span className="text-slate-500">Key:</span> {viewDetail.key}</div>
            <div><span className="text-slate-500">Scope:</span> {viewDetail.scope}</div>
            <div><span className="text-slate-500">Status:</span> <StatusBadge status={viewDetail.status}/></div>
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
        </div></Modal>}
    {confirmDialog}
  </>);
}
