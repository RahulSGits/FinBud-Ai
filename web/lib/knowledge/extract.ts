// Plain-text extraction for the knowledge base.
//
// Only the extracted text is ever persisted. Retrieval works on chunks, so the
// original binary buys nothing and storing it would mean running object storage
// for this one feature.
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf';

export const SUPPORTED_EXTENSIONS = ['.pdf', '.txt', '.md', '.markdown', '.csv', '.json'] as const;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
};

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

export function isSupportedFile(filename: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
}

export function supportedTypesLabel(): string {
  return SUPPORTED_EXTENSIONS.join(', ');
}

/** Best-effort MIME type from the filename, for files the browser did not label. */
export function mimeTypeFor(filename: string, fallback = 'application/octet-stream'): string {
  return MIME_BY_EXTENSION[extensionOf(filename)] ?? fallback;
}

/**
 * Extract plain text from an uploaded file.
 *
 * Throws with the list of supported types when the extension is not one we can
 * read, so the caller can hand the message straight to the user.
 */
export async function extractDocumentText(buffer: Buffer, filename: string): Promise<string> {
  const ext = extensionOf(filename);

  if (ext === '.pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return normalise(text);
  }

  if ((SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return normalise(new TextDecoder('utf-8').decode(buffer));
  }

  throw new Error(
    `${ext ? `"${ext}" files are not supported` : 'That file has no recognisable extension'}. Supported types are ${supportedTypesLabel()}.`
  );
}

/**
 * PDF extraction emits ragged spacing — hard-wrapped lines, non-breaking
 * spaces, runs of blank lines from page furniture. Flattening it here means the
 * chunker sees the same shape whatever the source format was.
 */
function normalise(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
