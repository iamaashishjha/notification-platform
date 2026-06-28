import { Panel } from '../../components/Panel';

export function SettingsPage() {
  return (
    <Panel title="Settings">
      <div className="max-w-2xl space-y-6">
        <div className="rounded-md border border-slate-200 p-4">
          <h3 className="mb-2 text-sm font-medium">Tenant Configuration</h3>
          <p className="text-sm text-slate-600">Tenant settings such as company name, branding, timezone, and default sender can be stored in the tenant's <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">config_json</code> field.</p>
        </div>
        <div className="rounded-md border border-slate-200 p-4">
          <h3 className="mb-2 text-sm font-medium">Retention</h3>
          <p className="text-sm text-slate-600">Audit log and notification retention policies are not yet configurable through the UI. Backend retention can be managed through database-level cleanup jobs.</p>
        </div>
        <div className="rounded-md border border-slate-200 p-4">
          <h3 className="mb-2 text-sm font-medium">Notification Defaults</h3>
          <p className="text-sm text-slate-600">Default priority, channel preferences, and fallback behavior are configured per-tenant through the tenant_channels and tenant_features tables.</p>
        </div>
      </div>
    </Panel>
  );
}
