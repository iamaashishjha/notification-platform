import { FormEvent, useState } from 'react';
import { apiRequest } from '../../api/client';
import { Panel } from '../../components/Panel';

export function SendNotificationPage() {
  const [tenantId, setTenantId] = useState('');
  const [channels, setChannels] = useState('sms,fcm');
  const [event, setEvent] = useState('ride.accepted');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setResult('');
    try {
      const res = await apiRequest<{ notification_id: string }>('/admin/api/v1/notifications/send', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: tenantId || undefined,
          event,
          channels: channels.split(',').map((c) => c.trim()).filter(Boolean),
          template: 'ride_accepted',
          target: {
            type: 'single',
            recipient: { phone: '9840000000', email: 'user@example.com', fcm_token: 'local-device', external_user_id: 'user_123' }
          },
          data: { customer_name: 'Aashish', driver_name: 'Ram', vehicle_no: 'BA 2 PA 1234' },
          priority: 5,
          schedule: { type: 'instant' }
        })
      });
      setResult(res.notification_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    }
  }

  return (
    <Panel title="Send Notification">
      <form onSubmit={submit} className="max-w-2xl space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Tenant ID</span>
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="Required for platform admin; tenant users use their tenant automatically" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
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
