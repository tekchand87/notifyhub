import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { TopNavbar } from './TopNavbar';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-surface-50 dark:bg-[#111214]">
      <TopNavbar onMenuToggle={() => setMobileOpen((o) => !o)} />

      <div className="flex flex-1 pt-[48px]">
        {/* Desktop sidebar */}
        <div className="hidden lg:flex shrink-0">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((c) => !c)}
          />
        </div>

        {/* Mobile sidebar — drawer only, no desktop duplicate */}
        <Sidebar
          collapsed={false}
          onToggle={() => {}}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />

        {/* Main content area */}
        <main className="flex-1 min-w-0 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
