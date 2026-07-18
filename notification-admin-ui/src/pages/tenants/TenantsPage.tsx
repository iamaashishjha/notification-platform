import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { apiRequest, list, listPage } from '../../api/client';
import { Panel } from '../../components/Panel';
import { Modal, ModalButton } from '../../components/Modal';
import { Button, RowActionButton } from '../../components/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { SearchSelect } from '../../components/SearchSelect';
import { TablePagination } from '../../components/TablePagination';
import { StatusToggle } from '../../components/StatusToggle';
import { FilterToolbar, SearchControl, SelectFilter } from '../../components/ListFilters';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Bell, Eye, FileText, Layers3, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import { usePagination } from '../../hooks/usePagination';
import type { PaginationMeta } from '../../types/api';

type Tenant = { id: string; name: string; slug: string; status: string; created_at: string };
type CatalogFeature = { identifier: string; name: string; category: string };
type CatalogChannel = { channel: string; description: string; enabled: boolean };
type ProviderType = { provider: string; channel: string; enabled?: boolean };
type StarterTemplate = { template_key: string; channel: string; subject: string; body: string };
type ProvisionForm = { name:string; slug:string; timezone:string; country:string; default_sender:string; default_sms:string; features:string[]; channels:string[]; providers:Record<string,string>; templates:StarterTemplate[] };
const emptyProvision: ProvisionForm = { name:'',slug:'',timezone:'',country:'',default_sender:'',default_sms:'',features:[],channels:[],providers:{},templates:[] };

export function TenantsPage() {
  const { can, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { confirmDialog, requestConfirm } = useConfirmDialog();
  const isPlatform = user?.is_platform_admin;
  if (!can('tenants.view')) return <Navigate to="/" replace />;

  const [items, setItems] = useState<Tenant[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createErr, setCreateErr] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProvisionForm>(emptyProvision);
  const [features, setFeatures] = useState<CatalogFeature[]>([]);
  const [channels, setChannels] = useState<CatalogChannel[]>([]);
  const [providerTypes, setProviderTypes] = useState<ProviderType[]>([]);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<PaginationMeta>();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { page, perPage, setPage, setPerPage } = usePagination([search, statusFilter]);

  function load() {
    setLoading(true);
    listPage<Tenant>('/admin/api/v1/tenants', { q: search, filter_status: statusFilter, page, per_page: perPage }).then((res) => { setItems(res.data); setMeta(res.meta); }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }
  useEffect(load, [search, statusFilter, page, perPage]);
  useEffect(()=>{Promise.all([list<CatalogFeature>('/admin/api/v1/feature-catalog').then(r=>setFeatures(r.data)),list<CatalogChannel>('/admin/api/v1/channel-catalog').then(r=>setChannels(r.data.filter(c=>c.enabled))),list<ProviderType>('/admin/api/v1/provider-types').then(r=>setProviderTypes(r.data.filter((provider)=>provider.enabled !== false)))]).catch(()=>{});}, []);

  const payload = () => ({ name:form.name,slug:form.slug,settings:{timezone:form.timezone,country:form.country,default_sender:form.default_sender,default_sms:form.default_sms},features:form.features,channels:channels.map(c=>({channel:c.channel,enabled:form.channels.includes(c.channel),direction:c.channel==='websocket'||c.channel==='in_app'?'two_way':'one_way',rate_limit_per_second:10,daily_quota:10000})),providers:form.channels.filter(c=>form.providers[c]).map(channel=>({channel,provider:form.providers[channel],is_default:true})),templates:form.templates });

  async function handleCreate() {
    setCreateErr('');
    try {
      setSaving(true); await apiRequest('/admin/api/v1/tenants', { method: 'POST', body: JSON.stringify(payload()) });
      setShowCreate(false); setForm(emptyProvision); toast.success('Tenant created', form.name); load();
    } catch (err: any) { setCreateErr(err.message); toast.error('Unable to create tenant', err.message); }
    finally { setSaving(false); }
  }

  async function handleEdit(id: string) {
    try {
      setSaving(true); await apiRequest(`/admin/api/v1/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(payload()) });
      setEditId(null); toast.success('Tenant updated', form.name); load();
    } catch (err: any) { setCreateErr(err.message); toast.error('Unable to update tenant', err.message); }
    finally { setSaving(false); }
  }

  async function openEdit(item: Tenant) {
    setEditId(item.id); setForm({...emptyProvision,name:item.name,slug:item.slug});
    try { const [overview,settings,templates]=await Promise.all([apiRequest<any>(`/admin/api/v1/tenants/${item.id}/overview`),apiRequest<any>(`/admin/api/v1/tenants/${item.id}/settings`),list<StarterTemplate>(`/admin/api/v1/templates?tenant_id=${item.id}`)]); const ov=overview.data, cfg=settings.data; setCreateErr(''); setForm({name:item.name,slug:item.slug,timezone:cfg.timezone||'',country:cfg.country||'',default_sender:cfg.default_sender||'',default_sms:cfg.default_sms||'',features:ov.features.filter((f:any)=>f.enabled).map((f:any)=>f.feature_key),channels:ov.channels.filter((c:any)=>c.enabled).map((c:any)=>c.channel),providers:Object.fromEntries(ov.providers.filter((p:any)=>p.is_default&&p.status==='active').map((p:any)=>[p.channel,p.provider])),templates:templates.data.map(t=>({template_key:t.template_key,channel:t.channel,subject:t.subject||'',body:(t as any).body||''}))}); } catch(err:any){setCreateErr(err.message);toast.error('Unable to load tenant', err.message)}
  }

  async function toggleStatus(item: Tenant) {
    const newStatus = item.status === 'active' ? 'disabled' : 'active';
    try {
      await apiRequest(`/admin/api/v1/tenants/${item.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      toast.success(`Tenant ${newStatus}`, item.name);
      load();
    } catch (err: any) { setError(err.message); toast.error('Unable to update tenant status', err.message); }
  }

  const editingTenant = items.find((item)=>item.id===editId);
  return (<>
    <Panel
      title="Tenants"
      actions={isPlatform ? <Button onClick={() => { setForm(emptyProvision); setCreateErr(''); setShowCreate(true); }} variant="primary" icon={Plus}>Create tenant</Button> : undefined}
    >
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <FilterToolbar>
        <SearchControl id="tenant-search" label="Search tenants" value={search} onChange={setSearch} placeholder="Name, slug, status, or ID" />
        <SelectFilter id="tenant-status" label="Status" value={statusFilter} onChange={setStatusFilter}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
          <option value="suspended">Suspended</option>
        </SelectFilter>
        {(search || statusFilter) && <Button size="sm" icon={XCircle} onClick={() => { setSearch(''); setStatusFilter(''); }} className="template-clear-filters">Clear filters</Button>}
      </FilterToolbar>

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No tenants found</div>
      ) : (
        <>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Workspace</th><th>Slug</th><th>Status</th><th>Created</th><th className="text-right">Actions</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-semibold text-blue-700">{item.name.slice(0, 2).toUpperCase()}</span>
                    <div>
                      <div className="font-semibold text-slate-900">{item.name}</div>
                      <div className="mt-0.5 font-mono text-xs text-slate-400">{item.id.slice(0, 8)}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="font-mono text-sm text-slate-700">{item.slug}</span>
                </td>
                <td>
                  {isPlatform ? (
                    <StatusToggle
                      value={item.status === 'active'}
                      label={`${item.status === 'active' ? 'Disable' : 'Enable'} ${item.name}`}
                      onToggle={() => requestConfirm({
                        title: `${item.status === 'active' ? 'Disable' : 'Enable'} tenant`,
                        description: 'Confirm tenant status change',
                        body: <>Change <strong className="text-slate-900">{item.name}</strong> to <strong className="text-slate-900">{item.status === 'active' ? 'disabled' : 'enabled'}</strong>?</>,
                        confirmLabel: item.status === 'active' ? 'Disable' : 'Enable',
                        variant: item.status === 'active' ? 'danger' : 'primary',
                        onConfirm: () => toggleStatus(item),
                      })}
                    />
                  ) : <StatusBadge status={item.status}/>}
                </td>
                <td className="text-slate-500"><div>{new Date(item.created_at).toLocaleDateString()}</div><div className="text-xs">{new Date(item.created_at).toLocaleTimeString()}</div></td>
                <td>
                  <div className="flex justify-end gap-1">
                    <RowActionButton onClick={() => navigate(`/tenants/${item.id}`)} icon={Eye}>View</RowActionButton>
                    {isPlatform && (
                      <>
                        <RowActionButton onClick={() => openEdit(item)} icon={Pencil}>Edit</RowActionButton>
                      </>
                    )}
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
    {showCreate&&<TenantProvisionModal title="Create tenant" error={createErr} form={form} setForm={setForm} features={features} channels={channels} providerTypes={providerTypes} saving={saving} onClose={()=>setShowCreate(false)} onSave={handleCreate}/>}
    {editingTenant&&<TenantProvisionModal title="Edit tenant" error={createErr} form={form} setForm={setForm} features={features} channels={channels} providerTypes={providerTypes} saving={saving} onClose={()=>setEditId(null)} onSave={()=>handleEdit(editingTenant.id)}/>}
    {confirmDialog}
  </>);
}

function TenantProvisionModal({title,error,form,setForm,features,channels,providerTypes,saving,onClose,onSave}:{title:string;error?:string;form:ProvisionForm;setForm:(value:ProvisionForm)=>void;features:CatalogFeature[];channels:CatalogChannel[];providerTypes:ProviderType[];saving:boolean;onClose:()=>void;onSave:()=>void}) {
  const toggle=(field:'features'|'channels',value:string)=>setForm({...form,[field]:form[field].includes(value)?form[field].filter(v=>v!==value):[...form[field],value]});
  const updateTemplate=(index:number,patch:Partial<StarterTemplate>)=>setForm({...form,templates:form.templates.map((t,i)=>i===index?{...t,...patch}:t)});
  const stats = [
    { label: 'Capabilities', value: form.features.length, icon: Layers3 },
    { label: 'Channels', value: form.channels.length, icon: Bell },
    { label: 'Templates', value: form.templates.length, icon: FileText },
  ];
  return <Modal title={title} description="Provision the tenant workspace, delivery access, provider defaults, and starter content." onClose={onClose} width="max-w-4xl" footer={<><ModalButton onClick={onClose}>Cancel</ModalButton><ModalButton variant="primary" disabled={saving||!form.name||!form.slug} onClick={onSave}>{saving?'Saving...':title.startsWith('Create')?'Create tenant':'Save changes'}</ModalButton></>}>
    <div className="space-y-5 px-6 py-5">{error&&<div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
        {stats.map(({label,value,icon:Icon})=><div key={label} className="flex items-center gap-3 rounded-md bg-white px-3 py-2"><span className="rounded-md bg-blue-50 p-2 text-blue-600"><Icon size={16}/></span><div><div className="text-lg font-semibold text-slate-900">{value}</div><div className="text-xs text-slate-500">{label}</div></div></div>)}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4"><h3 className="font-semibold text-slate-900">Workspace identity</h3><p className="mt-1 text-sm text-slate-500">Basic tenant metadata and default sender values.</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ['Tenant name','name','Acme Finance'],
            ['Workspace slug','slug','acme-finance'],
            ['Timezone','timezone','Asia/Kathmandu'],
            ['Country','country','Nepal'],
            ['Default email sender','default_sender','notifications@example.com'],
            ['Default SMS sender','default_sms','ACME'],
          ].map(([label,key,placeholder])=><label key={key} className="text-sm"><span className="mb-1 block font-medium">{label}</span><input value={(form as any)[key]} onChange={e=>setForm({...form,[key]:e.target.value})} placeholder={placeholder} className={`focus-ring w-full rounded-md border border-slate-300 px-3 py-2 ${key==='slug'?'font-mono':''}`}/></label>)}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Capabilities</h3><p className="mt-1 text-sm text-slate-500">Choose which platform modules this tenant can use.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{form.features.length} selected</span></div>
        <div className="grid gap-2 md:grid-cols-2">{features.map(feature=><label key={feature.identifier} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${form.features.includes(feature.identifier)?'border-blue-300 bg-blue-50':'border-slate-200 bg-white hover:border-blue-200'}`}><input type="checkbox" className="mt-1" checked={form.features.includes(feature.identifier)} onChange={()=>toggle('features',feature.identifier)}/><span><b className="block text-slate-900">{feature.name}</b><small className="text-slate-500">{feature.category}</small></span></label>)}</div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Delivery channels and providers</h3><p className="mt-1 text-sm text-slate-500">Enable tenant channels and assign the default provider per channel.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{form.channels.length} enabled</span></div>
        <div className="grid gap-3 lg:grid-cols-2">{channels.map(channel=>{
          const enabled = form.channels.includes(channel.channel);
          const providers = providerTypes.filter(p=>p.channel===channel.channel||(channel.channel==='in_app'&&p.channel==='websocket'));
          return <div key={channel.channel} className={`rounded-lg border p-3 ${enabled?'border-blue-300 bg-blue-50/70':'border-slate-200 bg-white'}`}>
            <div className="flex items-start justify-between gap-3">
              <label className="flex items-start gap-2 text-sm font-medium capitalize text-slate-900"><input type="checkbox" className="mt-1" checked={enabled} onChange={()=>toggle('channels',channel.channel)}/><span>{channel.channel.replace(/_/g,' ')}<small className="mt-0.5 block font-normal normal-case text-slate-500">{channel.description || 'Tenant delivery channel'}</small></span></label>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${enabled?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{enabled?'Enabled':'Disabled'}</span>
            </div>
            {enabled&&<div className="mt-3"><SearchSelect value={form.providers[channel.channel]||''} onChange={value=>setForm({...form,providers:{...form.providers,[channel.channel]:value}})} placeholder={providers.length?'Select default provider':'No provider types available'} options={providers.map(p=>({value:p.provider,label:p.provider.replace(/_/g,' ')}))}/></div>}
          </div>
        })}</div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Starter templates</h3><p className="mt-1 text-sm text-slate-500">Optional seed templates to create with this tenant.</p></div><RowActionButton type="button" onClick={()=>setForm({...form,templates:[...form.templates,{template_key:'',channel:form.channels[0]||'email',subject:'',body:''}]})} icon={Plus}>Add template</RowActionButton></div>
        <div className="space-y-3">{form.templates.length===0?<div className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400">No starter templates added</div>:form.templates.map((template,index)=><div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold text-slate-800">Template {index+1}</div><RowActionButton type="button" onClick={()=>setForm({...form,templates:form.templates.filter((_,i)=>i!==index)})} icon={Trash2} tone="danger">Remove</RowActionButton></div><div className="grid gap-3 md:grid-cols-2"><input value={template.template_key} onChange={e=>updateTemplate(index,{template_key:e.target.value})} placeholder="Template key" className="focus-ring rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"/><SearchSelect value={template.channel} onChange={value=>updateTemplate(index,{channel:value})} options={(form.channels.length?form.channels:channels.map(c=>c.channel)).map(channel=>({value:channel,label:channel.replace(/_/g,' ')}))}/></div><input value={template.subject} onChange={e=>updateTemplate(index,{subject:e.target.value})} placeholder="Subject (optional)" className="focus-ring mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"/><textarea value={template.body} onChange={e=>updateTemplate(index,{body:e.target.value})} placeholder="Template message body" rows={3} className="focus-ring mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"/></div>)}</div>
      </section>
    </div>
  </Modal>
}
