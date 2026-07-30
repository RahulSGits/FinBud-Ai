// Splitting documents into embeddable passages.
//
// Paragraph boundaries first, sentence boundaries second: a chunk cut mid
// sentence embeds as a fragment no customer question ever resembles, which is
// the single biggest cause of bad retrieval.

export interface Chunk {
  content: string;
  ordinal: number;
}

export interface ChunkOptions {
  size?: number;
  overlap?: number;
}

/** ~1000 characters is roughly 250 tokens — a whole idea, well inside the model limit. */
export const CHUNK_SIZE = 1000;

/** Carried into the next chunk so an answer spanning a boundary is still retrievable. */
export const CHUNK_OVERLAP = 150;

interface Unit {
  text: string;
  newParagraph: boolean;
}

export function chunkText(text: string, options: ChunkOptions = {}): Chunk[] {
  const size = Math.max(200, options.size ?? CHUNK_SIZE);
  const overlap = Math.min(Math.max(0, options.overlap ?? CHUNK_OVERLAP), Math.floor(size / 2));

  const normalised = text.replace(/\r\n?/g, '\n').trim();
  if (!normalised) return [];

  const units: Unit[] = [];
  for (const paragraph of normalised.split(/\n{2,}/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (trimmed.length <= size) {
      units.push({ text: trimmed, newParagraph: true });
      continue;
    }

    let first = true;
    for (const sentence of splitSentences(trimmed)) {
      const pieces = sentence.length <= size ? [sentence] : hardSplit(sentence, size);
      for (const piece of pieces) {
        units.push({ text: piece, newParagraph: first });
        first = false;
      }
    }
  }

  const chunks: Chunk[] = [];
  let buffer = '';

  const flush = () => {
    const content = buffer.trim();
    if (content) chunks.push({ content, ordinal: chunks.length });
  };

  for (const unit of units) {
    const separator = unit.newParagraph ? '\n\n' : ' ';

    if (!buffer) {
      buffer = unit.text;
      continue;
    }

    if (buffer.length + separator.length + unit.text.length <= size) {
      buffer += separator + unit.text;
      continue;
    }

    flush();
    const carried = tailOverlap(buffer, overlap);
    buffer = carried ? carried + separator + unit.text : unit.text;
  }
  flush();

  return chunks;
}

/**
 * Split on terminal punctuation, keeping any closing quote or bracket with the
 * sentence it belongs to. A newline also ends a sentence: extracted PDFs and
 * markdown lists rarely punctuate their lines.
 */
function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '\n') continue;

    let end = i + 1;
    while (end < text.length && /[.!?"'’”)\]]/.test(text[end])) end++;

    // Only a boundary if whitespace or the end of the text follows, so
    // decimals and abbreviations stay intact.
    if (end < text.length && !/\s/.test(text[end])) continue;

    const piece = text.slice(start, end).trim();
    if (piece) out.push(piece);
    start = end;
    i = end - 1;
  }

  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/** Last resort for text with no sentence structure at all, such as minified JSON. */
function hardSplit(text: string, size: number): string[] {
  const out: string[] = [];
  let i = 0;

  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    if (end < text.length) {
      const space = text.lastIndexOf(' ', end);
      if (space > i + size * 0.6) end = space;
    }
    const piece = text.slice(i, end).trim();
    if (piece) out.push(piece);
    i = end;
  }

  return out;
}

/** The tail of a chunk, advanced to a sentence or word boundary so it never starts mid-word. */
function tailOverlap(text: string, overlap: number): string {
  if (overlap <= 0) return '';
  const slice = text.slice(-overlap);
  if (slice.length === text.length) return '';

  const sentence = slice.search(/(?:[.!?]\s|\n)/);
  if (sentence !== -1) {
    const after = slice.slice(sentence).replace(/^[.!?]?\s+/, '').trim();
    if (after) return after;
  }

  const space = slice.indexOf(' ');
  return space === -1 ? '' : slice.slice(space + 1).trim();
}
