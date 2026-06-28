import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';
import { Plus, Trash2, UserPlus, UserX } from 'lucide-react';

type Group = { id: string; tenant_id: string; tenant_name?: string; name: string; description: string; member_count: number; status: string; created_at: string };
type Contact = { id: string; name: string; email: string; phone: string };
type Member = { id: string; name: string; email: string; phone: string };

export function GroupsPage() {
  const { user, can } = useAuth();
  const isPlatform = user?.is_platform_admin ?? false;
  const [items, setItems] = useState<Group[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [showAddMember, setShowAddMember] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantFilter, setTenantFilter] = useState('');

  const load = () => {
    setLoading(true);
    list<Group>('/admin/api/v1/groups' + (tenantFilter ? `?tenant_id=${tenantFilter}` : ''))
      .then((res) => setItems(res.data))
      .catch((err) => setError(err.message)).finally(() => setLoading(false));
  };
  const loadContacts = () => list<Contact>('/admin/api/v1/contacts').then((res) => setContacts(res.data)).catch(() => {});

  useEffect(() => { load(); loadContacts(); }, [tenantFilter]);

  async function loadMembers(groupId: string) {
    try {
      const res = await list<Member>(`/admin/api/v1/groups/${groupId}/members`);
      setMembers(res.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Load failed'); }
  }

  function toggleGroup(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    loadMembers(id);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      await apiRequest('/admin/api/v1/groups', { method: 'POST', body: JSON.stringify({ name, description }) });
      setName(''); setDescription(''); setShowForm(false); setMessage('Group created');
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Create failed'); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this group?')) return;
    try { await apiRequest(`/admin/api/v1/groups/${id}`, { method: 'DELETE' }); setMessage('Group deleted'); load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Delete failed'); }
  }

  async function addMember(groupId: string, contactId: string) {
    try {
      await apiRequest(`/admin/api/v1/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ contact_id: contactId }) });
      setMessage('Member added');
      loadMembers(groupId);
    } catch (err) { setError(err instanceof Error ? err.message : 'Add failed'); }
  }

  async function removeMember(groupId: string, contactId: string) {
    try {
      await apiRequest(`/admin/api/v1/groups/${groupId}/members/${contactId}`, { method: 'DELETE' });
      setMessage('Member removed');
      loadMembers(groupId);
    } catch (err) { setError(err instanceof Error ? err.message : 'Remove failed'); }
  }

  return (
    <Panel title="Contact Groups" actions={can('groups.create') ? <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">{showForm ? 'Cancel' : <><Plus size={14} /> Create Group</>}</button> : undefined}>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      {showForm && (
        <form onSubmit={submit} className="mb-6 max-w-lg space-y-3 rounded-md border border-slate-200 p-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={2} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={saving} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Saving...' : 'Create'}</button>
        </form>
      )}

      {isPlatform && (
        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-medium">Tenant Filter</span>
          <input value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} placeholder="Filter by tenant ID" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No groups found</div>
      ) : (
        <table className="w-full text-left text-sm">
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
                  <td>{item.status}</td>
                  <td className="text-right">
                    <button onClick={() => toggleGroup(item.id)} className="text-blue-600 hover:underline mr-3">{expanded === item.id ? 'Hide' : 'Members'}</button>
                    {can('groups.delete') && <button onClick={() => remove(item.id)} className="inline-flex items-center gap-1 text-red-600 hover:underline"><Trash2 size={12} />Delete</button>}
                  </td>
                </tr>
                {expanded === item.id && (
                  <tr key={`${item.id}-members`}>
                    <td colSpan={isPlatform ? 5 : 4} className="bg-slate-50 p-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {can('groups.members.manage') && <button onClick={() => setShowAddMember(showAddMember === item.id ? null : item.id)} className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white"><UserPlus size={12} />Add Member</button>}
                        </div>
                        {showAddMember === item.id && (
                          <div className="mb-3 flex gap-2">
                            <select className="rounded border px-2 py-1 text-xs" onChange={(e) => addMember(item.id, e.target.value)} defaultValue="">
                              <option value="" disabled>Select contact...</option>
                              {contacts.filter((c) => !members.find((m) => m.id === c.id)).map((c) => (
                                <option key={c.id} value={c.id}>{c.name} ({c.email || c.phone || 'no contact info'})</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {members.length === 0 ? (
                          <div className="text-sm text-slate-500">No members</div>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead><tr className="text-slate-500"><th className="py-1">Name</th><th>Email</th><th>Phone</th><th /></tr></thead>
                            <tbody>
                              {members.map((m) => (
                                <tr key={m.id} className="border-t border-slate-100">
                                  <td className="py-1">{m.name}</td><td>{m.email || '-'}</td><td>{m.phone || '-'}</td>
                                  <td>{can('groups.members.manage') && <button onClick={() => removeMember(item.id, m.id)} className="inline-flex items-center gap-1 text-red-600 hover:underline"><UserX size={12} />Remove</button>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
