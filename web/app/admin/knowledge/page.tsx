import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/shell/page-header';
import { KnowledgeManager, type KnowledgeDoc } from '@/components/knowledge/knowledge-manager';

export const dynamic = 'force-dynamic';

export default async function KnowledgePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/dashboard');

  const docs = await db.document.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      _count: { select: { chunks: true } },
      uploadedBy: { select: { name: true } },
    },
  });

  const documents: KnowledgeDoc[] = docs.map((d) => ({
    id: d.id,
    name: d.name,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    status: d.status,
    error: d.error,
    chunkCount: d._count.chunks,
    uploaderName: d.uploadedBy?.name ?? null,
    createdAt: d.createdAt.toISOString(),
  }));

  const passages = documents.reduce((n, d) => n + d.chunkCount, 0);
  const subtitle = documents.length
    ? `${documents.length} document${documents.length === 1 ? '' : 's'} · ${passages} searchable passage${passages === 1 ? '' : 's'}`
    : 'Documents your AI agents can draw on during calls';

  return (
    <>
      <PageHeader title="Knowledge base" subtitle={subtitle} />
      <div className="px-6 pb-10 space-y-6">
        <KnowledgeManager documents={documents} />
      </div>
    </>
  );
}
