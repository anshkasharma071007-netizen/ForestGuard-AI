import type { Language } from '@/i18n/translate';

const dateTime = {
  en: new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
  hi: new Intl.DateTimeFormat('hi-IN', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }),
};

export function formatTimestamp(value: string, language: Language = 'en') {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTime[language].format(date);
}
