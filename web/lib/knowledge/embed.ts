// Embeddings for the knowledge base.
//
// text-embedding-3-small at its native 1536 dimensions: cheap enough to embed a
// whole document library on upload, and small enough that DocumentChunk keeps a
// plain Float[] instead of needing pgvector.
import OpenAI from 'openai';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

// The API allows far more inputs per request, but 100 keeps each round trip
// well inside the token limit and makes a failure cheap to retry.
const BATCH_SIZE = 100;

// ~2000 tokens, comfortably under the model's 8192 limit even for text that
// tokenises badly (Devanagari, tables, long numbers).
const MAX_INPUT_CHARS = 8000;

export class EmbeddingsNotConfiguredError extends Error {
  constructor() {
    super('OPENAI_API_KEY is not configured, so semantic search is unavailable.');
    this.name = 'EmbeddingsNotConfiguredError';
  }
}

function client(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new EmbeddingsNotConfiguredError();
  return new OpenAI({ apiKey });
}

export function isEmbeddingConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/** Embed many passages, in request-sized batches. One vector per input, in order. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const openai = client();

  // The API rejects an empty string, and dropping that input instead would
  // misalign every vector after it against its chunk.
  const inputs = texts.map((t) => t.trim().slice(0, MAX_INPUT_CHARS) || ' ');

  const out: number[][] = [];
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: inputs.slice(i, i + BATCH_SIZE),
    });
    // Ordering is documented but not guaranteed; index is authoritative.
    const ordered = res.data.slice().sort((a, b) => a.index - b.index);
    for (const item of ordered) out.push(item.embedding);
  }

  if (out.length !== inputs.length) {
    throw new Error('The embedding service returned a different number of vectors than passages sent.');
  }
  return out;
}

/** Embed a single search query. Returns an empty array only for empty input. */
export async function embedQuery(query: string): Promise<number[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const [vector] = await embedTexts([trimmed]);
  return vector ?? [];
}
