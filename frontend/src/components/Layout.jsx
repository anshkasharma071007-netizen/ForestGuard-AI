import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3,
  ChevronRight,
  Globe2,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  PawPrint,
  Radio,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Logo } from './ui'

const SECTIONS = [
  {
    label: 'Command',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/monitoring', label: 'Live Monitoring', icon: Radio },
      { to: '/map', label: 'GIS Intelligence Map', icon: Map },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/wildlife', label: 'Wildlife Intelligence', icon: PawPrint },
      { to: '/risk', label: 'Risk & Alerts', icon: ShieldAlert },
      { to: '/guard', label: 'Forest Guard Panel', icon: Users },
    ],
  },
  {
    label: 'Insight',
    items: [{ to: '/analytics', label: 'Analytics & Reports', icon: BarChart3 }],
  },
]

const TITLES = {
  '/': 'Operations overview',
  '/monitoring': 'Live monitoring',
  '/map': 'GIS intelligence',
  '/wildlife': 'Wildlife intelligence',
  '/risk': 'Risk & alerts',
  '/guard': 'Forest guard panel',
  '/analytics': 'Analytics & reports',
}

function SidebarContent({ onNavigate }) {
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
            Demo landscape · Pench
          </div>
        </div>
      </div>

      <nav className="sidebar-scroll flex-1 space-y-5 overflow-y-auto px-3">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="px-3 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.24em] text-forest-300/60">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[12.5px] font-medium transition-all ${
                      isActive
                        ? 'bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                        : 'text-forest-100/65 hover:bg-white/[0.05] hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-lime transition-opacity ${
                          isActive ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      <item.icon
                        className={`h-[17px] w-[17px] transition-colors ${
                          isActive ? 'text-lime' : 'text-forest-200/60 group-hover:text-forest-100'
                        }`}
                        strokeWidth={1.8}
                      />
                      <span className="flex-1">{item.label}</span>
                      {isActive && <ChevronRight className="h-3.5 w-3.5 text-forest-200/60" />}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}

        <div className="rounded-xl border border-white/10 bg-gradient-to-br from-forest-800 to-forest-900 p-3.5">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-lime/90">
            <Globe2 className="h-3.5 w-3.5" /> Community
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-forest-100/60">
            Public safety advisories and sighting reports for buffer-zone villages.
          </p>
          <a
            href="/community"
            onClick={onNavigate}
            className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-lime hover:underline"
          >
            Open village portal <ChevronRight className="h-3 w-3" />
          </a>
        </div>
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
        <div className="px-2 pb-1 text-[9px] leading-relaxed text-forest-300/40">
          Illustrative boundaries · Synthetic observations
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

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-sand">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] bg-forest-950 bg-topo lg:block">
        <SidebarContent />
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
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 border-b border-[#e2ddce]/80 bg-sand/85 backdrop-blur-xl">
          <div className="flex h-[62px] items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-lg border border-[#dcd6c7] p-2 text-forest-800 lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div>
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-[#9a998e]">
                  Forest Guard AI / Operations
                </div>
                <div className="font-display text-[15px] font-medium leading-tight text-ink">{title}</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="hidden items-center gap-2 rounded-full border border-[#ddd6c6] bg-parchment/70 px-3 py-1.5 md:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-amber" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#7c7461]">
                  Demo data
                </span>
              </div>
              <div className="hidden text-right sm:block">
                <div className="text-[10.5px] font-medium text-[#606a60]">{today}</div>
                <div className="text-[9.5px] uppercase tracking-[0.12em] text-[#9a998e]">Seoni · Madhya Pradesh</div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8d2c2] bg-forest-900 text-[11px] font-semibold text-lime">
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

        <footer className="mx-auto flex max-w-[1500px] flex-col gap-2 border-t border-[#e2ddce] px-4 py-5 text-[10.5px] text-[#8f938a] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>Forest Guard AI · Protecting Forests. Preventing Conflict. Saving Lives.</span>
          <span>Demonstration prototype · synthetic observations · illustrative geography</span>
        </footer>
      </div>
    </div>
  )
}
