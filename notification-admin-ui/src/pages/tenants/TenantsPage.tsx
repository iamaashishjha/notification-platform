import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';

type Tenant = { id: string; name: string; slug: string; status: string; created_at: string };

export function TenantsPage() {
  const { can } = useAuth();
  if (!can('tenants.view')) return <Navigate to="/" replace />;
  const [items, setItems] = useState<Tenant[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    list<Tenant>('/admin/api/v1/tenants').then((res) => setItems(res.data)).catch((err) => setError(err.message));
  }, []);

  return (
    <Panel title="Tenants">
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr><th className="py-2">Name</th><th>Slug</th><th>Status</th><th>Created</th></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-slate-100">
              <td className="py-3 font-medium">{item.name}</td><td>{item.slug}</td><td>{item.status}</td><td>{item.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
