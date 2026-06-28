import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';

type NotificationLog = { public_id: string; tenant: string; event: string; status: string; created_at: string };

export function NotificationsPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<NotificationLog[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    list<NotificationLog>('/admin/api/v1/notifications').then((res) => setItems(res.data)).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);
  return (
    <Panel title="Notification Logs" actions={can('notifications.send') ? <Link className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white" to="/notifications/send">Send</Link> : undefined}>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No notifications found</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">ID</th><th>Tenant</th><th>Event</th><th>Status</th><th>Created</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.public_id} className="border-b border-slate-100">
                <td className="py-3 font-medium">{item.public_id}</td><td>{item.tenant}</td><td>{item.event}</td><td>{item.status}</td><td>{item.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
