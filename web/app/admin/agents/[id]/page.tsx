import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/shell/page-header';
import { AgentBuilder } from '@/components/agents/agent-builder';

export const dynamic = 'force-dynamic';

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export default async function AgentPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/dashboard');

  const agent = await db.agent.findUnique({
    where: { id: params.id },
    include: { _count: { select: { calls: true, campaigns: true } } },
  });
  if (!agent) notFound();

  return (
    <>
      <PageHeader
        title={agent.name}
        subtitle={`${agent.isActive ? 'Active' : 'Draft'} · ${plural(agent._count.calls, 'call')} · ${plural(agent._count.campaigns, 'campaign')}`}
        action={
          <Link
            href="/admin/agents"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> All agents
          </Link>
        }
      />
      <div className="px-6 pb-12">
        <AgentBuilder
          initial={{
            id: agent.id,
            name: agent.name,
            // Nulls become empty strings so every input stays controlled.
            description: agent.description ?? '',
            firstMessage: agent.firstMessage ?? '',
            systemPrompt: agent.systemPrompt ?? '',
            businessContext: agent.businessContext ?? '',
            callObjective: agent.callObjective ?? '',
            qualificationRules: agent.qualificationRules ?? '',
            objectionHandling: agent.objectionHandling ?? '',
            complianceRules: agent.complianceRules ?? '',
            closingScript: agent.closingScript ?? '',
            llmModel: agent.llmModel,
            sttModel: agent.sttModel,
            ttsModel: agent.ttsModel,
            voiceId: agent.voiceId ?? '',
            language: agent.language,
            transferEnabled: agent.transferEnabled,
            transferNumber: agent.transferNumber ?? '',
            useKnowledgeBase: agent.useKnowledgeBase,
            isActive: agent.isActive,
            syncedAt: agent.syncedAt ? agent.syncedAt.toISOString() : null,
            syncError: agent.syncError,
          }}
        />
      </div>
    </>
  );
}
