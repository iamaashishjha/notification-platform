import { useEffect, useState } from 'react';
import { apiRequest, list, listPage } from '../../api/client';
import { Panel } from '../../components/Panel';
import { Button, RowActionButton } from '../../components/Button';
import { TenantFilter } from '../../components/TenantFilter';
import { FilterToolbar, SearchControl, SelectFilter } from '../../components/ListFilters';
import { TablePagination } from '../../components/TablePagination';
import { StatusBadge } from '../../components/StatusBadge';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { usePagination } from '../../hooks/usePagination';
import type { PaginationMeta } from '../../types/api';
import { Pause, Play, SearchX, Square } from 'lucide-react';

type QueueControl = {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  channel: string;
  queue_name: string;
  status: string;
  max_attempts: number;
  retry_delay_seconds: number;
  notes: string;
  updated_at: string;
};
type Tenant = { id: string; name: string; slug?: string; status: string };

export function QueueControlsPage() {
  const { user, can } = useAuth();
  const toast = useToast();
  const isPlatform = user?.is_platform_admin ?? false;
  const [items, setItems] = useState<QueueControl[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantFilter, setTenantFilter] = useState('');
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [saving, setSaving] = useState('');
  const [meta, setMeta] = useState<PaginationMeta>();
  const { page, perPage, setPage, setPerPage } = usePagination([tenantFilter, search, channelFilter, statusFilter]);

  function load() {
    setLoading(true);
    listPage<QueueControl>('/admin/api/v1/queue-controls', { tenant_id: tenantFilter, q: search, filter_channel: channelFilter, filter_status: statusFilter, page, per_page: perPage })
      .then((res) => { setItems(res.data); setMeta(res.meta); })
      .catch((err) => toast.error('Unable to load queue controls', err instanceof Error ? err.message : 'Load failed'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [tenantFilter, search, channelFilter, statusFilter, page, perPage]);
  useEffect(() => { if (isPlatform) list<Tenant>('/admin/api/v1/tenants').then((res) => setTenants(res.data)).catch(() => undefined); }, [isPlatform]);

  async function updateStatus(item: QueueControl, status: string) {
    setSaving(item.id);
    try {
      await apiRequest(`/admin/api/v1/queue-controls/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast.success(`Queue ${status}`, item.queue_name);
      load();
    } catch (err) {
      toast.error('Unable to update queue', err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving('');
    }
  }

  return (
    <Panel title="Queue Controls">
      <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <div className="text-sm font-semibold text-blue-900">Tenant delivery isolation</div>
        <p className="mt-0.5 text-sm leading-5 text-blue-700">Pause or stop a tenant/channel queue without affecting other tenants. Paused queues keep jobs queued; stopped queues block new delivery attempts until resumed.</p>
      </div>

      <FilterToolbar>
        <SearchControl id="queue-search" label="Search queues" value={search} onChange={setSearch} placeholder="Queue, tenant, channel, or status" />
        <SelectFilter id="queue-channel" label="Channel" value={channelFilter} onChange={setChannelFilter}>
          <option value="">All channels</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="fcm">FCM</option>
          <option value="websocket">WebSocket</option>
        </SelectFilter>
        <SelectFilter id="queue-status" label="Status" value={statusFilter} onChange={setStatusFilter}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="stopped">Stopped</option>
        </SelectFilter>
        {isPlatform && <TenantFilter className="template-filter-control template-tenant-control" value={tenantFilter} onChange={setTenantFilter} tenants={tenants} />}
        {(search || channelFilter || statusFilter || tenantFilter) && <Button size="sm" icon={SearchX} onClick={() => { setSearch(''); setChannelFilter(''); setStatusFilter(''); setTenantFilter(''); }} className="template-clear-filters">Clear filters</Button>}
      </FilterToolbar>

      {loading ? <div className="py-8 text-center text-slate-400">Loading queue controls...</div> : items.length === 0 ? <div className="py-8 text-center text-slate-400">No queue controls found</div> : (
        <>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500"><tr><th className="py-2">Queue</th>{isPlatform&&<th>Tenant</th>}<th>Channel</th><th>Status</th><th>Retry</th><th>Updated</th><th>Actions</th></tr></thead>
            <tbody>{items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-3"><div className="font-mono text-xs font-medium text-slate-900">{item.queue_name}</div>{item.notes&&<div className="mt-1 text-xs text-slate-400">{item.notes}</div>}</td>
                {isPlatform&&<td className="text-xs text-slate-500">{item.tenant_name || item.tenant_id}</td>}
                <td className="capitalize">{item.channel.replace('_', ' ')}</td>
                <td><StatusBadge status={item.status} /></td>
                <td className="text-xs text-slate-500">{item.max_attempts} attempts / {item.retry_delay_seconds}s</td>
                <td className="text-xs text-slate-500">{item.updated_at}</td>
                <td><div className="flex gap-1">
                  {item.status !== 'active' && can('queue_controls.update') && <RowActionButton disabled={saving===item.id} icon={Play} onClick={() => updateStatus(item, 'active')}>Resume</RowActionButton>}
                  {item.status !== 'paused' && can('queue_controls.update') && <RowActionButton disabled={saving===item.id} icon={Pause} onClick={() => updateStatus(item, 'paused')}>Pause</RowActionButton>}
                  {item.status !== 'stopped' && can('queue_controls.update') && <RowActionButton disabled={saving===item.id} tone="danger" icon={Square} onClick={() => updateStatus(item, 'stopped')}>Stop</RowActionButton>}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
          <TablePagination meta={meta} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={setPerPage} />
        </>
      )}
    </Panel>
  );
}
