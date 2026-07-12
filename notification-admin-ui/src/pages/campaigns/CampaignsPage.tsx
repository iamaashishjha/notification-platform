import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';
import { Plus, Play, XCircle } from 'lucide-react';
import { Modal, ModalButton } from '../../components/Modal';
import { SearchSelect } from '../../components/SearchSelect';
import { StatusBadge } from '../../components/StatusBadge';

type Campaign = { id: string; tenant_id: string; tenant_name?: string; name: string; description: string; status: string; scheduled_at: string; created_at: string };
type Tenant = { id: string; name: string; status: string };

export function CampaignsPage() {
  const { user, can } = useAuth();
  const isPlatform = user?.is_platform_admin ?? false;
  const [items, setItems] = useState<Campaign[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);

  useEffect(() => { if (isPlatform) list<Tenant>('/admin/api/v1/tenants').then((r) => setTenants(r.data)).catch(() => {}); }, [isPlatform]);

  const load = () => {
    setLoading(true);
    list<Campaign>('/admin/api/v1/campaigns' + (tenantFilter ? `?tenant_id=${tenantFilter}` : ''))
      .then((res) => setItems(res.data))
      .catch((err) => setError(err.message)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantFilter]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      await apiRequest('/admin/api/v1/campaigns', { method: 'POST', body: JSON.stringify({ name, description }) });
      setName(''); setDescription('');
      setShowForm(false);
      setMessage('Campaign created');
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Create failed'); }
    finally { setSaving(false); }
  }

  async function transition(id: string, action: string) {
    try {
      await apiRequest(`/admin/api/v1/campaigns/${id}/${action}`, { method: 'POST' });
      setMessage(`Campaign ${action}ed`);
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Action failed'); }
  }

  return (
    <Panel title="Campaigns" actions={can('campaigns.create') ? <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">{showForm ? 'Cancel' : <><Plus size={14} /> Create Campaign</>}</button> : undefined}>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      {showForm && <Modal title="Create campaign" description="Create a coordinated notification campaign for review and delivery." onClose={() => setShowForm(false)} footer={<><ModalButton onClick={() => setShowForm(false)}>Cancel</ModalButton><ModalButton type="submit" variant="primary" disabled={saving} onClick={() => document.getElementById('campaign-create-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}>{saving ? 'Creating...' : 'Create campaign'}</ModalButton></>} width="max-w-2xl">
        <form id="campaign-create-form" onSubmit={submit} className="space-y-5 px-6 py-5">
          <label className="block text-sm"><span className="mb-1.5 block font-medium">Campaign name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          </label><label className="block text-sm"><span className="mb-1.5 block font-medium">Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </form>
      </Modal>}

      {isPlatform && (
        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-medium">Tenant Filter</span>
          <SearchSelect value={tenantFilter} onChange={setTenantFilter} placeholder="All tenants" options={[{value:'',label:'All tenants'}, ...tenants.map((t) => ({value:t.id,label:t.name}))]} />
        </label>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No campaigns found</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Name</th>{isPlatform && <th>Tenant</th>}<th>Status</th><th>Scheduled</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-3 font-medium">{item.name}</td>
                {isPlatform && <td className="text-xs text-slate-500">{item.tenant_name || '-'}</td>}
                <td><StatusBadge status={item.status}/></td>
                <td>{item.scheduled_at || '-'}</td>
                <td>{item.created_at}</td>
                <td>
                  <div className="flex gap-1">
                    {item.status === 'draft' && can('campaigns.approve') && <button onClick={() => transition(item.id, 'approve')} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"><Play size={12} />Approve</button>}
                    {item.status === 'approved' && can('campaigns.send') && <button onClick={() => transition(item.id, 'send')} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50"><Play size={12} />Send</button>}
                    {(item.status === 'draft' || item.status === 'approved') && can('campaigns.cancel') && <button onClick={() => transition(item.id, 'cancel')} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"><XCircle size={12} />Cancel</button>}
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
