import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list, listPage } from '../../api/client';
import { Panel } from '../../components/Panel';
import { Modal, ModalButton } from '../../components/Modal';
import { Button, RowActionButton } from '../../components/Button';
import { SearchSelect } from '../../components/SearchSelect';
import { TenantFilter } from '../../components/TenantFilter';
import { StatusBadge } from '../../components/StatusBadge';
import { TablePagination } from '../../components/TablePagination';
import { FilterToolbar, SearchControl } from '../../components/ListFilters';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { useAuth } from '../../auth/AuthContext';
import { Eye, Plus, Trash2, UserPlus, UserX, X } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { usePagination } from '../../hooks/usePagination';
import type { PaginationMeta } from '../../types/api';

type Group = { id: string; tenant_id: string; tenant_name?: string; name: string; description: string; member_count: number; status: string; created_at: string };
type Contact = { id: string; name: string; email: string; phone: string };
type Member = { id: string; name: string; email: string; phone: string };
type Tenant = { id: string; name: string; slug: string; status: string };

export function GroupsPage() {
  const { user, can } = useAuth();
  const toast = useToast();
  const { confirmDialog, requestConfirm } = useConfirmDialog();
  const isPlatform = user?.is_platform_admin ?? false;
  const [items, setItems] = useState<Group[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [showAddMember, setShowAddMember] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantFilter, setTenantFilter] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>();
  const { page, perPage, setPage, setPerPage } = usePagination([tenantFilter, search]);

  const load = () => {
    setLoading(true);
    listPage<Group>('/admin/api/v1/groups', { tenant_id: tenantFilter, q: search, page, per_page: perPage })
      .then((res) => { setItems(res.data); setMeta(res.meta); })
      .catch((err) => toast.error('Unable to load groups', err instanceof Error ? err.message : 'Load failed')).finally(() => setLoading(false));
  };
  const loadContacts = () => list<Contact>('/admin/api/v1/contacts').then((res) => setContacts(res.data)).catch(() => {});

  useEffect(() => { load(); loadContacts(); }, [tenantFilter, search, page, perPage]);
  useEffect(() => { if (isPlatform) list<Tenant>('/admin/api/v1/tenants').then((res) => setTenants(res.data)).catch(() => {}); }, [isPlatform]);

  async function loadMembers(groupId: string) {
    try {
      const res = await list<Member>(`/admin/api/v1/groups/${groupId}/members`);
      setMembers(res.data);
    } catch (err) { toast.error('Unable to load members', err instanceof Error ? err.message : 'Load failed'); }
  }

  function toggleGroup(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    loadMembers(id);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      await apiRequest('/admin/api/v1/groups', { method: 'POST', body: JSON.stringify({ name, description }) });
      setName(''); setDescription(''); setShowForm(false); toast.success('Group created', name);
      load();
    } catch (err) { const msg = err instanceof Error ? err.message : 'Create failed'; setFormError(msg); toast.error('Unable to create group', msg); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    try { await apiRequest(`/admin/api/v1/groups/${id}`, { method: 'DELETE' }); toast.success('Group deleted'); load(); }
    catch (err) { const msg = err instanceof Error ? err.message : 'Delete failed'; toast.error('Unable to delete group', msg); }
  }

  async function addMember(groupId: string, contactId: string) {
    try {
      await apiRequest(`/admin/api/v1/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ contact_id: contactId }) });
      toast.success('Member added');
      loadMembers(groupId);
    } catch (err) { const msg = err instanceof Error ? err.message : 'Add failed'; toast.error('Unable to add member', msg); }
  }

  async function removeMember(groupId: string, contactId: string) {
    try {
      await apiRequest(`/admin/api/v1/groups/${groupId}/members/${contactId}`, { method: 'DELETE' });
      toast.success('Member removed');
      loadMembers(groupId);
    } catch (err) { const msg = err instanceof Error ? err.message : 'Remove failed'; toast.error('Unable to remove member', msg); }
  }

  const expandedGroup = items.find((item)=>item.id===expanded);
  return (<>
    <Panel title="Contact Groups" actions={can('groups.create') ? <Button onClick={() => { setFormError(''); setShowForm(!showForm); }} variant="primary" icon={showForm ? X : Plus}>{showForm ? 'Cancel' : 'Create group'}</Button> : undefined}>
      <FilterToolbar>
        <SearchControl id="group-search" label="Search groups" value={search} onChange={setSearch} placeholder="Group, description, or tenant" />
        {isPlatform && <TenantFilter value={tenantFilter} onChange={setTenantFilter} tenants={tenants} />}
      </FilterToolbar>

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No groups found</div>
      ) : (
        <>
        <table data-no-datatable="true" className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Name</th>{isPlatform && <th>Tenant</th>}<th>Members</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <>
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="py-3 font-medium">{item.name}</td>
                  {isPlatform && <td className="text-xs text-slate-500">{item.tenant_name || '-'}</td>}
                  <td>{item.member_count}</td>
                  <td><StatusBadge status={item.status}/></td>
                  <td className="text-right">
                    <RowActionButton onClick={() => toggleGroup(item.id)} icon={Eye}>View members</RowActionButton>
                    {can('groups.delete') && <RowActionButton onClick={() => requestConfirm({
                      title: 'Delete contact group',
                      description: 'This action cannot be undone',
                      body: <>Delete <strong className="text-slate-900">{item.name}</strong>?</>,
                      confirmLabel: 'Delete group',
                      variant: 'danger',
                      onConfirm: () => remove(item.id),
                    })} icon={Trash2} tone="danger">Delete</RowActionButton>}
                  </td>
                </tr>
              </>
            ))}
          </tbody>
        </table>
        <TablePagination meta={meta} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={setPerPage} />
        </>
      )}
    </Panel>
    {showForm&&<Modal title="Create contact group" description="Create a reusable audience for notification delivery." onClose={()=>setShowForm(false)} width="max-w-2xl" footer={<><ModalButton onClick={()=>setShowForm(false)}>Cancel</ModalButton><ModalButton variant="primary" disabled={saving} onClick={()=>document.getElementById('group-create-form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))}>{saving?'Creating...':'Create group'}</ModalButton></>}><form id="group-create-form" onSubmit={submit} className="space-y-4 px-6 py-5">{formError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}<label className="block text-sm"><span className="mb-1 block font-medium">Group name</span><input value={name} onChange={(e)=>setName(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" required/></label><label className="block text-sm"><span className="mb-1 block font-medium">Description</span><textarea value={description} onChange={(e)=>setDescription(e.target.value)} rows={3} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2"/></label></form></Modal>}
    {expandedGroup&&<Modal title={expandedGroup.name} description={`${expandedGroup.member_count} contacts in this delivery audience.`} onClose={()=>{setExpanded(null);setShowAddMember(null)}} footer={<ModalButton onClick={()=>{setExpanded(null);setShowAddMember(null)}}>Close</ModalButton>}><div className="px-6 py-5">{can('groups.members.manage')&&<div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4"><Button onClick={()=>setShowAddMember(showAddMember?null:expandedGroup.id)} variant="primary" icon={UserPlus}>Add member</Button>{showAddMember&&<div className="mt-3"><SearchSelect value="" placeholder="Search contacts to add" onChange={(value)=>{addMember(expandedGroup.id,value);setShowAddMember(null)}} options={contacts.filter((c)=>!members.some((m)=>m.id===c.id)).map((c)=>({value:c.id,label:`${c.name} (${c.email||c.phone||'no contact info'})`}))}/></div>}</div>}{members.length===0?<div className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">No members in this group</div>:<table className="w-full text-left text-sm"><thead className="border-b text-slate-500"><tr><th className="py-2">Name</th><th>Email</th><th>Phone</th><th/></tr></thead><tbody>{members.map((m)=><tr key={m.id} className="border-b border-slate-100"><td className="py-3 font-medium">{m.name}</td><td>{m.email||'-'}</td><td>{m.phone||'-'}</td><td>{can('groups.members.manage')&&<RowActionButton onClick={()=>requestConfirm({title:'Remove group member',description:'Confirm member removal',body:<>Remove <strong className="text-slate-900">{m.name}</strong> from this group?</>,confirmLabel:'Remove member',variant:'danger',onConfirm:()=>removeMember(expandedGroup.id,m.id)})} icon={UserX} tone="danger">Remove</RowActionButton>}</td></tr>)}</tbody></table>}</div></Modal>}
    {confirmDialog}
  </>);
}
