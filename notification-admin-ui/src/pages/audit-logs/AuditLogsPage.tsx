import { useEffect, useState } from 'react';
import { list } from '../../api/client';
import { Panel } from '../../components/Panel';

type AuditLog = { id: string; action: string; actor_type: string; actor_user_id: string; resource_type: string; resource_id: string; ip_address: string; created_at: string };

export function AuditLogsPage() {
  const [items, setItems] = useState<AuditLog[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    list<AuditLog>('/admin/api/v1/audit-logs').then((res) => setItems(res.data)).catch((err) => setError(err.message));
  }, []);

  return (
    <Panel title="Audit Logs">
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr><th className="py-2">Action</th><th>Actor</th><th>Resource</th><th>Resource ID</th><th>IP</th><th>Time</th></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-slate-100">
              <td className="py-3 font-medium">{item.action}</td>
              <td>{item.actor_type}</td>
              <td>{item.resource_type}</td>
              <td className="font-mono text-xs">{item.resource_id || '-'}</td>
              <td>{item.ip_address || '-'}</td>
              <td>{item.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
