import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { db } from '@/lib/db';

// Block private / loopback hosts to prevent SSRF.
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd')) return true;
  return false;
}

// Strip HTML to readable plain text.
function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : '';

  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  body = decodeEntities(body)
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n').map((l) => l.trim()).join('\n')
    .trim();

  return { title, text: body };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { url } = await req.json();
  if (!url || typeof url !== 'string') return NextResponse.json({ error: 'URL is required' }, { status: 400 });

  let parsed: URL;
  try { parsed = new URL(url.startsWith('http') ? url : `https://${url}`); }
  catch { return NextResponse.json({ error: 'Invalid URL' }, { status: 400 }); }

  if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHost(parsed.hostname)) {
    return NextResponse.json({ error: 'That URL is not allowed' }, { status: 400 });
  }

  // Fetch with a timeout.
  let html = '';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(parsed.toString(), {
      headers: { 'User-Agent': 'FinBudBot/1.0 (+knowledge-base)', Accept: 'text/html' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) return NextResponse.json({ error: `Site returned ${res.status}` }, { status: 422 });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('text/plain')) {
      return NextResponse.json({ error: 'URL is not a web page (expected HTML)' }, { status: 422 });
    }
    html = (await res.text()).slice(0, 2_000_000); // cap at 2MB
  } catch (e: any) {
    return NextResponse.json({ error: e?.name === 'AbortError' ? 'The site took too long to respond' : 'Could not reach the site' }, { status: 502 });
  }

  const { title, text } = htmlToText(html);
  if (!text || text.length < 20) {
    return NextResponse.json({ error: 'No readable text found on that page' }, { status: 422 });
  }

  const content = text.slice(0, 20000); // store up to ~20k chars
  
  if (!user.organizationId) {
    return NextResponse.json({ error: 'No organization attached to user' }, { status: 400 });
  }

  let kb = await db.knowledgeBase.findFirst({ where: { organizationId: user.organizationId, name: 'Default Knowledge Base' } });
  if (!kb) {
    kb = await db.knowledgeBase.create({ data: { organizationId: user.organizationId, name: 'Default Knowledge Base' } });
  }

  const entry = await db.document.create({
    data: {
      knowledgeBaseId: kb.id,
      type: 'url',
      name: title || parsed.hostname,
      content,
      status: 'active'
    },
  });

  return NextResponse.json({ ...entry, chars: content.length }, { status: 201 });
}
