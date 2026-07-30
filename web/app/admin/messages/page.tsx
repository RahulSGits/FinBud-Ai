import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/shell/page-header';
import { TemplateManager, type TemplateRow } from '@/components/messaging/template-manager';

export const dynamic = 'force-dynamic';

export default async function AdminMessagesPage() {
  // Re-checked here as well as in the layout: a layout is not re-executed on
  // every client-side navigation, so the page owns its own gate.
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/dashboard');

  const rows = await db.messageTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      createdBy: { select: { name: true } },
      // Drives the delete warning: how much history a template is already
      // attached to is the thing an author wants to know before removing it.
      _count: { select: { messages: true } },
    },
  });

  const templates: TemplateRow[] = rows.map((t) => ({
    id: t.id,
    name: t.name,
    body: t.body,
    leadStatus: t.leadStatus,
    isActive: t.isActive,
    createdById: t.createdById,
    authorName: t.createdBy ? t.createdBy.name : null,
    updatedAt: t.updatedAt.toISOString(),
    sentCount: t._count.messages,
  }));

  return (
    <>
      <PageHeader
        title="Message templates"
        subtitle="Written once, sent on WhatsApp to follow up a lead after a call"
      />
      <div className="px-6 pb-10 space-y-6">
        <TemplateManager templates={templates} currentUserId={user.id} isAdmin />
      </div>
    </>
  );
}
