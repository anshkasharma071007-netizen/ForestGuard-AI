import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell, ClipboardList, LayoutDashboard, Map, Menu, Settings, UserRound, X,
} from 'lucide-react'
import api, { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../hooks/useApi'
import { formatDateTime } from '../utils/format'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeToggle from './ThemeToggle'
import { Logo } from './ui'
import './operations.css'

const SECTIONS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/reports', label: 'Reports', icon: ClipboardList },
  { to: '/map', label: 'Map', icon: Map },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function refreshAuthorityNotifications() {
  window.dispatchEvent(new Event('fg-notifications-changed'))
}

function AuthorityNavigation({ close }) {
  return <nav aria-label="Authority navigation" className="operations-nav">
    {SECTIONS.map(({ to, label, icon: Icon, end }) => (
      <NavLink key={to} to={to} end={end} onClick={close}><Icon size={17} aria-hidden="true" />{label}</NavLink>
    ))}
  </nav>
}

function Notifications({ data, loading, error, reload }) {
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const container = useRef(null)
  const trigger = useRef(null)
  const request = useRef(null)
  const location = useLocation()
  const navigate = useNavigate()
  const count = data ? data.unread + data.unread_alerts : 0

  useEffect(() => {
    setOpen(false)
    setFailure('')
    return () => request.current?.abort()
  }, [location.key])

  useEffect(() => {
    if (!open) return undefined
    function outside(event) {
      if (!container.current?.contains(event.target)) setOpen(false)
    }
    function escape(event) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  async function openItem(item) {
    if (request.current) return
    if (item.kind === 'report') {
      navigate(`/reports?report=${item.id}`)
      return
    }
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setFailure('')
    try {
      await api.post(`/api/alerts/${item.id}/read`, null, { signal: controller.signal })
      if (controller.signal.aborted) return
      navigate(item.incident_id ? `/alerts?incident=${item.incident_id}` : `/risk?alert=${item.id}`)
      await reload()
    } catch (err) {
      if (!controller.signal.aborted) setFailure(errorMessage(err))
    } finally {
      request.current = null
      setBusy(false)
    }
  }

  return <div className="relative" ref={container}>
    <button ref={trigger} type="button" className="operations-control" aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
      title="Notifications" aria-expanded={open} aria-controls={open ? 'authority-notifications' : undefined}
      onClick={() => { setOpen(!open); if (!open) reload() }}>
      <Bell size={18} aria-hidden="true" />
      {count > 0 && <span className="operations-notification-dot" />}
    </button>
    {open && <section id="authority-notifications" aria-label="Notifications" className="operations-popover">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 className="font-semibold">Notifications</h2>
        {data && <span className="text-xs text-muted-3">{count} unread</span>}
      </div>
      {(failure || error) && <p role="alert" className="px-4 pb-2 text-sm text-danger-7">{failure || error}</p>}
      {loading && !data && <p role="status" className="px-4 pb-3 text-sm text-muted-3">Loading…</p>}
      {data && !data.items.length && <p className="px-4 pb-3 text-sm text-muted-3">No unread notifications</p>}
      <ul className="max-h-[60vh] overflow-auto">
        {data?.items.map(item => <li key={`${item.kind}-${item.id}`}>
          <button className="operations-notification-row" type="button" disabled={busy} onClick={() => void openItem(item)}>
            <span className="block break-words font-semibold">{item.title}</span>
            <span className="block text-xs text-muted-3">{item.kind === 'report' ? 'New report' : 'New alert'} · {formatDateTime(item.created_at)}</span>
          </button>
        </li>)}
      </ul>
    </section>}
  </div>
}

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user } = useAuth()
  const notifications = useApi('/api/reports/notifications', { interval: 6000, deps: [user?.id] })
  const { reload } = notifications
  useEffect(() => {
    window.addEventListener('fg-notifications-changed', reload)
    return () => window.removeEventListener('fg-notifications-changed', reload)
  }, [reload])

  const unread = notifications.data?.unread
  return <div className="min-h-screen bg-sand">
    <header className="operations-header">
      <div className="operations-shell operations-header-content">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" className="operations-control operations-mobile-trigger" aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
          <NavLink to="/" className="operations-brand" onClick={() => setMobileOpen(false)}>
            <Logo compact />
            <span>Forest Guard AI</span>
          </NavLink>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <NavLink to="/reports?unread=1" className="operations-control" title="Unread reports"
            aria-label={unread == null ? 'Unread reports' : `Unread reports, ${unread}`}>
            <ClipboardList size={18} aria-hidden="true" />
            {unread != null && <span className="text-xs tabular-nums">{unread}</span>}
          </NavLink>
          <Notifications {...notifications} />
          <span className="hidden xl:inline-flex"><LanguageSwitcher /></span>
          <ThemeToggle />
          <NavLink to="/settings" title={user?.name || 'Authority account'} aria-label="Authority account" className="operations-control">
            <UserRound size={18} aria-hidden="true" />
          </NavLink>
        </div>
      </div>
    </header>
    <div className="operations-shell operations-body">
      <aside className={mobileOpen ? 'operations-sidebar is-open' : 'operations-sidebar'}>
        <AuthorityNavigation close={() => setMobileOpen(false)} />
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  </div>
}
