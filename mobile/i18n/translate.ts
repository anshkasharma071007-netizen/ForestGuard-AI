import { hi } from './hi';

export type Language = 'en' | 'hi';
export type Translate = (key: string, values?: Record<string, string | number>) => string;

export function translator(language: Language): Translate {
  return (key, values) => {
    const message = language === 'hi' && Object.hasOwn(hi, key) ? hi[key] : key;
    return values ? message.replace(/\{(\w+)\}/g, (token, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : token) : message;
  };
}

const species: Readonly<Record<string, string>> = {
  tiger: 'Bengal tiger', leopard: 'Indian leopard', elephant: 'Asian elephant',
  sloth_bear: 'Sloth bear', wild_boar: 'Wild boar', deer: 'Chital (spotted deer)',
  unidentified: 'Unknown', other: 'Other', monkey: 'Monkey', snake: 'Snake',
};
const risk: Readonly<Record<string, string>> = {
  low: 'Low risk', moderate: 'Moderate risk', high: 'High risk', critical: 'Critical risk',
};
const category: Readonly<Record<string, string>> = { sighting: 'Sighting', conflict: 'Conflict' };
const event: Readonly<Record<string, string>> = {
  submitted: 'Report submitted', approved: 'Report approved', rejected: 'Report rejected',
  resolved: 'Incident resolved', verified: 'Report approved',
};
const alertStatus: Readonly<Record<string, string>> = {
  active: 'Active', acknowledged: 'Acknowledged', responding: 'Response underway', resolved: 'Resolved',
};

const terms = { species, risk, category, event, alertStatus };
export type Term = keyof typeof terms;

function lookup(table: Readonly<Record<string, string>>, value: string): string | undefined {
  return Object.hasOwn(table, value) ? table[value] : undefined;
}

export function termLabel(t: Translate, group: Term, value: string, fallback?: string) {
  return t(lookup(terms[group], value) ?? fallback ?? value);
}

export function localizedAdvisoryTitle(t: Translate, language: Language, title: string | undefined, animal: string) {
  if (language === 'en') return title ?? animal;
  const event = title?.match(/^(.+) (conflict|sighting)$/);
  if (event && Object.hasOwn(hi, event[1])) return t('{animal} ' + event[2], { animal: t(event[1]) });
  return title ?? t(animal);
}

const guidance = 'Follow forest-department safety guidance and avoid travelling on forest roads after dusk.';

export function localizedAdvisorySummary(t: Translate, language: Language, summary?: string) {
  if (language === 'en' || !summary) return summary;
  const match = /^(High-priority|Precautionary) advisory: (.+?) activity reported near (.+?)\. (.+)$/.exec(summary);
  if (!match || !Object.hasOwn(hi, match[2]) || !match[4].startsWith(guidance)) return summary;
  const place = ['the approximate location shown', 'a buffer-zone settlement'].includes(match[3]) ? t(match[3]) : match[3];
  const advice = match[4].slice(guidance.length).trim();
  return [
    t(match[1] + ' advisory: {animal} activity reported near {place}.', { animal: t(match[2]), place }),
    t(guidance),
    t(advice),
  ].filter(Boolean).join(' ');
}

const errorPatterns = [
  [/^Shorten the description to ([\d,.]+) characters to fit the animal name\.$/,
    'Shorten the description to {count} characters to fit the animal name.', 'count'],
  [/^Too many requests\. Try again in (\d+) seconds\.$/, 'Too many requests. Try again in {seconds} seconds.', 'seconds'],
  [/^Photo exceeds the (\d+) MB limit\.$/, 'Photo exceeds the {size} MB limit.', 'size'],
  [/^String should have at least (\d+) characters$/, 'String should have at least {count} characters', 'count'],
  [/^String should have at most (\d+) characters$/, 'String should have at most {count} characters', 'count'],
] as const;

export function localizedError(t: Translate, language: Language, message: string) {
  if (!message || language === 'en') return message;
  const clean = message.replace(/^Value error, /, '');
  if (Object.hasOwn(hi, clean)) return t(clean);
  for (const [pattern, key, field] of errorPatterns) {
    const match = clean.match(pattern);
    if (match) return t(key, { [field]: match[1] });
  }
  return t('Request failed. Check your connection or try again.');
}
