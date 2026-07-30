// WhatsApp Cloud API client (Meta Graph API v21.0).
//
//   POST https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_NUMBER_ID}/messages
//   Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
//   { messaging_product: "whatsapp", to, type: "text", text: { body } }
//   -> { messaging_product, contacts:[{input, wa_id}], messages:[{ id:"wamid…" }] }
//
// Mock mode mirrors lib/providers/mock.ts: when USE_MOCK_CALLS=true, or when the
// credentials simply are not there, nothing is sent to Meta and a `mock-` id is
// returned instead. That is what lets the whole follow-up feature — templates,
// sending, history, delivery states — be exercised without a WhatsApp Business
// account, exactly as calls already run without telephony.
import { normalisePhone } from '../contacts/phone';

const GRAPH_VERSION = 'v21.0';

/** WhatsApp's hard limit on a text message body. */
export const WHATSAPP_TEXT_LIMIT = 4096;

/** Give up on the Graph API rather than hold a request handler open. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Typed failure so callers can map onto an HTTP status and, more importantly,
 * show the customer-facing operator what Meta actually complained about —
 * "Recipient phone number not in allowed list" is fixable, "Send failed" is not.
 */
export class WhatsAppError extends Error {
  constructor(
    message: string,
    readonly status: number = 502,
    readonly detail?: string
  ) {
    super(message);
    this.name = 'WhatsAppError';
  }
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

/** True when no request should reach Meta. */
export function isWhatsAppMockMode(): boolean {
  return process.env.USE_MOCK_CALLS === 'true' || !isWhatsAppConfigured();
}

/**
 * E.164 digits with no leading `+` — the only form the Graph API's `to` field
 * accepts. Reuses the importer's normaliser so a bare 10-digit Indian number
 * resolves the same way here as it does everywhere else.
 */
export function toWhatsAppNumber(raw: string): string | null {
  const e164 = normalisePhone(raw);
  return e164 ? e164.replace(/\D/g, '') : null;
}

function mockMessageId(): string {
  return `mock-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Pull Meta's own wording out of an error envelope, whatever shape it arrived in. */
function graphErrorDetail(payload: unknown, status: number): string {
  const root = (payload ?? {}) as Record<string, unknown>;
  const error = (root.error ?? {}) as Record<string, unknown>;

  const parts: string[] = [];
  if (typeof error.message === 'string' && error.message.trim()) parts.push(error.message.trim());

  const data = (error.error_data ?? {}) as Record<string, unknown>;
  if (typeof data.details === 'string' && data.details.trim()) parts.push(data.details.trim());

  if (typeof error.code === 'number') parts.push(`code ${error.code}`);

  return parts.length ? parts.join(' — ').slice(0, 400) : `HTTP ${status}`;
}

/**
 * Send one plain-text WhatsApp message.
 *
 * Returns the provider's message id, which is what delivery receipts arriving at
 * /api/webhooks/whatsapp are matched on.
 */
export async function sendWhatsAppText(
  to: string,
  body: string
): Promise<{ providerMessageId: string }> {
  const msisdn = toWhatsAppNumber(to);
  if (!msisdn) {
    throw new WhatsAppError(`"${to}" is not a number WhatsApp can deliver to.`, 400);
  }

  const message = String(body ?? '').trim();
  if (!message) throw new WhatsAppError('The message body is empty.', 400);
  if (message.length > WHATSAPP_TEXT_LIMIT) {
    throw new WhatsAppError(
      `The message is ${message.length} characters; WhatsApp allows ${WHATSAPP_TEXT_LIMIT}.`,
      400
    );
  }

  if (isWhatsAppMockMode()) {
    const providerMessageId = mockMessageId();
    console.log(
      `[whatsapp:mock] -> ${msisdn} (${message.length} chars) id=${providerMessageId}`
    );
    return { providerMessageId };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID as string;
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN as string}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: msisdn,
        type: 'text',
        text: { body: message },
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    const reason = e instanceof Error ? e.message : 'Network error';
    throw new WhatsAppError('Could not reach WhatsApp.', 502, reason.slice(0, 400));
  }
  clearTimeout(timer);

  const payload: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    // 401/403 mean the token or the phone-number id is wrong, which is a
    // configuration problem an admin fixes — not a transient delivery failure.
    const status = res.status === 401 || res.status === 403 ? 503 : 502;
    throw new WhatsAppError(
      `WhatsApp rejected the message (${res.status}).`,
      status,
      graphErrorDetail(payload, res.status)
    );
  }

  const messages = (payload as { messages?: { id?: string }[] }).messages;
  const id = Array.isArray(messages) && messages.length > 0 ? messages[0]?.id : undefined;
  if (!id) {
    throw new WhatsAppError(
      'WhatsApp accepted the request but returned no message id.',
      502,
      JSON.stringify(payload).slice(0, 400)
    );
  }

  return { providerMessageId: String(id) };
}
