'use client';

import Header from '@/components/dashboard/header';
import { Upload, Link as LinkIcon, FileText, Plus, Trash2, Database, BookOpen, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { toast } from 'sonner';

interface Source { id: string; title: string; type: string; content: string; source?: string | null; createdAt: string; }

const TYPE_ICONS: Record<string, typeof FileText> = { pdf: FileText, file: FileText, url: LinkIcon, faq: Database, text: BookOpen };

function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function KnowledgeBasePage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'url' | 'file' | 'faq' | 'text'>('url');
  const [busy, setBusy] = useState(false);

  // form fields
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

  const addEntry = async (payload: any) => {
    const r = await fetch('/api/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) { toast.error('Could not save'); return false; }
    await load(); return true;
  };

  const handleScrapeUrl = async () => {
    if (!url.trim()) { toast.error('Enter a website URL'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/knowledge/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { toast.success(`Extracted ${d.chars?.toLocaleString() || ''} characters from the page`); setUrl(''); await load(); }
      else toast.error(d.error || 'Failed to extract page');
    } finally { setBusy(false); }
  };

  const handleAddFaq = async () => {
    if (!question.trim() || !answer.trim()) { toast.error('Enter both question and answer'); return; }
    setBusy(true);
    if (await addEntry({ type: 'faq', title: question.trim(), content: answer.trim() })) { toast.success('Q&A added'); setQuestion(''); setAnswer(''); }
    setBusy(false);
  };

  const handleAddText = async () => {
    if (!title.trim() || !text.trim()) { toast.error('Enter a title and content'); return; }
    setBusy(true);
    if (await addEntry({ type: 'text', title: title.trim(), content: text.trim() })) { toast.success('Content saved'); setTitle(''); setText(''); }
    setBusy(false);
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    const okExt = /\.(txt|md|markdown|csv|json|html?)$/i.test(file.name);
    if (!okExt) { toast.error('Upload a text-based file (.txt, .md, .csv, .json, .html). For PDFs, paste the text in the Text tab.'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('File too large (max 2MB)'); return; }
    setBusy(true);
    try {
      const content = await file.text();
      if (await addEntry({ type: 'file', title: file.name, content: content.slice(0, 50000) })) toast.success(`Imported ${file.name}`);
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleDelete = async (id: string) => {
    setSources(prev => prev.filter(s => s.id !== id));
    await fetch('/api/knowledge', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    toast.success('Knowledge source deleted');
  };

  const sizeLabel = (s: Source) => s.type === 'url' ? 'Web page' : s.type === 'faq' ? 'Q&A' : `${(s.content?.length || 0).toLocaleString()} chars`;

  return (
    <div className="min-h-screen pb-10">
      <Header title="Knowledge Base" subtitle="Provide information for your AI agents to reference during calls" />

      <div className="p-4 sm:p-6 grid lg:grid-cols-3 gap-6">
        {/* Add Source Column */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Add Knowledge Source</h2>

            <div className="flex gap-2 mb-6">
              {[
                { id: 'url', label: 'URL', icon: LinkIcon },
                { id: 'file', label: 'File', icon: Upload },
                { id: 'faq', label: 'Q&A', icon: Database },
                { id: 'text', label: 'Text', icon: BookOpen },
              ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                  className={cn('flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all',
                    activeTab === tab.id ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
                      : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5')}>
                  <tab.icon className="w-4 h-4" />
                  <span className="text-xs font-medium">{tab.label}</span>
                </button>
              ))}
            </div>

            {activeTab === 'url' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1.5">Website URL</label>
                  <Input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleScrapeUrl()} placeholder="https://yourwebsite.com/about" className="bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white" />
                  <p className="text-xs text-slate-600 dark:text-slate-500 mt-2">FinBud fetches the page and extracts its readable text into the knowledge base.</p>
                </div>
                <Button onClick={handleScrapeUrl} disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-2" /> Extract &amp; Add</>}</Button>
              </div>
            )}

            {activeTab === 'file' && (
              <div className="space-y-4">
                <input ref={fileRef} type="file" accept=".txt,.md,.markdown,.csv,.json,.html,.htm" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
                <div onClick={() => !busy && fileRef.current?.click()} className="border-2 border-dashed border-slate-300 dark:border-white/10 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all cursor-pointer group">
                  <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    {busy ? <Loader2 className="w-5 h-5 animate-spin text-indigo-500" /> : <Upload className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
                  </div>
                  <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-1">Click to upload a file</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-500">.txt, .md, .csv, .json, .html · max 2MB</p>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-500">For PDFs, copy the text and paste it in the <button onClick={() => setActiveTab('text')} className="text-indigo-500 underline">Text</button> tab.</p>
              </div>
            )}

            {activeTab === 'faq' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1.5">Question</label>
                  <Input value={question} onChange={e => setQuestion(e.target.value)} placeholder="What are your business hours?" className="bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white mb-3" />
                  <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1.5">Answer</label>
                  <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="We are open Monday to Friday from 9 AM to 5 PM." className="w-full h-24 rounded-md bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <Button onClick={handleAddFaq} disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-2" /> Add Q&amp;A</>}</Button>
              </div>
            )}

            {activeTab === 'text' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1.5">Source Title</label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Company History" className="bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white mb-3" />
                  <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1.5">Raw Text Content</label>
                  <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Paste any unstructured text here..." className="w-full h-40 rounded-md bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <Button onClick={handleAddText} disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-2" /> Save Content</>}</Button>
              </div>
            )}
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div className="text-sm text-amber-800 dark:text-amber-200/80">
              <span className="font-semibold text-amber-600 dark:text-amber-400">Pro Tip:</span> After adding sources, attach them to an agent in the Agent Builder for the AI to use them.
            </div>
          </div>
        </div>

        {/* Sources List Column */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden h-full">
            <div className="p-5 border-b border-slate-200 dark:border-white/5 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Your Knowledge Sources</h2>
              <span className="text-sm text-slate-600 dark:text-slate-500">{sources.length} sources total</span>
            </div>

            {loading ? (
              <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500 dark:text-slate-400" /></div>
            ) : sources.length === 0 ? (
              <div className="p-12 text-center">
                <Database className="w-10 h-10 text-slate-600 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-slate-600 dark:text-slate-500 text-sm">No knowledge sources yet. Add a URL, file, Q&amp;A, or text to get started.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-white/5">
                {sources.map(source => {
                  const Icon = TYPE_ICONS[source.type] || FileText;
                  return (
                    <div key={source.id} className="p-5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors group">
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-0.5 truncate">{source.title}</h3>
                          <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-500">
                            <span className="uppercase font-semibold tracking-wider">{source.type}</span>
                            <span>•</span><span>{sizeLabel(source)}</span>
                            <span>•</span><span>Added {timeAgo(source.createdAt)}</span>
                          </div>
                          {source.source && <a href={source.source} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 truncate max-w-sm block hover:underline">{source.source}</a>}
                        </div>
                      </div>
                      <ConfirmDeleteDialog title="Delete Source?" description="Agents will no longer be able to reference it." onConfirm={() => handleDelete(source.id)}>
                        <Button variant="ghost" className="h-8 w-8 p-0 text-slate-600 dark:text-slate-500 hover:text-red-600 dark:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </ConfirmDeleteDialog>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
