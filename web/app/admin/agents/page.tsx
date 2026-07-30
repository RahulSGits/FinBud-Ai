import Link from 'next/link';
import { Bot, Plus, PhoneCall, Megaphone, Mic, Languages, CheckCircle2, CloudOff, AlertTriangle } from 'lucide-react';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { getProvider } from '@/lib/providers';
import { PageHeader } from '@/components/shell/page-header';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function relative(date: Date | null): string {
  if (!date) return 'never';
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function AgentsPage() {
  // Re-checked here as well as in the layout: a layout is not re-executed on
  // every client-side navigation, so the page owns its own gate.
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/dashboard');

  const agents = await db.agent.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { calls: true, campaigns: true } } },
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

  return (
    <>
      <PageHeader
        title="AI agents"
        subtitle={`${agents.length} agent${agents.length === 1 ? '' : 's'}`}
        action={
          <Link href="/admin/agents/new" className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors">
            <Plus className="w-4 h-4" /> New agent
          </Link>
        }
      />
      <div className="px-6 pb-10">
        {agents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 px-6 py-16 text-center">
            <Bot className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No agents yet</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">Describe what you want in a sentence and we&apos;ll draft the whole thing.</p>
            <Link href="/admin/agents/new" className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold">
              <Plus className="w-4 h-4" /> Create your first agent
            </Link>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/admin/agents/${a.id}`}
                  className="group flex h-full flex-col rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 hover:border-brand-500/40 dark:hover:border-brand-500/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    </div>
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-[11px] font-medium',
                      a.isActive ? 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400'
                                 : 'bg-slate-100 dark:bg-white/5 text-slate-500'
                    )}>
                      {a.isActive ? 'Active' : 'Draft'}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {a.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 min-h-[2rem]">
                    {a.description || 'No description'}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <Mic className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        {a.voiceId ? voiceNames.get(a.voiceId) ?? a.voiceId : 'Default voice'}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <Languages className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{languageNames.get(a.language) ?? a.language}</span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-auto pt-3 border-t border-slate-100 dark:border-white/5 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5"><PhoneCall className="w-3.5 h-3.5" />{a._count.calls} calls</span>
                    <span className="inline-flex items-center gap-1.5"><Megaphone className="w-3.5 h-3.5" />{a._count.campaigns}</span>
                    {a.syncError ? (
                      <span title={a.syncError} className="inline-flex items-center gap-1.5 min-w-0 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Sync failed</span>
                      </span>
                    ) : a.syncedAt ? (
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />Synced {relative(a.syncedAt)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <CloudOff className="w-3.5 h-3.5" />Not synced
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
