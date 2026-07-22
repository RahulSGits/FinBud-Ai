'use client';

import { Navbar } from '@/components/marketing/navbar';
import { Footer } from '@/components/marketing/footer';
import { motion } from 'motion/react';
import { Bot, UploadCloud, Phone, Play, CheckCircle2, ChevronRight, Sliders, Database, FileText } from 'lucide-react';

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-slate-50 selection:bg-emerald-500/30 font-sans flex flex-col overflow-hidden">
      <Navbar />

      <main className="relative z-10 pt-32 pb-24 flex-1">
        <section className="px-6 max-w-6xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-24"
          >
            <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white mb-6">How to Deploy an Agent</h1>
            <p className="text-slate-600 dark:text-slate-400 max-w-3xl mx-auto text-lg md:text-xl leading-relaxed">
              Gone are the days of spending months configuring complex dialog trees. FinBud AI uses generative language models to understand intent naturally. You can literally configure, train, and deploy a production-ready AI phone agent in under 10 minutes.
            </p>
          </motion.div>
          
          <div className="relative">
            {/* Vertical Line for Desktop (Animated) */}
            <div className="hidden md:block absolute left-[50%] top-0 bottom-0 w-[2px] bg-gradient-to-b from-emerald-500/50 via-emerald-500/10 to-transparent -translate-x-1/2 z-0 overflow-hidden">
              <motion.div 
                initial={{ height: "0%" }}
                whileInView={{ height: "100%" }}
                viewport={{ once: true }}
                transition={{ duration: 2.5, ease: "easeInOut" }}
                className="w-full bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.8)]"
              />
            </div>
            
            <div className="space-y-32">
              {/* Step 1 */}
              <div className="relative z-10 flex flex-col md:flex-row items-center gap-8 md:gap-16 group">
                <motion.div 
                  initial={{ opacity: 0, x: -50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ type: "spring", bounce: 0.3 }}
                  className="flex-1 md:text-right bg-white dark:bg-[#0a1128]/80 p-8 rounded-3xl border border-slate-300 dark:border-white/10 hover:border-emerald-500/50 transition-colors shadow-2xl backdrop-blur-md"
                >
                  <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">1. Define the Persona</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed mb-4">
                    Every great agent starts with a clear identity. You begin by writing a simple natural language prompt defining who the agent is, how they should speak, and what their primary goal is.
                  </p>
                  <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">
                    You can pick the agent&apos;s language, select a realistic male or female voice, and adjust the &apos;temperature&apos; to make them strictly professional or highly conversational.
                  </p>
                </motion.div>
                
                <motion.div initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.2, type: "spring" }} className="w-16 h-16 rounded-full bg-slate-50 dark:bg-[#020617] border-4 border-emerald-500 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-2xl flex-shrink-0 shadow-[0_0_30px_rgba(16,185,129,0.3)] relative z-20">1</motion.div>
                
                <motion.div 
                  initial={{ opacity: 0, x: 50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="flex-1 hidden md:block relative"
                >
                  {/* Graphical Mockup 1 */}
                  <div className="bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-white/10 rounded-2xl p-6 shadow-2xl transform group-hover:rotate-y-6 group-hover:-translate-y-2 transition-all duration-500" style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}>
                    <div className="flex items-center gap-3 mb-6 border-b border-slate-300 dark:border-white/10 pb-4">
                      <Sliders className="w-5 h-5 text-emerald-400" />
                      <span className="text-slate-900 dark:text-white font-semibold">Agent Configuration</span>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">System Prompt</label>
                        <div className="bg-black/50 border border-slate-200 dark:border-white/5 rounded-lg p-3 text-sm text-slate-600 dark:text-slate-300 font-mono">
                          &quot;You are Priya, a sales rep for Acme Corp. You must qualify leads by asking about their budget...&quot;
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="flex-1 bg-black/50 border border-slate-200 dark:border-white/5 rounded-lg p-3 flex justify-between items-center">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Voice Model</span>
                          <span className="text-xs text-slate-900 dark:text-white">en-IN-Priya</span>
                        </div>
                        <div className="flex-1 bg-black/50 border border-slate-200 dark:border-white/5 rounded-lg p-3 flex justify-between items-center">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Language</span>
                          <span className="text-xs text-slate-900 dark:text-white">English (US)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Step 2 */}
              <div className="relative z-10 flex flex-col md:flex-row-reverse items-center gap-8 md:gap-16 group">
                <motion.div 
                  initial={{ opacity: 0, x: 50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ type: "spring", bounce: 0.3 }}
                  className="flex-1 text-left bg-white dark:bg-[#0a1128]/80 p-8 rounded-3xl border border-slate-300 dark:border-white/10 hover:border-emerald-500/50 transition-colors shadow-2xl backdrop-blur-md"
                >
                  <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">2. Feed it Knowledge</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed mb-4">
                    An agent is only as good as what it knows. FinBud&apos;s built-in RAG (Retrieval-Augmented Generation) engine allows you to upload unstructured data directly to the agent&apos;s brain.
                  </p>
                  <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">
                    Upload PDF brochures, past call transcripts, or simply paste the URL of your company&apos;s Help Center. The AI will index this instantly and use it to answer highly specific customer questions accurately, eliminating hallucinations.
                  </p>
                </motion.div>
                
                <motion.div initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.2, type: "spring" }} className="w-16 h-16 rounded-full bg-slate-50 dark:bg-[#020617] border-4 border-emerald-500 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-2xl flex-shrink-0 shadow-[0_0_30px_rgba(16,185,129,0.3)] relative z-20">2</motion.div>
                
                <motion.div 
                  initial={{ opacity: 0, x: -50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="flex-1 hidden md:block relative"
                >
                  {/* Graphical Mockup 2 */}
                  <div className="bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-white/10 rounded-2xl p-6 shadow-2xl transform group-hover:-rotate-y-6 group-hover:-translate-y-2 transition-all duration-500" style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}>
                    <div className="flex items-center justify-between mb-6 border-b border-slate-300 dark:border-white/10 pb-4">
                      <div className="flex items-center gap-3">
                        <Database className="w-5 h-5 text-indigo-400" />
                        <span className="text-slate-900 dark:text-white font-semibold">Knowledge Base</span>
                      </div>
                      <span className="bg-indigo-500/20 text-indigo-400 text-xs px-2 py-1 rounded">Synced</span>
                    </div>
                    
                    <div className="border-2 border-dashed border-slate-300 dark:border-white/10 rounded-xl p-6 flex flex-col items-center justify-center bg-black/20 mb-4">
                      <UploadCloud className="w-8 h-8 text-slate-600 dark:text-slate-500 mb-2" />
                      <span className="text-sm text-slate-600 dark:text-slate-400">Drag & Drop PDFs or enter URLs</span>
                    </div>

                    <div className="space-y-2">
                      <div className="bg-black/50 border border-slate-200 dark:border-white/5 rounded-lg p-3 flex items-center gap-3">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm text-slate-600 dark:text-slate-300 flex-1">Platform_Guide_2024.pdf</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="bg-black/50 border border-slate-200 dark:border-white/5 rounded-lg p-3 flex items-center gap-3">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm text-slate-600 dark:text-slate-300 flex-1">https://acme.com/faq</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Step 3 */}
              <div className="relative z-10 flex flex-col md:flex-row items-center gap-8 md:gap-16 group">
                <motion.div 
                  initial={{ opacity: 0, x: -50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ type: "spring", bounce: 0.3 }}
                  className="flex-1 md:text-right bg-white dark:bg-[#0a1128]/80 p-8 rounded-3xl border border-slate-300 dark:border-white/10 hover:border-emerald-500/50 transition-colors shadow-2xl backdrop-blur-md"
                >
                  <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">3. Connect Telephony</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed mb-4">
                    FinBud seamlessly bridges the gap between internet protocols (WebRTC) and legacy phone networks (PSTN).
                  </p>
                  <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">
                    You can either purchase a new phone number directly through our dashboard in over 40 countries, or securely import your existing Twilio, Exotel, or Plivo credentials to utilize your own SIP trunks and carrier rates.
                  </p>
                </motion.div>
                
                <motion.div initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.2, type: "spring" }} className="w-16 h-16 rounded-full bg-slate-50 dark:bg-[#020617] border-4 border-emerald-500 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-2xl flex-shrink-0 shadow-[0_0_30px_rgba(16,185,129,0.3)] relative z-20">3</motion.div>
                
                <motion.div 
                  initial={{ opacity: 0, x: 50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="flex-1 hidden md:block relative"
                >
                   {/* Graphical Mockup 3 */}
                   <div className="bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-white/10 rounded-2xl p-6 shadow-2xl transform group-hover:rotate-y-6 group-hover:-translate-y-2 transition-all duration-500" style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}>
                    <div className="flex items-center gap-3 mb-6 border-b border-slate-300 dark:border-white/10 pb-4">
                      <Phone className="w-5 h-5 text-amber-400" />
                      <span className="text-slate-900 dark:text-white font-semibold">Phone Numbers</span>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 flex items-center justify-between">
                        <div>
                          <div className="text-slate-900 dark:text-white font-mono text-lg">+91 98765 43210</div>
                          <div className="text-emerald-400 text-xs">Active • Inbound & Outbound</div>
                        </div>
                        <div className="bg-emerald-500 text-black text-xs font-bold px-2 py-1 rounded">Twilio SIP</div>
                      </div>
                      
                      <div className="bg-black/50 border border-slate-200 dark:border-white/5 rounded-lg p-4 flex items-center justify-between opacity-50">
                        <div>
                          <div className="text-slate-600 dark:text-slate-400 font-mono text-lg">+91 98765 43210</div>
                          <div className="text-slate-600 dark:text-slate-500 text-xs">Unassigned</div>
                        </div>
                        <div className="bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white text-xs font-bold px-2 py-1 rounded">Exotel</div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Step 4 */}
              <div className="relative z-10 flex flex-col md:flex-row-reverse items-center gap-8 md:gap-16 group">
                <motion.div 
                  initial={{ opacity: 0, x: 50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ type: "spring", bounce: 0.3 }}
                  className="flex-1 text-left bg-white dark:bg-[#0a1128]/80 p-8 rounded-3xl border border-slate-300 dark:border-white/10 hover:border-emerald-500/50 transition-colors shadow-2xl backdrop-blur-md"
                >
                  <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">4. Monitor in Real-Time</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed mb-4">
                    Once live, your agent handles calls autonomously. You can publish your number on your website for inbound customer service, or upload a CSV list of leads and click &apos;Start Campaign&apos; for outbound sales.
                  </p>
                  <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">
                    Watch the dashboard as calls happen in real-time. View live transcripts, monitor sentiment, listen to call recordings immediately after they end, and analyze the AI&apos;s success rate.
                  </p>
                </motion.div>
                
                <motion.div initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.2, type: "spring" }} className="w-16 h-16 rounded-full bg-slate-50 dark:bg-[#020617] border-4 border-emerald-500 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-2xl flex-shrink-0 shadow-[0_0_30px_rgba(16,185,129,0.3)] relative z-20">4</motion.div>
                
                <motion.div 
                  initial={{ opacity: 0, x: -50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="flex-1 hidden md:block relative"
                >
                   {/* Graphical Mockup 4 */}
                   <div className="bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-white/10 rounded-2xl overflow-hidden shadow-2xl transform group-hover:-rotate-y-6 group-hover:-translate-y-2 transition-all duration-500" style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}>
                    <div className="bg-slate-100 dark:bg-[#1e293b] px-4 py-3 flex items-center gap-2 border-b border-slate-300 dark:border-white/10">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <div className="w-3 h-3 rounded-full bg-amber-500" />
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                      <span className="text-xs text-slate-600 dark:text-slate-400 ml-2 font-mono">Live Call Feed</span>
                    </div>
                    <div className="p-4 space-y-3 bg-white dark:bg-[#0a1128]">
                      <div className="flex justify-between items-center bg-slate-100 dark:bg-white/5 rounded p-3">
                        <div className="flex items-center gap-3">
                          <Bot className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-sm text-slate-900 dark:text-white">Call to +91 98765 432...</span>
                        </div>
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">Success</span>
                      </div>
                      <div className="p-4 bg-black/40 rounded-lg border border-slate-200 dark:border-white/5 space-y-3">
                        <div className="flex gap-2">
                          <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-1" />
                          <div className="text-xs text-slate-600 dark:text-slate-300">&quot;Hi, this is Priya from Acme Corp. Am I speaking with Rahul?&quot;</div>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <div className="text-xs text-slate-600 dark:text-slate-400">&quot;Yes, speaking. How can I help?&quot;</div>
                          <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center mt-1 text-[8px] text-white">U</div>
                        </div>
                         <div className="flex gap-2">
                          <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-1" />
                          <div className="text-xs text-slate-600 dark:text-slate-300">&quot;I noticed you downloaded our platform guide...&quot;</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>

            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
