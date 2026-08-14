// Venue-local time helpers (ADR-005).
//
// Timestamps are stored in ISO/UTC everywhere and that does NOT change here — this
// module only converts for grouping and display. We resolve the offset through Intl
// rather than hardcoding -03:00 so the code keeps working if Argentina ever reinstates
// daylight saving time.

export const VENUE_TZ = 'America/Argentina/Buenos_Aires';

// Hour at which the business day starts, in venue-local time.
//
// 0 means the business day matches the calendar day. Raise it (e.g. to 6) for a venue
// that closes at 3am and wants those late sales counted against the previous night.
// This single knob shifts both `venueDay()` and `dayBounds()` consistently.
export const BUSINESS_DAY_START_HOUR = 0;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: VENUE_TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function localParts(date: Date): LocalParts {
  const map: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = Number(part.value);
  }
  const hour = map.hour === 24 ? 0 : map.hour;
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour,
    minute: map.minute,
    second: map.second,
  };
}

function offsetMinutes(date: Date): number {
  const p = localParts(date);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asIfUtc - date.getTime()) / MS_PER_MINUTE;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function venueDay(date: Date = new Date()): string {
  const shifted = new Date(date.getTime() - BUSINESS_DAY_START_HOUR * MS_PER_HOUR);
  const p = localParts(shifted);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function venueHour(iso: string): number {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return -1;
  return localParts(date).hour;
}

export function dayBounds(day: string): { from: string; to: string } {
  const [year, month, dayOfMonth] = day.split('-').map(Number);

  const naive = Date.UTC(year, month - 1, dayOfMonth, BUSINESS_DAY_START_HOUR, 0, 0);
  let start = new Date(naive - offsetMinutes(new Date(naive)) * MS_PER_MINUTE);
  start = new Date(naive - offsetMinutes(start) * MS_PER_MINUTE);

  return {
    from: start.toISOString(),
    to: new Date(start.getTime() + MS_PER_DAY).toISOString(),
  };
}

export function shiftDay(day: string, deltaDays: number): string {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, dayOfMonth + deltaDays));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate()
  )}`;
}

export function isToday(day: string): boolean {
  return day === venueDay();
}

export function elapsedInDay(day: string, now: Date = new Date()): number {
  const { from } = dayBounds(day);
  return Math.max(0, Math.min(now.getTime() - new Date(from).getTime(), MS_PER_DAY));
}
