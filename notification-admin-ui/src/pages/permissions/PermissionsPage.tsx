import { useEffect, useState } from 'react';
import { list } from '../../api/client';
import { Panel } from '../../components/Panel';

type Permission = { id: string; key: string; description: string };

export function PermissionsPage() {
  const [items, setItems] = useState<Permission[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    list<Permission>('/admin/api/v1/permissions').then((res) => setItems(res.data)).catch((err) => setError(err.message));
  }, []);

  return (
    <Panel title="Permissions">
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr><th className="py-2">Key</th><th>Description</th></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-slate-100">
              <td className="py-3 font-mono text-xs">{item.key}</td>
              <td>{item.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
