import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list, listPage } from '../../api/client';
import { Panel } from '../../components/Panel';
import { Modal, ModalButton } from '../../components/Modal';
import { Button, RowActionButton } from '../../components/Button';
import { SearchSelect } from '../../components/SearchSelect';
import { TenantFilter } from '../../components/TenantFilter';
import { StatusBadge } from '../../components/StatusBadge';
import { TablePagination } from '../../components/TablePagination';
import { useAuth } from '../../auth/AuthContext';
import { Check, Copy, Eye, KeyRound, Plus, Search, Trash2, X } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { usePagination } from '../../hooks/usePagination';
import type { PaginationMeta } from '../../types/api';

type ApiKey = { id: string; tenant_id: string; tenant_name?: string; name: string; scopes: string; status: string; last_used_at: string; created_at: string };
type Tenant = { id: string; name: string; slug: string; status: string };

export function ApiKeysPage() {
  const { user, can } = useAuth();
  const toast = useToast();
  const isPlatform = user?.is_platform_admin ?? false;
  const [items, setItems] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [selected, setSelected] = useState<ApiKey | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [search, setSearch] = useState('');
  const [meta, setMeta] = useState<PaginationMeta>();
  const { page, perPage, setPage, setPerPage } = usePagination([tenantFilter, search]);

  const load = () => {
    setLoading(true);
    listPage<ApiKey>('/admin/api/v1/api-keys', { tenant_id: tenantFilter, q: search, page, per_page: perPage })
      .then((res) => { setItems(res.data); setMeta(res.meta); })
      .catch((err) => toast.error('Unable to load API keys', err instanceof Error ? err.message : 'Load failed'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [tenantFilter, search, page, perPage]);
  useEffect(() => { if (isPlatform) list<Tenant>('/admin/api/v1/tenants').then((res)=>setTenants(res.data)).catch(()=>{}); }, [isPlatform]);

  function chooseTenant(value: string) {
    setTenantId(value);
    const tenant = tenants.find((item)=>item.id===value);
    if (tenant && (!name || tenants.some((item)=>name===`${item.name} API Key`))) setName(`${tenant.name} API Key`);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setNewKey('');
    try {
      const res = await apiRequest<{ id: string; api_key: string; message: string }>('/admin/api/v1/api-keys', { method: 'POST', body: JSON.stringify({ name, ...(isPlatform ? { tenant_id: tenantId } : {}) }) });
      setNewKey(res.api_key);
      setName('');
      toast.success('API key created', 'Copy it now. It will not be shown again.');
      load();
    } catch (err) { toast.error('Unable to create API key', err instanceof Error ? err.message : 'Create failed'); }
    finally { setSaving(false); }
  }

  async function copyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function revoke(id: string) {
    try {
      await apiRequest(`/admin/api/v1/api-keys/${id}`, { method: 'DELETE' });
      setRevokeTarget(null);
      toast.success('API key revoked');
      load();
    } catch (err) { toast.error('Unable to revoke API key', err instanceof Error ? err.message : 'Revoke failed'); }
  }

  return (<>
    <Panel title="API Keys" actions={can('api_keys.create') ? <Button onClick={() => { setTenantId(tenantFilter); setShowForm(!showForm); }} variant="primary" icon={showForm ? X : Plus}>{showForm ? 'Cancel' : 'Create API key'}</Button> : undefined}>
      <div className="template-toolbar">
        <div className="template-search-control">
          <label htmlFor="api-key-search">Search API keys</label>
          <div className="template-control-input">
            <Search aria-hidden="true" size={16} />
            <input id="api-key-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, tenant, scope, or status" />
          </div>
        </div>
        {isPlatform && <TenantFilter className="template-filter-control template-tenant-control" value={tenantFilter} onChange={setTenantFilter} tenants={tenants} />}
        {(search || tenantFilter) && <Button size="sm" icon={X} onClick={() => { setSearch(''); setTenantFilter(''); }} className="template-clear-filters">Clear filters</Button>}
      </div>

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No API keys found</div>
      ) : (
        <>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Name</th>{isPlatform && <th>Tenant</th>}<th>Status</th><th>Last Used</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-3 font-medium">{item.name}</td>
                {isPlatform && <td className="text-xs text-slate-500">{item.tenant_name || '-'}</td>}
                <td><StatusBadge status={item.status}/></td>
                <td>{item.last_used_at || 'never'}</td>
                <td>{item.created_at}</td>
                <td>
                  <div className="flex gap-1">
                    {can('api_keys.view') && <RowActionButton onClick={() => setSelected(item)} icon={Eye}>Manage</RowActionButton>}
                    {item.status === 'active' && can('api_keys.revoke') && <RowActionButton onClick={() => setRevokeTarget(item)} icon={Trash2} tone="danger">Revoke</RowActionButton>}
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
    {showForm && !newKey && <Modal title="Create API key" description="Create a tenant-scoped credential for a server, integration, or automated workflow." onClose={() => setShowForm(false)} width="max-w-2xl" footer={<><ModalButton onClick={() => setShowForm(false)}>Cancel</ModalButton><ModalButton variant="primary" disabled={saving || (isPlatform && !tenantId)} onClick={() => document.getElementById('api-key-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))}>{saving ? 'Creating…' : 'Create API key'}</ModalButton></>}><form id="api-key-form" onSubmit={submit} className="space-y-4 px-6 py-5">{isPlatform&&<label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Tenant <span className="text-red-500">*</span></span><SearchSelect value={tenantId} onChange={chooseTenant} placeholder="Select tenant" options={tenants.filter((tenant)=>tenant.status==='active').map((tenant)=>({value:tenant.id,label:`${tenant.name} (${tenant.slug})`}))}/></label>}<label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Key name <span className="text-red-500">*</span></span><input autoFocus={!isPlatform} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tenant name API Key" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" required /><span className="mt-1.5 block text-xs text-slate-500">Defaults to the selected tenant name and can be customized for its integration.</span></label></form></Modal>}
    {selected&&<Modal title={selected.name} description="Tenant API key metadata and administrative controls." onClose={()=>setSelected(null)} width="max-w-2xl" footer={<><ModalButton onClick={()=>setSelected(null)}>Close</ModalButton>{selected.status==='active'&&can('api_keys.revoke')&&<ModalButton variant="danger" onClick={()=>{setSelected(null);setRevokeTarget(selected)}}>Revoke key</ModalButton>}</>}><dl className="grid gap-4 px-6 py-5 sm:grid-cols-2">{[['Tenant',selected.tenant_name||selected.tenant_id],['Status',selected.status],['Scopes',selected.scopes||'[]'],['Last used',selected.last_used_at||'Never'],['Created',selected.created_at],['Key ID',selected.id]].map(([label,value])=><div key={label} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 break-all text-sm font-medium">{value}</dd></div>)}</dl></Modal>}
    {newKey && <Modal title="API key created" description="Copy this credential now. For security, it cannot be displayed again." onClose={() => { setNewKey(''); setShowForm(false); }} width="max-w-2xl" footer={<ModalButton variant="primary" onClick={() => { setNewKey(''); setShowForm(false); }}>I have saved the key</ModalButton>}><div className="px-6 py-5"><div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"><KeyRound className="mt-0.5 shrink-0 text-amber-600" size={18} /><p className="text-sm leading-5 text-amber-800">Store this key in a secure secrets manager. Anyone with this value can authenticate as this tenant.</p></div><div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 bg-slate-950"><code className="min-w-0 flex-1 break-all px-4 py-3 font-mono text-sm leading-6 text-slate-100">{newKey}</code><Button onClick={copyKey} variant="ghost" icon={copied ? Check : Copy} className="w-28 shrink-0 rounded-none border-0 border-l border-slate-700 bg-slate-900 text-white hover:bg-slate-800 hover:text-white">{copied ? 'Copied' : 'Copy'}</Button></div></div></Modal>}
    {revokeTarget && <Modal title="Revoke API key" description="This credential will stop working immediately." onClose={() => setRevokeTarget(null)} width="max-w-md" footer={<><ModalButton onClick={() => setRevokeTarget(null)}>Cancel</ModalButton><ModalButton variant="danger" onClick={() => revoke(revokeTarget.id)}>Revoke key</ModalButton></>}><div className="px-6 py-5 text-sm leading-6 text-slate-600">Revoke <strong className="text-slate-900">{revokeTarget.name}</strong>? Any integration using this key will lose access and may begin failing.</div></Modal>}
  </>);
}
