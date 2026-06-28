import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';

type Campaign = { id: string; tenant_id: string; name: string; description: string; status: string; scheduled_at: string; created_at: string };

export function CampaignsPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<Campaign[]>([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => list<Campaign>('/admin/api/v1/campaigns').then((res) => setItems(res.data)).catch((err) => setError(err.message));

  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      await apiRequest('/admin/api/v1/campaigns', { method: 'POST', body: JSON.stringify({ name, description }) });
      setName(''); setDescription('');
      setShowForm(false);
      setMessage('Campaign created');
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Create failed'); }
    finally { setSaving(false); }
  }

  async function transition(id: string, action: string) {
    try {
      await apiRequest(`/admin/api/v1/campaigns/${id}/${action}`, { method: 'POST' });
      setMessage(`Campaign ${action}ed`);
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Action failed'); }
  }

  return (
    <Panel title="Campaigns" actions={can('campaigns.create') ? <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">{showForm ? 'Cancel' : 'Create Campaign'}</button> : undefined}>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      {showForm && (
        <form onSubmit={submit} className="mb-6 max-w-lg space-y-3 rounded-md border border-slate-200 p-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={saving} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Saving...' : 'Create'}</button>
        </form>
      )}

      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr><th className="py-2">Name</th><th>Status</th><th>Scheduled</th><th>Created</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-slate-100">
              <td className="py-3 font-medium">{item.name}</td>
              <td>{item.status}</td>
              <td>{item.scheduled_at || '-'}</td>
              <td>{item.created_at}</td>
              <td className="space-x-2">
                {item.status === 'draft' && can('campaigns.approve') && <button onClick={() => transition(item.id, 'approve')} className="text-blue-600 hover:underline">Approve</button>}
                {item.status === 'approved' && can('campaigns.send') && <button onClick={() => transition(item.id, 'send')} className="text-green-600 hover:underline">Send</button>}
                {(item.status === 'draft' || item.status === 'approved') && can('campaigns.cancel') && <button onClick={() => transition(item.id, 'cancel')} className="text-red-600 hover:underline">Cancel</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
