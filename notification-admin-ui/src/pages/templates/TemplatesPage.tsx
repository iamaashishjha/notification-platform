import { FormEvent, useEffect, useState } from 'react';
import { apiRequest, list } from '../../api/client';
import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';
import { Plus, Trash2, Pencil, X, Eye } from 'lucide-react';

type Template = { id: string; tenant_id: string; tenant_name?: string; template_key: string; channel: string; subject: string; body: string; status: string; created_at: string };

export function TemplatesPage() {
  const { user, can } = useAuth();
  const isPlatform = user?.is_platform_admin ?? false;
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [tenantFilter, setTenantFilter] = useState('');

  const load = () => {
    setLoading(true);
    list<Template>('/admin/api/v1/templates' + (tenantFilter ? `?tenant_id=${tenantFilter}` : ''))
      .then((res) => setItems(res.data))
      .catch((err) => setError(err.message)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenantFilter]);

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

  function startEdit(item: Template) {
    setEditingId(item.id);
    setTemplateKey(item.template_key);
    setChannel(item.channel || 'email');
    setSubject(item.subject || '');
    setBody(item.body || '');
  }

  async function saveEdit(id: string) {
    setSaving(true); setError('');
    try {
      await apiRequest(`/admin/api/v1/templates/${id}`, { method: 'PUT', body: JSON.stringify({ template_key: templateKey, channel, subject, body }) });
      setEditingId(null); setMessage('Template updated'); load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Update failed'); }
    finally { setSaving(false); }
  }

  return (
    <Panel title="Templates" actions={can('templates.create') ? <button onClick={() => { setShowForm(!showForm); setEditingId(null); }} className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">{showForm ? 'Cancel' : <><Plus size={14} /> Add Template</>}</button> : undefined}>
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

      {isPlatform && (
        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-medium">Tenant Filter</span>
          <input value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} placeholder="Filter by tenant ID" className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No templates found</div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">Key</th>{isPlatform && <th>Tenant</th>}<th>Channel</th><th>Subject</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                {editingId === item.id ? (
                  <>
                    <td className="py-3"><input value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} className="w-32 rounded border px-2 py-1 text-xs" /></td>
                    {isPlatform && <td>{item.tenant_name || '-'}</td>}
                    <td><select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded border px-2 py-1 text-xs"><option value="email">Email</option><option value="sms">SMS</option><option value="fcm">FCM</option></select></td>
                    <td><input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-32 rounded border px-2 py-1 text-xs" /></td>
                    <td>{item.status}</td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => saveEdit(item.id)} disabled={saving} className="rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50">Save</button>
                        <button onClick={() => setEditingId(null)} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"><X size={12} />Cancel</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-3 font-medium">{item.template_key}</td>
                    {isPlatform && <td className="text-xs text-slate-500">{item.tenant_name || '-'}</td>}
                    <td>{item.channel || '-'}</td>
                    <td>{item.subject || '-'}</td>
                    <td>{item.status}</td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => setViewingId(viewingId === item.id ? null : item.id)} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"><Eye size={12} />{viewingId === item.id ? 'Hide' : 'View'}</button>
                        {can('templates.update') && <button onClick={() => startEdit(item)} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"><Pencil size={12} />Edit</button>}
                        {can('templates.delete') && <button onClick={() => remove(item.id)} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"><Trash2 size={12} />Delete</button>}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {viewingId && items.find((i) => i.id === viewingId) && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
          <h3 className="mb-2 font-semibold">Template Preview</h3>
          {(() => {
            const t = items.find((i) => i.id === viewingId)!;
            return (
              <div className="space-y-2">
                <div><span className="text-slate-500">Key:</span> {t.template_key}</div>
                <div><span className="text-slate-500">Channel:</span> {t.channel}</div>
                <div><span className="text-slate-500">Subject:</span> {t.subject || '-'}</div>
                <div><span className="text-slate-500">Body:</span><pre className="mt-1 whitespace-pre-wrap rounded bg-white p-2 font-mono text-xs">{t.body || '-'}</pre></div>
              </div>
            );
          })()}
        </div>
      )}
    </Panel>
  );
}
