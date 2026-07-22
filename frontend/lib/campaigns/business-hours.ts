// Business-hours evaluation for campaign dialling.
//
// Stored on Campaign.businessHours as JSON:
//   { "tz": "Asia/Kolkata", "days": [1,2,3,4,5], "start": "09:00", "end": "18:00" }
//
// days uses JS getDay() numbering (0 = Sunday). Omitted/invalid config means
// "always allowed" — a campaign should not silently refuse to dial because a
// settings blob was malformed.

export interface BusinessHours {
  tz: string;
  days: number[];
  start: string;
  end: string;
}

const DEFAULT_TZ = 'Asia/Kolkata';

export function parseBusinessHours(raw: string | null | undefined): BusinessHours | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return null;

    const start = typeof parsed.start === 'string' ? parsed.start : null;
    const end = typeof parsed.end === 'string' ? parsed.end : null;
    if (!start || !end) return null;

    return {
      tz: typeof parsed.tz === 'string' && parsed.tz ? parsed.tz : DEFAULT_TZ,
      days: Array.isArray(parsed.days) && parsed.days.length
        ? parsed.days.map(Number).filter((d: number) => d >= 0 && d <= 6)
        : [0, 1, 2, 3, 4, 5, 6],
      start,
      end,
    };
  } catch {
    return null;
  }
}

/** Minutes since midnight, and weekday, for `at` in the given IANA timezone. */
function zonedParts(at: Date, tz: string): { minutes: number; day: number } {
  // Intl is the only dependency-free way to get wall-clock time in another
  // timezone; parsing the formatted parts avoids pulling in a date library.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const parts = fmt.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  const hour = parseInt(get('hour'), 10) || 0;
  const minute = parseInt(get('minute'), 10) || 0;

  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  return { minutes: hour * 60 + minute, day: dayMap[get('weekday')] ?? 0 };
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** True when `at` falls inside the configured calling window. */
export function isWithinBusinessHours(
  hours: BusinessHours | null,
  at: Date = new Date()
): boolean {
  if (!hours) return true;

  const start = toMinutes(hours.start);
  const end = toMinutes(hours.end);
  if (start == null || end == null) return true;

  let zoned;
  try {
    zoned = zonedParts(at, hours.tz);
  } catch {
    // Unknown timezone string — fail open rather than stall the campaign.
    return true;
  }

  if (!hours.days.includes(zoned.day)) return false;

  // Windows that wrap past midnight (e.g. 22:00 -> 02:00).
  if (end < start) return zoned.minutes >= start || zoned.minutes < end;

  return zoned.minutes >= start && zoned.minutes < end;
}

/** Human-readable reason used in API responses and the UI. */
export function describeWindow(hours: BusinessHours | null): string {
  if (!hours) return 'any time';
  return `${hours.start}–${hours.end} ${hours.tz}`;
}
