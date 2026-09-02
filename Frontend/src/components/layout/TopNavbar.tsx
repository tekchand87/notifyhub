import { useState, useEffect } from 'react';
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
    setDark(html.classList.contains('dark'));
    localStorage.setItem('nh_theme', html.classList.contains('dark') ? 'dark' : 'light');
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

  const handleLogout = () => {
    logout();
    navigate(ROUTES.LOGIN);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-[48px] flex items-center gap-3 px-4 bg-surface-900 dark:bg-surface-950 border-b border-surface-700 dark:border-surface-800">
      {/* Logo */}
      <Link
        to={ROUTES.DASHBOARD}
        className="flex items-center gap-2 text-white shrink-0"
        onClick={onMenuToggle}
      >
        <div className="w-7 h-7 rounded bg-primary-600 flex items-center justify-center text-white font-bold text-sm">
          N
        </div>
        <span className="font-semibold text-sm tracking-tight hidden sm:block">NotifyHub</span>
      </Link>

      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggle}
          className="p-1.5 rounded text-surface-300 hover:text-white hover:bg-surface-700 transition-colors"
          aria-label="Toggle dark mode"
        >
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button className="p-1.5 rounded text-surface-300 hover:text-white hover:bg-surface-700 transition-colors" aria-label="Help">
          <HelpCircle className="w-4 h-4" />
        </button>

        <button className="p-1.5 rounded text-surface-300 hover:text-white hover:bg-surface-700 transition-colors" aria-label="Notifications">
          <Bell className="w-4 h-4" />
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded text-surface-200 hover:text-white hover:bg-surface-700 transition-colors text-sm"
            aria-expanded={userMenuOpen}
            aria-label="User menu"
          >
            <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-semibold">
              {user?.name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <span className="hidden md:block max-w-[120px] truncate">{user?.name}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setUserMenuOpen(false)}
                aria-hidden
              />
              <div className={cn(
                'absolute right-0 top-full mt-1 z-20 w-52 rounded-md shadow-lg',
                'bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700',
                'py-1 text-sm',
              )}>
                <div className="px-3 py-2 border-b border-surface-100 dark:border-surface-800">
                  <p className="font-medium text-surface-900 dark:text-surface-100 truncate">{user?.name}</p>
                  <p className="text-surface-500 dark:text-surface-400 text-xs truncate">{user?.email}</p>
                </div>
                <MenuItem icon={<User className="w-3.5 h-3.5" />} label="Profile" to={ROUTES.PROFILE} onClick={() => setUserMenuOpen(false)} />
                <MenuItem icon={<Building2 className="w-3.5 h-3.5" />} label="Tenant" to={ROUTES.TENANT} onClick={() => setUserMenuOpen(false)} />
                <MenuItem icon={<Settings className="w-3.5 h-3.5" />} label="Settings" to={ROUTES.TENANT_SETTINGS} onClick={() => setUserMenuOpen(false)} />
                <div className="border-t border-surface-100 dark:border-surface-800 mt-1 pt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Logout
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
      className="flex items-center gap-2 px-3 py-1.5 text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
    >
      {icon}
      {label}
    </Link>
  );
}
