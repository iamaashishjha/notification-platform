import { useEffect, useMemo, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { SearchSelect } from '../../components/SearchSelect';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { CheckCircle2, Info, Layers3, Search, Users, XCircle } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../auth/AuthContext';

type FeatureCatalogItem = {
  identifier: string;
  feature_key: string;
  name: string;
  description: string;
  category: string;
  tenant_count: number;
  status?: string;
  enabled: boolean;
};

function StatusToggle({ value, label, disabled, onToggle }: { value: boolean; label: string; disabled?: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={value} aria-label={label} disabled={disabled} onClick={onToggle} className={`focus-ring inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-70 ${value ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      {value ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      <span>{value ? 'Enabled' : 'Disabled'}</span>
      <span className={`relative h-4 w-7 rounded-full transition ${value ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${value ? 'left-[14px]' : 'left-0.5'}`} /></span>
    </button>
  );
}

export function FeaturesPage() {
  const toast = useToast();
  const { can } = useAuth();
  const { confirmDialog, requestConfirm } = useConfirmDialog();
  const [items, setItems] = useState<FeatureCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    list<FeatureCatalogItem>('/admin/api/v1/feature-catalog')
      .then((res) => setItems(res.data))
      .catch((err) => toast.error('Unable to load feature catalog', err instanceof Error ? err.message : 'Load failed'))
      .finally(() => setLoading(false));
  }, [toast]);

  const categories = useMemo(() => [...new Set(items.map((item) => item.category))], [items]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => (!category || item.category === category) && (!query || [item.name, item.identifier, item.description].some((value) => value.toLowerCase().includes(query))));
  }, [items, search, category]);

  async function toggleFeature(item: FeatureCatalogItem) {
    const enabled = !item.enabled;
    try {
      await apiRequest(`/admin/api/v1/feature-catalog/${encodeURIComponent(item.identifier)}`, { method: 'PUT', body: JSON.stringify({ enabled }) });
      setItems((old) => old.map((feature) => feature.identifier === item.identifier ? { ...feature, enabled, status: enabled ? 'active' : 'disabled' } : feature));
      toast.success(enabled ? 'Feature enabled' : 'Feature disabled', item.name);
    } catch (err) {
      toast.error('Unable to update feature', err instanceof Error ? err.message : 'Update failed');
    }
  }

  return (
    <Panel title="Feature Catalog">
      <div className="mb-5 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <Info className="mt-0.5 shrink-0 text-blue-600" size={18} />
        <div>
          <div className="text-sm font-semibold text-blue-900">Tenant-specific access</div>
          <p className="mt-0.5 text-sm leading-5 text-blue-700">Enable or disable features for a tenant from Tenants, open the tenant, then use the Capabilities tab.</p>
        </div>
      </div>
      <div className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <p className="text-sm leading-6 text-slate-600">Features are reusable platform capabilities that can be enabled for individual tenants. Display names explain the business capability; identifiers provide a stable reference for integrations.</p>
        </div>
        <div className="flex gap-2">
          <label className="relative block min-w-64"><Search className="absolute left-3 top-2.5 text-slate-400" size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search features" className="focus-ring w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" /></label>
          <SearchSelect className="w-56" value={category} onChange={setCategory} placeholder="All categories" options={[{value:'',label:'All categories'},...categories.map((value)=>({value,label:value}))]}/>
        </div>
      </div>

      {loading ? <div className="py-12 text-center text-slate-400">Loading feature catalog…</div> : visible.length === 0 ? <div className="py-12 text-center text-slate-400">No matching features</div> : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Capability</th><th className="px-4 py-3">Business purpose</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Adoption</th><th className="px-4 py-3">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((item) => <tr key={item.identifier} className="hover:bg-slate-50/70">
                <td className="px-4 py-4"><div className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Layers3 size={17} /></span><div><div className="font-semibold text-slate-900">{item.name}</div><code className="mt-1 block text-xs text-slate-400">{item.identifier}</code></div></div></td>
                <td className="max-w-xl px-4 py-4 leading-5 text-slate-600">{item.description}</td>
                <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{item.category}</span></td>
                <td className="px-4 py-4"><div className="flex items-center gap-2 font-medium text-slate-700"><Users size={15} className="text-slate-400" />{item.tenant_count} tenant{item.tenant_count === 1 ? '' : 's'}</div></td>
                <td className="px-4 py-4">
                  <StatusToggle
                    value={item.enabled}
                    disabled={!can('features.update')}
                    label={`${item.enabled ? 'Disable' : 'Enable'} ${item.name}`}
                    onToggle={() => requestConfirm({
                      title: `${item.enabled ? 'Disable' : 'Enable'} feature`,
                      description: 'Confirm feature catalog status change',
                      body: <>Change <strong className="text-slate-900">{item.name}</strong> to <strong className="text-slate-900">{item.enabled ? 'disabled' : 'enabled'}</strong>?</>,
                      confirmLabel: item.enabled ? 'Disable' : 'Enable',
                      variant: item.enabled ? 'danger' : 'primary',
                      onConfirm: () => toggleFeature(item),
                    })}
                  />
                </td>
              </tr>)}
            </tbody>
          </table>
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">{visible.length} of {items.length} platform capabilities</div>
        </div>
      )}
      {confirmDialog}
    </Panel>
  );
}
