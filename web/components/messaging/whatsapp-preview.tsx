'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  CheckCheck,
  ChevronLeft,
  Clock,
  Mic,
  MoreVertical,
  Paperclip,
  Phone,
  Smile,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** Mirrors the MessageStatus enum without importing Prisma into the browser bundle. */
export type WhatsAppStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export interface WhatsAppPreviewProps {
  /** The final text: placeholders already substituted, exactly what the customer receives. */
  body: string;
  contactName: string;
  status?: WhatsAppStatus;
  /** ISO string. Defaults to "now". */
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Wallpaper
//
// WhatsApp's doodle background, drawn as an inline SVG data URI. It is built
// here rather than fetched so the screen renders identically with no network —
// an employee on a bad connection still gets a truthful preview.
// ---------------------------------------------------------------------------

function doodleWallpaper(stroke: string, opacity: number): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">' +
    `<g fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">` +
    // paper plane
    '<path d="M16 40 46 26 36 54 30 44Z"/><path d="M30 44 46 26"/>' +
    // smiley
    '<circle cx="86" cy="34" r="12"/><path d="M80 38c3.5 3.5 8.5 3.5 12 0"/><path d="M82 30h.01"/><path d="M90 30h.01"/>' +
    // heart
    '<path d="M150 48c-9-7-14-12-14-18a7 7 0 0 1 14-3 7 7 0 0 1 14 3c0 6-5 11-14 18z"/>' +
    // camera
    '<path d="M196 26h5l3-4h10l3 4h5a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4h-26a4 4 0 0 1-4-4V30a4 4 0 0 1 4-4z"/><circle cx="209" cy="39" r="8"/>' +
    // chat bubble
    '<path d="M22 84h36a7 7 0 0 1 7 7v15a7 7 0 0 1-7 7H40l-10 9v-9h-8a7 7 0 0 1-7-7V91a7 7 0 0 1 7-7z"/>' +
    // music
    '<path d="M100 118V88l24-5v26"/><circle cx="95" cy="118" r="5"/><circle cx="119" cy="113" r="5"/>' +
    // clock
    '<circle cx="168" cy="100" r="13"/><path d="M168 92v9l6 3"/>' +
    // coffee
    '<path d="M206 92h18v13a9 9 0 0 1-18 0z"/><path d="M224 96h4a5 5 0 0 1 0 10h-4"/><path d="M204 118h22"/>' +
    // star
    '<path d="M42 148l5 10 11 1.5-8 7.5 2 11-10-5.5-10 5.5 2-11-8-7.5 11-1.5z"/>' +
    // lightning
    '<path d="M104 146l-12 21h11l-4 16 15-22h-11z"/>' +
    // open book
    '<path d="M152 150h11a6 6 0 0 1 6 6v22a6 6 0 0 0-6-6h-11z"/><path d="M186 150h-11a6 6 0 0 0-6 6v22a6 6 0 0 1 6-6h11z"/>' +
    // handset
    '<path d="M204 152c0 15 12 27 27 27 3 0 5-2 5-5v-5l-9-4-4 5c-6-2-11-7-13-13l5-4-4-9h-5c-3 0-2 3-2 8z"/>' +
    // sun
    '<circle cx="38" cy="206" r="8"/><path d="M38 192v-5M38 225v-5M24 206h-5M57 206h5M28 196l-4-4M52 220l4 4M52 196l4-4M28 216l-4 4"/>' +
    // balloon
    '<path d="M116 190a11 11 0 0 0-11 11c0 7 6 13 11 15 5-2 11-8 11-15a11 11 0 0 0-11-11z"/><path d="M116 216v6l-4 5h8l-4-5"/>' +
    // double tick
    '<path d="M166 210l6 6 13-14"/><path d="M180 210l5 6 13-14"/>' +
    '</g></svg>';

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const DOODLE_LIGHT = doodleWallpaper('#0b1f16', 0.06);
const DOODLE_DARK = doodleWallpaper('#e9edef', 0.05);

const WALLPAPER_STYLE = { backgroundRepeat: 'repeat', backgroundSize: '240px 240px' } as const;

// ---------------------------------------------------------------------------
// Text rendering
//
// SECURITY: every byte below originates in a template body a colleague typed.
// The text is HTML-escaped *first* and every later pass only ever adds tags to
// the already-escaped string — never re-introducing raw user input. Skipping
// that first step would turn a template containing <script> or an onerror
// attribute into stored XSS against everyone who opens this screen.
// ---------------------------------------------------------------------------

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** WhatsApp's inline markdown. Operates on escaped text only. */
function inlineMarkup(escaped: string): string {
  if (!escaped) return '';
  return (
    escaped
      .replace(/~(\S(?:[^~\n]*\S)?)~/g, '<del>$1</del>')
      .replace(/\*(\S(?:[^*\n]*\S)?)\*/g, '<strong>$1</strong>')
      // Guarded so snake_case words are not silently italicised, which is how
      // WhatsApp itself behaves.
      .replace(/(^|[^\w])_(\S(?:[^_\n]*\S)?)_(?!\w)/g, '$1<em>$2</em>')
  );
}

// Group 1 is a web address, group 2 a phone-shaped run of digits. `\s` is
// deliberately not in the phone class: a number must not span a line break.
const LINKABLE = /((?:https?:\/\/|www\.)[^\s]+)|(\+?\d[\d ().-]{7,}\d)/gi;

const LINK_CLASS = 'underline underline-offset-2 text-[#027EB5] dark:text-[#53BDEB]';

function linkify(escaped: string): string {
  let out = '';
  let last = 0;

  LINKABLE.lastIndex = 0;
  for (let m = LINKABLE.exec(escaped); m !== null; m = LINKABLE.exec(escaped)) {
    const raw = m[0];
    out += inlineMarkup(escaped.slice(last, m.index));
    last = m.index + raw.length;

    if (m[1]) {
      // Sentence punctuation that happens to follow a URL is not part of it.
      // Entities are tested first each round: `&#39;` ends in a semicolon, so
      // stripping punctuation first would tear the entity in half.
      let text = raw;
      let tail = '';
      for (;;) {
        const entity = /(&quot;|&#39;|&gt;|&amp;)$/.exec(text);
        if (entity) {
          tail = entity[0] + tail;
          text = text.slice(0, text.length - entity[0].length);
          continue;
        }
        if (text.length > 0 && /[.,;:!?)]$/.test(text)) {
          tail = text.slice(-1) + tail;
          text = text.slice(0, -1);
          continue;
        }
        break;
      }
      if (!text) {
        out += inlineMarkup(raw);
        continue;
      }
      // Only http(s) and www. reach here, so the href can never be a
      // javascript: URL, and `text` is already entity-escaped for an attribute.
      const href = /^www\./i.test(text) ? `https://${text}` : text;
      out += `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow" class="${LINK_CLASS}">${text}</a>`;
      out += inlineMarkup(tail);
      continue;
    }

    const digits = raw.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      // A year, an amount or a reference number — not something to dial.
      out += inlineMarkup(raw);
      continue;
    }
    const href = `tel:${raw.trim().charAt(0) === '+' ? '+' : ''}${digits}`;
    out += `<a href="${href}" class="${LINK_CLASS}">${raw}</a>`;
  }

  out += inlineMarkup(escaped.slice(last));
  return out;
}

/**
 * Escaped text -> WhatsApp-formatted HTML.
 *
 * Line breaks are left as real newlines and preserved with `whitespace-pre-wrap`,
 * which also keeps runs of spaces the author typed on purpose.
 */
export function formatWhatsAppBody(body: string): string {
  const escaped = escapeHtml(body);

  // Monospace runs win outright: nothing inside ``` is formatted or linkified.
  const CODE = /```([\s\S]*?)```/g;
  let out = '';
  let last = 0;

  CODE.lastIndex = 0;
  for (let m = CODE.exec(escaped); m !== null; m = CODE.exec(escaped)) {
    out += linkify(escaped.slice(last, m.index));
    out += `<code class="font-mono text-[13px]">${m[1]}</code>`;
    last = m.index + m[0].length;
  }
  out += linkify(escaped.slice(last));

  return out;
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

const RECEIPT_LABEL: Record<WhatsAppStatus, string> = {
  queued: 'Waiting to send',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Not sent',
};

function Receipt({ status }: { status: WhatsAppStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center',
        status === 'read'
          ? 'text-[#53BDEB]'
          : status === 'failed'
            ? 'text-[#EA4335]'
            : 'text-[#667781] dark:text-[#8696A0]'
      )}
    >
      {status === 'queued' && <Clock aria-hidden className="w-3.5 h-3.5" />}
      {status === 'sent' && <Check aria-hidden className="w-4 h-4" />}
      {(status === 'delivered' || status === 'read') && <CheckCheck aria-hidden className="w-4 h-4" />}
      {status === 'failed' && <AlertCircle aria-hidden className="w-3.5 h-3.5" />}
      <span className="sr-only">{RECEIPT_LABEL[status]}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------

const CLOCK = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
});

export function WhatsAppPreview({ body, contactName, status = 'read', timestamp }: WhatsAppPreviewProps) {
  // "Now" differs between the server render and the browser's first paint, so
  // the clock is filled in after mount rather than causing a hydration mismatch.
  const [time, setTime] = useState('');
  useEffect(() => {
    const at = timestamp ? new Date(timestamp) : new Date();
    setTime(Number.isNaN(at.getTime()) ? '' : CLOCK.format(at));
  }, [timestamp]);

  const empty = body.trim().length === 0;
  const html = empty ? '' : formatWhatsAppBody(body);
  const name = contactName.trim() || 'Customer';
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[2.25rem] border-[10px] border-slate-900 dark:border-black bg-slate-900 dark:bg-black shadow-2xl shadow-slate-900/25 ring-1 ring-slate-900/10 dark:ring-white/10">
      <div className="relative overflow-hidden rounded-[1.55rem]">
        {/* Notch */}
        <div aria-hidden className="absolute left-1/2 top-0 z-20 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-slate-900 dark:bg-black" />

        {/* Chat header */}
        <header className="flex items-center gap-2.5 bg-[#075E54] dark:bg-[#1F2C34] px-2 pb-2.5 pt-7 text-white">
          <ChevronLeft aria-hidden className="w-5 h-5 shrink-0 opacity-90" />
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#C4CCD1] dark:bg-[#6A7175] text-sm font-semibold text-[#075E54] dark:text-white">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium leading-tight">{name}</span>
            <span className="block text-[11px] leading-tight text-white/70">online</span>
          </span>
          <Video aria-hidden className="w-[18px] h-[18px] shrink-0 opacity-90" />
          <Phone aria-hidden className="w-[17px] h-[17px] shrink-0 opacity-90" />
          <MoreVertical aria-hidden className="w-[18px] h-[18px] shrink-0 opacity-90" />
        </header>

        {/* Wallpaper sits on the parent so it stays put while the thread scrolls. */}
        <div className="relative bg-[#ECE5DD] dark:bg-[#0B141A]">
          <div aria-hidden className="pointer-events-none absolute inset-0 dark:hidden" style={{ backgroundImage: DOODLE_LIGHT, ...WALLPAPER_STYLE }} />
          <div aria-hidden className="pointer-events-none absolute inset-0 hidden dark:block" style={{ backgroundImage: DOODLE_DARK, ...WALLPAPER_STYLE }} />

          {/* Bottom alignment comes from `mt-auto` on the first child, not
              `justify-end`. In a scroll container, justify-content: flex-end
              pushes overflowing content past the top edge and makes it
              unreachable — a long template would have its opening lines cut off
              with no way to scroll back to them. */}
          <div className="relative flex min-h-[280px] max-h-[min(60vh,520px)] flex-col gap-2 overflow-y-auto overscroll-contain p-3">
            <div className="mt-auto flex justify-center">
              <span className="rounded-lg bg-white/85 dark:bg-[#1F2C34] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-[#54656F] dark:text-[#8696A0] shadow-sm">
                Today
              </span>
            </div>

            <div className="flex justify-end">
              <div className="relative max-w-[80%]">
                {/* The notched top-right corner every outgoing WhatsApp bubble has. */}
                <span
                  aria-hidden
                  className="absolute top-0 -right-2 h-0 w-0 border-t-8 border-r-8 border-t-[#DCF8C6] dark:border-t-[#005C4B] border-r-transparent"
                />
                <div className="relative rounded-[7.5px] rounded-tr-none bg-[#DCF8C6] dark:bg-[#005C4B] px-2.5 py-1.5 shadow-sm">
                  {empty ? (
                    <span className="text-[14.2px] italic leading-[19px] text-[#667781] dark:text-[#8696A0]">
                      Your message will appear here
                    </span>
                  ) : (
                    <span
                      className="text-[14.2px] leading-[19px] text-[#111B21] dark:text-[#E9EDEF] whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
                      // Safe: `formatWhatsAppBody` escapes before it formats.
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  )}
                  {/* Reserves room on the last line so the timestamp tucks in beside it. */}
                  <span aria-hidden className="inline-block w-[62px] select-none">&nbsp;</span>
                  <span className="absolute bottom-1 right-2 flex items-center gap-1 text-[11px] leading-none text-[#667781] dark:text-[#8696A0]">
                    <span className="tabular-nums">{time}</span>
                    <Receipt status={status} />
                  </span>
                </div>
                {status === 'failed' && (
                  <p className="mt-1 text-right text-[11px] text-[#EA4335]">Message not sent</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Compose bar */}
        <div className="flex items-center gap-1.5 bg-[#F0F0F0] dark:bg-[#111B21] px-2 py-2">
          <div className="flex flex-1 items-center gap-2 rounded-full bg-white dark:bg-[#1F2C34] px-3 py-2">
            <Smile aria-hidden className="w-[18px] h-[18px] shrink-0 text-[#8696A0]" />
            <span className="flex-1 truncate text-[13px] text-[#8696A0]">Message</span>
            <Paperclip aria-hidden className="w-[18px] h-[18px] shrink-0 text-[#8696A0]" />
            <Camera aria-hidden className="w-[18px] h-[18px] shrink-0 text-[#8696A0]" />
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00A884]">
            <Mic aria-hidden className="w-[18px] h-[18px] text-white" />
          </span>
        </div>
      </div>
    </div>
  );
}
