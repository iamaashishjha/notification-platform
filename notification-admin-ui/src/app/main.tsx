import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { AppLayout } from '../layouts/AppLayout';
import { LoginPage } from '../pages/login/LoginPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { TenantsPage } from '../pages/tenants/TenantsPage';
import { TenantDetailPage } from '../pages/tenants/TenantDetailPage';
import { NotificationsPage } from '../pages/notifications/NotificationsPage';
import { SendNotificationPage } from '../pages/notifications/SendNotificationPage';
import { ContactsPage } from '../pages/contacts/ContactsPage';
import { TemplatesPage } from '../pages/templates/TemplatesPage';
import { CampaignsPage } from '../pages/campaigns/CampaignsPage';
import { RolesPage } from '../pages/roles/RolesPage';
import { PermissionsPage } from '../pages/permissions/PermissionsPage';
import { ApiKeysPage } from '../pages/api-keys/ApiKeysPage';
import { AuditLogsPage } from '../pages/audit-logs/AuditLogsPage';
import { UsersPage } from '../pages/users/UsersPage';
import { FeaturesPage } from '../pages/features/FeaturesPage';
import { ChannelsPage } from '../pages/channels/ChannelsPage';
import { ProvidersPage } from '../pages/providers/ProvidersPage';
import { GroupsPage } from '../pages/groups/GroupsPage';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { QueueControlsPage } from '../pages/queues/QueueControlsPage';
import { IntegrationPage } from '../pages/integration/IntegrationPage';
import { ToastProvider } from '../components/Toast';
import './styles.css';

function PrivateRoute() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <AppLayout />;
}

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<PrivateRoute />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/tenants" element={<TenantsPage />} />
              <Route path="/tenants/:id" element={<TenantDetailPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/notifications/send" element={<SendNotificationPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/campaigns" element={<CampaignsPage />} />
              <Route path="/roles" element={<RolesPage />} />
              <Route path="/permissions" element={<PermissionsPage />} />
              <Route path="/api-keys" element={<ApiKeysPage />} />
              <Route path="/audit-logs" element={<AuditLogsPage />} />
              <Route path="/groups" element={<GroupsPage />} />
              <Route path="/features" element={<FeaturesPage />} />
              <Route path="/channels" element={<ChannelsPage />} />
              <Route path="/providers" element={<ProvidersPage />} />
              <Route path="/queues" element={<QueueControlsPage />} />
              <Route path="/integration" element={<IntegrationPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
