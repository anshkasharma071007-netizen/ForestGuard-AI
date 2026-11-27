import { useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  ClipboardList,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  Settings,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../hooks/useApi'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeToggle from './ThemeToggle'
import { Logo } from './ui'

const SECTIONS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/reports', label: 'Reports', icon: ClipboardList },
  { to: '/map', label: 'Map', icon: Map },
  { to: '/alerts', label: 'Alerts', icon: ShieldAlert },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const TITLES = {
  '/': 'Dashboard',
  '/monitoring': 'Live monitoring',
  '/map': 'Map',
  '/wildlife': 'Wildlife intelligence',
  '/reports': 'Reports',
  '/alerts': 'Alerts',
  '/settings': 'Settings',
  '/risk': 'Detection alerts',
  '/guard': 'Forest guard panel',
  '/analytics': 'Analytics & reports',
}

function SidebarContent({ onNavigate, unread }) {
  const { user, logout } = useAuth()
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-6 pt-6">
        <NavLink to="/" onClick={onNavigate}>
          <Logo light />
        </NavLink>
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-lime" />
          </span>
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-forest-100/80">
            Pench Landscape
          </div>
        </div>
      </div>

      <nav aria-label="Authority navigation" className="sidebar-scroll flex-1 space-y-1 overflow-y-auto px-3">
        {SECTIONS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[12.5px] font-medium transition-all ${isActive
                ? 'bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                : 'text-forest-100/65 hover:bg-white/[0.05] hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-lime transition-opacity ${isActive ? 'opacity-100' : 'opacity-0'
                    }`}
                />
                <item.icon
                  className={`h-[17px] w-[17px] transition-colors ${isActive ? 'text-lime' : 'text-forest-200/60 group-hover:text-forest-100'
                    }`}
                  strokeWidth={1.8}
                />
                <span className="flex-1">{item.label}{item.to === '/reports' && unread > 0 && ` (${unread})`}</span>
                {isActive && <ChevronRight className="h-3.5 w-3.5 text-forest-200/60" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-lime/15 text-[12px] font-bold text-lime">
            {(user?.name || 'FG')
              .split(' ')
              .map((part) => part[0])
              .slice(0, 2)
              .join('')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold text-white">{user?.name || 'Guest'}</div>
            <div className="truncate text-[10px] uppercase tracking-[0.12em] text-forest-200/60">
              {user?.role === 'admin' ? 'Range officer' : 'Forest guard'}
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg p-2 text-forest-200/60 transition hover:bg-white/10 hover:text-white"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const { user } = useAuth()
  const title = TITLES[location.pathname] || 'Forest Guard AI'

  const notifications = useApi('/api/reports/notifications', { interval: 6000 })
  const latestAlert = notifications.data?.latest_alert
  const unread = notifications.data?.unread ?? 0
  const initialAlert = useRef(undefined)
  if (notifications.data && initialAlert.current === undefined) initialAlert.current = latestAlert?.id ?? 0
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-sand">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] bg-forest-950 bg-topo lg:block">
        <SidebarContent unread={unread} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-forest-950/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-[264px] bg-forest-950 bg-topo shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-2 text-white/60 hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent unread={unread} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 border-b border-line-5/80 bg-sand/85 backdrop-blur-xl">
          <div className="flex h-[62px] items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-lg border border-control-line-3 p-2 text-success-9 lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div>
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-muted-16">
                  Forest Guard AI / Operations
                </div>
                <div className="font-display text-[15px] font-medium leading-tight text-ink">{title}</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div aria-live="polite" className="flex flex-wrap gap-2 text-xs">
                {unread > 0 && <NavLink to="/reports" className="btn">{unread} unread reports</NavLink>}
                {latestAlert?.id > initialAlert.current && <NavLink to={latestAlert.incident_id ? `/alerts?incident=${latestAlert.incident_id}` : '/risk'} className="btn" title={latestAlert.summary}>New field alert #{latestAlert.id}</NavLink>}
              </div>
              <LanguageSwitcher />
              <ThemeToggle />
              <div className="hidden text-right sm:block">
                <div className="text-[10.5px] font-medium text-secondary-9">{today}</div>
                <div className="text-[9.5px] uppercase tracking-[0.12em] text-muted-16">Seoni · Madhya Pradesh</div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-control-line-1 bg-forest-900 text-[11px] font-semibold text-lime">
                {(user?.name || 'FG')
                  .split(' ')
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join('')}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>

        <footer className="mx-auto flex max-w-[1500px] flex-col gap-2 border-t border-line-5 px-4 py-5 text-[10.5px] text-muted-12 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>Forest Guard AI · Protecting Forests. Preventing Conflict. Saving Lives.</span>
          <span>Conservation Intelligence & Human–Wildlife Coexistence</span>
        </footer>
      </div>
    </div>
  )
}
