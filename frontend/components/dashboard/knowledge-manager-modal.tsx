'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Link as LinkIcon, Upload, Database, BookOpen, Plus, Trash2, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Source { id: string; title: string; type: string; content: string; source?: string | null; createdAt: string; }
const TYPE_ICONS: Record<string, any> = { pdf: FileText, file: FileText, url: LinkIcon, faq: Database, text: BookOpen };

// In-page popup to manage knowledge sources without leaving the current page.
export function KnowledgeManagerModal({ onClose }: { onClose: () => void }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'url' | 'file' | 'faq' | 'text'>('url');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/knowledge');
    if (r.ok) setSources(await r.json());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const post = async (payload: any) => {
    const r = await fetch('/api/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) { toast.error('Could not save'); return false; }
    await load(); return true;
  };

  const addUrl = async () => {
    if (!url.trim()) { toast.error('Enter a website URL'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/knowledge/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { toast.success(`Extracted ${d.chars?.toLocaleString() || ''} characters`); setUrl(''); await load(); }
      else toast.error(d.error || 'Failed to extract page');
    } finally { setBusy(false); }
  };
  const addFaq = async () => { if (!question.trim() || !answer.trim()) return toast.error('Enter question and answer'); setBusy(true); if (await post({ type: 'faq', title: question.trim(), content: answer.trim() })) { toast.success('Q&A added'); setQuestion(''); setAnswer(''); } setBusy(false); };
  const addText = async () => { if (!title.trim() || !text.trim()) return toast.error('Enter a title and content'); setBusy(true); if (await post({ type: 'text', title: title.trim(), content: text.trim() })) { toast.success('Saved'); setTitle(''); setText(''); } setBusy(false); };
  const addFile = async (f?: File) => {
    if (!f) return;
    if (!/\.(txt|md|markdown|csv|json|html?)$/i.test(f.name)) { toast.error('Text-based files only (.txt, .md, .csv, .json, .html). For PDFs, paste the text.'); return; }
    if (f.size > 2 * 1024 * 1024) { toast.error('File too large (max 2MB)'); return; }
    setBusy(true);
    try { const content = await f.text(); if (await post({ type: 'file', title: f.name, content: content.slice(0, 50000) })) toast.success(`Imported ${f.name}`); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const del = async (id: string) => { setSources(p => p.filter(s => s.id !== id)); await fetch('/api/knowledge', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10">
          <div><h3 className="text-slate-900 dark:text-white font-semibold">Manage Knowledge</h3><p className="text-xs text-slate-500 dark:text-slate-400">Add sources your agent references during calls.</p></div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 border-b border-slate-200 dark:border-white/10">
          <div className="flex gap-2 mb-4">
            {[{ id: 'url', label: 'URL', icon: LinkIcon }, { id: 'file', label: 'File', icon: Upload }, { id: 'faq', label: 'Q&A', icon: Database }, { id: 'text', label: 'Text', icon: BookOpen }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)} className={cn('flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-all', tab === t.id ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400' : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5')}>
                <t.icon className="w-4 h-4" /><span className="text-xs font-medium">{t.label}</span>
              </button>
            ))}
          </div>

          {tab === 'url' && <div className="flex gap-2"><Input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addUrl()} placeholder="https://yourwebsite.com/about" className="bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white" /><Button onClick={addUrl} disabled={busy} className="bg-indigo-600 hover:bg-indigo-500 text-white shrink-0">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Extract'}</Button></div>}
          {tab === 'file' && <><input ref={fileRef} type="file" accept=".txt,.md,.markdown,.csv,.json,.html,.htm" className="hidden" onChange={e => addFile(e.target.files?.[0])} /><div onClick={() => !busy && fileRef.current?.click()} className="border-2 border-dashed border-slate-300 dark:border-white/10 rounded-xl p-6 text-center hover:border-indigo-500/30 hover:bg-indigo-500/5 cursor-pointer text-sm text-slate-600 dark:text-slate-400">{busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Click to upload .txt, .md, .csv, .json, .html (max 2MB)'}</div></>}
          {tab === 'faq' && <div className="space-y-2"><Input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Question" className="bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white" /><textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Answer" rows={2} className="w-full rounded-md bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" /><Button onClick={addFaq} disabled={busy} className="bg-indigo-600 hover:bg-indigo-500 text-white"><Plus className="w-4 h-4 mr-1.5" />Add Q&amp;A</Button></div>}
          {tab === 'text' && <div className="space-y-2"><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className="bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white" /><textarea value={text} onChange={e => setText(e.target.value)} placeholder="Paste content…" rows={3} className="w-full rounded-md bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" /><Button onClick={addText} disabled={busy} className="bg-indigo-600 hover:bg-indigo-500 text-white"><Plus className="w-4 h-4 mr-1.5" />Save</Button></div>}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Your sources ({sources.length})</p>
          {loading ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          : sources.length === 0 ? <p className="text-sm text-slate-500 py-6 text-center">No sources yet.</p>
          : <div className="space-y-2">{sources.map(s => { const Icon = TYPE_ICONS[s.type] || FileText; return (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 group">
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /></div>
              <div className="min-w-0 flex-1"><div className="text-sm font-medium text-slate-900 dark:text-white truncate">{s.title}</div><div className="text-xs text-slate-500 uppercase">{s.type}</div></div>
              <button onClick={() => del(s.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
            </div>
          ); })}</div>}
        </div>
      </div>
    </div>
  );
}
