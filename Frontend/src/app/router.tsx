import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute, GuestRoute } from '@/components/layout/ProtectedRoute';
import { LoginPage } from '@/modules/auth/pages/LoginPage';
import { RegisterPage } from '@/modules/auth/pages/RegisterPage';
import { DashboardPage } from '@/modules/dashboard/pages/DashboardPage';
import { TenantOverviewPage } from '@/modules/tenant/pages/TenantOverviewPage';
import { TenantSettingsPage } from '@/modules/tenant/pages/TenantSettingsPage';
import { MembersPage } from '@/modules/tenant/pages/MembersPage';
import { MemberDetailPage } from '@/modules/tenant/pages/MemberDetailPage';
import { EventsPage } from '@/modules/events/pages/EventsPage';
import { EventDetailPage } from '@/modules/events/pages/EventDetailPage';
import { ApiKeysPage } from '@/modules/apiKeys/pages/ApiKeysPage';
import { ProfilePage } from '@/modules/profile/pages/ProfilePage';

export const router = createBrowserRouter([
  // ─── Guest routes (redirects to dashboard if logged in) ──────────────────────
  {
    element: <GuestRoute />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },

  // ─── Protected routes (redirects to login if not logged in) ──────────────────
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/tenant', element: <TenantOverviewPage /> },
          { path: '/tenant/settings', element: <TenantSettingsPage /> },
          { path: '/tenant/members', element: <MembersPage /> },
          { path: '/tenant/members/:memberId', element: <MemberDetailPage /> },
          { path: '/events', element: <EventsPage /> },
          { path: '/events/:eventId', element: <EventDetailPage /> },
          { path: '/api-keys', element: <ApiKeysPage /> },
          { path: '/profile', element: <ProfilePage /> },
        ],
      },
    ],
  },

  // ─── Redirects ────────────────────────────────────────────────────────────────
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);
