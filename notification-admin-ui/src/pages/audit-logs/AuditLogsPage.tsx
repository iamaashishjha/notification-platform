import { useEffect, useState } from 'react';
import { list, listPage } from '../../api/client';
import { Panel } from '../../components/Panel';
import { Modal, ModalButton } from '../../components/Modal';
import { Button, RowActionButton } from '../../components/Button';
import { TenantFilter } from '../../components/TenantFilter';
import { TablePagination } from '../../components/TablePagination';
import { FilterToolbar, SearchControl } from '../../components/ListFilters';
import { useAuth } from '../../auth/AuthContext';
import { Eye, X } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { usePagination } from '../../hooks/usePagination';
import type { PaginationMeta } from '../../types/api';

type AuditLog = { id: string; action: string; actor_type: string; actor_user_id: string; resource_type: string; resource_id: string; ip_address: string; request_id?: string; session_id?: string; created_at: string; tenant_name?: string };
type Tenant = { id: string; name: string; slug?: string; status: string };

export function AuditLogsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isPlatform = user?.is_platform_admin ?? false;
  const [items, setItems] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedLogs, setSelectedLogs] = useState<AuditLog[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [tenantFilter, setTenantFilter] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');
  const [meta, setMeta] = useState<PaginationMeta>();
  const { page, perPage, setPage, setPerPage } = usePagination([tenantFilter, search]);

  useEffect(() => {
    setLoading(true);
    listPage<AuditLog>('/admin/api/v1/audit-logs', { tenant_id: tenantFilter, q: search, page, per_page: perPage }).then((res) => { setItems(res.data); setMeta(res.meta); }).catch((err) => toast.error('Unable to load audit logs', err instanceof Error ? err.message : 'Load failed')).finally(() => setLoading(false));
  }, [tenantFilter, search, page, perPage, toast]);
  useEffect(() => { if (isPlatform) list<Tenant>('/admin/api/v1/tenants').then((res)=>setTenants(res.data)).catch(()=>{}); }, [isPlatform]);

  const grouped = items.reduce<Record<string, AuditLog[]>>((acc, item) => {
    const key = item.session_id || 'No session';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  const sessions = Object.entries(grouped);

  async function viewSession(sessionID: string) {
    setSelectedSession(sessionID);
    setSessionLoading(true);
    try {
      const res = await listPage<AuditLog>('/admin/api/v1/audit-logs', { tenant_id: tenantFilter, q: sessionID, per_page: 100 });
      setSelectedLogs(res.data.filter((item) => (item.session_id || 'No session') === sessionID));
    } catch (err) {
      toast.error('Unable to load audit session', err instanceof Error ? err.message : 'Load failed');
      setSelectedLogs([]);
    } finally {
      setSessionLoading(false);
    }
  }

  return (<>
    <Panel title="Audit Logs">
      <FilterToolbar>
        <SearchControl id="audit-search" label="Search audit logs" value={search} onChange={setSearch} placeholder="Action, actor, resource, session, tenant, or IP" />
        {isPlatform && <TenantFilter className="template-filter-control template-tenant-control" value={tenantFilter} onChange={setTenantFilter} tenants={tenants} />}
        {(search || tenantFilter) && <Button size="sm" icon={X} onClick={() => { setSearch(''); setTenantFilter(''); }} className="template-clear-filters">Clear filters</Button>}
      </FilterToolbar>

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-slate-400">No audit logs found</div>
      ) : (
        <>
        <div className="space-y-6">
          {sessions.map(([sessionID, logs]) => (
            <section key={sessionID} className="rounded-md border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Session</h2>
                  <p className="font-mono text-xs text-slate-500">{sessionID}</p>
                </div>
                <button type="button" onClick={() => viewSession(sessionID)} className="focus-ring rounded-full bg-white px-2.5 py-1 text-xs font-medium text-blue-600 shadow-sm hover:bg-blue-50">{logs.length} events</button>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr><th className="py-2 pl-4">Action</th><th>Actor</th><th>Resource</th><th>Resource ID</th><th>IP</th><th>Time</th>{isPlatform && <th>Tenant</th>}<th>Actions</th></tr>
                </thead>
                <tbody>
                  {logs.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pl-4 font-medium">{item.action}</td>
                      <td>{item.actor_type}</td>
                      <td>{item.resource_type}</td>
                      <td className="font-mono text-xs">{item.resource_id || '-'}</td>
                      <td>{item.ip_address || '-'}</td>
                      <td>{item.created_at}</td>
                      {isPlatform && <td className="text-xs text-slate-500">{item.tenant_name || '-'}</td>}
                      <td><RowActionButton onClick={() => viewSession(item.session_id || 'No session')} icon={Eye}>View</RowActionButton></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
        <TablePagination meta={meta} page={page} perPage={perPage} onPageChange={setPage} onPerPageChange={setPerPage} />
        </>
      )}
    </Panel>
    {selectedSession&&<Modal title="Audit session" description={selectedSession} onClose={()=>{setSelectedSession('');setSelectedLogs([])}} width="max-w-4xl" footer={<ModalButton onClick={()=>{setSelectedSession('');setSelectedLogs([])}}>Close</ModalButton>}>
      {sessionLoading ? <div className="py-12 text-center text-slate-400">Loading session events...</div> : selectedLogs.length === 0 ? <div className="py-12 text-center text-slate-400">No audit events found for this session</div> : <div className="max-h-[65vh] overflow-auto px-6 py-5">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500"><tr><th className="py-2">Action</th><th>Actor</th><th>Resource</th><th>Resource ID</th><th>Request</th><th>IP</th><th>Time</th>{isPlatform&&<th>Tenant</th>}</tr></thead>
          <tbody>{selectedLogs.map((item)=><tr key={item.id} className="border-b border-slate-100"><td className="py-3 font-medium">{item.action}</td><td>{item.actor_type}</td><td>{item.resource_type}</td><td className="font-mono text-xs">{item.resource_id||'-'}</td><td className="font-mono text-xs">{item.request_id||'-'}</td><td>{item.ip_address||'-'}</td><td>{item.created_at}</td>{isPlatform&&<td className="text-xs text-slate-500">{item.tenant_name||'-'}</td>}</tr>)}</tbody>
        </table>
      </div>}
    </Modal>}
  </>);
}
