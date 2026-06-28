import { useEffect, useState } from 'react';
import { list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';

type ChannelCatalogItem = {
  channel: string;
  description: string;
  tenant_count: number;
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

  useEffect(() => {
    setLoading(true);
    list<ChannelCatalogItem>('/admin/api/v1/channel-catalog')
      .then((res) => setItems(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Panel title="Channel Catalog">
      <p className="mb-4 text-sm text-slate-500">
        Platform-level channel definitions. Configure channels per tenant from the{' '}
        <Link to="/tenants" className="text-blue-600 hover:underline">Tenant Detail</Link> page.
      </p>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No channels found</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Channel</th><th>Description</th><th>Supported Modes</th><th>Tenants Using</th><th />
          </tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.channel} className="border-b border-slate-100">
                <td className="py-3 font-medium capitalize">{item.channel}</td>
                <td className="text-slate-500">{item.description || '-'}</td>
                <td><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{CHANNEL_MODES[item.channel] || '-'}</span></td>
                <td><span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{item.tenant_count}</span></td>
                <td>
                  {can('channels.update') && (
                    <Link to="/tenants" className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">
                      <ExternalLink size={12} /> Manage
                    </Link>
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
