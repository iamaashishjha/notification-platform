import { useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';

type Feature = { id: string; feature_key: string; enabled: boolean; tenant_name: string; created_at: string };

export function FeaturesPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<Feature[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = () => { setLoading(true); list<Feature>('/admin/api/v1/features').then((res) => setItems(res.data)).catch((err) => setError(err.message)).finally(() => setLoading(false)); };

  useEffect(() => { load(); }, []);

  async function toggle(item: Feature) {
    try {
      await apiRequest(`/admin/api/v1/features/${item.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !item.enabled }) });
      setMessage(`${item.feature_key} ${item.enabled ? 'disabled' : 'enabled'}`);
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Update failed'); }
  }

  return (
    <Panel title="Feature Flags">
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No features configured</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Feature</th><th>Tenant</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-3 font-medium">{item.feature_key}</td>
                <td>{item.tenant_name}</td>
                <td><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${item.enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.enabled ? 'Enabled' : 'Disabled'}</span></td>
                <td>{can('features.update') && <button onClick={() => toggle(item)} className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">{item.enabled ? 'Disable' : 'Enable'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
