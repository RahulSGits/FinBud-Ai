import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { DocumentStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { AuthError, requireAdmin, requireUser, type SessionUser } from '@/lib/auth';
import { requireCompany } from '@/lib/authz';
import { chunkText } from '@/lib/knowledge/chunk';
import { embedTexts, isEmbeddingConfigured } from '@/lib/knowledge/embed';
import { extractDocumentText, isSupportedFile, mimeTypeFor, supportedTypesLabel } from '@/lib/knowledge/extract';
import {
  DEFAULT_MAX_DEPTH, DEFAULT_MAX_PAGES, UrlNotAllowedError, crawlSite,
} from '@/lib/knowledge/fetch-url';

// Extraction plus embedding of a large PDF is minutes of work, all of it in
// this request: the upload is only "done" once the document is searchable.
export const maxDuration = 300;

const MAX_BYTES = 10 * 1024 * 1024;

// Ceiling on one document's passages, so a pathological upload cannot run up an
// unbounded embedding bill. Roughly 1.2 million characters of prose.
const MAX_CHUNKS = 1200;

// Postgres has a parameter limit per statement, and each row carries 1536
// floats — writing in slices keeps a big document from blowing past it.
const WRITE_BATCH = 100;

type DocumentRow = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  error: string | null;
  chunkCount: number;
  uploaderName: string | null;
  createdAt: string;
};

function serialise(doc: any): DocumentRow {
  return {
    id: doc.id,
    name: doc.name,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    status: doc.status,
    error: doc.error,
    chunkCount: doc._count?.chunks ?? 0,
    uploaderName: doc.uploadedBy?.name ?? null,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Keep the logical storage key readable and free of path separators. */
function sanitiseFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'document';
}

// Deliberately asymmetric: any signed-in user may *read* the knowledge base —
// their agents quote it on calls, so they need to know what is in it — but only
// an admin may add to it or remove from it (POST and DELETE below). There is
// one company-wide library, so there is nothing to scope the listing by.
export async function GET() {
  try {
    await requireUser();
  } catch (e) {
    const err = e as AuthError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const docs = await db.document.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      _count: { select: { chunks: true } },
      uploadedBy: { select: { name: true } },
    },
  });

  return NextResponse.json({ documents: docs.map(serialise) });
}

export async function POST(req: NextRequest) {
  let user: SessionUser;
  try {
    user = await requireAdmin();
  } catch (e) {
    const err = e as AuthError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  // Two ways in: a file upload (multipart) or a website to crawl (JSON).
  if (req.headers.get('content-type')?.includes('application/json')) {
    return importFromUrl(req, user);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a multipart/form-data upload with a "file" field.' }, { status: 400 });
  }

  const field = form.get('file');
  if (!field || typeof field === 'string') {
    return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
  }

  const name = (field.name || 'document').trim().slice(0, 200) || 'document';
  if (!isSupportedFile(name)) {
    return NextResponse.json(
      { error: `"${name}" is not a supported file type. Supported types are ${supportedTypesLabel()}.` },
      { status: 400 }
    );
  }
  if (field.size > MAX_BYTES) {
    return NextResponse.json({ error: 'That file is larger than the 10 MB limit.' }, { status: 400 });
  }

  const buffer = Buffer.from(await field.arrayBuffer());
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  }
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'That file is larger than the 10 MB limit.' }, { status: 400 });
  }

  // The id is generated here so the storage key can contain it, and so the row
  // exists — visible in the UI as "processing" — before the slow work starts.
  const companyId = requireCompany(user);
  const id = randomUUID();
  const document = await db.document.create({
    data: {
      id,
      name,
      companyId,
      mimeType: field.type || mimeTypeFor(name),
      sizeBytes: buffer.byteLength,
      // A logical key only. The original binary is never retained: retrieval
      // needs the extracted chunks and nothing else.
      storagePath: `kb/${id}/${sanitiseFilename(name)}`,
      status: DocumentStatus.processing,
      uploadedById: user.id,
    },
  });

  try {
    const text = await extractDocumentText(buffer, name);
    if (!text) {
      throw new Error('No readable text could be extracted. Scanned PDFs need to be run through OCR first.');
    }

    let chunks = chunkText(text);
    if (chunks.length === 0) {
      throw new Error('No readable text could be extracted from this file.');
    }

    const warnings: string[] = [];
    if (chunks.length > MAX_CHUNKS) {
      chunks = chunks.slice(0, MAX_CHUNKS);
      warnings.push(`Only the first ${MAX_CHUNKS} passages of this document were indexed. Split it into smaller files to index all of it.`);
    }

    const { vectors, embedded, warning: embedWarning } = await embedOrDegrade(
      chunks.map((c) => c.content)
    );
    if (embedWarning) warnings.push(embedWarning);

    for (let i = 0; i < chunks.length; i += WRITE_BATCH) {
      const slice = chunks.slice(i, i + WRITE_BATCH);
      await db.documentChunk.createMany({
        data: slice.map((c, n) => ({
          documentId: document.id,
          content: c.content,
          ordinal: c.ordinal,
          embedding: vectors[i + n] ?? [],
        })),
      });
    }

    await db.document.update({
      where: { id: document.id },
      data: { status: DocumentStatus.ready, error: null },
    });

    await db.auditLog.create({
      data: {
        action: 'document.uploaded',
        entity: 'Document',
        entityId: document.id,
        userId: user.id,
        meta: { name, sizeBytes: buffer.byteLength, chunks: chunks.length, embedded },
      },
    });

    const fresh = await db.document.findUnique({
      where: { id: document.id },
      include: {
        _count: { select: { chunks: true } },
        uploadedBy: { select: { name: true } },
      },
    });
    return NextResponse.json(
      {
        document: fresh ? serialise(fresh) : null,
        chunks: chunks.length,
        warning: warnings.length ? warnings.join(' ') : null,
      },
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'The document could not be processed.';
    // Record why on the row itself so the failure survives the page reload, and
    // drop any partial chunks so a broken document never reaches search.
    await db.documentChunk.deleteMany({ where: { documentId: document.id } }).catch(() => undefined);
    await db.document
      .update({ where: { id: document.id }, data: { status: DocumentStatus.failed, error: message.slice(0, 1000) } })
      .catch(() => undefined);

    console.error('document upload failed:', e);
    return NextResponse.json({ error: message, documentId: document.id }, { status: 422 });
  }
}

/**
 * Embed the chunks, degrading to text-only storage rather than failing.
 *
 * Embedding is the one step that depends on someone else's paid service, and it
 * fails in ways that have nothing to do with the document: no key, no billing
 * credit (a 429 "exceeded your quota"), a rate limit, an outage. Throwing away a
 * crawled site or a 40-page PDF because of that would be the wrong trade — the
 * extracted text is the expensive part to reproduce. So the chunks are always
 * stored; only semantic ranking waits for a working key.
 */
async function embedOrDegrade(
  texts: string[]
): Promise<{ vectors: number[][]; embedded: boolean; warning: string | null }> {
  if (!isEmbeddingConfigured()) {
    return {
      vectors: [],
      embedded: false,
      warning:
        'Semantic search is unavailable until OPENAI_API_KEY is configured. The text is stored, so nothing is lost — re-import once a key is in place to make it searchable.',
    };
  }

  try {
    return { vectors: await embedTexts(texts), embedded: true, warning: null };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    const quota = /quota|billing|insufficient/i.test(detail);
    console.error('embedding failed; storing text without vectors:', detail);

    return {
      vectors: [],
      embedded: false,
      warning: quota
        ? 'The text was stored, but it could not be embedded because the OpenAI account has no remaining quota. Add billing credit, then re-import to enable semantic search.'
        : `The text was stored, but embedding failed (${detail.slice(0, 160)}). Re-import once that is resolved to enable semantic search.`,
    };
  }
}

/**
 * Import a website: crawl the origin, then index each page's text as chunks of
 * one Document, prefixed with the page URL so a retrieved passage can be traced
 * back to where it came from.
 */
async function importFromUrl(req: NextRequest, user: SessionUser): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const rawUrl = String(body.url ?? '').trim();
  if (!rawUrl) return NextResponse.json({ error: 'Enter a website address to import.' }, { status: 400 });

  const maxPages = Math.max(1, Math.min(Number(body.maxPages) || DEFAULT_MAX_PAGES, 100));
  const maxDepth = Math.max(0, Math.min(Number(body.maxDepth ?? DEFAULT_MAX_DEPTH), 4));

  let crawl;
  try {
    // Only supply a scheme when there isn't one. Prepending to anything without
    // "http" turns `file:///etc/passwd` into a nonsense host and reports it as a
    // DNS failure instead of the real reason: that scheme is not allowed.
    const target = /^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    crawl = await crawlSite(target, { maxPages, maxDepth });
  } catch (e) {
    // A blocked or unreachable URL is the user's mistake to fix, so it never
    // creates a failed Document row — there would be nothing to retry from.
    const message = e instanceof Error ? e.message : 'That website could not be read.';
    const status = e instanceof UrlNotAllowedError ? 400 : 422;
    return NextResponse.json({ error: message }, { status });
  }

  const host = new URL(crawl.pages[0].url).hostname;
  const name = (crawl.title || host).slice(0, 200);

  const companyId = requireCompany(user);
  const id = randomUUID();
  const document = await db.document.create({
    data: {
      id,
      name,
      companyId,
      mimeType: 'text/html',
      sizeBytes: crawl.pages.reduce((n, p) => n + p.text.length, 0),
      storagePath: `kb/${id}/${host}`,
      status: DocumentStatus.processing,
      uploadedById: user.id,
    },
  });

  try {
    // Chunk per page rather than concatenating: a chunk must not straddle two
    // unrelated pages, and the URL header keeps the citation with the text.
    let chunks = crawl.pages.flatMap((page) =>
      chunkText(`${page.title}\n${page.url}\n\n${page.text}`).map((c) => c.content)
    );
    if (!chunks.length) throw new Error('No readable text could be extracted from that website.');

    const warnings: string[] = [];
    if (chunks.length > MAX_CHUNKS) {
      chunks = chunks.slice(0, MAX_CHUNKS);
      warnings.push(`Only the first ${MAX_CHUNKS} passages were indexed. Import specific sections separately to cover more.`);
    }
    if (crawl.skipped.length) {
      warnings.push(`${crawl.skipped.length} page(s) were skipped (unreadable or too little text).`);
    }

    const { vectors, embedded, warning: embedWarning } = await embedOrDegrade(chunks);
    if (embedWarning) warnings.push(embedWarning);

    for (let i = 0; i < chunks.length; i += WRITE_BATCH) {
      const slice = chunks.slice(i, i + WRITE_BATCH);
      await db.documentChunk.createMany({
        data: slice.map((content, n) => ({
          documentId: document.id,
          content,
          ordinal: i + n,
          embedding: vectors[i + n] ?? [],
        })),
      });
    }

    await db.document.update({ where: { id: document.id }, data: { status: DocumentStatus.ready, error: null } });
    await db.auditLog.create({
      data: {
        action: 'document.imported',
        entity: 'Document',
        entityId: document.id,
        userId: user.id,
        meta: { url: rawUrl, host, pages: crawl.pages.length, chunks: chunks.length, embedded },
      },
    });

    const fresh = await db.document.findUnique({
      where: { id: document.id },
      include: { _count: { select: { chunks: true } }, uploadedBy: { select: { name: true } } },
    });

    return NextResponse.json(
      {
        document: fresh ? serialise(fresh) : null,
        pages: crawl.pages.length,
        chunks: chunks.length,
        skipped: crawl.skipped.slice(0, 10),
        warning: warnings.length ? warnings.join(' ') : null,
      },
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'That website could not be processed.';
    await db.documentChunk.deleteMany({ where: { documentId: document.id } }).catch(() => undefined);
    await db.document
      .update({ where: { id: document.id }, data: { status: DocumentStatus.failed, error: message.slice(0, 1000) } })
      .catch(() => undefined);

    console.error('website import failed:', e);
    return NextResponse.json({ error: message, documentId: document.id }, { status: 422 });
  }
}

export async function DELETE(req: NextRequest) {
  let user: SessionUser;
  try {
    user = await requireAdmin();
  } catch (e) {
    const err = e as AuthError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const document = await db.document.findUnique({ where: { id } });
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  // Chunks cascade with the document.
  await db.document.delete({ where: { id } });
  await db.auditLog.create({
    data: {
      action: 'document.deleted',
      entity: 'Document',
      entityId: id,
      userId: user.id,
      meta: { name: document.name },
    },
  });

  return NextResponse.json({ ok: true });
}
