// Retrieval over the knowledge base.
import { DocumentStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { embedQuery } from './embed';

export interface KnowledgeHit {
  content: string;
  score: number;
  documentName: string;
}

// An exact scan, deliberately.
//
// One lender's knowledge base is a few thousand passages. Scoring every one of
// them in JavaScript costs single-digit milliseconds per thousand and always
// returns the true top N, whereas an ANN index (pgvector) would add an
// extension, a migration and approximate answers to save time we are not
// spending. The candidate cap below is the point at which that stops being
// true and this should be revisited.
const MAX_CANDIDATES = 4000;

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  // A zero vector has no direction, so similarity is undefined rather than 1.
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Top matching passages for a natural-language question, most similar first. */
export async function searchKnowledge(query: string, limit = 5): Promise<KnowledgeHit[]> {
  const vector = await embedQuery(query);
  if (vector.length === 0) return [];

  const chunks = await db.documentChunk.findMany({
    where: { document: { status: DocumentStatus.ready } },
    select: { content: true, embedding: true, document: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
    take: MAX_CANDIDATES,
  });

  const scored: KnowledgeHit[] = [];
  for (const chunk of chunks) {
    // Passages stored before an API key existed have no vector. They stay
    // readable in the dashboard and become searchable once re-uploaded.
    if (chunk.embedding.length !== vector.length) continue;

    const score = cosine(vector, chunk.embedding);
    if (score <= 0) continue;
    scored.push({ content: chunk.content, score, documentName: chunk.document.name });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, Math.min(Math.floor(limit), 20)));
}
