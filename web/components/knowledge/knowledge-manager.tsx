'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, CheckCircle2, FileText, Globe, Layers, Loader2, Trash2, UploadCloud, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface KnowledgeDoc {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  error: string | null;
  chunkCount: number;
  uploaderName: string | null;
  createdAt: string;
}

// Duplicated from lib/knowledge/extract rather than imported: that module pulls
// in the PDF parser, which has no business in a browser bundle.
const ACCEPTED = ['.pdf', '.txt', '.md', '.markdown', '.csv', '.json'];
const MAX_BYTES = 10 * 1024 * 1024;

const STATUS_TONE: Record<string, string> = {
  ready: 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400',
  processing: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  uploading: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  failed: 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400',
};

interface UploadItem {
  key: string;
  name: string;
  size: number;
  progress: number;
  phase: 'uploading' | 'processing' | 'error';
  error?: string;
}

export function KnowledgeManager({ documents }: { documents: KnowledgeDoc[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const counter = useRef(0);

  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<KnowledgeDoc | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [siteUrl, setSiteUrl] = useState('');
  const [maxPages, setMaxPages] = useState(25);
  const [maxDepth, setMaxDepth] = useState(2);
  const [importing, setImporting] = useState(false);

  // Keeps the "added 4m ago" column honest while the page sits open.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  async function uploadOne(file: File) {
    if (!ACCEPTED.includes(extensionOf(file.name))) {
      toast.error(`${file.name} is not a supported file type. Use ${ACCEPTED.join(', ')}.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`${file.name} is larger than the 10 MB limit.`);
      return;
    }

    counter.current += 1;
    const key = `upload-${counter.current}`;
    setUploads((prev) => [...prev, { key, name: file.name, size: file.size, progress: 0, phase: 'uploading' }]);

    const patch = (changes: Partial<UploadItem>) =>
      setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...changes } : u)));
    const drop = () => setUploads((prev) => prev.filter((u) => u.key !== key));

    try {
      const res = await send(file, (pct) =>
        patch({ progress: pct, phase: pct >= 100 ? 'processing' : 'uploading' })
      );

      if (res.ok) {
        drop();
        const chunks = Number(res.data?.chunks ?? 0);
        toast.success(`${file.name} indexed — ${chunks} passage${chunks === 1 ? '' : 's'} ready`);
        if (typeof res.data?.warning === 'string' && res.data.warning) setWarning(res.data.warning);
        router.refresh();
        return;
      }

      const message = String(res.data?.error || 'The upload failed.');
      toast.error(message);
      if (res.data?.documentId) {
        // The document row exists and carries the reason, so let the list own it.
        drop();
        router.refresh();
      } else {
        patch({ phase: 'error', progress: 100, error: message });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'The upload failed.';
      toast.error(message);
      patch({ phase: 'error', error: message });
    }
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    for (const file of files) await uploadOne(file);
  }

  async function importUrl(e: React.FormEvent) {
    e.preventDefault();
    const url = siteUrl.trim();
    if (!url) return;

    setImporting(true);
    setWarning(null);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, maxPages, maxDepth }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not import that website');

      toast.success(
        `Imported ${data.pages} page${data.pages === 1 ? '' : 's'} — ${data.chunks} passage${data.chunks === 1 ? '' : 's'} indexed`
      );
      if (data.warning) setWarning(data.warning);
      setSiteUrl('');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not import that website');
    } finally {
      setImporting(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents?id=${encodeURIComponent(pendingDelete.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete the document');

      toast.success(`${pendingDelete.name} removed`);
      setPendingDelete(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the document');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        // dragleave also fires when the pointer crosses onto a child, which
        // would otherwise flicker the highlight off and on.
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); }
        }}
        className={cn(
          'rounded-2xl border border-dashed px-6 py-10 text-center cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
          dragging
            ? 'border-brand-500 bg-brand-500/[0.06]'
            : 'border-slate-300 dark:border-white/10 hover:border-brand-500/50 hover:bg-slate-50 dark:hover:bg-white/[0.02]'
        )}
      >
        <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-brand-500/10 flex items-center justify-center">
          <UploadCloud className="w-5 h-5 text-brand-600 dark:text-brand-400" />
        </div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {dragging ? 'Drop to upload' : 'Drag a document here, or click to choose one'}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {ACCEPTED.join(', ')} · up to 10 MB. Text is extracted, split into passages and embedded so agents can quote it on a call.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED.join(',')}
          className="hidden"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {/* Import a website */}
      <form
        onSubmit={importUrl}
        className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5"
      >
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Import a website</h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Give a starting address and we read that page and the pages it links to on the same
          site, then index the text the same way as an uploaded document.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            inputMode="url"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="financebuddha.com/home-loan"
            disabled={importing}
            className="flex-1 h-10 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={importing || !siteUrl.trim()}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors shrink-0"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            {importing ? 'Reading site…' : 'Import'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3">
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            Pages at most
            <input
              type="number"
              min={1}
              max={100}
              value={maxPages}
              onChange={(e) => setMaxPages(Math.max(1, Math.min(Number(e.target.value) || 1, 100)))}
              disabled={importing}
              className="w-20 h-8 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-2 text-sm tabular-nums text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            Link depth
            <select
              value={maxDepth}
              onChange={(e) => setMaxDepth(Number(e.target.value))}
              disabled={importing}
              className="h-8 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
            >
              <option value={0}>This page only</option>
              <option value={1}>1 level of links</option>
              <option value={2}>2 levels</option>
              <option value={3}>3 levels</option>
            </select>
          </label>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Only pages on the same site are followed. Larger crawls take longer.
          </p>
        </div>
      </form>

      {warning && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Stored, but not yet searchable</p>
            <p className="text-xs text-amber-700/90 dark:text-amber-400/80 mt-0.5">{warning}</p>
          </div>
          <button
            onClick={() => setWarning(null)}
            className="p-1 -mr-1 text-amber-600/70 hover:text-amber-700 dark:hover:text-amber-300"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {uploads.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] divide-y divide-slate-100 dark:divide-white/[0.06]"
          >
            {uploads.map((u) => (
              <li key={u.key} className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  {u.phase === 'error'
                    ? <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    : <Loader2 className="w-4 h-4 text-brand-500 animate-spin shrink-0" />}
                  <span className="text-sm font-medium text-slate-900 dark:text-white truncate flex-1">{u.name}</span>
                  <span className="text-xs text-slate-400 tabular-nums shrink-0">{formatBytes(u.size)}</span>
                  <span className="text-xs text-slate-500 tabular-nums shrink-0">
                    {u.phase === 'uploading' ? `${u.progress}%` : u.phase === 'processing' ? 'Extracting & embedding…' : 'Failed'}
                  </span>
                  {u.phase === 'error' && (
                    <button
                      onClick={() => setUploads((prev) => prev.filter((x) => x.key !== u.key))}
                      className="p-1 -mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {u.phase !== 'error' && (
                  <div className="h-1.5 mt-2.5 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full bg-brand-500 transition-all duration-300',
                        u.phase === 'processing' && 'animate-pulse'
                      )}
                      style={{ width: `${Math.max(4, u.progress)}%` }}
                    />
                  </div>
                )}
                {u.error && <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">{u.error}</p>}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {documents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 px-6 py-16 text-center">
          <FileText className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No documents yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Policies, rate sheets and product FAQs go here. Agents with the knowledge base enabled search them mid-call.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="sticky top-0 z-10 bg-white dark:bg-[#0a1128]">
                <tr className="border-b border-slate-200 dark:border-white/10 text-left text-xs text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3 font-medium">Document</th>
                  <th className="px-4 py-3 font-medium text-right">Passages</th>
                  <th className="px-4 py-3 font-medium text-right">Size</th>
                  <th className="px-4 py-3 font-medium">Uploaded by</th>
                  <th className="px-4 py-3 font-medium text-right">Added</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {documents.map((d) => (
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
                          {d.status === 'failed' && d.error && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{d.error}</p>
                          )}
                          {d.status === 'ready' && d.chunkCount === 0 && (
                            <p className="text-xs text-slate-500 mt-0.5">No passages were indexed from this file.</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-slate-400" />
                        {d.chunkCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{formatBytes(d.sizeBytes)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 truncate">{d.uploaderName || '—'}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500" suppressHydrationWarning>
                      {relativeTime(d.createdAt)}
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
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setPendingDelete(d)}
                        title="Delete document"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {pendingDelete && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !deleting && setPendingDelete(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 p-6"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 shrink-0 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Delete this document?</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{pendingDelete.name}</span> and its{' '}
                    {pendingDelete.chunkCount} indexed passage{pendingDelete.chunkCount === 1 ? '' : 's'} are removed for good.
                    Agents stop drawing on it immediately.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  onClick={() => setPendingDelete(null)}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
                >
                  Keep it
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

interface UploadResult {
  ok: boolean;
  status: number;
  data: any;
}

// XHR rather than fetch: only XHR reports upload progress, and a 10 MB PDF on a
// mobile connection is long enough that a progress bar is the difference
// between "working" and "broken".
function send(file: File, onProgress: (pct: number) => void): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/documents');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      onProgress(100);
      let data: any = {};
      try { data = JSON.parse(xhr.responseText); } catch { data = {}; }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error('The upload could not reach the server.'));
    xhr.ontimeout = () => reject(new Error('The upload timed out.'));
    xhr.send(form);
  });
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
