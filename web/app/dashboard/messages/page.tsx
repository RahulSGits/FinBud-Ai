import type { Prisma } from '@prisma/client';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/shell/page-header';
import { TemplateManager, type TemplateRow } from '@/components/messaging/template-manager';

export const dynamic = 'force-dynamic';

export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // The same rule the templates API applies, and the same one `visibleAgents`
  // uses for agents: an employee may *use* anything the company has published,
  // and additionally sees their own drafts. Admins see the lot.
  const where: Prisma.MessageTemplateWhereInput =
    user.role === 'admin' ? {} : { OR: [{ isActive: true }, { createdById: user.id }] };

  const rows = await db.messageTemplate.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      createdBy: { select: { name: true } },
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
        subtitle="Written once, sent on WhatsApp to follow up your leads after a call"
      />
      <div className="px-6 pb-10 space-y-6">
        <TemplateManager
          templates={templates}
          currentUserId={user.id}
          isAdmin={user.role === 'admin'}
        />
      </div>
    </>
  );
}
