export const SPECIES_COLOR = {
  tiger: '#B8501F',
  leopard: '#A5731C',
  elephant: '#4A6478',
  deer: '#3E8B54',
  wild_boar: '#7A3B24',
  sloth_bear: '#4A4A52',
  unidentified: '#6B7A6E',
}

export const RISK_COLOR = {
  low: '#2A7048',
  moderate: '#C68A1E',
  high: '#B3362A',
}

export const RISK_SOFT = {
  low: '#E6F2E4',
  moderate: '#FAEECB',
  high: '#F8E2DB',
}

export function formatDate(value, opts = {}, lang = 'en') {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...opts,
  })
}

export function formatDateTime(value, lang = 'en') {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: '2-digit',
    month: 'short',
  })} · ${date.toLocaleTimeString(lang === 'hi' ? 'hi-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit', ...(lang === 'hi' ? { hourCycle: 'h23' } : {}) })}`
}

export function timeAgo(value, lang = 'en') {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const seconds = Math.max(1, (Date.now() - date.getTime()) / 1000)
  if (lang === 'hi') {
    if (seconds < 90) return 'अभी'
    const relative = new Intl.RelativeTimeFormat('hi-IN')
    if (seconds < 3600) return relative.format(-Math.round(seconds / 60), 'minute')
    if (seconds < 86400) return relative.format(-Math.round(seconds / 3600), 'hour')
    if (seconds < 2592000) return relative.format(-Math.round(seconds / 86400), 'day')
    return formatDate(value, {}, lang)
  }
  if (seconds < 90) return 'just now'
  const minutes = seconds / 60
  if (minutes < 60) return `${Math.round(minutes)} min ago`
  const hours = minutes / 60
  if (hours < 24) return `${Math.round(hours)} h ago`
  const days = hours / 24
  if (days < 30) return `${Math.round(days)} d ago`
  return formatDate(value)
}

export function titleCase(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function compactNumber(value, lang = 'en') {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export function confidencePercent(value) {
  if (value === null || value === undefined) return '—'
  return `${Math.round(value * 100)}%`
}

export function speciesImage(key) {
  const map = {
    tiger: '/images/tiger.webp',
    leopard: '/images/leopard.webp',
    elephant: '/images/elephant.webp',
    deer: '/images/deer.webp',
    wild_boar: '/images/boar.webp',
    sloth_bear: '/images/bear.webp',
    unidentified: '/images/forest.webp',
  }
  return map[key] || '/images/forest.webp'
}

export function statusTone(status) {
  switch (status) {
    case 'active':
    case 'high':
    case 'open':
      return 'danger'
    case 'acknowledged':
    case 'responding':
    case 'verified':
    case 'moderate':
      return 'warning'
    case 'resolved':
    case 'closed':
    case 'dismissed':
    case 'low':
      return 'success'
    default:
      return 'neutral'
  }
}

export function directionLabel(direction) {
  return {
    toward_village: 'Toward village',
    away_from_village: 'Away from village',
    parallel_or_unclear: 'Parallel / unclear',
    unknown: 'Unknown',
  }[direction] || titleCase(direction)
}

export function csvFilename(response, fallback) {
  const header = response.headers?.['content-disposition'] || ''
  const match = header.match(/filename="?([^"]+)"?/)
  return match?.[1] || fallback
}
