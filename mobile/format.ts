const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export function formatTimestamp(value: string) {
  return dateTime.format(new Date(value));
}
