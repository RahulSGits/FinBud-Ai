import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/shell/page-header';
import { AgentBuilder } from '@/components/agents/agent-builder';

export default function NewEmployeeAgentPage() {
  return (
    <>
      <PageHeader
        title="New AI agent"
        subtitle="Describe it, review the draft, then activate"
        action={
          <Link
            href="/dashboard/agents"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> All agents
          </Link>
        }
      />
      <div className="px-6 pb-12">
        <AgentBuilder basePath="/dashboard/agents" />
      </div>
    </>
  );
}
