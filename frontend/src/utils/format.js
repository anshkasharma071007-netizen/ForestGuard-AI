export const SPECIES_COLOR = {
  tiger: '#C2410C',
  leopard: '#B45309',
  elephant: '#475569',
  deer: '#15803D',
  wild_boar: '#7C2D12',
  sloth_bear: '#3F3F46',
  unidentified: '#64748B',
}

export const RISK_COLOR = {
  low: '#2F7250',
  moderate: '#D9A441',
  high: '#B83B2B',
}

export const RISK_SOFT = {
  low: '#E4F0E7',
  moderate: '#F8EDCF',
  high: '#F6DFD8',
}

export function formatDate(value, opts = {}) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...opts,
  })
}

export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  })} · ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
}

export function timeAgo(value) {
  if (!value) return '—'
  const date = new Date(value)
  const seconds = Math.max(1, (Date.now() - date.getTime()) / 1000)
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

export function compactNumber(value) {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
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
