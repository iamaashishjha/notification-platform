import { useEffect, useMemo, useState } from 'react';
import { list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { Link } from 'react-router-dom';
import { CheckCircle2, Layers3, Search, Users } from 'lucide-react';

type FeatureCatalogItem = {
  identifier: string;
  feature_key: string;
  name: string;
  description: string;
  category: string;
  tenant_count: number;
};

export function FeaturesPage() {
  const [items, setItems] = useState<FeatureCatalogItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    list<FeatureCatalogItem>('/admin/api/v1/feature-catalog')
      .then((res) => setItems(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => [...new Set(items.map((item) => item.category))], [items]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => (!category || item.category === category) && (!query || [item.name, item.identifier, item.description].some((value) => value.toLowerCase().includes(query))));
  }, [items, search, category]);

  return (
    <Panel title="Feature Catalog">
      <div className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <p className="text-sm leading-6 text-slate-600">Features are reusable platform capabilities that can be enabled for individual tenants. Display names explain the business capability; identifiers provide a stable reference for integrations.</p>
          <Link to="/tenants" className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline">Manage tenant access →</Link>
        </div>
        <div className="flex gap-2">
          <label className="relative block min-w-64"><Search className="absolute left-3 top-2.5 text-slate-400" size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search features" className="focus-ring w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" /></label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="focus-ring rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select>
        </div>
      </div>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading ? <div className="py-12 text-center text-slate-400">Loading feature catalog…</div> : visible.length === 0 ? <div className="py-12 text-center text-slate-400">No matching features</div> : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Capability</th><th className="px-4 py-3">Business purpose</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Adoption</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((item) => <tr key={item.identifier} className="hover:bg-slate-50/70">
                <td className="px-4 py-4"><div className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Layers3 size={17} /></span><div><div className="font-semibold text-slate-900">{item.name}</div><code className="mt-1 block text-xs text-slate-400">{item.identifier}</code></div></div></td>
                <td className="max-w-xl px-4 py-4 leading-5 text-slate-600">{item.description}</td>
                <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{item.category}</span></td>
                <td className="px-4 py-4"><div className="flex items-center gap-2 font-medium text-slate-700"><Users size={15} className="text-slate-400" />{item.tenant_count} tenant{item.tenant_count === 1 ? '' : 's'}</div><div className="mt-1 flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 size={12} />Enabled</div></td>
              </tr>)}
            </tbody>
          </table>
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">{visible.length} of {items.length} platform capabilities</div>
        </div>
      )}
    </Panel>
  );
}
