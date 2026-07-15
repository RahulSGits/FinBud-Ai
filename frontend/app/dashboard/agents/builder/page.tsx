'use client';

import { useState } from 'react';
import Header from '@/components/dashboard/header';
import { Settings2, BookOpen, Mic, Phone, CheckCircle2, ChevronRight, ChevronLeft, Save, Building2, Play, Cpu, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { KnowledgeManagerModal } from '@/components/dashboard/knowledge-manager-modal';

const STEPS = [
  { id: 1, title: 'Identity & Prompt', icon: Settings2 },
  { id: 2, title: 'Knowledge', icon: BookOpen },
  { id: 3, title: 'Voice & AI Model', icon: Cpu },
  { id: 4, title: 'Telephony & Rules', icon: Phone },
  { id: 5, title: 'Review', icon: CheckCircle2 },
];

export default function AgentBuilderPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const router = useRouter();
  
  const [agentData, setAgentData] = useState({
    // General
    name: '',
    language: 'en-US',
    greeting: 'Hello, this is your AI assistant. How can I help you today?',
    
    // Prompt Builder
    systemPrompt: '',
    businessContext: '',
    callObjective: '',
    qualificationRules: '',
    closingInstructions: '',
    fallbackRules: '',
    complianceRules: '',
    
    // Voice & LLM
    llmProvider: 'openai',
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 500,
    voiceProvider: 'exote',
    voiceId: 'priya',
    
    // Telephony & Advanced
    callerId: '',
    transferEnabled: false,
    transferNumber: '',
    interruptions: true,
    silenceTimeout: 10,
  });

  const [showKnowledge, setShowKnowledge] = useState(false);
  const [selectedKnowledge, setSelectedKnowledge] = useState<string[]>([]);

  const handleUpdate = (field: string, value: any) => {
    setAgentData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!user) return toast.error('You must be logged in to create an agent.');
    setLoading(true);

    const payload = {
      ...agentData,
      knowledgeBases: selectedKnowledge
    };

    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    
    if (!res.ok) {
      const d = await res.json();
      toast.error('Failed to save agent. ' + (d.error || ''));
    } else {
      toast.success('Agent saved successfully!');
      router.push('/dashboard/agents');
    }
  };

  return (
    <div className="min-h-screen pb-20">
      <Header 
        title="Agent Builder" 
        subtitle="Configure and deploy your advanced AI voice agent"
        action={{ label: loading ? 'Saving...' : 'Deploy Agent', onClick: handleSave }}
      />
      
      <div className="max-w-5xl mx-auto p-6 mt-4">
        {/* Progress Stepper */}
        <div className="mb-10">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-white dark:bg-[#0a1128] rounded-full z-0" />
            <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-emerald-500 rounded-full z-0 transition-all duration-500" style={{ width: `${((step - 1) / 4) * 100}%` }} />
            
            {STEPS.map((s, i) => (
              <div key={s.id} className="relative z-10 flex flex-col items-center gap-2">
                <button 
                  onClick={() => s.id < step && setStep(s.id)}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                    step === s.id ? "bg-white dark:bg-[#0a1128] border-emerald-500 text-emerald-600 dark:text-emerald-400" :
                    step > s.id ? "bg-emerald-500 border-emerald-500 text-slate-900 dark:text-white" :
                    "bg-white dark:bg-[#0a1128] border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-500"
                  )}
                >
                  {step > s.id ? <CheckCircle2 className="w-5 h-5" /> : <s.icon className="w-4 h-4" />}
                </button>
                <span className={cn("text-xs font-medium absolute -bottom-6 whitespace-nowrap", step >= s.id ? "text-slate-600 dark:text-slate-300" : "text-slate-600")}>
                  {s.title}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Form Container */}
        <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl p-8 min-h-[400px]">
          
          {/* STEP 1: IDENTITY & PROMPT BUILDER */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Identity & Prompt Builder</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">Construct a highly structured system prompt for enterprise readiness.</p>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6 pb-6 border-b border-slate-200 dark:border-white/10">
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Agent Name</label>
                  <Input value={agentData.name} onChange={e => handleUpdate('name', e.target.value)} placeholder="e.g., Sales Rep Priya" className="bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">First Message (Greeting)</label>
                  <Input value={agentData.greeting} onChange={e => handleUpdate('greeting', e.target.value)} placeholder="Hello! How can I help?" className="bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white" />
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-1.5">Base System Prompt</label>
                  <Textarea value={agentData.systemPrompt} onChange={e => handleUpdate('systemPrompt', e.target.value)} rows={3} placeholder="You are a professional sales assistant for..." className="bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-sm" />
                </div>
                
                <div className="grid md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-1.5">Business Context & Company Info</label>
                    <Textarea value={agentData.businessContext} onChange={e => handleUpdate('businessContext', e.target.value)} rows={3} placeholder="We sell AI automation software..." className="bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-1.5">Call Objective</label>
                    <Textarea value={agentData.callObjective} onChange={e => handleUpdate('callObjective', e.target.value)} rows={3} placeholder="To book a 15-minute discovery call..." className="bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-1.5">Qualification Rules</label>
                    <Textarea value={agentData.qualificationRules} onChange={e => handleUpdate('qualificationRules', e.target.value)} rows={3} placeholder="Only transfer if the user is a business owner..." className="bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-1.5">Closing Instructions</label>
                    <Textarea value={agentData.closingInstructions} onChange={e => handleUpdate('closingInstructions', e.target.value)} rows={3} placeholder="End the call by wishing them a great day..." className="bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-1.5">Fallback & Objection Handling</label>
                    <Textarea value={agentData.fallbackRules} onChange={e => handleUpdate('fallbackRules', e.target.value)} rows={3} placeholder="If they say it's too expensive, respond with..." className="bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-amber-600 dark:text-amber-400 mb-1.5 flex items-center gap-1"><AlertTriangle className="w-4 h-4"/> Compliance Rules</label>
                    <Textarea value={agentData.complianceRules} onChange={e => handleUpdate('complianceRules', e.target.value)} rows={3} placeholder="Never make promises about exact interest rates..." className="bg-amber-50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20 text-sm" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: KNOWLEDGE */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Knowledge Sources (RAG)</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Attach existing knowledge bases for dynamic answer generation.</p>
                </div>
                <Button variant="outline" className="border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-300" onClick={() => setShowKnowledge(true)}>Manage Knowledge</Button>
              </div>
              
              <div className="grid gap-3">
                {[
                  { id: 'kb_docs', title: 'Company Policy Docs', type: 'PDF Collection' },
                  { id: 'kb_site', title: 'Website Scraping Data', type: 'URL Collection' },
                ].map(k => (
                  <label key={k.id} className={cn("flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all", selectedKnowledge.includes(k.id) ? "bg-indigo-500/10 border-indigo-500/30" : "bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10")}>
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox" 
                        checked={selectedKnowledge.includes(k.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedKnowledge([...selectedKnowledge, k.id]);
                          else setSelectedKnowledge(selectedKnowledge.filter(id => id !== k.id));
                        }}
                        className="w-4 h-4 rounded border-white/20 bg-transparent text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-white">{k.title}</div>
                        <div className="text-xs text-slate-600 dark:text-slate-500">{k.type}</div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: VOICE & AI MODEL */}
          {step === 3 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Voice & AI Model</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">Select the cognitive engine and vocal characteristics.</p>
              </div>
              
              {/* LLM Engine */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2"><Cpu className="w-4 h-4"/> Cognitive Engine</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">LLM Provider</label>
                    <select value={agentData.llmProvider} onChange={e => handleUpdate('llmProvider', e.target.value)} className="w-full h-10 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none">
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="gemini">Google Gemini</option>
                      <option value="groq">Groq (Ultra-fast Llama)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">AI Model</label>
                    <select value={agentData.model} onChange={e => handleUpdate('model', e.target.value)} className="w-full h-10 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none">
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="gpt-4o-mini">GPT-4o Mini (Faster)</option>
                      <option value="claude-3-haiku">Claude 3.5 Haiku</option>
                      <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5 flex justify-between">Temperature <span>{agentData.temperature}</span></label>
                    <input type="range" min="0" max="1" step="0.1" value={agentData.temperature} onChange={e => handleUpdate('temperature', parseFloat(e.target.value))} className="w-full" />
                    <p className="text-xs text-slate-500 mt-1">Lower = Strict, Higher = Creative</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Max Tokens</label>
                    <Input type="number" value={agentData.maxTokens} onChange={e => handleUpdate('maxTokens', parseInt(e.target.value))} className="bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10" />
                  </div>
                </div>
              </div>

              <div className="h-px bg-slate-200 dark:bg-white/10" />

              {/* Voice Engine */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2"><Mic className="w-4 h-4"/> Voice Synthesizer</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Voice Provider</label>
                    <select value={agentData.voiceProvider} onChange={e => handleUpdate('voiceProvider', e.target.value)} className="w-full h-10 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none">
                      <option value="exote">Exote</option>
                      <option value="sarvam">Sarvam (Indian Accents)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Language & Accent</label>
                    <select value={agentData.language} onChange={e => handleUpdate('language', e.target.value)} className="w-full h-10 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none">
                      <option value="en-US">English (US)</option>
                      <option value="en-IN">English (India)</option>
                      <option value="hi-IN">Hindi</option>
                      <option value="es-ES">Spanish</option>
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Select Voice Profile</label>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {[
                      { id: 'priya', name: 'Priya', type: 'Professional Female' },
                      { id: 'marcus', name: 'Marcus', type: 'Authoritative Male' },
                      { id: 'sarah', name: 'Sarah', type: 'Friendly Female' },
                    ].map(v => (
                      <div key={v.id} onClick={() => handleUpdate('voiceId', v.id)} className={cn("p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between", agentData.voiceId === v.id ? "bg-emerald-500/10 border-emerald-500/30" : "bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10")}>
                        <div className="flex items-center gap-3">
                          <div className={cn("w-4 h-4 rounded-full border-2", agentData.voiceId === v.id ? "border-emerald-500 bg-emerald-500" : "border-slate-500")} />
                          <div>
                            <div className="text-sm font-medium text-slate-900 dark:text-white">{v.name}</div>
                            <div className="text-xs text-slate-600 dark:text-slate-500">{v.type}</div>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-600 hover:text-emerald-600 rounded-full"><Play className="w-4 h-4 ml-0.5" /></Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: TELEPHONY & RULES */}
          {step === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Telephony & Interaction Rules</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">Configure connection details and conversational interruptions.</p>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6 pb-6 border-b border-slate-200 dark:border-white/10">
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Caller ID (Phone Number)</label>
                  <Input value={agentData.callerId} onChange={e => handleUpdate('callerId', e.target.value)} placeholder="+1 555 123 4567" className="bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Silence Timeout (seconds)</label>
                  <Input type="number" value={agentData.silenceTimeout} onChange={e => handleUpdate('silenceTimeout', parseInt(e.target.value))} className="bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white" />
                  <p className="text-xs text-slate-500 mt-1">End call if user is silent for this long.</p>
                </div>
              </div>

              {/* Interaction Settings */}
              <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Allow Interruptions</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">Let the user interrupt the AI while it is speaking.</p>
                  </div>
                  <button type="button" onClick={() => handleUpdate('interruptions', !agentData.interruptions)} className={cn('w-12 h-6 rounded-full relative transition-colors flex-shrink-0', agentData.interruptions ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700')}>
                    <span className={cn('absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow', agentData.interruptions ? 'translate-x-6' : 'translate-x-0.5')} />
                  </button>
                </div>
              </div>

              {/* Live warm transfer */}
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Live Call Transfer</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">When the AI detects qualification, transfer to a human.</p>
                  </div>
                  <button type="button" onClick={() => handleUpdate('transferEnabled', !agentData.transferEnabled)} className={cn('w-12 h-6 rounded-full relative transition-colors flex-shrink-0', agentData.transferEnabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700')}>
                    <span className={cn('absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow', agentData.transferEnabled ? 'translate-x-6' : 'translate-x-0.5')} />
                  </button>
                </div>
                {agentData.transferEnabled && (
                  <div className="pt-3 border-t border-indigo-500/10">
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Human Agent Number (E.164)</label>
                    <Input value={agentData.transferNumber} onChange={e => handleUpdate('transferNumber', e.target.value)} placeholder="+19876543210" className="bg-white dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: REVIEW */}
          {step === 5 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Review Configuration</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">Verify your enterprise agent before deployment.</p>
              </div>
              
              <div className="bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-200 dark:border-white/5">
                  <div><span className="text-xs text-slate-600 dark:text-slate-500 block mb-1">Agent Name</span><span className="text-sm text-slate-900 dark:text-white font-medium">{agentData.name || 'Unnamed Agent'}</span></div>
                  <div><span className="text-xs text-slate-600 dark:text-slate-500 block mb-1">Language</span><span className="text-sm text-slate-900 dark:text-white font-medium capitalize">{agentData.language}</span></div>
                </div>
                <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-200 dark:border-white/5">
                  <div><span className="text-xs text-slate-600 dark:text-slate-500 block mb-1">LLM Engine</span><span className="text-sm text-slate-900 dark:text-white font-medium capitalize">{agentData.llmProvider} ({agentData.model})</span></div>
                  <div><span className="text-xs text-slate-600 dark:text-slate-500 block mb-1">Voice Profile</span><span className="text-sm text-slate-900 dark:text-white font-medium capitalize">{agentData.voiceId} ({agentData.voiceProvider})</span></div>
                </div>
                <div>
                  <span className="text-xs text-slate-600 dark:text-slate-500 block mb-1">Knowledge Sources</span>
                  <span className="text-sm text-slate-900 dark:text-white font-medium">{selectedKnowledge.length} documents attached</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer Navigation */}
        <div className="mt-6 flex items-center justify-between border-t border-slate-200 dark:border-white/5 pt-6">
          <Button 
            variant="outline" 
            onClick={() => setStep(step - 1)} 
            disabled={step === 1}
            className="border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-transparent"
          >
            <ChevronLeft className="w-4 h-4 mr-1.5" /> Back
          </Button>
          
          {step < 5 ? (
            <Button 
              onClick={() => setStep(step + 1)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white border-0"
            >
              Continue <ChevronRight className="w-4 h-4 ml-1.5" />
            </Button>
          ) : (
            <Button 
              onClick={handleSave}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white border-0"
            >
              <Save className="w-4 h-4 mr-1.5" /> {loading ? 'Deploying...' : 'Deploy Agent'}
            </Button>
          )}
        </div>
      </div>

      {showKnowledge && <KnowledgeManagerModal onClose={() => setShowKnowledge(false)} />}
    </div>
  );
}
