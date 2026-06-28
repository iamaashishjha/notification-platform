import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';

type TenantOption = { id: string; name: string; slug: string };

export function SendNotificationPage() {
  const { user } = useAuth();
  const isPlatform = user?.is_platform_admin ?? false;
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [channels, setChannels] = useState('sms,fcm');
  const [event, setEvent] = useState('order.confirmed');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isPlatform) {
      list<TenantOption>('/admin/api/v1/tenants').then((res) => { setTenants(res.data); if (res.data.length) setTenantId(res.data[0].id); }).catch(() => {});
    }
  }, [isPlatform]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setResult('');
    const body: Record<string, unknown> = {
      event,
      channels: channels.split(',').map((c) => c.trim()).filter(Boolean),
      template: 'order_confirmation',
      target: {
        type: 'single',
        recipient: { phone: '+12025551234', email: 'jane@example.com', fcm_token: 'local-device', external_user_id: 'cust_001' }
      },
      data: { customer_name: 'Jane Smith', order_id: 'ORD-12345', total_amount: '99.99' },
      priority: 5,
      schedule: { type: 'instant' }
    };
    if (isPlatform) {
      body.tenant_id = tenantId;
    }
    try {
      const res = await apiRequest<{ notification_id: string }>('/admin/api/v1/notifications/send', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      setResult(res.notification_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    }
  }

  return (
    <Panel title="Send Notification">
      <form onSubmit={submit} className="max-w-2xl space-y-4">
        {isPlatform ? (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Tenant</span>
            <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2">
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>)}
            </select>
          </label>
        ) : (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Sending as tenant: <strong>{user?.tenant_id || 'your tenant'}</strong>
          </div>
        )}
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Event</span>
          <input value={event} onChange={(e) => setEvent(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Channels</span>
          <input value={channels} onChange={(e) => setChannels(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {result && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">Queued as {result}</div>}
        <button className="focus-ring rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Queue notification</button>
      </form>
    </Panel>
  );
}
