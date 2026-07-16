'use client';

import { useState } from 'react';
import { Navbar } from '@/components/marketing/navbar';
import { Footer } from '@/components/marketing/footer';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Phone, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WebCallDemo } from '@/components/marketing/web-call-demo';

const FAQS = [
  { q: 'How does the AI handle accents and regional languages?', a: 'FinBud integrates with specialized voice providers like Sarvam AI for fluent Indian languages and Exote for global accents, ensuring high-quality, natural-sounding conversations. The underlying LLM is prompt-engineered to understand context and mixed-languages (like Hinglish).' },
  { q: 'Can I use my existing phone numbers?', a: 'Yes! You can connect your existing SIP trunks or telephony providers like Twilio, Exotel, and Knowlarity directly in the dashboard. We provide simple webhook integrations so you do not have to migrate away from your current carrier.' },
  { q: 'What happens if the AI cannot answer a question?', a: 'You can define fallback behaviors. The AI can seamlessly transfer the call to a human agent, take a message, or follow up with an SMS/WhatsApp message with more information. The AI is trained to politely admit when it does not know something.' },
  { q: 'Is there a limit to how many concurrent calls I can make?', a: 'By default, accounts support 2 concurrent calls. If you need massive concurrency (e.g. 1,000+ simultaneous calls for outbound blasts), please contact our team to upgrade your concurrency limits.' },
  { q: 'Is my data secure?', a: 'Absolutely. We use enterprise-grade encryption for all data at rest and in transit. Your custom knowledge bases and call transcripts are securely isolated per-tenant. We never use your proprietary data to train our foundational models.' },
  { q: 'Do you offer a free trial?', a: 'Yes, all new accounts receive a 14-day free trial with 10 complimentary minutes to test out building and deploying an AI agent. No credit card is required to start building.' }
];

export default function FAQPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const [demoMode, setDemoMode] = useState<'voice' | 'chat'>('voice');

  const openDemo = (mode: 'voice' | 'chat') => {
    setDemoMode(mode);
    setIsDemoOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-slate-50 selection:bg-emerald-500/30 font-sans flex flex-col">
      <Navbar />

      <main className="relative z-10 pt-32 pb-24 flex-1">
        <section className="px-6 max-w-4xl mx-auto mb-32">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white mb-6">Frequently Asked Questions</h1>
            <p className="text-slate-600 dark:text-slate-400 text-lg md:text-xl max-w-2xl mx-auto">
              Everything you need to know about FinBud&apos;s capabilities, telephony integration, and data security.
            </p>
          </motion.div>
          
          <div className="space-y-6" style={{ perspective: '1000px' }}>
            {FAQS.map((faq, idx) => (
              <motion.div 
                key={idx} 
                initial={{ opacity: 0, x: -20, rotateX: -10 }}
                animate={{ opacity: 1, x: 0, rotateX: 0 }}
                transition={{ delay: idx * 0.1, type: "spring" }}
                whileHover={{ scale: 1.02, rotateX: 2 }}
                className="bg-white dark:bg-[#0a1128]/80 border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden transition-all backdrop-blur-sm hover:border-emerald-500/30 shadow-lg shadow-black/40 cursor-pointer"
                style={{ transformStyle: 'preserve-3d' }}
              >
                <button 
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-white/[0.04] translate-z-10"
                >
                  <span className="font-semibold text-slate-900 dark:text-white text-lg pr-4">{faq.q}</span>
                  {openFaq === idx ? <ChevronUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-600 dark:text-slate-500 flex-shrink-0" />}
                </button>
                <AnimatePresence>
                  {openFaq === idx && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-6 pb-5 text-slate-600 dark:text-slate-400 leading-relaxed overflow-hidden text-base translate-z-10 border-t border-slate-200 dark:border-white/5 pt-4"
                    >
                      {faq.a}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Live Demo / Graphical Call Action */}
        <section className="px-6 max-w-5xl mx-auto border-t border-slate-300 dark:border-white/10 pt-24">
          <div className="bg-gradient-to-br from-[#0a1128] to-[#020617] border border-slate-300 dark:border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center gap-12">
            {/* Background Glow */}
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="flex-1 text-center md:text-left z-10">
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">Still have questions?</h2>
              <p className="text-slate-600 dark:text-slate-300 text-lg mb-8 leading-relaxed">
                Why read when you can just ask? Talk to our own FinBud AI Support Agent right now. It&apos;s trained on all our documentation and can answer any technical or pricing questions you have.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
                <Button onClick={() => openDemo('voice')} size="lg" className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-full px-8 shadow-lg shadow-emerald-500/20">
                  <Phone className="w-5 h-5 mr-2" /> Try Voice Call
                </Button>
                <Button onClick={() => openDemo('chat')} size="lg" variant="outline" className="rounded-full px-8 border-white/20 hover:bg-slate-100 dark:hover:bg-white/5 bg-slate-100 dark:bg-white/5">
                  <PlayCircle className="w-5 h-5 mr-2" /> Try Live Chat
                </Button>
              </div>
            </div>

            {/* Visual Phone Mockup */}
            <div className="w-full md:w-[320px] relative z-10 perspective-1000">
              <motion.div 
                animate={{ y: [0, -10, 0] }} 
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="bg-black border-4 border-slate-800 rounded-[3rem] p-4 shadow-2xl relative cursor-pointer group"
                style={{ transformStyle: 'preserve-3d', rotateY: -10, rotateX: 5 }}
                onClick={() => openDemo('voice')}
              >
                {/* Overlay hover effect */}
                <div className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/10 rounded-[2.5rem] transition-colors z-50 flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 bg-emerald-500 text-black font-bold px-4 py-2 rounded-full transform translate-y-4 group-hover:translate-y-0 transition-all shadow-lg">Click to Call</span>
                </div>

                {/* Phone Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-800 rounded-b-2xl z-20" />
                
                {/* Screen Content */}
                <div className="bg-[#111] rounded-[2.5rem] h-[500px] w-full overflow-hidden flex flex-col pt-12 relative border border-slate-300 dark:border-white/10">
                  <div className="flex flex-col items-center justify-center flex-1">
                    <div className="relative mb-6">
                      <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20" />
                      <div className="w-24 h-24 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center relative z-10 backdrop-blur-md">
                        <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.5)]">
                          <Phone className="w-8 h-8 text-slate-900 dark:text-white fill-white" />
                        </div>
                      </div>
                    </div>
                    <h3 className="text-slate-900 dark:text-white font-semibold text-xl">FinBud Support</h3>
                    <p className="text-slate-600 dark:text-slate-400 mt-2 font-mono">Tap to connect</p>
                    
                    <div className="flex gap-1 mt-6">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <motion.div 
                          key={i}
                          animate={{ height: ["10px", "40px", "10px"] }}
                          transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.1 }}
                          className="w-1.5 bg-emerald-400/30 rounded-full"
                        />
                      ))}
                    </div>
                  </div>

                  {/* Call Controls */}
                  <div className="p-6 pb-8 flex justify-center gap-6 mt-auto bg-gradient-to-t from-black to-transparent">
                    <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center backdrop-blur-md">
                       <div className="w-6 h-6 border-2 border-white rounded-full flex items-center justify-center"><div className="w-3 h-3 bg-white rounded-sm" /></div>
                    </div>
                    <div className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/20">
                      <Phone className="w-6 h-6 text-slate-900 dark:text-white rotate-[135deg]" />
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

      </main>

      <Footer />
      <WebCallDemo isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} defaultMode={demoMode} />
    </div>
  );
}
