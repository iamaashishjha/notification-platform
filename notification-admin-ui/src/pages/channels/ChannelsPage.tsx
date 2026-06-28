import { useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';

type Channel = { id: string; channel: string; enabled: boolean; direction: string; rate_limit_per_second: number; daily_quota: number; tenant_name: string };

export function ChannelsPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<Channel[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editVals, setEditVals] = useState({ rate_limit_per_second: 10, daily_quota: 10000, direction: 'one_way' });

  const load = () => { setLoading(true); list<Channel>('/admin/api/v1/channels').then((res) => setItems(res.data)).catch((err) => setError(err.message)).finally(() => setLoading(false)); };

  useEffect(() => { load(); }, []);

  async function startEdit(item: Channel) {
    setEditing(item.id);
    setEditVals({ rate_limit_per_second: item.rate_limit_per_second, daily_quota: item.daily_quota, direction: item.direction });
  }

  async function save(id: string) {
    try {
      await apiRequest(`/admin/api/v1/channels/${id}`, { method: 'PUT', body: JSON.stringify(editVals) });
      setMessage('Channel updated');
      setEditing(null);
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Update failed'); }
  }

  async function toggle(item: Channel) {
    try {
      await apiRequest(`/admin/api/v1/channels/${item.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !item.enabled }) });
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Update failed'); }
  }

  return (
    <Panel title="Channels">
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No channels configured</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Channel</th><th>Tenant</th><th>Status</th><th>Direction</th><th>Rate/s</th><th>Daily Quota</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-3 font-medium">{item.channel}</td>
                <td>{item.tenant_name}</td>
                <td>
                  <button onClick={() => toggle(item)} className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${item.enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {item.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </td>
                {editing === item.id ? (
                  <>
                    <td>
                      <select value={editVals.direction} onChange={(e) => setEditVals({ ...editVals, direction: e.target.value })} className="w-24 rounded border px-2 py-1 text-xs">
                        <option value="one_way">One-way</option><option value="two_way">Two-way</option>
                      </select>
                    </td>
                    <td><input type="number" value={editVals.rate_limit_per_second} onChange={(e) => setEditVals({ ...editVals, rate_limit_per_second: +e.target.value })} className="w-16 rounded border px-2 py-1 text-xs" /></td>
                    <td><input type="number" value={editVals.daily_quota} onChange={(e) => setEditVals({ ...editVals, daily_quota: +e.target.value })} className="w-20 rounded border px-2 py-1 text-xs" /></td>
                    <td>{can('channels.update') && <button onClick={() => save(item.id)} className="rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50">Save</button>}</td>
                  </>
                ) : (
                  <>
                    <td>{item.direction}</td>
                    <td>{item.rate_limit_per_second}</td>
                    <td>{item.daily_quota}</td>
                    <td>
                      <div className="flex gap-1">
                        {can('channels.update') && <button onClick={() => startEdit(item)} className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">Edit</button>}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
