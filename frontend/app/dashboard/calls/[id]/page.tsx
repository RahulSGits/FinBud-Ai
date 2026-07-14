'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, PhoneCall, Clock, CheckCircle2, AlertCircle, Play, Pause, ChevronLeft, User, Bot, IndianRupee, MessageCircle } from 'lucide-react';
import Header from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function CallDetailsPage() {
  const { id } = useParams();
  const router = useRouter();
  const [call, setCall] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await fetch(`/api/calls/${id}`);
    if (r.ok) {
      setCall(await r.json());
    } else {
      toast.error('Could not load call details');
      router.push('/dashboard/calls');
    }
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  if (loading || !call) {
    return <div className="min-h-screen bg-slate-50 dark:bg-[#020617] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>;
  }

  const durationStr = `${Math.floor((call.duration || 0) / 60)}:${String((call.duration || 0) % 60).padStart(2, '0')}`;
  
  let transcriptData = [];
  try {
    if (call.transcript) {
      transcriptData = JSON.parse(call.transcript);
    }
  } catch (e) {
    console.error('Could not parse transcript', e);
  }

  return (
    <div className="min-h-screen pb-10">
      <div className="bg-white dark:bg-[#0a1128] border-b border-slate-200 dark:border-white/5 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-500 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              {call.contact?.name || call.phone}
            </h1>
            <p className="text-xs text-slate-500">{new Date(call.startedAt).toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Metadata & Intelligence */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-xl p-4">
              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Duration</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">{durationStr}</div>
            </div>
            <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-xl p-4">
              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1"><IndianRupee className="w-3.5 h-3.5" /> Cost</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">₹{(call.cost || 0).toFixed(2)}</div>
            </div>
            <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-xl p-4">
              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1"><PhoneCall className="w-3.5 h-3.5" /> Outcome</div>
              <div className="text-lg font-bold text-slate-900 dark:text-white truncate">{call.outcome || 'N/A'}</div>
            </div>
            <div className={cn("border rounded-xl p-4", call.interested ? "bg-emerald-500/10 border-emerald-500/30" : "bg-white dark:bg-[#0a1128] border-slate-200 dark:border-white/5")}>
              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Interested</div>
              <div className={cn("text-lg font-bold", call.interested ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white")}>{call.interested ? 'Yes' : 'No'}</div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden">
            <div className="bg-slate-50 dark:bg-white/[0.02] px-5 py-3 border-b border-slate-200 dark:border-white/5">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Post-Call Intelligence</h3>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Summary</h4>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{call.summary || 'No summary generated.'}</p>
              </div>
              <div className="h-px w-full bg-slate-100 dark:bg-white/5" />
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Customer Intent</h4>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{call.customerIntent || 'N/A'}</p>
              </div>
              <div className="h-px w-full bg-slate-100 dark:bg-white/5" />
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Objections Raised</h4>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{call.objections || 'None recorded.'}</p>
              </div>
              <div className="h-px w-full bg-slate-100 dark:bg-white/5" />
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Next Action</h4>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-sm font-medium">
                  {call.nextAction || 'None'}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden">
             <div className="bg-slate-50 dark:bg-white/[0.02] px-5 py-3 border-b border-slate-200 dark:border-white/5">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Recording</h3>
            </div>
            <div className="p-5">
              {call.recordingUrl ? (
                <audio controls className="w-full h-10" src={call.recordingUrl} />
              ) : (
                <div className="text-center py-4">
                  <div className="w-10 h-10 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-2 text-slate-400">
                    <Play className="w-4 h-4 ml-1" />
                  </div>
                  <p className="text-sm text-slate-500">No recording available</p>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column: Transcript */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-xl h-[800px] flex flex-col">
            <div className="bg-slate-50 dark:bg-white/[0.02] px-5 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-indigo-500" />
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Call Transcript</h3>
              </div>
              <span className="text-xs bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-full font-medium">
                {transcriptData.length} Messages
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {transcriptData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500">
                  <MessageCircle className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-3" />
                  <p>Transcript not available</p>
                </div>
              ) : (
                transcriptData.map((msg: any, i: number) => {
                  const isAgent = msg.role === 'agent' || msg.role === 'assistant';
                  return (
                    <div key={i} className={cn("flex gap-4 max-w-[85%]", isAgent ? "mr-auto" : "ml-auto flex-row-reverse")}>
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1", isAgent ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300")}>
                        {isAgent ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                      </div>
                      <div className={cn("rounded-2xl px-5 py-3 text-sm shadow-sm", isAgent ? "bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/5 text-slate-700 dark:text-slate-200" : "bg-emerald-500 text-white")}>
                        {msg.content}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
