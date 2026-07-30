import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { AuthError, requireAdmin } from '@/lib/auth';

// Platform defaults, stored one row per key in the Setting singleton table.
//
// dailyCallLimit is written as a bare JSON number because lib/calls/place.ts
// reads it with Number(row.value) — wrapping it in an object would make every
// user silently fall back to the hardcoded limit.

const KEYS = ['companyName', 'dailyCallLimit', 'businessHours', 'retryLimit', 'retryDelayMins'] as const;
type SettingKey = (typeof KEYS)[number];

const DEFAULTS: Record<SettingKey, Prisma.InputJsonValue> = {
  companyName: 'Finance Buddha',
  dailyCallLimit: 100,
  businessHours: { tz: 'Asia/Kolkata', days: [1, 2, 3, 4, 5, 6], start: '09:00', end: '20:00' },
  retryLimit: 1,
  retryDelayMins: 60,
};

type Validated = { value: Prisma.InputJsonValue } | { error: string };

function isSettingKey(key: string): key is SettingKey {
  return (KEYS as readonly string[]).includes(key);
}

function deny(e: unknown) {
  const err = e as AuthError;
  return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
}

function whole(label: string, min: number, max: number) {
  return (raw: unknown): Validated => {
    if (typeof raw !== 'number' && typeof raw !== 'string') {
      return { error: `${label} must be a number.` };
    }
    const n = Math.trunc(Number(raw));
    if (!Number.isFinite(n)) return { error: `${label} must be a number.` };
    if (n < min || n > max) return { error: `${label} must be between ${min} and ${max}.` };
    return { value: n };
  };
}

/** HH:MM, zero-padded, or null when it is not a time at all. */
function normaliseTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const mins = Number(m[2]);
  if (hours > 23 || mins > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

const VALIDATORS: Record<SettingKey, (raw: unknown) => Validated> = {
  companyName: (raw) => {
    if (typeof raw !== 'string') return { error: 'Company name must be text.' };
    const name = raw.trim();
    if (!name) return { error: 'Company name cannot be empty.' };
    if (name.length > 120) return { error: 'Company name is too long (120 characters maximum).' };
    return { value: name };
  },

  dailyCallLimit: whole('Daily call limit', 1, 100_000),

  // 0 is legitimate: it means one attempt and no retry, matching
  // Campaign.retryLimit, so it is allowed where the other numbers are not.
  retryLimit: whole('Retry limit', 0, 10),

  retryDelayMins: whole('Retry delay', 1, 10_080),

  businessHours: (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { error: 'Business hours must have a timezone, days, a start and an end.' };
    }
    const hours = raw as Record<string, unknown>;

    const tz = typeof hours.tz === 'string' ? hours.tz.trim() : '';
    if (!tz) return { error: 'Business hours need a timezone.' };
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
    } catch {
      return { error: `"${tz}" is not a timezone this server recognises.` };
    }

    if (!Array.isArray(hours.days)) return { error: 'Business hours need a list of calling days.' };
    const days = Array.from(new Set(hours.days.map((d) => Math.trunc(Number(d))))).sort((a, b) => a - b);
    if (!days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return { error: 'Pick at least one calling day (0 = Sunday … 6 = Saturday).' };
    }

    const start = normaliseTime(hours.start);
    const end = normaliseTime(hours.end);
    if (!start || !end) return { error: 'The calling window needs a start and end time in HH:MM.' };
    if (start === end) return { error: 'The calling window cannot start and end at the same time.' };

    // Rebuilt as a literal rather than passed through, so a client cannot
    // smuggle extra keys into the column.
    return { value: { tz, days, start, end } };
  },
};

/** Every stored row, flattened, with the documented defaults filled in. */
export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return deny(e);
  }

  const rows = await db.setting.findMany();

  const settings: Record<string, unknown> = {};
  // Rows left behind by an earlier build are passed through untouched; only the
  // documented keys are validated and defaulted.
  for (const row of rows) settings[row.key] = row.value;

  for (const key of KEYS) {
    const raw = settings[key];
    if (raw === undefined || raw === null) {
      settings[key] = DEFAULTS[key];
      continue;
    }
    // A hand-edited row must not hand the UI a value it cannot render.
    const checked = VALIDATORS[key](raw);
    settings[key] = 'error' in checked ? DEFAULTS[key] : checked.value;
  }

  return NextResponse.json(settings);
}

export async function PATCH(req: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return deny(e);
  }

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected an object of settings.' }, { status: 400 });
  }
  const patch = body as Record<string, unknown>;

  const incoming = Object.keys(patch);
  const unknown = incoming.filter((key) => !isSettingKey(key));
  if (unknown.length) {
    // Storing an unrecognised key would look like it worked while nothing ever
    // read it, so refuse rather than accept it quietly.
    return NextResponse.json(
      { error: `Unknown setting${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}` },
      { status: 400 }
    );
  }

  const keys = incoming.filter(isSettingKey);
  if (!keys.length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  const updates: { key: SettingKey; value: Prisma.InputJsonValue }[] = [];
  for (const key of keys) {
    const checked = VALIDATORS[key](patch[key]);
    if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
    updates.push({ key, value: checked.value });
  }

  // One transaction: a half-applied settings save is harder to reason about
  // than one that failed outright.
  await db.$transaction(
    updates.map((u) =>
      db.setting.upsert({
        where: { key: u.key },
        create: { key: u.key, value: u.value },
        update: { value: u.value },
      })
    )
  );

  await db.auditLog.create({
    data: {
      action: 'settings.updated',
      entity: 'Setting',
      userId: admin.id,
      meta: { keys: updates.map((u) => u.key) },
    },
  });

  return NextResponse.json({
    ok: true,
    settings: Object.fromEntries(updates.map((u) => [u.key, u.value])),
  });
}
