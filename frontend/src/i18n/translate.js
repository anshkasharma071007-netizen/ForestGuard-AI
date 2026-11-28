import { hi } from './translations.js'
import { operationsHi } from './operations-hi.js'

const hindi = { ...hi, ...operationsHi }

export function translator(lang) {
  return (key, values) => {
    if (!key) return key
    const text = lang === 'hi' && Object.hasOwn(hindi, key) ? hindi[key] : key
    return values ? text.replace(/\{(\w+)\}/g, (token, name) => Object.hasOwn(values, name) ? String(values[name]) : token) : text
  }
}

const terms = {
  species: {
    tiger: 'Bengal tiger', leopard: 'Indian leopard', elephant: 'Asian elephant', sloth_bear: 'Sloth bear',
    wild_boar: 'Wild boar', deer: 'Chital (spotted deer)', unidentified: 'Unknown animal',
    other: 'Other animal', monkey: 'Monkey', snake: 'Snake',
  },
  risk: { low: 'Low', moderate: 'Moderate', high: 'High', critical: 'Critical' },
  severity: { low: 'Low risk', moderate: 'Moderate risk', high: 'High risk', critical: 'Critical risk' },
  report: { pending: 'Pending', forwarded: 'Forwarded', verified: 'Verified', under_work: 'Under Work', rejected: 'Rejected', resolved: 'Resolved', closed: 'Closed' },
  alert: { active: 'Active', acknowledged: 'Acknowledged', responding: 'Responding', resolved: 'Resolved', dismissed: 'Dismissed', open: 'Open', closed: 'Closed', verified: 'Verified' },
  category: { sighting: 'Sighting', conflict: 'Conflict', livestock_depredation: 'Livestock depredation', crop_damage: 'Crop damage',
    property_damage: 'Property damage', human_injury: 'Human injury', human_fatality: 'Human fatality' },
  role: { admin: 'Central administrator', range_officer: 'Range officer', guard: 'Forest guard', central_admin: 'Central administrator' },
  analysis: { no_photo: 'No photo', queued: 'Queued', processing: 'Processing', completed: 'Completed', unavailable: 'Unavailable', failed: 'Failed' },
  notification: { report: 'New report', alert: 'New alert', submitted: 'Report submitted',
    approved: 'Report approved', rejected: 'Report rejected', resolved: 'Incident resolved' },
  direction: { toward_village: 'Toward village', away_from_village: 'Away from village', parallel_or_unclear: 'Parallel / unclear', unknown: 'Unknown' },
}

const guidance = 'Follow forest-department safety guidance and avoid travelling on forest roads after dusk.'
const errorPatterns = [
  [/^File exceeds the (\d+) MB upload limit\.$/, 'File exceeds the {size} MB upload limit.', 'size'],
  [/^Photo exceeds the (\d+) MB limit\.$/, 'Photo exceeds the {size} MB limit.', 'size'],
  [/^String should have at least (\d+) characters$/, 'String should have at least {count} characters', 'count'],
  [/^String should have at most (\d+) characters$/, 'String should have at most {count} characters', 'count'],
]

export function languageTools(lang) {
  const t = translator(lang)
  function term(group, value, fallback) {
    const table = terms[group]
    return t(fallback ?? (table && Object.hasOwn(table, value) ? table[value] : String(value ?? '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())))
  }
  function errorText(message) {
    if (!message || lang === 'en') return message
    const clean = typeof message === 'string' ? message.replace(/^Value error, /, '') : ''
    if (Object.hasOwn(hindi, clean)) return t(clean)
    for (const [pattern, key, field] of errorPatterns) {
      const result = clean.match(pattern)
      if (result) return t(key, { [field]: result[1] })
    }
    return t('Request failed. Check your connection or try again.')
  }
  function riskDetail(detail) {
    if (lang === 'en' || !detail) return detail
    const formats = [
      [/^([\d.]+) km$/, '{distance} km', 'distance'],
      [/^([\d.]+) days ago$/, '{count} days ago', 'count'],
      [/^(\d+) detections \/ 7 days$/, '{count} detections / 7 days', 'count'],
      [/^(\d+) incidents \/ 30 days$/, '{count} incidents / 30 days', 'count'],
    ]
    for (const [pattern, key, field] of formats) {
      const match = detail.match(pattern)
      if (match) return t(key, { [field]: match[1] })
    }
    return t(detail)
  }
  function alertReason(reason) {
    if (lang === 'en' || !reason) return reason
    const match = /^(.+?) detection (.+?) from (.+?) boundary\. Open the detection record for the full, explainable risk breakdown\.$/.exec(reason)
    if (!match || !Object.hasOwn(hindi, match[1])) return reason
    return t('{species} detection {distance} from {village} boundary. Open the detection record for the full, explainable risk breakdown.', {
      species: t(match[1]), distance: riskDetail(match[2]), village: match[3],
    })
  }
  function advisorySummary(summary) {
    if (lang === 'en' || !summary) return summary
    const match = /^(High-priority|Precautionary) advisory: (.+?) activity reported near (.+?)\. (.+)$/.exec(summary)
    if (!match || !Object.hasOwn(hindi, match[2]) || !match[4].startsWith(guidance)) return summary
    const place = ['the approximate location shown', 'a buffer-zone settlement'].includes(match[3]) ? t(match[3]) : match[3]
    return [
      t(match[1] + ' advisory: {animal} activity reported near {place}.', { animal: t(match[2]), place }),
      t(guidance),
      t(match[4].slice(guidance.length).trim()),
    ].filter(Boolean).join(' ')
  }
  return { t, term, errorText, advisorySummary, alertReason, riskDetail }
}
