import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { Modal, ModalButton } from '../../components/Modal';
import { useAuth } from '../../auth/AuthContext';
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';

type ApiKey = { id: string; tenant_id: string; tenant_name?: string; name: string; scopes: string; status: string; last_used_at: string; created_at: string };

export function ApiKeysPage() {
  const { user, can } = useAuth();
  const isPlatform = user?.is_platform_admin ?? false;
  const [items, setItems] = useState<ApiKey[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);

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

  async function copyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function revoke(id: string) {
    try {
      await apiRequest(`/admin/api/v1/api-keys/${id}`, { method: 'DELETE' });
      setRevokeTarget(null);
      setMessage('API key revoked');
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Revoke failed'); }
  }

  return (<>
    <Panel title="API Keys" actions={can('api_keys.create') ? <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">{showForm ? 'Cancel' : <><Plus size={14} /> Create API Key</>}</button> : undefined}>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No API keys found</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Name</th>{isPlatform && <th>Tenant</th>}<th>Status</th><th>Last Used</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-3 font-medium">{item.name}</td>
                {isPlatform && <td className="text-xs text-slate-500">{item.tenant_name || '-'}</td>}
                <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.status}</span></td>
                <td>{item.last_used_at || 'never'}</td>
                <td>{item.created_at}</td>
                <td>
                  <div className="flex gap-1">
                    {item.status === 'active' && can('api_keys.revoke') && <button onClick={() => setRevokeTarget(item)} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"><Trash2 size={12} />Revoke</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
    {showForm && !newKey && <Modal title="Create API key" description="Create a credential for a server, integration, or automated workflow." onClose={() => setShowForm(false)} width="max-w-md" footer={<><ModalButton onClick={() => setShowForm(false)}>Cancel</ModalButton><ModalButton variant="primary" disabled={saving} onClick={() => document.getElementById('api-key-form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))}>{saving ? 'Creating…' : 'Create API key'}</ModalButton></>}><form id="api-key-form" onSubmit={submit} className="px-6 py-5"><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Key name <span className="text-red-500">*</span></span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Production integration" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" required /><span className="mt-1.5 block text-xs text-slate-500">Use a name that identifies where this credential will be used.</span></label></form></Modal>}
    {newKey && <Modal title="API key created" description="Copy this credential now. For security, it cannot be displayed again." onClose={() => { setNewKey(''); setShowForm(false); }} width="max-w-2xl" footer={<ModalButton variant="primary" onClick={() => { setNewKey(''); setShowForm(false); }}>I have saved the key</ModalButton>}><div className="px-6 py-5"><div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"><KeyRound className="mt-0.5 shrink-0 text-amber-600" size={18} /><p className="text-sm leading-5 text-amber-800">Store this key in a secure secrets manager. Anyone with this value can authenticate as this tenant.</p></div><div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 bg-slate-950"><code className="min-w-0 flex-1 break-all px-4 py-3 font-mono text-sm leading-6 text-slate-100">{newKey}</code><button onClick={copyKey} className="focus-ring flex w-28 shrink-0 items-center justify-center gap-2 border-l border-slate-700 bg-slate-900 text-sm font-medium text-white hover:bg-slate-800">{copied ? <><Check size={16} />Copied</> : <><Copy size={16} />Copy</>}</button></div></div></Modal>}
    {revokeTarget && <Modal title="Revoke API key" description="This credential will stop working immediately." onClose={() => setRevokeTarget(null)} width="max-w-md" footer={<><ModalButton onClick={() => setRevokeTarget(null)}>Cancel</ModalButton><ModalButton variant="danger" onClick={() => revoke(revokeTarget.id)}>Revoke key</ModalButton></>}><div className="px-6 py-5 text-sm leading-6 text-slate-600">Revoke <strong className="text-slate-900">{revokeTarget.name}</strong>? Any integration using this key will lose access and may begin failing.</div></Modal>}
  </>);
}
