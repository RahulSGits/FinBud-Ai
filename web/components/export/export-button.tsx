'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Format = 'csv' | 'xlsx';

const CHOICES: { format: Format; label: string; hint: string; icon: LucideIcon }[] = [
  { format: 'csv', label: 'CSV', hint: 'Opens anywhere', icon: FileText },
  { format: 'xlsx', label: 'Excel', hint: 'Formatted .xlsx', icon: FileSpreadsheet },
];

// Fixed locale so the row count in the toast matches the rest of the app's
// Indian digit grouping (1,00,000 rather than 100,000).
const NUMBER = new Intl.NumberFormat('en-IN');

export interface ExportButtonProps {
  /** Export kind understood by /api/export: interested | contacts | calls | campaign. */
  type: string;
  /** Extra query parameters. Empty and nullish values are dropped. */
  params?: Record<string, string | number | null | undefined>;
  label?: string;
  variant?: 'primary' | 'secondary';
  /** Which edge the menu is pinned to — 'right' keeps it on screen in a toolbar. */
  align?: 'left' | 'right';
  icon?: LucideIcon;
  className?: string;
}

/** `attachment; filename="finbud-…csv"` → `finbud-…csv`. */
function filenameFrom(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const quoted = /filename="([^"]+)"/.exec(header);
  if (quoted) return quoted[1];
  const bare = /filename=([^;]+)/.exec(header);
  return bare ? bare[1].trim() : fallback;
}

export function ExportButton({
  type,
  params,
  label = 'Export',
  variant = 'secondary',
  align = 'right',
  icon: Icon = Download,
  className,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Format | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function run(format: Format) {
    setOpen(false);
    setBusy(format);

    try {
      const query = new URLSearchParams({ type, format });
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value === null || value === undefined || value === '') return;
          query.set(key, String(value));
        });
      }

      // Fetched rather than navigated to via <a href>: the session cookie rides
      // along, and a 403 or a "nothing to export" comes back as a readable
      // message instead of a browser tab full of JSON.
      const res = await fetch(`/api/export?${query.toString()}`, { credentials: 'same-origin' });
      const contentType = res.headers.get('content-type') ?? '';

      if (!res.ok || contentType.includes('application/json')) {
        const data = await res.json().catch(() => ({} as { error?: string; message?: string }));
        if (!res.ok) throw new Error(data.error || `Export failed (${res.status})`);
        // 200 + JSON is the empty case — never download a file with no rows in it.
        toast.info(data.message || 'Nothing to export yet');
        return;
      }

      const blob = await res.blob();
      const rows = Number(res.headers.get('X-Export-Rows') ?? 0);
      const truncated = res.headers.get('X-Export-Truncated') === 'true';
      const limit = Number(res.headers.get('X-Export-Limit') ?? 0);
      const filename = filenameFrom(
        res.headers.get('content-disposition'),
        `finbud-${type}.${format}`
      );

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revoked on a later tick: Safari aborts the download if the object URL
      // disappears in the same frame as the click.
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);

      toast.success(
        `${NUMBER.format(rows)} row${rows === 1 ? '' : 's'} exported to ${filename}`
      );
      if (truncated && limit > 0) {
        toast.warning(
          `Only the first ${NUMBER.format(limit)} rows were included — narrow the filters for the rest.`
        );
      }
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  }

  const trigger =
    variant === 'primary'
      ? 'inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors disabled:opacity-50'
      : 'inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50';

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        className={trigger}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
        {busy ? 'Preparing…' : label}
        <ChevronDown
          className={cn('w-3.5 h-3.5 opacity-70 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-40 mt-2 w-52 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0a1128] shadow-xl shadow-slate-900/10 p-1.5',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {CHOICES.map((choice) => (
            <button
              key={choice.format}
              type="button"
              role="menuitem"
              onClick={() => run(choice.format)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              <choice.icon className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                  {choice.label}
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                  {choice.hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
