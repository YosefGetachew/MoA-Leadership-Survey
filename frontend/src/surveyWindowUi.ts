export function ethiopiaInput(date: Date): string {
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function planWindow(mode: 'now' | 'later', start: string, end: string, now = new Date()) {
  const read = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
    const date = new Date(value + ':00+03:00');
    return Number.isFinite(date.getTime()) && ethiopiaInput(date) === value ? date : null;
  };
  const startsAt = mode === 'now' ? now : read(start);
  const endsAt = read(end);
  if (!startsAt) return { error: 'Choose a valid opening date and time.', field: 'start' as const };
  if (mode === 'later' && startsAt.getTime() <= now.getTime()) return { error: 'Choose a future opening time, or select Open now.', field: 'start' as const };
  if (!endsAt) return { error: 'Choose when the survey should close.', field: 'end' as const };
  if (endsAt <= startsAt) return { error: 'Closing time must be after opening time.', field: 'end' as const };
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}
