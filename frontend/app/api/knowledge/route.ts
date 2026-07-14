import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { db } from '@/lib/db';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy' });

export async function GET() {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  let kb = await db.knowledgeBase.findFirst({ where: { organizationId: user.organizationId, name: 'Default Knowledge Base' } });
  if (!kb) {
    kb = await db.knowledgeBase.create({ data: { organizationId: user.organizationId, name: 'Default Knowledge Base' } });
  }

  const documents = await db.document.findMany({ where: { knowledgeBaseId: kb.id }, orderBy: { createdAt: 'desc' } });
  
  const mapped = documents.map(d => ({
    id: d.id,
    title: d.name,
    type: d.type,
    content: d.content ? d.content.slice(0, 100) : '',
    createdAt: d.createdAt,
  }));

  return NextResponse.json(mapped);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const body = await req.json();
  
  let kb = await db.knowledgeBase.findFirst({ where: { organizationId: user.organizationId, name: 'Default Knowledge Base' } });
  if (!kb) {
    kb = await db.knowledgeBase.create({ data: { organizationId: user.organizationId, name: 'Default Knowledge Base' } });
  }

  const doc = await db.document.create({
    data: {
      knowledgeBaseId: kb.id,
      type: body.type || 'text',
      name: body.title || 'Untitled',
      content: body.content,
      status: 'active'
    }
  });

  try {
    const chunks = doc.content.match(/[\s\S]{1,1000}/g) || [];
    if (chunks.length > 0 && process.env.OPENAI_API_KEY) {
      const resp = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: chunks,
      });

      for (let i = 0; i < chunks.length; i++) {
        const embedding = resp.data[i].embedding;
        const embeddingStr = `[${embedding.join(',')}]`;
        await db.$executeRaw`
          INSERT INTO "DocumentEmbedding" (id, "documentId", content, embedding, "createdAt")
          VALUES (gen_random_uuid(), ${doc.id}, ${chunks[i]}, ${embeddingStr}::vector, NOW())
        `;
      }
    }
  } catch (e) {
    console.error('Embedding failed:', e);
  }

  return NextResponse.json({
    id: doc.id,
    title: doc.name,
    type: doc.type,
    content: doc.content ? doc.content.slice(0, 100) : '',
    createdAt: doc.createdAt,
  }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { id } = await req.json();
  await db.document.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
