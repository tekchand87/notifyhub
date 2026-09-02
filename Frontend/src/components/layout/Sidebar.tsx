import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Bell,
  History,
  Building2,
  Users,
  Settings,
  User,
  Key,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { ROUTES } from '@/constants';
import { cn } from '@/lib/utils';
import { useAuth } from '@/modules/auth/AuthContext';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const NAV_SECTIONS: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Home',
    items: [
      { label: 'Dashboard', to: ROUTES.DASHBOARD, icon: <LayoutDashboard className="w-4 h-4" /> },
    ],
  },
  {
    heading: 'Events',
    items: [
      { label: 'Events', to: ROUTES.EVENTS, icon: <Bell className="w-4 h-4" /> },
    ],
  },
  {
    heading: 'Tenant',
    items: [
      { label: 'Overview', to: ROUTES.TENANT, icon: <Building2 className="w-4 h-4" />, adminOnly: true },
      { label: 'Members', to: ROUTES.MEMBERS, icon: <Users className="w-4 h-4" />, adminOnly: true },
      { label: 'API Keys', to: ROUTES.API_KEYS, icon: <Key className="w-4 h-4" />, adminOnly: true },
      { label: 'Settings', to: ROUTES.TENANT_SETTINGS, icon: <Settings className="w-4 h-4" />, adminOnly: true },
    ],
  },
  {
    heading: 'Account',
    items: [
      { label: 'Profile', to: ROUTES.PROFILE, icon: <User className="w-4 h-4" /> },
    ],
  },
];

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'tenant_admin';

  const content = (
    <aside
      className={cn(
        'flex flex-col h-full bg-surface-900 dark:bg-surface-950 border-r border-surface-700 dark:border-surface-800 transition-all duration-200',
        collapsed ? 'w-14' : 'w-[240px]',
      )}
    >
      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((i) => !i.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.heading} className="mb-1">
              {!collapsed && (
                <p className="px-3 py-1.5 text-2xs font-semibold uppercase tracking-widest text-surface-500">
                  {section.heading}
                </p>
              )}
              {visibleItems.map((item) => (
                <SidebarNavLink
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  onClick={onMobileClose}
                />
              ))}
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-surface-700 dark:border-surface-800 p-2">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-1.5 rounded text-surface-400 hover:text-white hover:bg-surface-700 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>
    </aside>
  );

  // Mobile overlay
  if (mobileOpen !== undefined) {
    return (
      <>
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={onMobileClose}
            aria-hidden
          />
        )}
        <div
          className={cn(
            'fixed top-[48px] left-0 bottom-0 z-30 lg:hidden transition-transform duration-200',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {content}
        </div>
        <div className="hidden lg:block">{content}</div>
      </>
    );
  }

  return content;
}

function SidebarNavLink({
  item,
  collapsed,
  onClick,
}: {
  item: NavItem;
  collapsed: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={item.to}
      end={item.to === ROUTES.TENANT}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 px-3 py-2 mx-1 rounded text-sm transition-colors',
          isActive
            ? 'bg-primary-600 text-white'
            : 'text-surface-300 hover:bg-surface-700 hover:text-white',
          collapsed && 'justify-center px-0',
        )
      }
    >
      {item.icon}
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}
