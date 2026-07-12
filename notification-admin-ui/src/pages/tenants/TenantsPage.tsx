import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { Modal, ModalButton } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { SearchSelect } from '../../components/SearchSelect';
import { useAuth } from '../../auth/AuthContext';

type Tenant = { id: string; name: string; slug: string; status: string; created_at: string };
type CatalogFeature = { identifier: string; name: string; category: string };
type CatalogChannel = { channel: string; description: string; enabled: boolean };
type ProviderType = { provider: string; channel: string };
type StarterTemplate = { template_key: string; channel: string; subject: string; body: string };
type ProvisionForm = { name:string; slug:string; timezone:string; country:string; default_sender:string; default_sms:string; features:string[]; channels:string[]; providers:Record<string,string>; templates:StarterTemplate[] };
const emptyProvision: ProvisionForm = { name:'',slug:'',timezone:'',country:'',default_sender:'',default_sms:'',features:[],channels:[],providers:{},templates:[] };

export function TenantsPage() {
  const { can, user } = useAuth();
  const navigate = useNavigate();
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

  function load() {
    setLoading(true);
    list<Tenant>('/admin/api/v1/tenants').then((res) => setItems(res.data)).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }
  useEffect(()=>{load();Promise.all([list<CatalogFeature>('/admin/api/v1/feature-catalog').then(r=>setFeatures(r.data)),list<CatalogChannel>('/admin/api/v1/channel-catalog').then(r=>setChannels(r.data.filter(c=>c.enabled))),list<ProviderType>('/admin/api/v1/provider-types').then(r=>setProviderTypes(r.data))]).catch(()=>{});}, []);

  const payload = () => ({ name:form.name,slug:form.slug,settings:{timezone:form.timezone,country:form.country,default_sender:form.default_sender,default_sms:form.default_sms},features:form.features,channels:channels.map(c=>({channel:c.channel,enabled:form.channels.includes(c.channel),direction:c.channel==='websocket'||c.channel==='in_app'?'two_way':'one_way',rate_limit_per_second:10,daily_quota:10000})),providers:form.channels.filter(c=>form.providers[c]).map(channel=>({channel,provider:form.providers[channel],is_default:true})),templates:form.templates });

  async function handleCreate() {
    setCreateErr('');
    try {
      setSaving(true); await apiRequest('/admin/api/v1/tenants', { method: 'POST', body: JSON.stringify(payload()) });
      setShowCreate(false); setForm(emptyProvision); load();
    } catch (err: any) { setCreateErr(err.message); }
    finally { setSaving(false); }
  }

  async function handleEdit(id: string) {
    try {
      setSaving(true); await apiRequest(`/admin/api/v1/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(payload()) });
      setEditId(null); load();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function openEdit(item: Tenant) {
    setEditId(item.id); setForm({...emptyProvision,name:item.name,slug:item.slug});
    try { const [overview,settings,templates]=await Promise.all([apiRequest<any>(`/admin/api/v1/tenants/${item.id}/overview`),apiRequest<any>(`/admin/api/v1/tenants/${item.id}/settings`),list<StarterTemplate>(`/admin/api/v1/templates?tenant_id=${item.id}`)]); const ov=overview.data, cfg=settings.data; setForm({name:item.name,slug:item.slug,timezone:cfg.timezone||'',country:cfg.country||'',default_sender:cfg.default_sender||'',default_sms:cfg.default_sms||'',features:ov.features.filter((f:any)=>f.enabled).map((f:any)=>f.feature_key),channels:ov.channels.filter((c:any)=>c.enabled).map((c:any)=>c.channel),providers:Object.fromEntries(ov.providers.filter((p:any)=>p.is_default&&p.status==='active').map((p:any)=>[p.channel,p.provider])),templates:templates.data.map(t=>({template_key:t.template_key,channel:t.channel,subject:t.subject||'',body:(t as any).body||''}))}); } catch(err:any){setError(err.message)}
  }

  async function toggleStatus(item: Tenant) {
    const newStatus = item.status === 'active' ? 'disabled' : 'active';
    try {
      await apiRequest(`/admin/api/v1/tenants/${item.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      load();
    } catch (err: any) { setError(err.message); }
  }

  const editingTenant = items.find((item)=>item.id===editId);
  return (<>
    <Panel
      title="Tenants"
      actions={isPlatform ? <button onClick={() => { setForm(emptyProvision); setCreateErr(''); setShowCreate(true); }} className="focus-ring rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">Create Tenant</button> : undefined}
    >
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

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
                  {item.name}
                </td>
                <td>
                  {item.slug}
                </td>
                <td>
                  <StatusBadge status={item.status}/>
                </td>
                <td className="text-slate-500">{item.created_at}</td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => navigate(`/tenants/${item.id}`)} className="focus-ring rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">View</button>
                    {isPlatform && (
                      <>
                        <button onClick={() => openEdit(item)} className="focus-ring rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">Edit</button>
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
    {showCreate&&<TenantProvisionModal title="Create tenant" error={createErr} form={form} setForm={setForm} features={features} channels={channels} providerTypes={providerTypes} saving={saving} onClose={()=>setShowCreate(false)} onSave={handleCreate}/>}
    {editingTenant&&<TenantProvisionModal title="Edit tenant" form={form} setForm={setForm} features={features} channels={channels} providerTypes={providerTypes} saving={saving} onClose={()=>setEditId(null)} onSave={()=>handleEdit(editingTenant.id)}/>}
  </>);
}

function TenantProvisionModal({title,error,form,setForm,features,channels,providerTypes,saving,onClose,onSave}:{title:string;error?:string;form:ProvisionForm;setForm:(value:ProvisionForm)=>void;features:CatalogFeature[];channels:CatalogChannel[];providerTypes:ProviderType[];saving:boolean;onClose:()=>void;onSave:()=>void}) {
  const toggle=(field:'features'|'channels',value:string)=>setForm({...form,[field]:form[field].includes(value)?form[field].filter(v=>v!==value):[...form[field],value]});
  const updateTemplate=(index:number,patch:Partial<StarterTemplate>)=>setForm({...form,templates:form.templates.map((t,i)=>i===index?{...t,...patch}:t)});
  return <Modal title={title} description="Configure identity, localization, capabilities, delivery channels, providers, and starter templates." onClose={onClose} footer={<><ModalButton onClick={onClose}>Cancel</ModalButton><ModalButton variant="primary" disabled={saving||!form.name||!form.slug} onClick={onSave}>{saving?'Saving...':title.startsWith('Create')?'Create tenant':'Save all changes'}</ModalButton></>}>
    <div className="space-y-6 px-6 py-5">{error&&<div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <section><h3 className="mb-3 font-semibold">Identity and defaults</h3><div className="grid gap-4 sm:grid-cols-2">{[['Tenant name','name'],['Workspace slug','slug'],['Timezone','timezone'],['Country','country'],['Default email sender','default_sender'],['Default SMS sender','default_sms']].map(([label,key])=><label key={key} className="text-sm"><span className="mb-1 block font-medium">{label}</span><input value={(form as any)[key]} onChange={e=>setForm({...form,[key]:e.target.value})} className={`focus-ring w-full rounded-md border border-slate-300 px-3 py-2 ${key==='slug'?'font-mono':''}`}/></label>)}</div></section>
      <section><h3 className="mb-3 font-semibold">Capabilities</h3><div className="grid gap-2 sm:grid-cols-2">{features.map(feature=><label key={feature.identifier} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${form.features.includes(feature.identifier)?'border-blue-300 bg-blue-50':'border-slate-200'}`}><input type="checkbox" checked={form.features.includes(feature.identifier)} onChange={()=>toggle('features',feature.identifier)}/><span><b className="block">{feature.name}</b><small className="text-slate-500">{feature.category}</small></span></label>)}</div></section>
      <section><h3 className="mb-3 font-semibold">Notification channels and providers</h3><div className="space-y-3">{channels.map(channel=><div key={channel.channel} className="grid items-center gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr]"><label className="flex items-center gap-2 text-sm font-medium capitalize"><input type="checkbox" checked={form.channels.includes(channel.channel)} onChange={()=>toggle('channels',channel.channel)}/>{channel.channel.replace('_',' ')}</label>{form.channels.includes(channel.channel)&&<SearchSelect value={form.providers[channel.channel]||''} onChange={value=>setForm({...form,providers:{...form.providers,[channel.channel]:value}})} placeholder="Select default provider" options={providerTypes.filter(p=>p.channel===channel.channel||(channel.channel==='in_app'&&p.channel==='websocket')).map(p=>({value:p.provider,label:p.provider.replace(/_/g,' ')}))}/>}</div>)}</div></section>
      <section><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Starter templates</h3><button onClick={()=>setForm({...form,templates:[...form.templates,{template_key:'',channel:'email',subject:'',body:''}]})} className="text-sm font-semibold text-blue-600">+ Add template</button></div><div className="space-y-3">{form.templates.map((template,index)=><div key={index} className="space-y-3 rounded-lg border border-slate-200 p-4"><div className="grid gap-3 sm:grid-cols-2"><input value={template.template_key} onChange={e=>updateTemplate(index,{template_key:e.target.value})} placeholder="Template key" className="focus-ring rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"/><SearchSelect value={template.channel} onChange={value=>updateTemplate(index,{channel:value})} options={form.channels.map(channel=>({value:channel,label:channel.replace('_',' ')}))}/></div><input value={template.subject} onChange={e=>updateTemplate(index,{subject:e.target.value})} placeholder="Subject (optional)" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm"/><textarea value={template.body} onChange={e=>updateTemplate(index,{body:e.target.value})} placeholder="Template message body" rows={3} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm"/><button onClick={()=>setForm({...form,templates:form.templates.filter((_,i)=>i!==index)})} className="text-xs font-semibold text-red-600">Remove template</button></div>)}</div></section>
    </div>
  </Modal>
}
