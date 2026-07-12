import { useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';
import { Bell, CheckCircle2, Power } from 'lucide-react';

type ChannelCatalogItem = {
  channel: string;
  description: string;
  tenant_count: number;
  enabled: boolean;
};

const CHANNEL_MODES: Record<string, string> = {
  'email': 'one_way/two_way',
  'sms': 'one_way/two_way',
  'fcm': 'one_way',
  'websocket': 'two_way',
  'in_app': 'two_way',
  'whatsapp': 'two_way',
  'web_push': 'one_way',
};

export function ChannelsPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<ChannelCatalogItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');

  async function toggle(item: ChannelCatalogItem) {
    setSaving(item.channel); setError('');
    try { await apiRequest(`/admin/api/v1/channel-catalog/${item.channel}`, { method: 'PUT', body: JSON.stringify({ enabled: !item.enabled }) }); setItems((old) => old.map((x) => x.channel === item.channel ? {...x, enabled: !x.enabled} : x)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Update failed'); }
    finally { setSaving(''); }
  }

  useEffect(() => {
    setLoading(true);
    list<ChannelCatalogItem>('/admin/api/v1/channel-catalog')
      .then((res) => setItems(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Panel title="Global Channel Management">
      <div className="mb-5 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3"><Bell size={18} className="mt-0.5 text-blue-600"/><div><div className="text-sm font-semibold text-blue-900">Platform delivery controls</div><p className="mt-0.5 text-sm text-blue-700">Globally enable or disable delivery channels. A disabled channel is unavailable to every tenant, regardless of its tenant-level setting.</p></div></div>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No channels found</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Channel</th><th>Description</th><th>Supported Modes</th><th>Tenants Using</th><th>Status</th><th />
          </tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.channel} className="border-b border-slate-100">
                <td className="py-3 font-medium capitalize">{item.channel}</td>
                <td className="text-slate-500">{item.description || '-'}</td>
                <td><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{CHANNEL_MODES[item.channel] || '-'}</span></td>
                <td><span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{item.tenant_count}</span></td>
                <td><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${item.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{item.enabled && <CheckCircle2 size={12}/>} {item.enabled ? 'Globally active' : 'Disabled'}</span></td>
                <td>
                  {can('channels.update') && (
                    <button disabled={saving === item.channel} onClick={() => toggle(item)} className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${item.enabled ? 'text-red-600 hover:bg-red-50' : 'text-emerald-700 hover:bg-emerald-50'}`}><Power size={12}/>{saving === item.channel ? 'Saving...' : item.enabled ? 'Disable globally' : 'Enable globally'}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
