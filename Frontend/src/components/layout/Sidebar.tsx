import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Bell,
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
      {
        label: 'Dashboard',
        to: ROUTES.DASHBOARD,
        icon: <LayoutDashboard className="w-4 h-4" />,
      },
    ],
  },
  {
    heading: 'Events',
    items: [
      {
        label: 'Events',
        to: ROUTES.EVENTS,
        icon: <Bell className="w-4 h-4" />,
      },
    ],
  },
  {
    heading: 'Tenant',
    items: [
      {
        label: 'Overview',
        to: ROUTES.TENANT,
        icon: <Building2 className="w-4 h-4" />,
        adminOnly: true,
      },
      {
        label: 'Members',
        to: ROUTES.MEMBERS,
        icon: <Users className="w-4 h-4" />,
        adminOnly: true,
      },
      {
        label: 'API Keys',
        to: ROUTES.API_KEYS,
        icon: <Key className="w-4 h-4" />,
        adminOnly: true,
      },
      {
        label: 'Settings',
        to: ROUTES.TENANT_SETTINGS,
        icon: <Settings className="w-4 h-4" />,
        adminOnly: true,
      },
    ],
  },
  {
    heading: 'Account',
    items: [
      {
        label: 'Profile',
        to: ROUTES.PROFILE,
        icon: <User className="w-4 h-4" />,
      },
    ],
  },
];

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'tenant_admin';

  const content = (
    <aside
      className={cn(
        'flex flex-col h-full transition-all duration-200',
        // Light mode: off-white sidebar with right border
        'bg-surface-50 border-r border-surface-200',
        // Dark mode: deep graphite sidebar
        'dark:bg-[#181a1d] dark:border-[#2a2d32]',
        collapsed ? 'w-[52px]' : 'w-[232px]',
      )}
    >
      {/* ── Navigation ──────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5" aria-label="Main navigation">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((i) => !i.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.heading} className="mb-2">
              {/* Section heading */}
              {!collapsed && (
                <p
                  className={cn(
                    'px-3 pb-1 text-2xs font-semibold uppercase tracking-widest',
                    'text-surface-400 dark:text-surface-600',
                  )}
                >
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

      {/* ── Collapse toggle ──────────────────────────── */}
      <div
        className={cn(
          'border-t px-2 py-2',
          'border-surface-200 dark:border-[#2a2d32]',
        )}
      >
        <button
          onClick={onToggle}
          className={cn(
            'w-full flex items-center justify-center p-1.5 rounded text-xs transition-colors',
            'text-surface-400 hover:text-surface-700 hover:bg-surface-100',
            'dark:text-surface-500 dark:hover:text-surface-300 dark:hover:bg-surface-800',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
          {!collapsed && (
            <span className="ml-1.5 text-2xs">Collapse</span>
          )}
        </button>
      </div>
    </aside>
  );

  // Mobile overlay — only renders the slide-in drawer (lg:hidden).
  // The desktop sidebar is rendered separately in AppLayout.
  if (mobileOpen !== undefined) {
    return (
      <>
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
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
          'group relative flex items-center gap-2.5 mx-2 px-2 py-1.5 rounded text-sm transition-colors',
          // Active state — amber left bar + amber tinted bg
          isActive
            ? [
                'bg-primary-50 text-primary-800',
                'dark:bg-primary-950/40 dark:text-primary-400',
                'before:absolute before:left-0 before:top-1 before:bottom-1',
                'before:w-0.5 before:bg-primary-600 before:rounded-r before:-ml-2',
              ]
            : [
                'text-surface-600 hover:text-surface-900 hover:bg-surface-100',
                'dark:text-surface-400 dark:hover:text-surface-100 dark:hover:bg-surface-800',
              ],
          collapsed && 'justify-center px-0 mx-1',
        )
      }
    >
      <span className={cn('shrink-0 transition-colors')}>{item.icon}</span>
      {!collapsed && (
        <span className="truncate font-medium text-xs">{item.label}</span>
      )}
    </NavLink>
  );
}
