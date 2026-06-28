import { useEffect, useState } from 'react';
import { list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';

type ProviderTypeItem = {
  provider: string;
  channel: string;
  description: string;
  tenant_count: number;
};

const CHANNEL_GROUP_LABELS: Record<string, string> = {
  'email': 'Email',
  'sms': 'SMS',
  'fcm': 'FCM',
  'websocket': 'WebSocket / In-App',
  'in_app': 'WebSocket / In-App',
  'whatsapp': 'WhatsApp',
};

export function ProvidersPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<ProviderTypeItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    list<ProviderTypeItem>('/admin/api/v1/provider-types')
      .then((res) => setItems(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const grouped: Record<string, ProviderTypeItem[]> = {};
  for (const item of items) {
    const groupKey = CHANNEL_GROUP_LABELS[item.channel] || item.channel;
    if (!grouped[groupKey]) grouped[groupKey] = [];
    grouped[groupKey].push(item);
  }

  return (
    <Panel title="Provider Type Catalog">
      <p className="mb-4 text-sm text-slate-500">
        Platform-level provider types. Configure provider instances per tenant from the{' '}
        <Link to="/tenants" className="text-blue-600 hover:underline">Tenant Detail</Link> page.
      </p>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No providers found</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([channelLabel, providers]) => (
            <div key={channelLabel}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{channelLabel}</h3>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr><th className="py-2">Provider Type</th><th>Channel</th><th>Description</th><th>Tenants Using</th><th /></tr>
                </thead>
                <tbody>
                  {providers.map((item) => (
                    <tr key={item.provider} className="border-b border-slate-100">
                      <td className="py-3 font-medium capitalize">{item.provider.replace(/_/g, ' ')}</td>
                      <td className="capitalize">{item.channel}</td>
                      <td className="text-slate-500">{item.description || '-'}</td>
                      <td><span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{item.tenant_count}</span></td>
                      <td>
                        {can('providers.create') && (
                          <Link to="/tenants" className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">
                            <ExternalLink size={12} /> Manage
                          </Link>
                        )}
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
