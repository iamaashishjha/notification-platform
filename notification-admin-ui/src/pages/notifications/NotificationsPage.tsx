import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, listPage } from '../../api/client';
import { Panel } from '../../components/Panel';
import { StatusBadge } from '../../components/StatusBadge';
import { TablePagination } from '../../components/TablePagination';
import { useAuth } from '../../auth/AuthContext';
import { Eye, Send } from 'lucide-react';
import { usePagination } from '../../hooks/usePagination';
import type { PaginationMeta } from '../../types/api';
import { FilterToolbar, SearchControl, SelectFilter } from '../../components/ListFilters';
import { RowActionButton } from '../../components/Button';
import { Modal, ModalButton } from '../../components/Modal';

type NotificationLog = { public_id: string; tenant: string; event: string; status: string; delivery_status: string; channel: string; provider: string; created_at: string };
type TimelineEvent = { type: string; timestamp: string; channel?: string; provider?: string; attempt_no?: number; duration_ms?: number; explanation?: string; failure?: FailureInfo };
type FailureInfo = { category: string; code: string; retryable: boolean; explanation: string; suggested_action: string };
type DeliveryAttempt = { attempt_no: number; status: string; duration_ms: number; created_at: string; failure: FailureInfo };
type DeliveryDetail = { id: string; channel: string; provider: string; status: string; failure: FailureInfo; attempts: DeliveryAttempt[] };
type NotificationDetail = { public_id: string; tenant: string; event: string; status: string; template_key: string; schedule_type: string; created_at: string; deliveries: DeliveryDetail[]; timeline: TimelineEvent[] };

export function NotificationsPage() {
  const { can } = useAuth();
  const [items, setItems] = useState<NotificationLog[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<PaginationMeta>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [detail, setDetail] = useState<NotificationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const { page, perPage, setPage, setPerPage } = usePagination();
  const filters = useMemo(() => ({ page, per_page: perPage, search, status, channel }), [page, perPage, search, status, channel]);

  useEffect(() => {
    setLoading(true);
    listPage<NotificationLog>('/admin/api/v1/notifications', filters).then((res) => { setItems(res.data); setMeta(res.meta); }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [filters]);

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  async function openDetail(publicId: string) {
    setDetailLoading(true);
    setError('');
    try {
      const res = await apiRequest<{ data: NotificationDetail }>(`/admin/api/v1/notifications/${publicId}`);
      setDetail(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load notification details');
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <Panel title="Notification Logs" actions={can('notifications.send') ? <Link className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white" to="/notifications/send"><Send size={14} />Send</Link> : undefined}>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <FilterToolbar>
        <SearchControl id="notification-search" label="Search" value={search} onChange={(value) => updateFilter(setSearch, value)} placeholder="ID, event, idempotency key" />
        <SelectFilter id="notification-status" label="Status" value={status} onChange={(value) => updateFilter(setStatus, value)}>
          <option value="">All statuses</option>
          <option value="queued">Queued</option>
          <option value="sending">Sending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="dead">Dead-lettered</option>
          <option value="blocked">Blocked</option>
        </SelectFilter>
        <SelectFilter id="notification-channel" label="Channel" value={channel} onChange={(value) => updateFilter(setChannel, value)}>
          <option value="">All channels</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="fcm">Mobile push</option>
          <option value="websocket">WebSocket</option>
        </SelectFilter>
      </FilterToolbar>

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No notifications found</div>
      ) : (
        <>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr><th className="py-2">ID</th><th>Tenant</th><th>Event</th><th>Channel</th><th>Provider</th><th>Status</th><th>Created</th><th className="w-28">Actions</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.public_id} className="border-b border-slate-100">
                <td className="py-3 font-medium">{item.public_id}</td><td>{item.tenant}</td><td>{item.event}</td><td>{item.channel || '-'}</td><td>{item.provider || '-'}</td><td><StatusBadge status={item.delivery_status || item.status}/></td><td>{item.created_at}</td><td><RowActionButton icon={Eye} onClick={() => openDetail(item.public_id)} disabled={detailLoading}>View</RowActionButton></td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination meta={meta} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={setPerPage} />
        </>
      )}
      {detail && <Modal title={`Notification ${detail.public_id}`} description={`${detail.tenant} · ${detail.event}`} onClose={() => setDetail(null)} width="max-w-4xl" footer={<ModalButton onClick={() => setDetail(null)}>Close</ModalButton>}>
        <div className="space-y-5 p-6">
          <div className="grid gap-3 md:grid-cols-4">
            <Info label="Status" value={<StatusBadge status={detail.status} />} />
            <Info label="Template" value={detail.template_key || '-'} />
            <Info label="Schedule" value={detail.schedule_type} />
            <Info label="Created" value={detail.created_at} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Deliveries</h3>
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Channel</th><th>Provider</th><th>Status</th><th>Attempts</th><th>Failure</th><th>Suggested action</th></tr></thead>
                <tbody>{detail.deliveries.map((delivery) => <tr key={delivery.id} className="border-t border-slate-100"><td className="px-3 py-2">{delivery.channel}</td><td>{delivery.provider}</td><td><StatusBadge status={delivery.status} /></td><td>{delivery.attempts.length}</td><td>{delivery.failure.code}</td><td className="max-w-xs text-slate-600">{delivery.failure.suggested_action}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Lifecycle Timeline</h3>
            <div className="space-y-3">
              {detail.timeline.map((event, index) => <div key={`${event.type}-${index}`} className="rounded-md border border-slate-200 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold capitalize text-slate-900">{event.type.replace(/_/g, ' ')}</span>{event.channel && <span className="text-slate-500">{event.channel}</span>}{event.provider && <span className="text-slate-500">{event.provider}</span>}{event.attempt_no && <span className="text-slate-500">attempt {event.attempt_no}</span>}<span className="ml-auto text-xs text-slate-500">{event.timestamp}</span></div>
                <p className="mt-1 text-sm text-slate-600">{event.explanation || event.failure?.explanation}</p>
              </div>)}
            </div>
          </div>
        </div>
      </Modal>}
    </Panel>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"><div className="text-xs font-semibold uppercase text-slate-500">{label}</div><div className="mt-1 text-sm text-slate-900">{value}</div></div>;
}
