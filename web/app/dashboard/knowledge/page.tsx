import { redirect } from 'next/navigation';
import { AlertTriangle, CheckCircle2, FileText, Info, Layers, Loader2 } from 'lucide-react';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { visibleDocuments } from '@/lib/authz';
import { PageHeader } from '@/components/shell/page-header';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, string> = {
  ready: 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400',
  processing: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  uploading: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  failed: 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function EmployeeKnowledgePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // One company-wide library, readable by everyone: there is nothing here to
  // scope to the current user. Writing to it stays with the admin screen.
  const docs = await db.document.findMany({
    where: visibleDocuments(user),
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      _count: { select: { chunks: true } },
      uploadedBy: { select: { name: true } },
    },
  });

  const passages = docs.reduce((n, d) => n + d._count.chunks, 0);
  const subtitle = docs.length
    ? `${docs.length} document${docs.length === 1 ? '' : 's'} · ${passages} searchable passage${passages === 1 ? '' : 's'}`
    : 'Documents your AI agents can draw on during calls';

  return (
    <>
      <PageHeader title="Knowledge base" subtitle={subtitle} />

      <div className="px-6 pb-10 space-y-6">
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-4 py-3.5">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-brand-500/10 flex items-center justify-center">
            <Info className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-white">What your agents already know</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Your AI agents search these documents mid-call and quote them back to the customer. The library is
              maintained by an administrator — ask them to add, replace or remove anything.
            </p>
          </div>
        </div>

        {docs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 px-6 py-16 text-center">
            <FileText className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No documents yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Nothing has been added to the knowledge base. Ask your administrator to upload the policies, rate sheets
              and product FAQs your agents should be able to quote.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="sticky top-0 z-10 bg-white dark:bg-[#0a1128]">
                  <tr className="border-b border-slate-200 dark:border-white/10 text-left text-xs text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-3 font-medium">Document</th>
                    <th className="px-4 py-3 font-medium text-right">Passages</th>
                    <th className="px-4 py-3 font-medium text-right">Size</th>
                    <th className="px-4 py-3 font-medium">Added by</th>
                    <th className="px-4 py-3 font-medium text-right">Added</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                  {docs.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={cn(
                            'w-8 h-8 shrink-0 rounded-lg flex items-center justify-center',
                            d.mimeType === 'application/pdf'
                              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                          )}>
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 dark:text-white truncate">{d.name}</p>
                            {d.status === 'failed' && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                                This document could not be indexed, so agents cannot quote it.
                              </p>
                            )}
                            {d.status === 'ready' && d._count.chunks === 0 && (
                              <p className="text-xs text-slate-500 mt-0.5">No passages were indexed from this file.</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-slate-400" />
                          {d._count.chunks}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {formatBytes(d.sizeBytes)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 truncate">
                        {d.uploadedBy?.name || '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-500 tabular-nums">
                        {d.createdAt.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium',
                          STATUS_TONE[d.status] ?? 'bg-slate-100 dark:bg-white/5 text-slate-500'
                        )}>
                          {d.status === 'ready' && <CheckCircle2 className="w-3 h-3" />}
                          {(d.status === 'processing' || d.status === 'uploading') && <Loader2 className="w-3 h-3 animate-spin" />}
                          {d.status === 'failed' && <AlertTriangle className="w-3 h-3" />}
                          {d.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
