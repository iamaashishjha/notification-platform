import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list, listPage } from '../../api/client';
import { Panel } from '../../components/Panel';
import { Button, RowActionButton } from '../../components/Button';
import { useAuth } from '../../auth/AuthContext';
import { Plus, Play, Search, Send, X, XCircle } from 'lucide-react';
import { Modal, ModalButton } from '../../components/Modal';
import { TenantFilter } from '../../components/TenantFilter';
import { StatusBadge } from '../../components/StatusBadge';
import { TablePagination } from '../../components/TablePagination';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { usePagination } from '../../hooks/usePagination';
import type { PaginationMeta } from '../../types/api';

type Campaign = { id: string; tenant_id: string; tenant_name?: string; name: string; description: string; status: string; scheduled_at: string; created_at: string };
type Tenant = { id: string; name: string; slug?: string; status: string };

export function CampaignsPage() {
  const { user, can } = useAuth();
  const toast = useToast();
  const { confirmDialog, requestConfirm } = useConfirmDialog();
  const isPlatform = user?.is_platform_admin ?? false;
  const [items, setItems] = useState<Campaign[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [tenantFilter, setTenantFilter] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');
  const [meta, setMeta] = useState<PaginationMeta>();
  const { page, perPage, setPage, setPerPage } = usePagination([tenantFilter, search]);

  useEffect(() => { if (isPlatform) list<Tenant>('/admin/api/v1/tenants').then((r) => setTenants(r.data)).catch(() => {}); }, [isPlatform]);

  const load = () => {
    setLoading(true);
    listPage<Campaign>('/admin/api/v1/campaigns', { tenant_id: tenantFilter, q: search, page, per_page: perPage })
      .then((res) => { setItems(res.data); setMeta(res.meta); })
      .catch((err) => toast.error('Unable to load campaigns', err instanceof Error ? err.message : 'Load failed')).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantFilter, search, page, perPage]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setFormError('');
    try {
      await apiRequest('/admin/api/v1/campaigns', { method: 'POST', body: JSON.stringify({ name, description }) });
      setName(''); setDescription('');
      setShowForm(false);
      toast.success('Campaign created', name);
      load();
    } catch (err) { const msg = err instanceof Error ? err.message : 'Create failed'; setFormError(msg); toast.error('Unable to create campaign', msg); }
    finally { setSaving(false); }
  }

  async function transition(id: string, action: string) {
    try {
      await apiRequest(`/admin/api/v1/campaigns/${id}/${action}`, { method: 'POST' });
      toast.success(`Campaign ${action}ed`);
      load();
    } catch (err) { const msg = err instanceof Error ? err.message : 'Action failed'; toast.error('Campaign action failed', msg); }
  }

  return (
    <Panel title="Campaigns" actions={can('campaigns.create') ? <Button onClick={() => { setFormError(''); setShowForm(!showForm); }} variant="primary" icon={showForm ? X : Plus}>{showForm ? 'Cancel' : 'Create campaign'}</Button> : undefined}>
      {showForm && <Modal title="Create campaign" description="Create a coordinated notification campaign for review and delivery." onClose={() => setShowForm(false)} footer={<><ModalButton onClick={() => setShowForm(false)}>Cancel</ModalButton><ModalButton type="submit" variant="primary" disabled={saving} onClick={() => document.getElementById('campaign-create-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))}>{saving ? 'Creating...' : 'Create campaign'}</ModalButton></>} width="max-w-2xl">
        <form id="campaign-create-form" onSubmit={submit} className="space-y-5 px-6 py-5">
          {formError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}
          <label className="block text-sm"><span className="mb-1.5 block font-medium">Campaign name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          </label><label className="block text-sm"><span className="mb-1.5 block font-medium">Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </form>
      </Modal>}

      <div className="template-toolbar">
        <div className="template-search-control">
          <label htmlFor="campaign-search">Search campaigns</label>
          <div className="template-control-input">
            <Search aria-hidden="true" size={16} />
            <input id="campaign-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, description, tenant, or status" />
          </div>
        </div>
        {isPlatform && <TenantFilter className="template-filter-control template-tenant-control" value={tenantFilter} onChange={setTenantFilter} tenants={tenants} />}
        {(search || tenantFilter) && <Button size="sm" icon={X} onClick={() => { setSearch(''); setTenantFilter(''); }} className="template-clear-filters">Clear filters</Button>}
      </div>

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No campaigns found</div>
      ) : (
        <>
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
                    {item.status === 'draft' && can('campaigns.approve') && <RowActionButton onClick={() => requestConfirm({title:'Approve campaign',description:'Confirm campaign action',body:<>Approve <strong className="text-slate-900">{item.name}</strong>?</>,confirmLabel:'Approve',onConfirm:()=>transition(item.id, 'approve')})} icon={Play}>Approve</RowActionButton>}
                    {item.status === 'approved' && can('campaigns.send') && <RowActionButton onClick={() => requestConfirm({title:'Send campaign',description:'Confirm campaign action',body:<>Send <strong className="text-slate-900">{item.name}</strong> now?</>,confirmLabel:'Send campaign',onConfirm:()=>transition(item.id, 'send')})} icon={Send} tone="success">Send</RowActionButton>}
                    {(item.status === 'draft' || item.status === 'approved') && can('campaigns.cancel') && <RowActionButton onClick={() => requestConfirm({title:'Cancel campaign',description:'Confirm campaign action',body:<>Cancel <strong className="text-slate-900">{item.name}</strong>?</>,confirmLabel:'Cancel campaign',variant:'danger',onConfirm:()=>transition(item.id, 'cancel')})} icon={XCircle} tone="danger">Cancel</RowActionButton>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination meta={meta} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={setPerPage} />
        </>
      )}
      {confirmDialog}
    </Panel>
  );
}
