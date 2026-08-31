const zone = 'Africa/Addis_Ababa';
const numericEthiopian = new Intl.DateTimeFormat('en-u-ca-ethiopic-nu-latn', {
  timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric',
});

export function ethiopianParts(date: Date) {
  const parts = numericEthiopian.formatToParts(date);
  const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
}

// Reverse the runtime's Unicode calendar mapping, including Pagume and leap days.
// Search dates at UTC noon; timezone conversion is applied only to the final time.
export function ethiopianToGregorian(year: number, month: number, day: number): string | null {
  if (![year, month, day].every(Number.isInteger) || year < 1900 || year > 2200 || month < 1 || month > 13 || day < 1 || day > 30) return null;
  let low = Math.floor(Date.UTC(year + 7, 0, 1) / 86400000);
  let high = Math.floor(Date.UTC(year + 9, 0, 1) / 86400000);
  const target = year * 10000 + month * 100 + day;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const date = new Date(middle * 86400000 + 43200000);
    const parts = ethiopianParts(date);
    const current = parts.year * 10000 + parts.month * 100 + parts.day;
    if (current === target) return date.toISOString().slice(0, 10);
    if (current < target) low = middle + 1;
    else high = middle - 1;
  }
  return null;
}

export function calendarDates(value: string, language: 'en' | 'am' = 'en') {
  const date = new Date(value);
  const options = { timeZone: zone, day: 'numeric', month: 'long', year: 'numeric' } as const;
  const parts = new Intl.DateTimeFormat('en-u-ca-ethiopic-nu-latn', { ...options, month: 'numeric' }).formatToParts(date);
  const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
  return {
    // Always use Amharic month names, including in the English admin interface.
    // Keep the era suffix out of the date to avoid confusion with clock AM/PM.
    ethiopian: `${part('day')} ${ethiopianMonths[part('month') - 1]} ${part('year')}`,
    gregorian: new Intl.DateTimeFormat(language === 'am' ? 'am-ET' : 'en-GB', { ...options, calendar: 'gregory' }).format(date),
    time: new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(date),
  };
}

export function clock24(hour: string, minute: string, meridiem: string): string | null {
  const h = Number(hour), m = Number(minute);
  if (!/^\d{1,2}$/.test(hour) || !/^\d{2}$/.test(minute) || h < 1 || h > 12 || m > 59 || !['AM', 'PM'].includes(meridiem)) return null;
  return `${String(h % 12 + (meridiem === 'PM' ? 12 : 0)).padStart(2, '0')}:${minute}`;
}

export const ethiopianMonths = ['መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሃሴ', 'ጳጉሜ'];
