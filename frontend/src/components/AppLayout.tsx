import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  Upload,
  Users,
  UserSquare2,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { NotificationBell } from './NotificationBell';
import { IconButton, SearchInput } from './ui';
import { initials } from '@/utils/format';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: Building2 },
  { to: '/followups', label: 'Follow-ups', icon: CalendarClock },
  { to: '/customers', label: 'Customers', icon: UserSquare2 },
  { to: '/imports', label: 'Imports', icon: Upload },
  { to: '/reports', label: 'Reports', icon: BarChart3, adminOnly: true },
  { to: '/users', label: 'BDE team', icon: Users, adminOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const SIDEBAR_KEY = 'crm.sidebar.collapsed';

export function AppLayout() {
  const { user, isAdmin, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1');
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === '[' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setCollapsed((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const isLeads = location.pathname.startsWith('/leads');

  function submitSearch(event?: React.FormEvent) {
    event?.preventDefault();
    const value = search.trim();
    if (!value) return;
    navigate(`/leads?search=${encodeURIComponent(value)}`);
  }

  function handleSignOut() {
    setProfileOpen(false);
    signOut();
  }

  const expandedWidth = 'w-[268px] lg:w-[268px]';
  const collapsedWidth = 'w-[76px] lg:w-[76px]';

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-white shadow-xl shadow-slate-200/30 transition-all duration-300 ease-in-out lg:static lg:translate-x-0 lg:shadow-none ${
          collapsed ? collapsedWidth : expandedWidth
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className={`flex h-[72px] items-center border-b border-slate-100 ${collapsed ? 'justify-center px-2' : 'justify-between px-5'}`}>
          <Link to="/dashboard" className="flex min-w-0 items-center gap-3 overflow-hidden" title={collapsed ? 'Sales CRM - Click to dashboard' : undefined}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-sm font-black text-white shadow-sm shadow-brand-600/20">CR</span>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-bold tracking-tight text-slate-950">Sales CRM</p>
                <p className="text-[11px] text-slate-400">Lead operations</p>
              </div>
            )}
          </Link>
          <div className="flex items-center gap-1">
            <IconButton
              label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setCollapsed((value) => !value)}
              className="hidden lg:inline-flex"
            >
              {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </IconButton>
            <IconButton label="Close menu" onClick={() => setMobileOpen(false)} className="lg:hidden">
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        <div className={`${collapsed ? 'px-2' : 'px-4'} pt-5`}>
          {!collapsed && <p className="eyebrow px-2 pb-2">Workspace</p>}
          <nav className="space-y-1">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `group relative flex items-center rounded-xl py-2.5 text-sm font-semibold transition ${
                    collapsed ? 'justify-center px-0' : 'gap-3 px-3'
                  } ${
                    isActive ? 'bg-brand-50 text-brand-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                    {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                    {!collapsed && item.to === '/leads' && isLeads && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}

                    {/* Floating tooltip on hover when collapsed */}
                    {collapsed && (
                      <div className="pointer-events-none absolute left-full ml-3 hidden rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg group-hover:block z-50 whitespace-nowrap">
                        {item.label}
                      </div>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="mt-auto space-y-2 p-3">
          <button
            type="button"
            onClick={() => setCollapsed((val) => !val)}
            className={`hidden lg:flex w-full items-center rounded-xl py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition ${
              collapsed ? 'justify-center px-0' : 'gap-2 px-3'
            }`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && <span>Collapse sidebar</span>}
          </button>

          {!collapsed ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                  {initials(user?.fullName ?? '')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{user?.fullName}</p>
                  <p className="truncate text-xs text-slate-500">{user?.role === 'ADMIN' ? 'Administrator' : 'Business Development'}</p>
                </div>
              </div>
              <button type="button" onClick={handleSignOut} className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold text-slate-500 hover:bg-white hover:text-slate-900">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          ) : (
            <IconButton label={`Signed in as ${user?.fullName ?? 'user'}. Click to sign out.`} onClick={handleSignOut} className="w-full">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{initials(user?.fullName ?? '')}</span>
            </IconButton>
          )}
        </div>
      </aside>

      {mobileOpen && <button aria-label="Close sidebar" className="fixed inset-0 z-30 bg-slate-950/30 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col transition-all duration-300">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
          <div className="flex h-[72px] items-center gap-3 px-3 sm:px-5 lg:px-7">
            <div className="flex items-center gap-1">
              <IconButton label="Open menu" onClick={() => setMobileOpen(true)} className="lg:hidden"><Menu className="h-5 w-5" /></IconButton>
              <IconButton
                label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                onClick={() => setCollapsed((value) => !value)}
                className="hidden lg:inline-flex"
              >
                {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
              </IconButton>
            </div>

            <form onSubmit={submitSearch} className="hidden max-w-xl flex-1 md:block">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leads, companies, contacts…" aria-label="Search leads" className="field h-10 pl-9 pr-16" />
                <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">Ctrl K</kbd>
              </div>
            </form>

            <div className="ml-auto flex items-center gap-1.5">
              <NotificationBell />
              <div className="relative ml-1">
                <button type="button" onClick={() => setProfileOpen((open) => !open)} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{initials(user?.fullName ?? '')}</span>
                  <span className="hidden text-left sm:block">
                    <span className="block max-w-28 truncate text-xs font-bold text-slate-800">{user?.fullName}</span>
                    <span className="block text-[11px] text-slate-400">{user?.role === 'ADMIN' ? 'Admin' : 'BDE'}</span>
                  </span>
                  <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
                </button>
                {profileOpen && (
                  <>
                    <button aria-label="Close profile menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setProfileOpen(false)} />
                    <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                      <div className="border-b border-slate-100 px-3 py-2.5">
                        <p className="truncate text-sm font-semibold text-slate-900">{user?.fullName}</p>
                        <p className="truncate text-xs text-slate-500">{user?.email}</p>
                      </div>
                      <Link to="/settings" onClick={() => setProfileOpen(false)} className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"><Settings className="h-4 w-4" /> Settings</Link>
                      <button type="button" onClick={handleSignOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" /> Sign out</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="px-3 pb-3 md:hidden"><form onSubmit={submitSearch}><SearchInput value={search} onChange={setSearch} placeholder="Search leads…" /></form></div>
        </header>

        <main className="min-w-0 flex-1 p-3 sm:p-5 lg:p-7">
          <div className="page-shell min-w-0"><Outlet /></div>
        </main>
      </div>
    </div>
  );
}
