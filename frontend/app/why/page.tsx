'use client';

import { Navbar } from '@/components/marketing/navbar';
import { Footer } from '@/components/marketing/footer';
import { Zap, Globe2, ShieldCheck, MessageSquare, BookOpen, BarChart3, Database, Cpu, Network, AudioWaveform } from 'lucide-react';
import { motion } from 'framer-motion';

export default function WhyPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-slate-50 selection:bg-emerald-500/30 font-sans flex flex-col">
      <Navbar />

      <main className="relative z-10 pt-32 pb-24 flex-1">
        {/* Hero Section */}
        <section className="px-6 max-w-7xl mx-auto mb-24">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white mb-6">The FinBud Advantage</h1>
            <p className="text-slate-600 dark:text-slate-400 max-w-3xl mx-auto text-lg md:text-xl leading-relaxed mb-8">
              FinBud AI isn&apos;t just a wrapper. We&apos;ve built an enterprise-grade voice architecture optimized for the Indian and global markets. By orchestrating top-tier LLMs, native Speech-to-Text, and emotionally intelligent Text-to-Speech engines, we achieve sub-800ms conversational latency.
            </p>
          </motion.div>
        </section>

        {/* Graphical Architecture View */}
        <section className="px-6 max-w-6xl mx-auto mb-32">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">Our Sub-Second Voice Pipeline</h2>
            <p className="text-slate-600 dark:text-slate-400">A visual breakdown of how FinBud processes calls faster than human reaction time.</p>
          </div>

          <div className="relative bg-white dark:bg-[#0a1128] border border-slate-300 dark:border-white/10 rounded-3xl p-8 md:p-16 overflow-hidden shadow-2xl">
            {/* Animated Grid Background */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-20 pointer-events-none" />
            
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 md:gap-4">
              
              {/* Step 1: Telephony */}
              <motion.div 
                whileHover={{ scale: 1.05, rotateY: 10 }}
                className="flex flex-col items-center bg-slate-50 dark:bg-[#020617]/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200 dark:border-white/5 w-full md:w-1/4"
                style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}
              >
                <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mb-4 border border-blue-500/50">
                  <Network className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-2">1. Telephony Layer</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 text-center">WebRTC SIP Trunks connect the user via Twilio/Exotel with ~50ms latency.</p>
              </motion.div>

              {/* Arrow */}
              <div className="hidden md:flex flex-1 items-center justify-center relative">
                <div className="h-[2px] w-full bg-slate-200 dark:bg-white/10 relative overflow-hidden">
                   <motion.div animate={{ x: ["-100%", "200%"] }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }} className="h-full w-1/2 bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
                </div>
              </div>

              {/* Step 2: Processing (STT & LLM) */}
              <motion.div 
                whileHover={{ scale: 1.05, rotateY: 10 }}
                className="flex flex-col items-center bg-slate-50 dark:bg-[#020617]/80 backdrop-blur-md p-6 rounded-2xl border border-emerald-500/30 w-full md:w-1/3 shadow-[0_0_30px_rgba(16,185,129,0.1)] relative"
                style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}
              >
                <div className="absolute -top-3 right-4 bg-emerald-500 text-xs font-bold px-2 py-1 rounded text-black shadow-lg">CORE</div>
                <div className="flex gap-4 mb-4">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/50">
                    <AudioWaveform className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center border border-purple-500/50">
                    <Cpu className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-2">2. Deepgram STT + Groq LLM</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 text-center">Transcribes speech in &lt;300ms, understands context, and generates the AI&apos;s response in &lt;400ms.</p>
              </motion.div>

              {/* Arrow */}
              <div className="hidden md:flex flex-1 items-center justify-center relative">
                <div className="h-[2px] w-full bg-slate-200 dark:bg-white/10 relative overflow-hidden">
                   <motion.div animate={{ x: ["-100%", "200%"] }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear", delay: 0.5 }} className="h-full w-1/2 bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
                </div>
              </div>

              {/* Step 3: TTS */}
              <motion.div 
                whileHover={{ scale: 1.05, rotateY: 10 }}
                className="flex flex-col items-center bg-slate-50 dark:bg-[#020617]/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200 dark:border-white/5 w-full md:w-1/4"
                style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}
              >
                <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center mb-4 border border-amber-500/50">
                  <Database className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-2">3. Emotional TTS</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 text-center">Sarvam/Cartesia streams human-like audio back to the caller in &lt;200ms.</p>
              </motion.div>

            </div>
          </div>
        </section>

        {/* Detailed Feature Grid */}
        <section className="px-6 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">Enterprise Features Built-In</h2>
            <p className="text-slate-600 dark:text-slate-400 text-lg">Every FinBud AI agent comes packed with capabilities designed for serious business operations.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8" style={{ perspective: '1200px' }}>
            {[
              { icon: Zap, title: 'Ultra-Low Latency', desc: 'Latency is the biggest killer of AI voice agents. We have deeply optimized our networking layer, utilizing WebSockets and streaming audio chunks, to ensure response times stay under 800 milliseconds. This makes conversations feel entirely natural, preventing users from talking over the AI.' },
              { icon: Globe2, title: 'Native Multilingualism', desc: 'Unlike competitors that struggle with accents, FinBud is uniquely tuned for the Indian subcontinent alongside global markets. Our agents seamlessly switch between English (US/UK/IN), Hindi, Tamil, Telugu, Spanish, and French, perfectly understanding mixed-language queries (e.g., "Hinglish").' },
              { icon: ShieldCheck, title: 'Bring Your Own Telephony', desc: 'We don\'t lock you into expensive marked-up minutes. Securely bring your own SIP trunks or connect your existing Twilio, Exotel, Plivo, or Knowlarity accounts. You retain complete ownership of your phone numbers and benefit from your negotiated carrier rates.' },
              { icon: MessageSquare, title: 'Omnichannel Routing', desc: 'Voice is just one touchpoint. If a user doesn\'t pick up, or if the conversation requires sending a link, FinBud automatically triggers fallback workflows via SMS, WhatsApp, or Email. It can even intelligently transfer complex calls to a human agent with full transcript context.' },
              { icon: BookOpen, title: 'RAG Knowledge Base', desc: 'Don\'t let your agent hallucinate. Simply upload your company PDFs, paste website URLs, or write a custom FAQ. FinBud uses Retrieval-Augmented Generation (RAG) to fetch exact facts from your documents, ensuring the AI only speaks accurate information about your business.' },
              { icon: BarChart3, title: 'Actionable Intelligence', desc: 'Every call is recorded, transcribed, and analyzed in real-time. Our dashboard provides sentiment analysis, automatic lead scoring, and call summarization. Instantly know if an outbound campaign was successful without manually listening to hundreds of recordings.' }
            ].map((f, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 50, rotateX: 10 }}
                whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.1, type: "spring", stiffness: 100 }}
                whileHover={{ scale: 1.05, rotateY: 5, zIndex: 10 }}
                className="bg-white dark:bg-[#0a1128]/50 border border-slate-200 dark:border-white/5 rounded-2xl p-8 cursor-pointer relative overflow-hidden group shadow-lg shadow-black/50 flex flex-col"
                style={{ transformStyle: 'preserve-3d' }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 to-emerald-500/0 group-hover:from-emerald-500/10 transition-colors duration-500" />
                <div className="w-14 h-14 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-6 group-hover:bg-emerald-500/20 group-hover:scale-110 transition-all border border-emerald-500/20">
                  <f.icon className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4 translate-z-10">{f.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm translate-z-10 flex-1">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
