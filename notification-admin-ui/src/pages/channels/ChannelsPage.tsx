import { useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { useAuth } from '../../auth/AuthContext';
import { Bell, CheckCircle2, Info, XCircle } from 'lucide-react';
import { useToast } from '../../components/Toast';

type ChannelCatalogItem = {
  channel: string;
  description: string;
  tenant_count: number;
  enabled: boolean;
};

function StatusToggle({ value, label, disabled, onToggle }: { value: boolean; label: string; disabled?: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={value} aria-label={label} disabled={disabled} onClick={onToggle} className={`focus-ring inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-medium disabled:opacity-60 ${value ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      {value ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      <span>{value ? 'Enabled' : 'Disabled'}</span>
      <span className={`relative h-4 w-7 rounded-full transition ${value ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${value ? 'left-[14px]' : 'left-0.5'}`} /></span>
    </button>
  );
}

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
  const toast = useToast();
  const { confirmDialog, requestConfirm } = useConfirmDialog();
  const [items, setItems] = useState<ChannelCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');

  async function toggle(item: ChannelCatalogItem) {
    setSaving(item.channel);
    try { await apiRequest(`/admin/api/v1/channel-catalog/${item.channel}`, { method: 'PUT', body: JSON.stringify({ enabled: !item.enabled }) }); setItems((old) => old.map((x) => x.channel === item.channel ? {...x, enabled: !x.enabled} : x)); toast.success(item.enabled ? 'Channel disabled globally' : 'Channel enabled globally', item.channel.replace('_', ' ')); }
    catch (err) { const msg = err instanceof Error ? err.message : 'Update failed'; toast.error('Unable to update channel', msg); }
    finally { setSaving(''); }
  }

  useEffect(() => {
    setLoading(true);
    list<ChannelCatalogItem>('/admin/api/v1/channel-catalog')
      .then((res) => setItems(res.data))
      .catch((err) => toast.error('Unable to load channel catalog', err instanceof Error ? err.message : 'Load failed'))
      .finally(() => setLoading(false));
  }, [toast]);

  return (
    <Panel title="Channel Catalog">
      <div className="mb-5 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <Info className="mt-0.5 shrink-0 text-blue-600" size={18} />
        <div>
          <div className="text-sm font-semibold text-blue-900">Tenant-specific access</div>
          <p className="mt-0.5 text-sm leading-5 text-blue-700">Enable or disable channels for a tenant from Tenants, open the tenant, then use the Channels tab.</p>
        </div>
      </div>
      <div className="mb-6 flex items-start gap-3 border-b border-slate-200 pb-5"><Bell size={18} className="mt-0.5 text-blue-600"/><div><div className="text-sm font-semibold text-slate-900">Platform delivery controls</div><p className="mt-0.5 text-sm leading-6 text-slate-600">Globally enable or disable delivery channels. A disabled channel is unavailable to every tenant, regardless of its tenant-level setting.</p></div></div>

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No channels found</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Channel</th><th className="px-4 py-3">Business purpose</th><th className="px-4 py-3">Supported modes</th><th className="px-4 py-3">Adoption</th><th className="px-4 py-3">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.channel} className="hover:bg-slate-50/70">
                <td className="px-4 py-4"><div className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Bell size={17} /></span><div><div className="font-semibold capitalize text-slate-900">{item.channel.replace('_', ' ')}</div><code className="mt-1 block text-xs text-slate-400">{item.channel}</code></div></div></td>
                <td className="max-w-xl px-4 py-4 leading-5 text-slate-600">{item.description || '-'}</td>
                <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{CHANNEL_MODES[item.channel] || '-'}</span></td>
                <td className="px-4 py-4"><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">{item.tenant_count} tenant{item.tenant_count === 1 ? '' : 's'}</span></td>
                <td className="px-4 py-4">
                  <StatusToggle
                    value={item.enabled}
                    disabled={!can('channels.update') || saving === item.channel}
                    label={`${item.enabled ? 'Disable' : 'Enable'} ${item.channel}`}
                    onToggle={() => {
                      if (!can('channels.update')) return;
                      requestConfirm({
                        title: `${item.enabled ? 'Disable' : 'Enable'} channel globally`,
                        description: 'Confirm global channel status change',
                        body: <>Change <strong className="text-slate-900">{item.channel.replace('_', ' ')}</strong> for every tenant?</>,
                        confirmLabel: item.enabled ? 'Disable globally' : 'Enable globally',
                        variant: item.enabled ? 'danger' : 'primary',
                        onConfirm: () => toggle(item),
                      });
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {confirmDialog}
    </Panel>
  );
}
