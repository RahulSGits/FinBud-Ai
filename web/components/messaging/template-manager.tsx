'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Braces,
  Loader2,
  Lock,
  MessageSquare,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { PLACEHOLDERS, extractPlaceholders, renderTemplate } from '@/lib/messaging/render';
import { WhatsAppPreview, type WhatsAppStatus } from './whatsapp-preview';
import { cn } from '@/lib/utils';

/** One template as the server pages serialise it — Dates already ISO strings. */
export interface TemplateRow {
  id: string;
  name: string;
  body: string;
  /** LeadStatus value, or null for "any outcome". */
  leadStatus: string | null;
  isActive: boolean;
  createdById: string | null;
  authorName: string | null;
  updatedAt: string;
  /** Messages already sent from this template. */
  sentCount: number;
}

interface Props {
  templates: TemplateRow[];
  currentUserId: string;
  isAdmin: boolean;
}

// WhatsApp refuses anything longer than this, so the counter is a real limit
// rather than a style guide.
const MAX_BODY = 4096;

const OUTCOMES: { value: string; label: string }[] = [
  { value: '', label: 'Any outcome' },
  { value: 'interested', label: 'Interested' },
  { value: 'callback_requested', label: 'Callback requested' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'unknown', label: 'Unknown outcome' },
];

const OUTCOME_LABEL: Record<string, string> = {
  interested: 'Interested',
  callback_requested: 'Callback requested',
  not_interested: 'Not interested',
  no_answer: 'No answer',
  voicemail: 'Voicemail',
  unknown: 'Unknown outcome',
};

const OUTCOME_TONE: Record<string, string> = {
  interested: 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400',
  callback_requested: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  not_interested: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400',
  no_answer: 'bg-slate-100 dark:bg-white/5 text-slate-500',
  voicemail: 'bg-slate-100 dark:bg-white/5 text-slate-500',
  unknown: 'bg-slate-100 dark:bg-white/5 text-slate-500',
};

const STATUSES: { value: WhatsAppStatus; label: string }[] = [
  { value: 'queued', label: 'Queued' },
  { value: 'sent', label: 'Sent' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'read', label: 'Read' },
  { value: 'failed', label: 'Failed' },
];

const INPUT =
  'w-full h-10 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60';

// Fixed zone on both sides of hydration: this is an India-only deployment, and
// letting the server and the browser each use their own zone would make the
// timestamps disagree on first paint.
const UPDATED = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});

function formatUpdated(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? 'unknown' : UPDATED.format(at);
}

/** `{{customer_name}}` and `customer_name` are the same placeholder. */
function tokenKey(token: string): string {
  return token.replace(/[{}]/g, '').trim().toLowerCase();
}

function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > 96 ? `${flat.slice(0, 96)}…` : flat;
}

interface Draft {
  /** Null while creating. */
  id: string | null;
  name: string;
  body: string;
  leadStatus: string;
  isActive: boolean;
  /** Set when an employee opened somebody else's template. */
  readOnly: boolean;
  authorName: string | null;
}

const BLANK: Draft = {
  id: null,
  name: '',
  body: '',
  leadStatus: '',
  isActive: true,
  readOnly: false,
  authorName: null,
};

export function TemplateManager({ templates, currentUserId, isAdmin }: Props) {
  const router = useRouter();
  const editorRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [draft, setDraft] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<WhatsAppStatus>('read');
  const [confirm, setConfirm] = useState<TemplateRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const editing = draft.id !== null;

  // An admin owns everything; an employee only what they authored.
  const canEdit = (t: TemplateRow) => isAdmin || t.createdById === currentUserId;

  const mine = templates.filter((t) => t.createdById === currentUserId);
  const others = templates.filter((t) => t.createdById !== currentUserId);

  const sampleVars = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const p of PLACEHOLDERS) {
      // Keyed under both spellings so the preview fills in whether the renderer
      // looks up bare names or whole {{tokens}}.
      vars[p.token] = p.example;
      vars[p.token.replace(/[{}]/g, '').trim()] = p.example;
    }
    return vars;
  }, []);

  // The phone header should agree with whatever name the body greets, or the
  // preview reads as a message to the wrong person.
  const sampleContact = useMemo(() => {
    const named =
      PLACEHOLDERS.find((p) => /customer|contact|lead/i.test(p.token) && /name/i.test(p.token)) ??
      PLACEHOLDERS.find((p) => /name/i.test(p.token));
    const value = named ? named.example.trim() : '';
    return value || 'Rohit Sharma';
  }, []);

  const knownTokens = useMemo(() => {
    const set = new Set<string>();
    for (const p of PLACEHOLDERS) set.add(tokenKey(p.token));
    return set;
  }, []);

  const unknownTokens = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const used = extractPlaceholders(draft.body);
    for (let i = 0; i < used.length; i += 1) {
      const key = tokenKey(used[i]);
      if (!key || knownTokens.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(used[i]);
    }
    return out;
  }, [draft.body, knownTokens]);

  const preview = useMemo(() => renderTemplate(draft.body, sampleVars), [draft.body, sampleVars]);

  const overLimit = draft.body.length > MAX_BODY;

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  function reset() {
    setDraft(BLANK);
    setMenuOpen(false);
  }

  function load(t: TemplateRow) {
    setDraft({
      id: t.id,
      name: t.name,
      body: t.body,
      leadStatus: t.leadStatus ?? '',
      isActive: t.isActive,
      readOnly: !canEdit(t),
      authorName: t.authorName,
    });
    setMenuOpen(false);
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function insertToken(token: string) {
    // Tolerates a bare name or an already-braced token.
    const text = token.indexOf('{{') === -1 ? `{{${token}}}` : token;
    const el = bodyRef.current;
    setMenuOpen(false);

    if (!el) {
      setDraft((d) => ({ ...d, body: d.body + text }));
      return;
    }

    const start = el.selectionStart;
    const end = el.selectionEnd;
    setDraft((d) => ({ ...d, body: d.body.slice(0, start) + text + d.body.slice(end) }));

    // React writes the new value on the next paint; move the caret after that,
    // otherwise it snaps to the end of the textarea.
    requestAnimationFrame(() => {
      const at = start + text.length;
      el.focus();
      el.setSelectionRange(at, at);
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || draft.readOnly) return;

    const name = draft.name.trim();
    const body = draft.body;

    if (!name) {
      toast.error('Give the template a name.');
      return;
    }
    if (!body.trim()) {
      toast.error('A template needs a message body.');
      return;
    }
    if (body.length > MAX_BODY) {
      toast.error(`WhatsApp caps a message at ${MAX_BODY} characters. This one is ${body.length}.`);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/message-templates', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editing ? { id: draft.id } : {}),
          name,
          body,
          leadStatus: draft.leadStatus || null,
          isActive: draft.isActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save the template.');

      toast.success(editing ? `“${name}” updated` : `Template “${name}” created`);
      if (!editing) reset();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the template.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: TemplateRow) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/message-templates?id=${encodeURIComponent(t.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete the template.');

      toast.success(`“${t.name}” deleted`);
      setConfirm(null);
      if (draft.id === t.id) reset();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the template.');
    } finally {
      setDeleting(false);
    }
  }

  const current = editing ? templates.find((t) => t.id === draft.id) ?? null : null;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Editor */}
        <section
          ref={editorRef}
          className="lg:col-span-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] scroll-mt-6"
        >
          <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-white/10">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {editing ? (draft.readOnly ? 'Viewing template' : 'Edit template') : 'New template'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {draft.readOnly
                  ? `Written by ${draft.authorName ?? 'a colleague'}. You can read and copy it, but only its author or an admin can change it.`
                  : 'The preview on the right is exactly what lands on the customer’s phone.'}
              </p>
            </div>
            {editing && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                <Plus className="w-4 h-4" /> New template
              </button>
            )}
          </header>

          <form onSubmit={save} className="p-5 space-y-5">
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Template name <span className="text-red-500">*</span>
              </span>
              <input
                value={draft.name}
                disabled={draft.readOnly}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Interested — send the document checklist"
                className={INPUT}
              />
            </label>

            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Use for</span>
                <select
                  value={draft.leadStatus}
                  disabled={draft.readOnly}
                  onChange={(e) => setDraft((d) => ({ ...d, leadStatus: e.target.value }))}
                  className={INPUT}
                >
                  {OUTCOMES.map((o) => (
                    <option key={o.value || 'any'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Offered first after a call with this outcome. “Any outcome” shows up everywhere.
                </span>
              </label>

              <div>
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Availability</span>
                <div className="flex items-center gap-3 h-10">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={draft.isActive}
                    aria-label="Active"
                    disabled={draft.readOnly}
                    onClick={() => setDraft((d) => ({ ...d, isActive: !d.isActive }))}
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60',
                      draft.isActive ? 'bg-brand-600' : 'bg-slate-200 dark:bg-white/10'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform',
                        draft.isActive ? 'translate-x-[23px]' : 'translate-x-[3px]'
                      )}
                    />
                  </button>
                  <span className="text-sm text-slate-700 dark:text-slate-200">
                    {draft.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Inactive templates stay saved but nobody can pick them to send.
                </span>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Message <span className="text-red-500">*</span>
                </span>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'text-[11px] tabular-nums',
                      overLimit ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    {draft.body.length} / {MAX_BODY}
                  </span>

                  <div ref={menuRef} className="relative">
                    <button
                      type="button"
                      disabled={draft.readOnly}
                      onClick={() => setMenuOpen((o) => !o)}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-60 transition-colors"
                    >
                      <Braces className="w-3.5 h-3.5" /> Insert placeholder
                    </button>

                    <AnimatePresence>
                      {menuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          role="menu"
                          className="absolute right-0 z-30 mt-2 w-72 max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0a1128] p-1.5 shadow-xl"
                        >
                          {PLACEHOLDERS.length === 0 ? (
                            <p className="px-2.5 py-3 text-xs text-slate-500 dark:text-slate-400">
                              No placeholders are configured.
                            </p>
                          ) : (
                            PLACEHOLDERS.map((p) => (
                              <button
                                key={p.token}
                                type="button"
                                role="menuitem"
                                onClick={() => insertToken(p.token)}
                                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                              >
                                <span className="block text-xs font-medium text-slate-900 dark:text-white">
                                  {p.label}
                                </span>
                                <span className="block font-mono text-[11px] text-brand-600 dark:text-brand-400">
                                  {p.token.indexOf('{{') === -1 ? `{{${p.token}}}` : p.token}
                                </span>
                                <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  e.g. {p.example}
                                </span>
                              </button>
                            ))
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              <textarea
                ref={bodyRef}
                value={draft.body}
                disabled={draft.readOnly}
                onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                rows={10}
                placeholder={'Hi {{customer_name}}, thanks for your time today.\n\nHere is what we need to move ahead:\n*1.* PAN card\n*2.* Last 3 salary slips'}
                className="w-full rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 py-3 text-sm leading-relaxed text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 resize-y"
              />

              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                WhatsApp formatting works here: <code className="font-mono">*bold*</code>,{' '}
                <code className="font-mono">_italic_</code>, <code className="font-mono">~strikethrough~</code> and{' '}
                <code className="font-mono">```monospace```</code>.
              </p>

              {overLimit && (
                <Callout tone="red">
                  This message is {draft.body.length - MAX_BODY} character
                  {draft.body.length - MAX_BODY === 1 ? '' : 's'} over WhatsApp’s {MAX_BODY}-character limit and would be
                  rejected on send.
                </Callout>
              )}

              {unknownTokens.length > 0 && (
                <Callout tone="amber">
                  <strong className="font-semibold">
                    {unknownTokens.length === 1 ? 'Unknown placeholder' : 'Unknown placeholders'}
                  </strong>{' '}
                  {unknownTokens.map((t) => (t.indexOf('{{') === -1 ? `{{${t}}}` : t)).join(', ')} — nothing fills{' '}
                  {unknownTokens.length === 1 ? 'it' : 'them'} in, so the customer sees the raw braces. Use the insert
                  menu to pick a supported one.
                </Callout>
              )}
            </div>

            {draft.readOnly ? (
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Start my own
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                {editing && current && (
                  <button
                    type="button"
                    onClick={() => setConfirm(current)}
                    className="inline-flex items-center gap-2 h-9 px-4 mr-auto rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/40 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                )}
                {editing && (
                  <button
                    type="button"
                    onClick={reset}
                    disabled={busy}
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={busy || overLimit}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editing ? 'Save changes' : 'Create template'}
                </button>
              </div>
            )}
          </form>
        </section>

        {/* Live preview */}
        <aside className="lg:col-span-2">
          <div className="lg:sticky lg:top-6 space-y-3">
            <WhatsAppPreview body={preview} contactName={sampleContact} status={previewStatus} />

            <div
              role="group"
              aria-label="Delivery state"
              className="flex flex-wrap items-center justify-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/5"
            >
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={previewStatus === s.value}
                  onClick={() => setPreviewStatus(s.value)}
                  className={cn(
                    'h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-colors',
                    previewStatus === s.value
                      ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-center text-slate-500 dark:text-slate-400 px-2">
              Placeholders are filled with sample values, so this is the real message — not the raw{' '}
              <code className="font-mono">{'{{tokens}}'}</code>.
            </p>
          </div>
        </aside>
      </div>

      {/* Lists */}
      <TemplateGroup
        title="My templates"
        hint="Yours to edit, rename or retire."
        templates={mine}
        activeId={draft.id}
        editable
        onOpen={load}
        onDelete={setConfirm}
        emptyTitle="You have not written a template yet"
        emptyHint="Draft one above and it lands here, ready to send after your next call."
      />

      <TemplateGroup
        title="Company templates"
        hint={
          isAdmin
            ? 'Written by the rest of the team. As an admin you can edit any of them.'
            : 'Written by colleagues. You can send these, but only their author or an admin can change them.'
        }
        templates={others}
        activeId={draft.id}
        editable={isAdmin}
        onOpen={load}
        onDelete={setConfirm}
        emptyTitle="Nothing shared yet"
        emptyHint="Templates other people write show up here."
      />

      {/* Delete confirmation */}
      <AnimatePresence>
        {confirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !deleting && setConfirm(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 p-6"
            >
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Delete “{confirm.name}”?</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                It disappears from the follow-up menu and can no longer be sent.
              </p>

              <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-white/5 px-3.5 py-3">
                <AlertTriangle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {confirm.sentCount > 0 ? (
                    <>
                      The{' '}
                      <strong className="font-semibold text-slate-900 dark:text-white tabular-nums">
                        {confirm.sentCount}
                      </strong>{' '}
                      message{confirm.sentCount === 1 ? '' : 's'} already sent from this template keep the exact words
                      that went out.
                    </>
                  ) : (
                    <>Messages already sent keep the exact words that went out.</>
                  )}{' '}
                  Deleting a template never rewrites what a customer received.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setConfirm(null)}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={() => remove(confirm)}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
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

// ---------------------------------------------------------------------------

function TemplateGroup({
  title,
  hint,
  templates,
  activeId,
  editable,
  onOpen,
  onDelete,
  emptyTitle,
  emptyHint,
}: {
  title: string;
  hint: string;
  templates: TemplateRow[];
  activeId: string | null;
  editable: boolean;
  onOpen: (t: TemplateRow) => void;
  onDelete: (t: TemplateRow) => void;
  emptyTitle: string;
  emptyHint: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 dark:border-white/10">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{hint}</p>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 tabular-nums">
          {templates.length}
        </span>
      </header>

      {templates.length === 0 ? (
        <div className="m-5 rounded-2xl border border-dashed border-slate-300 dark:border-white/10 px-6 py-12 text-center">
          <MessageSquare className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{emptyTitle}</p>
          <p className="text-xs text-slate-500 mt-1">{emptyHint}</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          {templates.map((t) => (
            <li
              key={t.id}
              className={cn(
                'flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors',
                activeId === t.id && 'bg-brand-500/[0.06] dark:bg-brand-500/10'
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-slate-900 dark:text-white truncate">{t.name}</h3>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[11px] font-medium',
                      t.leadStatus
                        ? OUTCOME_TONE[t.leadStatus] ?? OUTCOME_TONE.unknown
                        : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400'
                    )}
                  >
                    {t.leadStatus ? OUTCOME_LABEL[t.leadStatus] ?? t.leadStatus.replace(/_/g, ' ') : 'Any outcome'}
                  </span>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[11px] font-medium',
                      t.isActive
                        ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-500'
                    )}
                  >
                    {t.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{excerpt(t.body)}</p>

                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                  {t.authorName ?? 'Unknown author'} · updated {formatUpdated(t.updatedAt)}
                  {t.sentCount > 0 && ` · ${t.sentCount} sent`}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpen(t)}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                >
                  {editable ? <Pencil className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  {editable ? 'Edit' : 'View'}
                </button>
                {editable && (
                  <button
                    type="button"
                    onClick={() => onDelete(t)}
                    aria-label={`Delete ${t.name}`}
                    className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/40 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Callout({ tone, children }: { tone: 'amber' | 'red'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-xl px-3.5 py-3 mt-3',
        tone === 'red' ? 'bg-red-500/10' : 'bg-amber-500/10'
      )}
    >
      {tone === 'red' ? (
        <X className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      )}
      <p className={cn('text-xs', tone === 'red' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300')}>
        {children}
      </p>
    </div>
  );
}
