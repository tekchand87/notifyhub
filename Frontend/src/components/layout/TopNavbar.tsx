import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  HelpCircle,
  ChevronDown,
  Moon,
  Sun,
  User,
  LogOut,
  Settings,
  Building2,
  Search,
  Menu,
} from 'lucide-react';
import { useAuth } from '@/modules/auth/AuthContext';
import { ROUTES } from '@/constants';
import { cn } from '@/lib/utils';

interface TopNavbarProps {
  onMenuToggle?: () => void;
}

function useDarkMode() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  );
  const toggle = () => {
    const html = document.documentElement;
    html.classList.toggle('dark');
    const isDark = html.classList.contains('dark');
    setDark(isDark);
    localStorage.setItem('nh_theme', isDark ? 'dark' : 'light');
  };
  useEffect(() => {
    const saved = localStorage.getItem('nh_theme');
    if (saved === 'dark') document.documentElement.classList.add('dark');
  }, []);
  return { dark, toggle };
}

export function TopNavbar({ onMenuToggle }: TopNavbarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { dark, toggle } = useDarkMode();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    navigate(ROUTES.LOGIN);
  };

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-40 h-[48px] flex items-center gap-3 px-4',
        'bg-white border-b border-surface-200',
        'dark:bg-[#181a1d] dark:border-[#2a2d32]',
      )}
    >
      {/* ── Brand ───────────────────────────────────── */}
      <Link
        to={ROUTES.DASHBOARD}
        className="flex items-center gap-2 shrink-0 mr-2"
        aria-label="NotifyHub home"
      >
        {/* Brand mark */}
        <div
          className={cn(
            'w-7 h-7 rounded flex items-center justify-center shrink-0',
            'bg-surface-900 dark:bg-surface-50',
          )}
        >
          <span
            className="text-primary-500 font-bold text-sm leading-none"
            aria-hidden
          >
            N
          </span>
        </div>
        <span className="font-semibold text-sm tracking-tight text-surface-900 dark:text-surface-100 hidden sm:block">
          NotifyHub
        </span>
      </Link>

      {/* ── Mobile menu toggle ───────────────────────── */}
      <button
        onClick={onMenuToggle}
        className={cn(
          'p-1.5 rounded transition-colors lg:hidden',
          'text-surface-500 hover:text-surface-900 hover:bg-surface-100',
          'dark:text-surface-400 dark:hover:text-surface-100 dark:hover:bg-surface-800',
        )}
        aria-label="Toggle menu"
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* ── Global search ────────────────────────────── */}
      <div className="flex-1 max-w-md hidden md:flex">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Search events, members, API keys…"
            className={cn(
              'w-full pl-8 pr-3 py-1 text-xs rounded border transition-colors',
              'bg-surface-50 border-surface-200 text-surface-700 placeholder-surface-400',
              'focus:outline-none focus:ring-1 focus:ring-primary-600 focus:border-primary-600 focus:bg-white',
              'dark:bg-surface-900 dark:border-surface-700 dark:text-surface-300',
              'dark:focus:bg-[#111214] dark:focus:border-primary-600',
            )}
            aria-label="Global search"
          />
          <kbd
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2',
              'hidden sm:inline-flex items-center px-1 py-0.5 rounded text-2xs',
              'bg-surface-100 border border-surface-200 text-surface-400',
              'dark:bg-surface-800 dark:border-surface-700',
            )}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="flex-1" />

      {/* ── Right actions ────────────────────────────── */}
      <div className="flex items-center gap-0.5">
        <NavIconBtn onClick={toggle} label={dark ? 'Light mode' : 'Dark mode'}>
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </NavIconBtn>

        <NavIconBtn label="Help & documentation">
          <HelpCircle className="w-4 h-4" />
        </NavIconBtn>

        <NavIconBtn label="Notifications">
          <Bell className="w-4 h-4" />
        </NavIconBtn>

        {/* Divider */}
        <div className="w-px h-5 bg-surface-200 dark:bg-[#2a2d32] mx-1" />

        {/* ── User menu ──────────────────────────────── */}
        <div className="relative" ref={menuRef}>
          <button
            id="user-menu-btn"
            onClick={() => setUserMenuOpen((o) => !o)}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors',
              'text-surface-700 hover:bg-surface-100',
              'dark:text-surface-300 dark:hover:bg-surface-800',
            )}
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
          >
            {/* Avatar */}
            <div
              className={cn(
                'w-6 h-6 rounded flex items-center justify-center text-2xs font-semibold shrink-0',
                'bg-primary-100 text-primary-800',
                'dark:bg-primary-900 dark:text-primary-300',
              )}
            >
              {initials}
            </div>
            <span className="hidden md:block max-w-[120px] truncate text-xs font-medium">
              {user?.name}
            </span>
            <ChevronDown
              className={cn(
                'w-3 h-3 text-surface-400 transition-transform',
                userMenuOpen && 'rotate-180',
              )}
            />
          </button>

          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setUserMenuOpen(false)}
                aria-hidden
              />
              <div
                role="menu"
                className={cn(
                  'absolute right-0 top-full mt-1 z-20 w-56 rounded shadow-card-md py-1 text-sm',
                  'bg-white border border-surface-200',
                  'dark:bg-[#181a1d] dark:border-[#2a2d32]',
                )}
              >
                {/* User info */}
                <div className="px-3 py-2.5 border-b border-surface-100 dark:border-[#2a2d32]">
                  <p className="font-semibold text-surface-900 dark:text-surface-100 text-xs truncate">
                    {user?.name}
                  </p>
                  <p className="text-surface-500 dark:text-surface-400 text-2xs truncate mt-0.5">
                    {user?.email}
                  </p>
                </div>

                <div className="py-1">
                  <MenuItem
                    icon={<User className="w-3.5 h-3.5" />}
                    label="Profile"
                    to={ROUTES.PROFILE}
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <MenuItem
                    icon={<Building2 className="w-3.5 h-3.5" />}
                    label="Tenant overview"
                    to={ROUTES.TENANT}
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <MenuItem
                    icon={<Settings className="w-3.5 h-3.5" />}
                    label="Settings"
                    to={ROUTES.TENANT_SETTINGS}
                    onClick={() => setUserMenuOpen(false)}
                  />
                </div>

                <div className="border-t border-surface-100 dark:border-[#2a2d32] pt-1">
                  <button
                    onClick={handleLogout}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors',
                      'text-error-600 hover:bg-error-50',
                      'dark:text-error-400 dark:hover:bg-error-950',
                    )}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function NavIconBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'p-1.5 rounded transition-colors',
        'text-surface-500 hover:text-surface-900 hover:bg-surface-100',
        'dark:text-surface-400 dark:hover:text-surface-100 dark:hover:bg-surface-800',
      )}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function MenuItem({
  icon,
  label,
  to,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  to: string;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 text-xs transition-colors',
        'text-surface-700 hover:bg-surface-50',
        'dark:text-surface-300 dark:hover:bg-surface-800',
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
