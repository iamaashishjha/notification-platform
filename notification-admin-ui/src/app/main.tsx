import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { AppLayout } from '../layouts/AppLayout';
import { LoginPage } from '../pages/login/LoginPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { TenantsPage } from '../pages/tenants/TenantsPage';
import { NotificationsPage } from '../pages/notifications/NotificationsPage';
import { SendNotificationPage } from '../pages/notifications/SendNotificationPage';
import { ModulePage } from '../pages/settings/ModulePage';
import './styles.css';

function PrivateRoute() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <AppLayout />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<PrivateRoute />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tenants" element={<TenantsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/notifications/send" element={<SendNotificationPage />} />
            <Route path="/users" element={<ModulePage title="Users" permission="users.view" />} />
            <Route path="/roles" element={<ModulePage title="Roles" permission="roles.manage" />} />
            <Route path="/permissions" element={<ModulePage title="Permissions" permission="permissions.manage" />} />
            <Route path="/features" element={<ModulePage title="Feature Flags" permission="features.manage" />} />
            <Route path="/channels" element={<ModulePage title="Channels" permission="channels.manage" />} />
            <Route path="/providers" element={<ModulePage title="Provider Configs" permission="providers.manage" />} />
            <Route path="/contacts" element={<ModulePage title="Contacts" permission="contacts.view" />} />
            <Route path="/groups" element={<ModulePage title="Contact Groups" permission="groups.manage" />} />
            <Route path="/templates" element={<ModulePage title="Templates" permission="templates.view" />} />
            <Route path="/campaigns" element={<ModulePage title="Campaigns" permission="campaigns.view" />} />
            <Route path="/api-keys" element={<ModulePage title="API Keys" permission="api_keys.manage" />} />
            <Route path="/audit-logs" element={<ModulePage title="Audit Logs" permission="audit_logs.view" />} />
            <Route path="/settings" element={<ModulePage title="Settings" permission="settings.manage" />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
