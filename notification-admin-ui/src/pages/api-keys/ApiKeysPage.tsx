import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';

type ApiKey = { id: string; tenant_id: string; name: string; scopes: string; status: string; last_used_at: string; created_at: string };

export function ApiKeysPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<ApiKey[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [message, setMessage] = useState('');

  const load = () => { setLoading(true); list<ApiKey>('/admin/api/v1/api-keys').then((res) => setItems(res.data)).catch((err) => setError(err.message)).finally(() => setLoading(false)); };

  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setMessage(''); setNewKey('');
    try {
      const res = await apiRequest<{ id: string; api_key: string; message: string }>('/admin/api/v1/api-keys', { method: 'POST', body: JSON.stringify({ name }) });
      setNewKey(res.api_key);
      setName('');
      setMessage('API key created - copy it now, it will not be shown again');
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Create failed'); }
    finally { setSaving(false); }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    try {
      await apiRequest(`/admin/api/v1/api-keys/${id}`, { method: 'DELETE' });
      setMessage('API key revoked');
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Revoke failed'); }
  }

  return (
    <Panel title="API Keys" actions={can('api_keys.create') ? <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">{showForm ? 'Cancel' : 'Create API Key'}</button> : undefined}>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      {newKey && (
        <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm">
          <strong className="block">New API Key:</strong>
          <code className="mt-1 block break-all rounded bg-white px-2 py-1 font-mono text-xs">{newKey}</code>
          <span className="mt-1 block text-yellow-700">Save this key - it will not be shown again.</span>
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="mb-6 max-w-lg space-y-3 rounded-md border border-slate-200 p-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name (e.g. production-sms)" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <button disabled={saving} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Creating...' : 'Create'}</button>
        </form>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No API keys found</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Name</th><th>Status</th><th>Last Used</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-3 font-medium">{item.name}</td>
                <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.status}</span></td>
                <td>{item.last_used_at || 'never'}</td>
                <td>{item.created_at}</td>
                <td>
                  <div className="flex gap-1">
                    {item.status === 'active' && can('api_keys.revoke') && <button onClick={() => revoke(item.id)} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">Revoke</button>}
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
