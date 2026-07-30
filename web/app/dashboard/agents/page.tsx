import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Bot, Plus, PhoneCall, Megaphone, Mic, Languages, Lock, UserRound, Sparkles,
} from 'lucide-react';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isAdmin, visibleAgents } from '@/lib/authz';
import { getProvider } from '@/lib/providers';
import { PageHeader } from '@/components/shell/page-header';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface AgentCardData {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  language: string;
  voiceId: string | null;
  authorName: string | null;
  calls: number;
  campaigns: number;
}

export default async function MyAgentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const agents = await db.agent.findMany({
    where: visibleAgents(user),
    orderBy: { updatedAt: 'desc' },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { calls: true, campaigns: true } },
    },
  });

  // Resolve voice and language ids to human names once per engine in use. A
  // provider outage must not take this page down, so unresolved ids are shown
  // as they are stored.
  const voiceNames = new Map<string, string>();
  const languageNames = new Map<string, string>();
  await Promise.all(
    Array.from(new Set(agents.map((a) => a.voiceProvider))).map(async (id) => {
      const provider = getProvider(id);
      const [voices, languages] = await Promise.allSettled([provider.listVoices(), provider.listLanguages()]);
      if (voices.status === 'fulfilled') for (const v of voices.value) voiceNames.set(v.id, v.name);
      if (languages.status === 'fulfilled') for (const l of languages.value) languageNames.set(l.code, l.name);
    })
  );

  const cards: AgentCardData[] = agents.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    isActive: a.isActive,
    language: languageNames.get(a.language) ?? a.language,
    voiceId: a.voiceId ? voiceNames.get(a.voiceId) ?? a.voiceId : null,
    authorName: a.createdBy?.name ?? null,
    calls: a._count.calls,
    campaigns: a._count.campaigns,
  }));

  const mineIds = new Set(agents.filter((a) => a.createdById === user.id).map((a) => a.id));
  const mine = cards.filter((c) => mineIds.has(c.id));
  const company = cards.filter((c) => !mineIds.has(c.id));

  // An admin browsing the employee view still owns every agent, so their
  // colleagues' agents are shown as editable rather than locked.
  const admin = isAdmin(user);

  return (
    <>
      <PageHeader
        title="My agents"
        subtitle={
          agents.length === 0
            ? 'Author the AI that speaks to your leads'
            : `${mine.length} of your own · ${company.length} from the team`
        }
        action={
          <Link
            href="/dashboard/agents/new"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> New agent
          </Link>
        }
      />

      <div className="px-6 pb-10 space-y-6">
        {agents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 px-6 py-16 text-center">
            <Bot className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No agents yet</p>
            <p className="text-xs text-slate-500 mt-1 mb-4 max-w-sm mx-auto">
              Describe the agent you want in one sentence — the opening line, persona, objections
              and closing get drafted for you. Nothing goes live until you say so.
            </p>
            <Link
              href="/dashboard/agents/new"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold"
            >
              <Sparkles className="w-4 h-4" /> Draft my first agent
            </Link>
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">My agents</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Yours to edit, activate and delete.
                </p>
              </div>

              {mine.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 px-6 py-10 text-center">
                  <Bot className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2.5" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    You haven&apos;t written an agent yet
                  </p>
                  <p className="text-xs text-slate-500 mt-1 mb-4 max-w-sm mx-auto">
                    Describe one in a sentence and every section gets drafted for you to review.
                  </p>
                  <Link
                    href="/dashboard/agents/new"
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold"
                  >
                    <Sparkles className="w-4 h-4" /> Draft an agent
                  </Link>
                </div>
              ) : (
                <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {mine.map((a) => (
                    <li key={a.id}>
                      <AgentCard agent={a} locked={false} showAuthor={false} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {company.length > 0 && (
              <section className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Company agents</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {admin
                      ? 'Written by your colleagues. You can open and change any of them.'
                      : 'Written by your colleagues. Use them in your campaigns — only their author can change them.'}
                  </p>
                </div>
                <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {company.map((a) => (
                    <li key={a.id}>
                      <AgentCard agent={a} locked={!admin} showAuthor />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

function AgentCard({
  agent, locked, showAuthor,
}: {
  agent: AgentCardData;
  locked: boolean;
  showAuthor: boolean;
}) {
  return (
    <Link
      href={`/dashboard/agents/${agent.id}`}
      className="group flex h-full flex-col rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 hover:border-brand-500/40 dark:hover:border-brand-500/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center">
          <Bot className="w-4 h-4 text-brand-600 dark:text-brand-400" />
        </div>
        <div className="flex items-center gap-1.5">
          {locked && (
            <span
              title="Read-only — you did not create this agent"
              className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-white/5 text-slate-500 inline-flex items-center gap-1"
            >
              <Lock className="w-3 h-3" /> Read-only
            </span>
          )}
          <span className={cn(
            'px-2 py-0.5 rounded-full text-[11px] font-medium',
            agent.isActive ? 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400'
                           : 'bg-slate-100 dark:bg-white/5 text-slate-500'
          )}>
            {agent.isActive ? 'Active' : 'Draft'}
          </span>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
        {agent.name}
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 min-h-[2rem]">
        {agent.description || 'No description'}
      </p>

      {showAuthor && (
        <p className="inline-flex items-center gap-1.5 mt-2 text-xs text-slate-500 dark:text-slate-400 min-w-0">
          <UserRound className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{agent.authorName ?? 'Author removed'}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <Mic className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{agent.voiceId ?? 'Default voice'}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <Languages className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{agent.language}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-auto pt-3 border-t border-slate-100 dark:border-white/5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <PhoneCall className="w-3.5 h-3.5" />
          {agent.calls} call{agent.calls === 1 ? '' : 's'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Megaphone className="w-3.5 h-3.5" />
          {agent.campaigns} campaign{agent.campaigns === 1 ? '' : 's'}
        </span>
      </div>
    </Link>
  );
}
