import { Bell, Building2, KeyRound, LayoutDashboard, LogOut, Megaphone, Send, Settings, Shield, UserRoundCog, Users } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'notifications.view' },
  { to: '/tenants', label: 'Tenants', icon: Building2, permission: 'tenants.view' },
  { to: '/users', label: 'Users', icon: Users, permission: 'users.view' },
  { to: '/roles', label: 'Roles', icon: Shield, permission: 'roles.manage' },
  { to: '/features', label: 'Features', icon: UserRoundCog, permission: 'features.view' },
  { to: '/channels', label: 'Channels', icon: Bell, permission: 'channels.view' },
  { to: '/providers', label: 'Providers', icon: Settings, permission: 'providers.view' },
  { to: '/contacts', label: 'Contacts', icon: Users, permission: 'contacts.view' },
  { to: '/templates', label: 'Templates', icon: Megaphone, permission: 'templates.view' },
  { to: '/notifications', label: 'Logs', icon: Bell, permission: 'notifications.view' },
  { to: '/notifications/send', label: 'Send', icon: Send, permission: 'notifications.send' },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone, permission: 'campaigns.view' },
  { to: '/api-keys', label: 'API Keys', icon: KeyRound, permission: 'api_keys.view' },
  { to: '/audit-logs', label: 'Audit', icon: Shield, permission: 'audit_logs.view' },
  { to: '/settings', label: 'Settings', icon: Settings, permission: 'settings.view' }
];

export function AppLayout() {
  const { user, logout, can } = useAuth();
  return (
    <div className="min-h-screen bg-[#f7f8fb] text-slate-900">
      <aside className="fixed inset-y-0 left-0 w-64 border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center border-b border-slate-200 px-5">
          <div>
            <div className="text-base font-semibold">Notification Admin</div>
            <div className="text-xs text-slate-500">{user?.is_platform_admin ? 'Platform' : 'Tenant'} workspace</div>
          </div>
        </div>
        <nav className="h-[calc(100vh-4rem)] overflow-y-auto p-3">
          {nav.filter((item) => can(item.permission)).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Icon size={17} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <div className="ml-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div>
            <div className="text-sm font-medium">{user?.email}</div>
            <div className="text-xs text-slate-500">{user?.tenant_id || 'all tenants'}</div>
          </div>
          <button onClick={logout} className="focus-ring inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
            <LogOut size={16} /> Logout
          </button>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
