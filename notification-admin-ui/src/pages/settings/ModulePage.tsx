import { Panel } from '../../components/Panel';
import { useAuth } from '../../auth/AuthContext';

export function ModulePage({ title, permission }: { title: string; permission: string }) {
  const { can } = useAuth();
  if (!can(permission)) {
    return <Panel title={title}><div className="text-sm text-slate-600">Permission required: {permission}</div></Panel>;
  }
  return (
    <Panel title={title}>
      <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-600">
        This module is wired into the navigation and API surface. CRUD tables and forms can extend this panel without changing the platform architecture.
      </div>
    </Panel>
  );
}
