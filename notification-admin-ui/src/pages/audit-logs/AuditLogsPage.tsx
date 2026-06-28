import { useEffect, useState } from 'react';
import { list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';
import { Eye } from 'lucide-react';

type AuditLog = { id: string; action: string; actor_type: string; actor_user_id: string; resource_type: string; resource_id: string; ip_address: string; created_at: string; tenant_name?: string };

export function AuditLogsPage() {
  const { user } = useAuth();
  const isPlatform = user?.is_platform_admin ?? false;
  const [items, setItems] = useState<AuditLog[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AuditLog | null>(null);

  useEffect(() => {
    setLoading(true);
    list<AuditLog>('/admin/api/v1/audit-logs').then((res) => setItems(res.data)).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  return (
    <Panel title="Audit Logs">
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {selected && (
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Audit Detail</h3>
            <button onClick={() => setSelected(null)} className="text-xs text-slate-500 hover:underline">Close</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-slate-500">Action:</span> {selected.action}</div>
            <div><span className="text-slate-500">Actor:</span> {selected.actor_type} ({selected.actor_user_id || 'system'})</div>
            <div><span className="text-slate-500">Resource:</span> {selected.resource_type} {selected.resource_id ? `#${selected.resource_id}` : ''}</div>
            <div><span className="text-slate-500">IP:</span> {selected.ip_address || '-'}</div>
            <div><span className="text-slate-500">Time:</span> {selected.created_at}</div>
            {isPlatform && <div><span className="text-slate-500">Tenant:</span> {selected.tenant_name || '-'}</div>}
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No audit logs found</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Action</th><th>Actor</th><th>Resource</th><th>Resource ID</th><th>IP</th><th>Time</th>{isPlatform && <th>Tenant</th>}<th>Actions</th></tr>
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
                {isPlatform && <td className="text-xs text-slate-500">{item.tenant_name || '-'}</td>}
                <td><button onClick={() => setSelected(selected?.id === item.id ? null : item)} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"><Eye size={12} />{selected?.id === item.id ? 'Hide' : 'View'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
