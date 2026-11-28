import { useLanguage } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3, Bell, ClipboardList, LayoutDashboard, Map, Menu, PawPrint, Radio, Settings, Shield, UserRound, X,
} from 'lucide-react'
import api, { errorMessage } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../hooks/useApi'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeToggle from './ThemeToggle'
import { Logo } from './ui'
import './operations.css'

const SECTIONS = [
  ['Operations', [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/reports', label: 'Reports', icon: ClipboardList },
    { to: '/map', label: 'Map', icon: Map },
    { to: '/alerts', label: 'Alerts', icon: Bell },
  ]],
  ['Intelligence', [
    { to: '/monitoring', label: 'Live Monitoring', icon: Radio },
    { to: '/wildlife', label: 'Wildlife Intelligence', icon: PawPrint },
    { to: '/analytics', label: 'Analytics & Reports', icon: BarChart3 },
  ]],
  ['Administration', [
    { to: '/guard', label: 'Forest Guard Panel', icon: Shield },
    { to: '/settings', label: 'Settings', icon: Settings },
  ]],
]

export function refreshAuthorityNotifications() {
  window.dispatchEvent(new Event('fg-notifications-changed'))
}

function AuthorityNavigation({ close }) {
  const { t } = useLanguage()
  return <nav aria-label={t('Authority navigation')} className="operations-nav">
    {SECTIONS.map(([group, items]) => <div key={group} className="operations-nav-group">
      <div className="operations-nav-label">{t(group)}</div>
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={close}><Icon size={17} aria-hidden="true" />{t(label)}</NavLink>
      ))}
    </div>)}
  </nav>
}

function Notifications({ data, loading, error, reload }) {
  const { t, dateTime, errorText } = useLanguage()
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
    <button ref={trigger} type="button" className="operations-control" aria-label={count ? t('Notifications, {count} unread', { count }) : t('Notifications')}
      title={t('Notifications')} aria-expanded={open} aria-controls={open ? 'authority-notifications' : undefined}
      onClick={() => { setOpen(!open); if (!open) reload() }}>
      <Bell size={18} aria-hidden="true" />
      {count > 0 && <span className="operations-notification-dot" />}
    </button>
    {open && <section id="authority-notifications" aria-label={t('Notifications')} className="operations-popover">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 className="font-semibold">{t('Notifications')}</h2>
        {data && <span className="text-xs text-muted-3">{t('{count} unread', { count })}</span>}
      </div>
      {(failure || error) && <p role="alert" className="px-4 pb-2 text-sm text-danger-7">{errorText(failure || error)}</p>}
      {loading && !data && <p role="status" className="px-4 pb-3 text-sm text-muted-3">{t('Loading…')}</p>}
      {data && !data.items.length && <p className="px-4 pb-3 text-sm text-muted-3">{t('No unread notifications')}</p>}
      <ul className="max-h-[60vh] overflow-auto">
        {data?.items.map(item => <li key={`${item.kind}-${item.id}`}>
          <button className="operations-notification-row" type="button" disabled={busy} onClick={() => void openItem(item)}>
            <span className="block break-words font-semibold">{item.kind === 'alert' ? t(item.title) : item.title}</span>
            <span className="block text-xs text-muted-3">{item.kind === 'report' ? t('New report') : t('New alert')} · {dateTime(item.created_at)}</span>
          </button>
        </li>)}
      </ul>
    </section>}
  </div>
}

export default function Layout({ children }) {
  const { t } = useLanguage()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user } = useAuth()
  const notifications = useApi('/api/reports/notifications', { interval: 6000, deps: [user?.id] })
  const { reload } = notifications
  useEffect(() => {
    window.addEventListener('fg-notifications-changed', reload)
    return () => window.removeEventListener('fg-notifications-changed', reload)
  }, [reload])

  const coverage = user?.role === 'admin' ? t('Central administration')
    : user?.jurisdictions?.map(item => item.name).join(', ') || t('No jurisdiction assigned')
  const unread = notifications.data?.unread
  return <div className="min-h-screen bg-sand">
    <header className="operations-header">
      <div className="operations-shell operations-header-content">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" className="operations-control operations-mobile-trigger" aria-label={mobileOpen ? t('Close navigation') : t('Open navigation')}
            aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
          <NavLink to="/" className="operations-brand" onClick={() => setMobileOpen(false)} aria-label="Van Saathi">
            <Logo />
          </NavLink>
        </div>
        <div className="operations-header-controls flex shrink-0 items-center gap-1 sm:gap-2">
          <NavLink to="/reports?unread=1" className="operations-control" title={t('Unread reports')}
            aria-label={unread == null ? t('Unread reports') : t('Unread reports, {count}', { count: unread })}>
            <ClipboardList size={18} aria-hidden="true" />
            {unread != null && <span className="text-xs tabular-nums">{unread}</span>}
          </NavLink>
          <Notifications {...notifications} />
          <LanguageSwitcher />
          <ThemeToggle />
          <NavLink to="/settings" title={[user?.name, coverage].filter(Boolean).join(' · ')} aria-label={t('Authority account')} className="operations-control">
            <span className="hidden max-w-44 truncate text-xs lg:inline" aria-hidden="true">{user?.name} · {coverage}</span>
            <UserRound size={18} aria-hidden="true" />
          </NavLink>
        </div>
      </div>
    </header>
    <div className="operations-shell operations-body">
      <aside className={mobileOpen ? 'operations-sidebar is-open' : 'operations-sidebar'}>
        <p className="operations-coverage" title={coverage}><Map size={16} aria-hidden="true" />{coverage}</p>
        <AuthorityNavigation close={() => setMobileOpen(false)} />
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  </div>
}
