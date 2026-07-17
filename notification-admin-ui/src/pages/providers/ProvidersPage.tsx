import { useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { CheckCircle2, Info, Plug, Users, XCircle } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { useAuth } from '../../auth/AuthContext';

type ProviderTypeItem = {
  provider: string;
  channel: string;
  description: string;
  tenant_count: number;
  enabled: boolean;
};

function StatusToggle({ value, label, disabled, onToggle }: { value: boolean; label: string; disabled?: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={value} aria-label={label} disabled={disabled} onClick={onToggle} className={`focus-ring inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-70 ${value ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      {value ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      <span>{value ? 'Enabled' : 'Disabled'}</span>
      <span className={`relative h-4 w-7 rounded-full transition ${value ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${value ? 'left-[14px]' : 'left-0.5'}`} /></span>
    </button>
  );
}

export function ProvidersPage() {
  const { can } = useAuth();
  const toast = useToast();
  const { confirmDialog, requestConfirm } = useConfirmDialog();
  const [items, setItems] = useState<ProviderTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');

  useEffect(() => {
    setLoading(true);
    list<ProviderTypeItem>('/admin/api/v1/provider-types')
      .then((res) => setItems(res.data))
      .catch((err) => toast.error('Unable to load provider catalog', err instanceof Error ? err.message : 'Load failed'))
      .finally(() => setLoading(false));
  }, [toast]);

  async function toggle(item: ProviderTypeItem) {
    const enabled = !item.enabled;
    setSaving(item.provider);
    try {
      await apiRequest(`/admin/api/v1/provider-types/${encodeURIComponent(item.provider)}`, { method: 'PUT', body: JSON.stringify({ enabled }) });
      setItems((current) => current.map((provider) => provider.provider === item.provider ? { ...provider, enabled } : provider));
      toast.success(enabled ? 'Provider enabled globally' : 'Provider disabled globally', item.provider.replace(/_/g, ' '));
    } catch (err) {
      toast.error('Unable to update provider', err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving('');
    }
  }

  return (
    <Panel title="Provider Type Catalog">
      <div className="mb-5 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <Info className="mt-0.5 shrink-0 text-blue-600" size={18} />
        <div>
          <div className="text-sm font-semibold text-blue-900">Tenant-specific provider configs</div>
          <p className="mt-0.5 text-sm leading-5 text-blue-700">Configure and enable tenant provider instances from Tenants, open the tenant, then use the Providers tab.</p>
        </div>
      </div>
      <p className="mb-4 text-sm text-slate-500">Platform-level provider types available for tenant provider configuration.</p>

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No providers found</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Provider type</th><th className="px-4 py-3">Business purpose</th><th className="px-4 py-3">Channel</th><th className="px-4 py-3">Adoption</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={`${item.channel}-${item.provider}`} className="hover:bg-slate-50/70">
                  <td className="px-4 py-4"><div className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Plug size={17} /></span><div><div className="font-semibold capitalize text-slate-900">{item.provider.replace(/_/g, ' ')}</div><code className="mt-1 block text-xs text-slate-400">{item.provider}</code></div></div></td>
                  <td className="max-w-xl px-4 py-4 leading-5 text-slate-600">{item.description || '-'}</td>
                  <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600">{item.channel.replace(/_/g, ' ')}</span></td>
                  <td className="px-4 py-4"><div className="flex items-center gap-2 font-medium text-slate-700"><Users size={15} className="text-slate-400" />{item.tenant_count} tenant{item.tenant_count === 1 ? '' : 's'}</div></td>
                  <td className="px-4 py-4">
                    <StatusToggle
                      value={item.enabled}
                      disabled={!can('providers.update') || saving === item.provider}
                      label={`${item.enabled ? 'Disable' : 'Enable'} ${item.provider}`}
                      onToggle={() => {
                        if (!can('providers.update')) return;
                        requestConfirm({
                          title: `${item.enabled ? 'Disable' : 'Enable'} provider globally`,
                          description: 'Confirm global provider status change',
                          body: <>Change <strong className="text-slate-900">{item.provider.replace(/_/g, ' ')}</strong> for every tenant?</>,
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
