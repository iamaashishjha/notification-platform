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
      setItems(res.data.map((p: any) => {
        if (Array.isArray(p.roles)) return p;
        if (typeof p.roles !== 'string') return { ...p, roles: [] };
        try { return { ...p, roles: JSON.parse(p.roles) }; }
        catch {
          try { return { ...p, roles: JSON.parse(atob(p.roles)) }; }
          catch { return { ...p, roles: [] }; }
        }
      }));
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
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          {Object.entries(categories).map(([cat, perms]) => (
            <section key={cat} className="border-b border-slate-200 last:border-b-0">
              <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{cat.replace(/_/g, ' ')}</h3>
              <table className="w-full min-w-[900px] table-fixed text-left text-sm">
                <colgroup><col className="w-[35%]" /><col className="w-[30%]" /><col className="w-[35%]" /></colgroup>
                <thead className="border-b border-slate-200 bg-white text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-2.5">Key</th><th className="px-4 py-2.5">Description</th><th className="px-4 py-2.5">Associated roles</th></tr>
                </thead>
                <tbody>
                  {perms.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-slate-800">{p.key}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{p.description}</td>
                      <td className="px-4 py-3">
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
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}
