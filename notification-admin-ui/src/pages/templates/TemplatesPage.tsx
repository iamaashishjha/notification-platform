import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';

type Template = { id: string; tenant_id: string; template_key: string; channel: string; subject: string; status: string; created_at: string };

export function TemplatesPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<Template[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [templateKey, setTemplateKey] = useState('');
  const [channel, setChannel] = useState('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => { setLoading(true); list<Template>('/admin/api/v1/templates').then((res) => setItems(res.data)).catch((err) => setError(err.message)).finally(() => setLoading(false)); };

  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      await apiRequest('/admin/api/v1/templates', { method: 'POST', body: JSON.stringify({ template_key: templateKey, channel, subject, body }) });
      setTemplateKey(''); setChannel('email'); setSubject(''); setBody('');
      setShowForm(false);
      setMessage('Template created');
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Create failed'); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this template?')) return;
    try {
      await apiRequest(`/admin/api/v1/templates/${id}`, { method: 'DELETE' });
      load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Delete failed'); }
  }

  return (
    <Panel title="Templates" actions={can('templates.create') ? <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">{showForm ? 'Cancel' : 'Add Template'}</button> : undefined}>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

      {showForm && (
        <form onSubmit={submit} className="mb-6 max-w-lg space-y-3 rounded-md border border-slate-200 p-4">
          <input value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} placeholder="Template key (e.g. order_confirmation)" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" required />
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="email">Email</option><option value="sms">SMS</option><option value="fcm">FCM</option>
          </select>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body" rows={4} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={saving} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Saving...' : 'Create'}</button>
        </form>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No templates found</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Key</th><th>Channel</th><th>Subject</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-3 font-medium">{item.template_key}</td>
                <td>{item.channel || '-'}</td>
                <td>{item.subject || '-'}</td>
                <td>{item.status}</td>
                <td>
                  <div className="flex gap-1">
                    {can('templates.delete') && <button onClick={() => remove(item.id)} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">Delete</button>}
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
