import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { MessageStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Meta's webhook for the WhatsApp Cloud API.
//
//   GET  — the one-time subscription handshake: echo hub.challenge.
//   POST — delivery receipts, as entry[].changes[].value.statuses[].
//
// Nothing here is authenticated as a FinBud user: the caller is Meta, not a
// member of staff, so the only guards are the verify token on GET and the
// optional payload signature on POST.

/**
 * How far along delivery a status is.
 *
 * Receipts genuinely arrive out of order — `read` can land before `delivered` —
 * so a message only ever moves forward. `failed` is terminal: WhatsApp will not
 * deliver a message it has already given up on.
 */
const RANK: Record<MessageStatus, number> = {
  [MessageStatus.queued]: 0,
  [MessageStatus.sent]: 1,
  [MessageStatus.delivered]: 2,
  [MessageStatus.read]: 3,
  [MessageStatus.failed]: 4,
};

interface StatusUpdate {
  providerMessageId: string;
  status: MessageStatus;
  at: Date | null;
  error: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Meta's status vocabulary onto ours. `deleted` and `warning` are not states. */
function toMessageStatus(raw: unknown): MessageStatus | null {
  switch (String(raw ?? '').toLowerCase()) {
    case 'sent':
      return MessageStatus.sent;
    case 'delivered':
      return MessageStatus.delivered;
    case 'read':
      return MessageStatus.read;
    case 'failed':
      return MessageStatus.failed;
    default:
      return null;
  }
}

/** Unix seconds, as a string, per the webhook payload. */
function toDate(raw: unknown): Date | null {
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const at = new Date(seconds * 1000);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Readable reason from one of Meta's error objects. */
function describeError(raw: unknown): string | null {
  const error = asRecord(raw);
  const parts: string[] = [];

  const title = error.title;
  if (typeof title === 'string' && title.trim()) parts.push(title.trim());

  const message = error.message;
  if (typeof message === 'string' && message.trim() && message.trim() !== parts[0]) {
    parts.push(message.trim());
  }

  const details = asRecord(error.error_data).details;
  if (typeof details === 'string' && details.trim()) parts.push(details.trim());

  if (typeof error.code === 'number') parts.push(`code ${error.code}`);

  return parts.length ? parts.join(' — ').slice(0, 400) : null;
}

/** Flatten entry[].changes[].value.statuses[] into one list of updates. */
function collectUpdates(payload: unknown): StatusUpdate[] {
  const updates: StatusUpdate[] = [];

  for (const entry of asArray(asRecord(payload).entry)) {
    for (const change of asArray(asRecord(entry).changes)) {
      const value = asRecord(asRecord(change).value);

      // Errors reported for the change as a whole apply to its statuses when the
      // individual receipt carries none of its own.
      const changeError = describeError(asArray(value.errors)[0]);

      for (const raw of asArray(value.statuses)) {
        const entryStatus = asRecord(raw);
        const providerMessageId = String(entryStatus.id ?? '').trim();
        if (!providerMessageId) continue;

        const status = toMessageStatus(entryStatus.status);
        if (!status) continue;

        const ownError = describeError(asArray(entryStatus.errors)[0]);

        updates.push({
          providerMessageId,
          status,
          at: toDate(entryStatus.timestamp),
          error: ownError ?? changeError,
        });
      }
    }
  }

  return updates;
}

/**
 * Optional payload signature check.
 *
 * Meta signs every delivery with the app secret as X-Hub-Signature-256. It is
 * only enforced when WHATSAPP_APP_SECRET is configured, so the mock setup — no
 * WhatsApp Business account at all — still works end to end.
 */
function signatureValid(raw: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;
  if (!header || !header.startsWith('sha256=')) return false;

  const expected = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex'));
  const received = Buffer.from(header.slice('sha256='.length));
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

/** Meta's subscription handshake. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  // An unset token must never verify: otherwise anyone who guesses this URL
  // could point their own Meta app at our delivery-receipt handler.
  if (!expected || mode !== 'subscribe' || token !== expected || !challenge) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Meta expects the challenge echoed back verbatim as plain text, not JSON.
  return new NextResponse(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/** Delivery receipts. */
export async function POST(req: NextRequest) {
  const raw = await req.text();

  if (!signatureValid(raw, req.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'Bad signature' }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Malformed bodies are never going to parse on a retry either.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const updates = collectUpdates(payload);

  let updated = 0;
  let ignored = 0;

  try {
    for (const update of updates) {
      const existing = await db.message.findUnique({
        where: { providerMessageId: update.providerMessageId },
        select: { id: true, status: true, sentAt: true, deliveredAt: true },
      });

      // An id we never issued — another app on the same number, or a message
      // sent before this deployment. Acknowledge it so Meta stops retrying.
      if (!existing) {
        ignored++;
        continue;
      }

      if (existing.status === MessageStatus.failed) {
        ignored++;
        continue;
      }
      if (update.status !== MessageStatus.failed && RANK[update.status] <= RANK[existing.status]) {
        ignored++;
        continue;
      }

      const stamp = update.at ?? new Date();
      const data: Prisma.MessageUncheckedUpdateInput = { status: update.status };

      if (update.status === MessageStatus.failed) {
        data.error = update.error ?? 'WhatsApp reported a delivery failure.';
      } else {
        // A `read` can be the first receipt we see; backfill the earlier stamps
        // rather than leaving a delivered message that looks like it never sent.
        if (!existing.sentAt) data.sentAt = stamp;
        if (update.status !== MessageStatus.sent && !existing.deliveredAt) {
          data.deliveredAt = stamp;
        }
      }

      await db.message.update({ where: { id: existing.id }, data });
      updated++;
    }
  } catch (e) {
    // A database failure is worth a retry, unlike anything above.
    console.error('[webhook:whatsapp]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated, ignored });
}
