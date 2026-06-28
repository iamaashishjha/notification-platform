import { useEffect, useState } from 'react';
import { list } from '../../api/client';
import { Panel } from '../../components/Panel';

type Permission = {
  id: string;
  key: string;
  description: string;
  roles: { id: string; name: string; key: string; scope: string }[];
};

export function PermissionsPage() {
  const [items, setItems] = useState<Permission[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    list<Permission>('/admin/api/v1/permissions').then((res) => {
      setItems(res.data.map((p: any) => ({ ...p, roles: typeof p.roles === 'string' ? JSON.parse(p.roles) : p.roles })));
    }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  const categories: Record<string, Permission[]> = {};
  for (const p of items) {
    const cat = p.key.split('.')[0] || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(p);
  }

  return (
    <Panel title="Permissions">
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No permissions found</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(categories).map(([cat, perms]) => (
            <div key={cat}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{cat}</h3>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr><th className="py-2">Key</th><th>Description</th><th>Associated Roles</th></tr>
                </thead>
                <tbody>
                  {perms.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="py-2 font-mono text-xs">{p.key}</td>
                      <td className="py-2 text-xs text-slate-500">{p.description}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1">
                          {p.roles && p.roles.length > 0 ? p.roles.map((r) => (
                            <span key={r.id} className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.scope === 'platform' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                              {r.name}
                            </span>
                          )) : <span className="text-xs text-slate-400">-</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
