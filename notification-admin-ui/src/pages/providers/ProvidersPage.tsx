import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';

type Provider = { id: string; channel: string; provider: string; is_default: boolean; status: string; tenant_name: string };

export function ProvidersPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<Provider[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [channel, setChannel] = useState('email');
  const [providerName, setProviderName] = useState('mock');
  const [saving, setSaving] = useState(false);

  const load = () => { setLoading(true); list<Provider>('/admin/api/v1/providers').then((res) => setItems(res.data)).catch((err) => setError(err.message)).finally(() => setLoading(false)); };

  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      await apiRequest('/admin/api/v1/providers', { method: 'POST', body: JSON.stringify({ channel, provider: providerName }) });
      setShowForm(false); setMessage('Provider config created');
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Create failed'); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this provider config?')) return;
    try {
      await apiRequest(`/admin/api/v1/providers/${id}`, { method: 'DELETE' });
      setMessage('Provider config deleted');
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Delete failed'); }
  }

  async function testProvider(id: string) {
    try {
      const res = await apiRequest<{ message: string }>(`/admin/api/v1/providers/${id}/test`, { method: 'POST' });
      setMessage(res.message || 'Test OK');
    } catch (err: any) { setError(err.message); }
  }

  return (
    <Panel title="Provider Configs" actions={can('providers.create') ? <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">{showForm ? 'Cancel' : 'Add Provider'}</button> : undefined}>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      {showForm && (
        <form onSubmit={submit} className="mb-6 max-w-lg space-y-3 rounded-md border border-slate-200 p-4">
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="email">Email</option><option value="sms">SMS</option><option value="fcm">FCM</option><option value="websocket">WebSocket</option>
          </select>
          <select value={providerName} onChange={(e) => setProviderName(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="mock">Mock</option><option value="smtp">SMTP</option><option value="sendgrid">SendGrid</option><option value="ses">SES</option>
            <option value="twilio">Twilio</option><option value="sparrow">Sparrow</option><option value="generic_http_sms">Generic HTTP SMS</option>
            <option value="fcm">FCM</option>
          </select>
          <button disabled={saving} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Saving...' : 'Create'}</button>
        </form>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No provider configs found</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Channel</th><th>Provider</th><th>Tenant</th><th>Default</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-3 font-medium">{item.channel}</td>
                <td>{item.provider}</td>
                <td>{item.tenant_name}</td>
                <td>{item.is_default ? 'Yes' : 'No'}</td>
                <td>{item.status}</td>
                <td>
                  <div className="flex gap-1">
                    {can('providers.test') && <button onClick={() => testProvider(item.id)} className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">Test</button>}
                    {can('providers.delete') && <button onClick={() => remove(item.id)} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">Delete</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
