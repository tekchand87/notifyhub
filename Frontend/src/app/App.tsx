import { RouterProvider } from 'react-router-dom';
import { Providers } from './providers';
import { router } from './router';
import { useAuth } from '@/modules/auth/AuthContext';

// ── Inner app rendered after providers are ready ──────────────────────────────
// We gate the router on isLoading so there is NEVER a blank flash:
// while the session restore (authApi.getMe) is in flight, a full-screen
// spinner is shown. Once loading resolves (authenticated or not) the router
// mounts — ProtectedRoute then redirects to /login if not authenticated.
function InnerApp() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-surface-400">Loading NotifyHub…</p>
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
}

export function App() {
  return (
    <Providers>
      <InnerApp />
    </Providers>
  );
}
