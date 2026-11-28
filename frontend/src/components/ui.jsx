import { useLanguage } from '../i18n'
import { useEffect } from 'react'
import { AlertTriangle, Info, Loader2, ShieldAlert, X } from 'lucide-react'
import { RISK_COLOR, statusTone } from '../utils/format'

export function Logo({ compact = false, light = false }) {
  const { t } = useLanguage()
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime text-forest-950 shadow-[0_8px_24px_-10px_rgba(196,232,122,0.9)]">
        <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" aria-hidden="true">
          <path
            d="M16 4c4.5 3.6 8 8 8 13a8 8 0 0 1-16 0c0-5 3.5-9.4 8-13z"
            fill="currentColor"
            opacity="0.95"
          />
          <path d="M16 9.5v14M16 14.5l-4-3.5M16 18l4-3.5" stroke="#0C2418" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      {!compact && (
        <div className="leading-tight">
          <div
            className={`font-display text-[19px] font-semibold tracking-tight ${
              light ? 'text-brand-light' : 'text-ink'
            }`}
          >
            Forest Guard <span className="text-moss">AI</span>
          </div>
          <div
            className={`mt-0.5 text-[9px] font-medium uppercase tracking-[0.2em] ${
              light ? 'text-forest-200/80' : 'text-muted-7'
            }`}
          >
            {t('Conservation intelligence')}
          </div>
        </div>
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

export function RiskBadge({ level, score, className = '' }) {
  const { term } = useLanguage()
  const tone = statusTone(level)
  return (
    <span className={`chip ${TONES[tone]} ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: RISK_COLOR[level] || RISK_COLOR.low }} />
      <span>{term('risk', level)}</span>
      {score !== undefined && score !== null && (
        <span className="font-mono text-[10px] opacity-75">{score}</span>
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
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-3">{label}</div>
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-control-line-1 bg-parchment/60 px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success-surface-5 text-success-5">
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-3 font-display text-[17px] text-ink">{title}</div>
      {description && <div className="mt-1 max-w-md text-[12px] leading-relaxed text-muted-3">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
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

export function MetricBar({ label, value, max = 100, color = '#2F7250', suffix = '' }) {
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
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${SOFT_RISK_TONES[level] || SOFT_RISK_TONES.low}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {term('risk', level)}
    </span>
  )
}
