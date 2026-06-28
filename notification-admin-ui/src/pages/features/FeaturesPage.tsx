import { useEffect, useState } from 'react';
import { list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';

type FeatureCatalogItem = {
  feature_key: string;
  description: string;
  tenant_count: number;
};

export function FeaturesPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<FeatureCatalogItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    list<FeatureCatalogItem>('/admin/api/v1/feature-catalog')
      .then((res) => setItems(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Panel title="Feature Catalog">
      <p className="mb-4 text-sm text-slate-500">
        Platform-level feature definitions. Enable/disable features per tenant from the{' '}
        <Link to="/tenants" className="text-blue-600 hover:underline">Tenant Detail</Link> page.
      </p>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No features found</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Feature</th><th>Description</th><th>Tenants Using</th><th />
          </tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.feature_key} className="border-b border-slate-100">
                <td className="py-3 font-medium">{item.feature_key}</td>
                <td className="text-slate-500">{item.description || '-'}</td>
                <td><span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{item.tenant_count}</span></td>
                <td>
                  {can('features.update') && (
                    <Link to="/tenants" className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">
                      <ExternalLink size={12} /> Manage
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
