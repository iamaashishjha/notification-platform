import { useEffect, useState } from 'react';
import { list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { Modal, ModalButton } from '../../components/Modal';
import { useAuth } from '../../auth/AuthContext';
import { Eye } from 'lucide-react';

type AuditLog = { id: string; action: string; actor_type: string; actor_user_id: string; resource_type: string; resource_id: string; ip_address: string; request_id?: string; session_id?: string; created_at: string; tenant_name?: string };

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

  const grouped = items.reduce<Record<string, AuditLog[]>>((acc, item) => {
    const key = item.session_id || 'No session';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  const sessions = Object.entries(grouped);

  return (<>
    <Panel title="Audit Logs">
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No audit logs found</div>
      ) : (
        <div className="space-y-6">
          {sessions.map(([sessionID, logs]) => (
            <section key={sessionID} className="rounded-md border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Session</h2>
                  <p className="font-mono text-xs text-slate-500">{sessionID}</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm">{logs.length} events</span>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr><th className="py-2 pl-4">Action</th><th>Actor</th><th>Resource</th><th>Resource ID</th><th>IP</th><th>Time</th>{isPlatform && <th>Tenant</th>}<th>Actions</th></tr>
                </thead>
                <tbody>
                  {logs.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pl-4 font-medium">{item.action}</td>
                      <td>{item.actor_type}</td>
                      <td>{item.resource_type}</td>
                      <td className="font-mono text-xs">{item.resource_id || '-'}</td>
                      <td>{item.ip_address || '-'}</td>
                      <td>{item.created_at}</td>
                      {isPlatform && <td className="text-xs text-slate-500">{item.tenant_name || '-'}</td>}
                      <td><button onClick={() => setSelected(item)} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"><Eye size={12} />View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </Panel>
    {selected&&<Modal title="Audit event" description="Immutable activity record and request context." onClose={()=>setSelected(null)} width="max-w-2xl" footer={<ModalButton onClick={()=>setSelected(null)}>Close</ModalButton>}><dl className="grid gap-4 px-6 py-5 sm:grid-cols-2">{[['Action',selected.action],['Actor',`${selected.actor_type} (${selected.actor_user_id||'system'})`],['Resource',`${selected.resource_type}${selected.resource_id?` #${selected.resource_id}`:''}`],['Session ID',selected.session_id||'-'],['Request ID',selected.request_id||'-'],['IP address',selected.ip_address||'-'],['Timestamp',selected.created_at],...(isPlatform?[['Tenant',selected.tenant_name||'-']]:[])].map(([label,value])=><div key={label} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 break-all text-sm font-medium">{value}</dd></div>)}</dl></Modal>}
  </>);
}
