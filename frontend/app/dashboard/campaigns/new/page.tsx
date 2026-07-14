'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, FileText, Bot, ArrowRight, Check, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Agent { id: string; name: string; }

import { parseContactsCsv, ParsedContact } from '@/lib/contacts';

export default function CreateCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [parsed, setParsed] = useState<{ count: number; phoneCol: string; nameCol: string; contacts: ParsedContact[] } | null>(null);
  const [launching, setLaunching] = useState(false);

  const loadAgents = useCallback(async () => {
    const r = await fetch('/api/agents');
    if (r.ok) setAgents(await r.json());
  }, []);
  useEffect(() => { loadAgents(); }, [loadAgents]);

  const agentName = agents.find(a => a.id === agentId)?.name || '';

  const ingestFile = async (f: File) => {
    if (!/\.(csv|txt)$/i.test(f.name)) { toast.error('Upload a .csv file with a phone column'); return; }
    setFile(f);
    const text = await f.text();
    const p = parseContactsCsv(text);
    setParsed({ count: p.contacts.length, phoneCol: p.phoneCol, nameCol: p.nameCol, contacts: p.contacts });
    if (p.contacts.length === 0) toast.error('No valid phone numbers found in that file');
    else toast.success(`Validated ${p.contacts.length} contacts`);
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); if (e.dataTransfer.files?.[0]) ingestFile(e.dataTransfer.files[0]); };

  const launch = async () => {
    setLaunching(true);
    try {
      const payload = { 
        name: campaignName, 
        agentId, 
        totalContacts: parsed?.count || 0,
        contacts: parsed?.contacts || [] 
      };
      const r = await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) { toast.error('Could not create campaign'); return; }
      const campaign = await r.json();
      toast.success('Campaign created');
      router.push(`/dashboard/campaigns/${campaign.id}`);
    } finally { setLaunching(false); }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Create Auto-Dialer Campaign</h1>
        <p className="text-slate-600 dark:text-slate-400">Upload a list of customers to automatically dispatch AI calls.</p>
      </div>

      <div className="flex items-center justify-between relative">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-slate-200 dark:bg-white/5 -z-10" />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-emerald-500 transition-all duration-500 -z-10" style={{ width: step === 1 ? '0%' : step === 2 ? '50%' : '100%' }} />
        {[{ num: 1, label: 'Setup' }, { num: 2, label: 'Upload Data' }, { num: 3, label: 'Review' }].map((s) => (
          <div key={s.num} className="flex flex-col items-center gap-2 bg-slate-50 dark:bg-[#020617] px-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${step >= s.num ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-500'}`}>{step > s.num ? <Check className="w-4 h-4" /> : s.num}</div>
            <span className={`text-xs font-medium ${step >= s.num ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-500'}`}>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-[#0a1628] border border-slate-200 dark:border-white/5 rounded-xl p-6 sm:p-8">
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Campaign Name</label>
              <input type="text" value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="e.g. Q4 Lead Follow-up" className="w-full bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select AI Agent</label>
              {agents.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-500">No agents yet — create one first in AI Agents.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {agents.map((a) => (
                    <div key={a.id} onClick={() => setAgentId(a.id)} className={`border rounded-lg p-4 cursor-pointer transition-all ${agentId === a.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center"><Bot className="w-5 h-5 text-slate-600 dark:text-slate-400" /></div>
                        <div className="font-medium text-slate-900 dark:text-white">{a.name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end pt-4">
              <button disabled={!campaignName || !agentId} onClick={() => setStep(2)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Next Step <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div onDragOver={e => e.preventDefault()} onDrop={handleDrop} className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${file ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-300 dark:border-white/20 hover:border-emerald-500/50'}`}>
              {!file ? (
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4"><UploadCloud className="w-8 h-8 text-slate-600 dark:text-slate-400" /></div>
                  <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">Upload CSV File</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-500 mb-6">Drag &amp; drop, or browse. Needs a phone/number column.</p>
                  <label className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-2.5 rounded-lg font-medium cursor-pointer hover:opacity-90 transition-opacity">Browse Files<input type="file" className="hidden" accept=".csv,.txt" onChange={e => e.target.files?.[0] && ingestFile(e.target.files[0])} /></label>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4 text-emerald-500"><FileText className="w-8 h-8" /></div>
                  <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">{file.name}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-500 mb-6">{(file.size / 1024).toFixed(2)} KB</p>
                  <div className="bg-slate-50 dark:bg-white/5 rounded-lg p-4 text-left w-full max-w-md border border-slate-200 dark:border-white/10 mb-6">
                    <div className="flex items-center gap-2 text-sm text-slate-900 dark:text-white font-medium mb-3"><Check className="w-4 h-4 text-emerald-500" /> Validated {parsed?.count ?? 0} contacts</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-500">Phone Column:</span><span className="font-mono bg-slate-200 dark:bg-white/10 px-2 rounded">{parsed?.phoneCol}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-500">Name Column:</span><span className="font-mono bg-slate-200 dark:bg-white/10 px-2 rounded">{parsed?.nameCol}</span></div>
                    </div>
                  </div>
                  <button onClick={() => { setFile(null); setParsed(null); }} className="text-sm text-red-500 hover:underline">Remove File</button>
                </div>
              )}
            </div>
            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(1)} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-4 py-2 font-medium">Back</button>
              <button disabled={!file || !parsed?.count} onClick={() => setStep(3)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Review Campaign <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-8">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-400">Ready to Create</h4>
                <p className="text-sm text-amber-700/80 dark:text-amber-400/80 mt-1">The campaign will be created with {parsed?.count} contacts. Live dialing begins once your Twilio number is configured.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6 bg-slate-50 dark:bg-white/5 p-6 rounded-xl border border-slate-200 dark:border-white/10">
              <div><div className="text-sm text-slate-600 dark:text-slate-500 mb-1">Campaign Name</div><div className="font-medium text-slate-900 dark:text-white">{campaignName}</div></div>
              <div><div className="text-sm text-slate-600 dark:text-slate-500 mb-1">Assigned Agent</div><div className="font-medium text-slate-900 dark:text-white">{agentName}</div></div>
              <div><div className="text-sm text-slate-600 dark:text-slate-500 mb-1">Data Source</div><div className="font-medium text-slate-900 dark:text-white">{file?.name}</div></div>
              <div><div className="text-sm text-slate-600 dark:text-slate-500 mb-1">Total Contacts</div><div className="font-medium text-slate-900 dark:text-white">{parsed?.count}</div></div>
            </div>
            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(2)} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-4 py-2 font-medium">Back</button>
              <button disabled={launching} onClick={launch} className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-3 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-60">{launching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Campaign'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
