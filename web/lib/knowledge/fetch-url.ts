// Ingesting a website into the knowledge base.
//
// Given a starting URL, crawl the same origin and return readable text per
// page. The agent then answers from the company's own site without anyone
// having to paste PDFs in.
//
// SECURITY: this fetches URLs a signed-in user supplies, from the server. That
// is a server-side request forgery primitive unless it is fenced in, so every
// hop is re-validated against `assertPublicUrl` — not just the URL the user
// typed, but each redirect and each discovered link. Without that check the
// endpoint would happily read http://169.254.169.254/ (cloud instance
// metadata), http://localhost:5432, or anything else on the private network,
// and hand the contents back through the knowledge base.
import { lookup } from 'dns/promises';
import { isIP } from 'net';

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
}

export interface CrawlResult {
  pages: FetchedPage[];
  /** Pages we chose not to fetch, with the reason, so the UI can be honest. */
  skipped: { url: string; reason: string }[];
  title: string;
}

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  /** Stop once this much text has been collected, to bound memory and cost. */
  maxTotalChars?: number;
}

export const DEFAULT_MAX_PAGES = 25;
export const DEFAULT_MAX_DEPTH = 2;
export const DEFAULT_MAX_CHARS = 400_000;

const FETCH_TIMEOUT_MS = 15_000;
const MAX_PAGE_BYTES = 3_000_000;

export class UrlNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlNotAllowedError';
  }
}

/** RFC1918 and friends — anything that is not routable on the public internet. */
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase();
    if (v6 === '::1' || v6 === '::') return true;
    // Unique-local (fc00::/7) and link-local (fe80::/10).
    if (/^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)) return true;
    // IPv4-mapped addresses smuggle a v4 target through a v6 literal.
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }

  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;           // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true;                          // multicast / reserved
  return false;
}

/**
 * Throw unless the URL is a public http(s) address.
 *
 * Resolves DNS rather than trusting the hostname: `internal.example.com` can
 * legitimately resolve to 10.0.0.5, and that is the case this has to stop.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlNotAllowedError('That is not a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlNotAllowedError('Only http and https URLs can be imported.');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');

  if (isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new UrlNotAllowedError('That address is on a private network and cannot be imported.');
    }
    return url;
  }

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new UrlNotAllowedError('That address is on a private network and cannot be imported.');
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new UrlNotAllowedError(`Could not resolve ${host}.`);
  }

  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new UrlNotAllowedError('That host resolves to a private network address and cannot be imported.');
  }

  return url;
}

// ---------------------------------------------------------------------------
// HTML -> text
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  mdash: '—', ndash: '–', hellip: '…', middot: '·', trade: '™',
  copy: '©', reg: '®', deg: '°', eacute: 'é', rupee: '₹',
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Strip chrome and markup, keeping the reading order of the content. */
export function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';

  let body = html;

  // Order matters: drop whole non-content elements before touching anything else,
  // or their inner text leaks into the output.
  body = body.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const tag of ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'nav', 'header', 'footer', 'form']) {
    body = body.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), ' ');
  }
  // Cookie banners and menus rarely close their tags tidily; drop by role too.
  body = body.replace(/<[^>]+role=["'](navigation|banner|contentinfo|dialog)["'][^>]*>[\s\S]*?<\/[^>]+>/gi, ' ');

  // Block-level tags become line breaks so paragraphs survive as paragraphs —
  // the chunker splits on them.
  body = body.replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre)>/gi, '\n\n');
  body = body.replace(/<br\s*\/?>/gi, '\n');
  body = body.replace(/<li\b[^>]*>/gi, '\n• ');
  body = body.replace(/<\/(td|th)>/gi, '\t');

  body = body.replace(/<[^>]+>/g, ' ');
  body = decodeEntities(body);

  const text = body
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, text };
}

/** Same-origin links worth following, absolutised and de-fragmented. */
function extractLinks(html: string, base: URL): string[] {
  const out = new Set<string>();

  // Exec loop rather than matchAll: the project targets ES5 in tsconfig, where
  // iterating an IterableIterator needs downlevelIteration.
  const pattern = /<a\b[^>]*href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const href = match[1].trim();
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(href)) continue;

    let target: URL;
    try {
      target = new URL(href, base);
    } catch {
      continue;
    }
    if (target.origin !== base.origin) continue;
    // Assets masquerading as pages waste the page budget.
    if (/\.(png|jpe?g|gif|svg|webp|ico|css|js|zip|mp[34]|avi|mov|woff2?|ttf)$/i.test(target.pathname)) continue;

    target.hash = '';
    out.add(target.toString());
  }

  return Array.from(out);
}

async function fetchPage(url: URL): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      // Redirects are followed manually so each hop can be re-validated;
      // fetch's automatic following would let a public URL bounce us onto
      // 127.0.0.1 and defeat assertPublicUrl entirely.
      redirect: 'manual',
      headers: {
        'User-Agent': 'FinBudAI-KnowledgeBase/1.0 (+https://financebuddha.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new Error(`HTTP ${res.status} without a location header`);
      const next = await assertPublicUrl(new URL(location, url).toString());
      return fetchPage(next);
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const type = res.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml/i.test(type)) {
      throw new Error(`not an HTML page (${type.split(';')[0] || 'unknown type'})`);
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_PAGE_BYTES) throw new Error('page is too large');

    return { html: new TextDecoder('utf-8').decode(buffer), finalUrl: res.url || url.toString() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Breadth-first crawl of one origin.
 *
 * Sequential rather than parallel: this points at someone else's server, and a
 * burst of concurrent requests from an "import my site" button is how you get
 * rate-limited or mistaken for an attack.
 */
export async function crawlSite(startUrl: string, options: CrawlOptions = {}): Promise<CrawlResult> {
  const maxPages = Math.max(1, Math.min(options.maxPages ?? DEFAULT_MAX_PAGES, 100));
  const maxDepth = Math.max(0, Math.min(options.maxDepth ?? DEFAULT_MAX_DEPTH, 4));
  const maxChars = options.maxTotalChars ?? DEFAULT_MAX_CHARS;

  const start = await assertPublicUrl(startUrl);

  const queue: { url: string; depth: number }[] = [{ url: start.toString(), depth: 0 }];
  const seen = new Set([start.toString()]);
  const pages: FetchedPage[] = [];
  const skipped: { url: string; reason: string }[] = [];
  let total = 0;
  let siteTitle = '';

  while (queue.length && pages.length < maxPages && total < maxChars) {
    const { url, depth } = queue.shift()!;

    let html: string;
    try {
      const validated = await assertPublicUrl(url);
      const fetched = await fetchPage(validated);
      html = fetched.html;
    } catch (err) {
      skipped.push({ url, reason: err instanceof Error ? err.message : 'could not be fetched' });
      continue;
    }

    const { title, text } = htmlToText(html);
    if (!siteTitle) siteTitle = title;

    // A nav-only page adds noise to retrieval without adding information.
    if (text.length >= 200) {
      pages.push({ url, title: title || url, text });
      total += text.length;
    } else {
      skipped.push({ url, reason: 'too little readable text' });
    }

    if (depth < maxDepth) {
      for (const link of extractLinks(html, new URL(url))) {
        if (seen.has(link) || seen.size >= maxPages * 4) continue;
        seen.add(link);
        queue.push({ url: link, depth: depth + 1 });
      }
    }
  }

  if (!pages.length) {
    throw new UrlNotAllowedError(
      skipped[0]
        ? `Nothing could be read from that site (${skipped[0].reason}).`
        : 'Nothing could be read from that site.'
    );
  }

  return { pages, skipped, title: siteTitle || start.hostname };
}
