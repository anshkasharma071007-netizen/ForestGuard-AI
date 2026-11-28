import { useLanguage } from '../i18n'
import { useEffect } from 'react'
import { AlertTriangle, Info, Leaf, Loader2, Octagon, ShieldAlert, Triangle, X } from 'lucide-react'
import { RISK_COLOR, statusTone } from '../utils/format'

export function BrandMark({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 36 36" className={className} fill="none" aria-hidden="true">
      <path
        d="M14 13.5C13.4 9.8 11.6 7.4 8.6 5.6M12 9.4C9.8 8.2 7.6 8.2 5.6 9.2M22 13.5C22.6 9.8 24.4 7.4 27.4 5.6M24 9.4C26.2 8.2 28.4 8.2 30.4 9.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M13.4 12.6c-1.9-1.2-4.2-1.2-5.6.2 1 1.7 3.1 2.4 4.9 2.1zM22.6 12.6c1.9-1.2 4.2-1.2 5.6.2-1 1.7-3.1 2.4-4.9 2.1z"
        fill="currentColor"
      />
      <path
        d="M12.6 15.1c0-2.5 2.4-4.5 5.4-4.5s5.4 2 5.4 4.5c0 5.4-2.7 9.7-5.4 9.7s-5.4-4.3-5.4-9.7z"
        fill="currentColor"
      />
      <circle cx="15.4" cy="16.2" r=".95" fill="#0B2B1D" />
      <circle cx="20.6" cy="16.2" r=".95" fill="#0B2B1D" />
      <path
        d="M18 20.6c-1.5 0-2.5 1-2.5 2.1 0 1.2 1.1 2 2.5 2s2.5-.8 2.5-2c0-1.1-1-2.1-2.5-2.1z"
        fill="#0B2B1D"
        opacity=".55"
      />
    </svg>
  )
}

export function Logo({ compact = false, light = false }) {
  const { t } = useLanguage()
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${
          light
            ? 'bg-lime text-forest-950 ring-white/25 shadow-[0_10px_26px_-12px_rgba(207,232,163,0.75)]'
            : 'bg-forest-900 text-lime ring-forest-700/60 shadow-[0_10px_26px_-12px_rgba(11,43,29,0.85)]'
        }`}
      >
        <BrandMark className="h-6 w-6" />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span
            className={`block font-display text-[20px] font-semibold tracking-tight ${
              light ? 'text-brand-light' : 'text-ink'
            }`}
          >
            Van <span className={light ? 'text-lime' : 'text-moss'}>Saathi</span>
          </span>
          <span
            className={`mt-0.5 block text-[10.5px] font-medium uppercase tracking-[0.2em] ${
              light ? 'text-forest-200/80' : 'text-muted-7'
            }`}
          >
            {t('Conservation intelligence')}
          </span>
        </span>
      )}
    </div>
  )
}

const TONES = {
  success: 'border-success-line-1 bg-success-surface-2 text-success-1',
  warning: 'border-warning-line-1 bg-warning-surface-1 text-warning-3',
  danger: 'border-danger-line-1 bg-danger-surface-1 text-danger-2',
  neutral: 'border-control-line-6 bg-inset-8 text-secondary-7',
  forest: 'border-success-line-1 bg-success-surface-2 text-success-1',
  dark: 'border-forest-700 bg-forest-800 text-forest-100',
}

export function Badge({ children, tone = 'neutral', dot = false, className = '' }) {
  return (
    <span className={`chip ${TONES[tone] || TONES.neutral} ${className}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export const SEVERITY_ICON = { low: Leaf, moderate: Triangle, high: Octagon }

export function SeverityIcon({ level, className = 'h-3 w-3' }) {
  const Icon = SEVERITY_ICON[level] || Leaf
  return <Icon className={className} strokeWidth={2.4} aria-hidden="true" />
}

export function RiskBadge({ level, score, className = '' }) {
  const { term } = useLanguage()
  const tone = statusTone(level)
  return (
    <span className={`chip ${TONES[tone]} ${className}`} style={{ color: RISK_COLOR[level] || RISK_COLOR.low }}>
      <SeverityIcon level={level} />
      <span className="text-ink">{term('risk', level)}</span>
      {score !== undefined && score !== null && (
        <span className="font-mono text-[11px] text-muted-2">{score}</span>
      )}
    </span>
  )
}

export function StatusBadge({ status, domain = 'report' }) {
  const { term } = useLanguage()
  return (
    <Badge tone={statusTone(status)} dot>
      {term(domain, status)}
    </Badge>
  )
}

export function SpeciesTag({ species, name, color, className = '' }) {
  const { term } = useLanguage()
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-line-6 bg-raised/80 px-2.5 py-1 text-[11px] font-semibold text-secondary-1 ${className}`}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: color || '#64748B' }} />
      {term('species', species, name)}
    </span>
  )
}

export function PageHeader({ eyebrow, title, description, actions, children }) {
  return (
    <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="font-display text-[30px] leading-[1.1] tracking-[-0.02em] text-ink">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-secondary-11">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionTitle({ title, subtitle, action, className = '' }) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <div>
        <h2 className="font-display text-[19px] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-muted-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'forest', mono = false, className = '' }) {
  const iconTone = {
    forest: 'bg-success-surface-5 text-success-7',
    lime: 'bg-success-surface-4 text-success-3',
    clay: 'bg-danger-surface-2 text-danger-5',
    amber: 'bg-warning-surface-2 text-warning-5',
    slate: 'bg-inset-6 text-secondary-6',
  }[tone]
  return (
    <div className={`card relative overflow-hidden p-5 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-2">{label}</div>
        {Icon && (
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconTone}`}>
            <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} />
          </div>
        )}
      </div>
      <div
        className={`mt-3 text-[32px] leading-none tracking-tight text-ink ${
          mono ? 'font-mono text-[27px]' : 'font-display'
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-2 text-[11.5px] leading-snug text-muted-4">{hint}</div>}
    </div>
  )
}

export function DemoNotice({ compact = false, children }) {
  const { t } = useLanguage()
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border border-control-line-2 bg-inset-10 text-warning-1 ${
        compact ? 'px-3 py-2 text-[10.5px]' : 'px-3.5 py-2.5 text-[11.5px]'
      }`}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="leading-relaxed">
        {children || (
          <>
            <strong className="font-semibold">{t('Demonstration dataset.')}</strong> {t('All detections, alerts and incidents are synthetic and clearly labelled. Images are AI-processed reference evidence, not live camera-trap feeds.')}
          </>
        )}
      </div>
    </div>
  )
}

export function Loading({ label = 'Loading intelligence…', height = 'h-64' }) {
  const { t } = useLanguage()
  return (
    <div className={`flex ${height} flex-col items-center justify-center gap-3 rounded-2xl border border-line-7 bg-parchment`}>
      <Loader2 className="h-5 w-5 animate-spin text-success-5" />
      <div className="text-[12px] font-medium text-muted-3">{t(label)}</div>
    </div>
  )
}

export function SkeletonRows({ rows = 5 }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="shimmer h-11 rounded-lg" />
      ))}
    </div>
  )
}

export function ErrorBox({ message, onRetry }) {
  const { t, errorText } = useLanguage()
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-danger-line-1 bg-danger-surface-3 p-4">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-5" />
      <div className="flex-1">
        <div className="text-[12.5px] font-semibold text-danger-1">{t('Could not load this view')}</div>
        <div className="mt-0.5 text-[11.5px] leading-relaxed text-danger-3">{errorText(message)}</div>
      </div>
      {onRetry && (
        <button type="button" className="btn-outline !px-3 !py-1.5 !text-[11px]" onClick={onRetry}>
          {t('Retry')}
        </button>
      )}
    </div>
  )
}

export function EmptyState({ icon: Icon = ShieldAlert, title, description, action }) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-control-line-3 bg-parchment/70 px-6 py-12 text-center">
      <div className="paw-field pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
      <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-success-surface-5 text-success-4 ring-1 ring-inset ring-success-line-3">
        <Icon className="h-5 w-5" />
      </div>
      <div className="relative mt-3 font-display text-[18px] text-ink">{title}</div>
      {description && <div className="relative mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-2">{description}</div>}
      {action && <div className="relative mt-4">{action}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, subtitle, children, footer, width = 'max-w-2xl' }) {
  const { t } = useLanguage()
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => event.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-forest-950/55 backdrop-blur-sm" onClick={onClose} />
      <div className={`fade-in relative max-h-[90vh] w-full ${width} overflow-hidden rounded-2xl border border-line-7 bg-parchment shadow-lift`}>
        <div className="flex items-start justify-between gap-4 border-b border-line-10 px-5 py-4">
          <div>
            <div className="font-display text-[20px] leading-tight text-ink">{title}</div>
            {subtitle && <div className="mt-0.5 text-[11.5px] text-muted-3">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-3 transition hover:bg-hover-1 hover:text-ink"
            aria-label={t('Close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(90vh-8rem)] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line-10 bg-inset-13 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function MetricBar({ label, value, max = 100, color = '#1F5C3A', suffix = '' }) {
  const width = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-medium text-secondary-4">{label}</span>
        <span className="font-mono text-[10.5px] text-muted-3">
          {value}
          {suffix}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line-3">
        <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  )
}

const SOFT_RISK_TONES = {
  low: 'bg-soft-risk-low text-soft-risk-low-ink',
  moderate: 'bg-soft-risk-moderate text-soft-risk-moderate-ink',
  high: 'bg-soft-risk-high text-soft-risk-high-ink',
}

export function SoftRisk({ level }) {
  const { term } = useLanguage()
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-semibold ${SOFT_RISK_TONES[level] || SOFT_RISK_TONES.low}`}
    >
      <SeverityIcon level={level} className="h-3 w-3" />
      {term('risk', level)}
    </span>
  )
}
