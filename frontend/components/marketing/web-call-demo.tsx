'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Mic, MicOff, X, Bot, User, Send, MessageSquare } from 'lucide-react';

interface WebCallDemoProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode: 'voice' | 'chat';
}

export function WebCallDemo({ isOpen, onClose, defaultMode }: WebCallDemoProps) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'ended'>('connecting');
  const [mode, setMode] = useState<'voice' | 'chat'>(defaultMode);

  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<{ role: 'user' | 'agent', text: string }[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [inputText, setInputText] = useState('');
  
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
      // Trigger voice loading
      if (synthRef.current.onvoiceschanged !== undefined) {
        synthRef.current.onvoiceschanged = () => synthRef.current?.getVoices();
      }
      
      // @ts-ignore
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        
        recognitionRef.current.onresult = (event: any) => {
          const text = event.results[0][0].transcript;
          handleUserMessage(text);
        };

        recognitionRef.current.onend = () => {
          if (mode === 'voice' && status === 'connected' && !isSpeaking && !isMuted && !isProcessing) {
            try { recognitionRef.current?.start(); } catch (e) {}
          }
        };
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isSpeaking, isMuted, mode, isProcessing]);

  useEffect(() => {
    if (isOpen) {
      setMode(defaultMode);
      setStatus('connecting');
      setTranscript([]);
      
      const timer = setTimeout(() => {
        setStatus('connected');
        const greeting = "Hi there! I'm Priya, the FinBud Support Agent. Ask me about our pricing, latency, or languages!";
        if (defaultMode === 'voice') speak(greeting);
        setTranscript([{ role: 'agent', text: greeting }]);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      endSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultMode]);

  useEffect(() => {
    if (status === 'connected') {
      if (mode === 'voice' && !isMuted && !isSpeaking && !isProcessing) {
        try { recognitionRef.current?.start(); } catch(e){}
      } else {
        try { recognitionRef.current?.stop(); } catch(e){}
      }
    }
  }, [mode, status, isMuted, isSpeaking, isProcessing]);

  const handleUserMessage = async (text: string) => {
    if (!text.trim()) return;
    const newTranscript = [...transcript, { role: 'user' as const, text }];
    setTranscript(newTranscript);
    setInputText('');
    setIsProcessing(true);
    
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: newTranscript })
      });
      const data = await res.json();
      
      if (data.reply) {
        setTranscript(prev => [...prev, { role: 'agent', text: data.reply }]);
        if (mode === 'voice') speak(data.reply);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    handleUserMessage(inputText);
  };

  const speak = (text: string) => {
    if (mode !== 'voice') return;
    
    // Cancel any existing TTS
    if (synthRef.current) synthRef.current.cancel(); 
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // Attempt realistic voice via Google Translate TTS
    // en-IN gives a realistic Indian female voice (perfect for Priya)
    const ttsLang = 'en-IN';
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=₹{encodeURIComponent(text)}&tl=₹{ttsLang}&client=tw-ob`;
    
    const audio = new Audio(url);
    audioRef.current = audio;
    
    audio.onplay = () => {
      setIsSpeaking(true);
      try { recognitionRef.current?.stop(); } catch(e){}
    };
    
    audio.onended = () => {
      setIsSpeaking(false);
      if (mode === 'voice' && status === 'connected' && !isMuted && !isProcessing) {
         try { recognitionRef.current?.start(); } catch(e){}
      }
    };

    audio.play().catch(e => {
      console.error("Realistic TTS blocked or failed, falling back to browser TTS", e);
      // Fallback to browser TTS if audio is blocked or fails
      if (!synthRef.current) return;
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = synthRef.current.getVoices();
      let preferredVoice = voices.find(v => v.name.includes('Google US English') || v.name.includes('Samantha') || v.name.includes('Female'));
      utterance.pitch = 1.1;
      if (preferredVoice) utterance.voice = preferredVoice;

      utterance.onstart = () => { setIsSpeaking(true); try { recognitionRef.current?.stop(); } catch(e){} };
      utterance.onend = () => { 
        setIsSpeaking(false); 
        if (mode === 'voice' && status === 'connected' && !isMuted && !isProcessing) try { recognitionRef.current?.start(); } catch(e){} 
      };
      synthRef.current.speak(utterance);
    });
  };

  // Rest of the component follows...
  const endSession = () => {
    setStatus('ended');
    if (synthRef.current) synthRef.current.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    try { recognitionRef.current?.stop(); } catch(e){}
    setTimeout(onClose, 500);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (!isMuted) {
      try { recognitionRef.current?.stop(); } catch(e){}
    } else if (!isSpeaking && mode === 'voice') {
      try { recognitionRef.current?.start(); } catch(e){}
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          onClick={endSession}
        />

        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative bg-white dark:bg-[#0a1128] border border-slate-300 dark:border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col h-[650px]"
        >
          {/* Header */}
          <div className="p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#020617] flex items-center justify-between z-10 relative">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                {status === 'connected' && <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#020617] rounded-full" />}
              </div>
              <div>
                <h3 className="text-slate-900 dark:text-white font-bold">FinBud Support AI</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {status === 'connecting' ? 'Connecting...' : status === 'connected' ? 'Online' : 'Session ended'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">

              <div className="bg-slate-100 dark:bg-white/5 rounded-full p-1 flex">
                <button 
                  onClick={() => setMode('chat')} 
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${mode === 'chat' ? 'bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  <MessageSquare className="w-3.5 h-3.5 inline mr-1" /> Chat
                </button>
                <button 
                  onClick={() => {
                    setMode('voice');
                    if (status === 'connected') {
                      speak("Switched to voice mode. I'm listening.");
                    }
                  }} 
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${mode === 'voice' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  <Phone className="w-3.5 h-3.5 inline mr-1" /> Voice
                </button>
              </div>
              <button onClick={endSession} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 transition-colors ml-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Transcript Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 flex flex-col scrollbar-hide bg-white dark:bg-[#0a1128] relative">
            {/* Visualizer Background for Voice Mode */}
            {mode === 'voice' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                <div className="w-48 h-48 rounded-full bg-emerald-500 blur-[80px]" />
              </div>
            )}

            {transcript.map((msg, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'} z-10`}
              >
                <div className={`px-4 py-3 rounded-2xl text-sm shadow-md ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-slate-100 dark:bg-[#1e293b] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/5 rounded-bl-sm'}`}>
                  {msg.text}
                </div>
              </motion.div>
            ))}
            
            {status === 'connected' && mode === 'voice' && !isSpeaking && !isMuted && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="self-center flex flex-col items-center gap-2 mt-8 z-10">
                <div className="flex gap-1 items-center h-12">
                   <motion.div animate={{ height: ["10px", "20px", "10px"] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2 bg-emerald-400 rounded-full" />
                   <motion.div animate={{ height: ["10px", "30px", "10px"] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-2 bg-emerald-400 rounded-full" />
                   <motion.div animate={{ height: ["10px", "15px", "10px"] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-2 bg-emerald-400 rounded-full" />
                </div>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium tracking-widest uppercase">Listening</span>
              </motion.div>
            )}

            {isSpeaking && mode === 'voice' && (
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="self-center flex flex-col items-center gap-2 mt-8 z-10">
                <div className="flex gap-1 items-center h-16">
                  {[1,2,3,4,5].map((i) => (
                    <motion.div key={i} animate={{ height: ["20px", "60px", "20px"] }} transition={{ repeat: Infinity, duration: 0.5 + (i * 0.1) }} className="w-3 bg-emerald-500 rounded-full" />
                  ))}
                </div>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium tracking-widest uppercase">Speaking</span>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Controls Area */}
          <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#020617] z-10 relative">
            {mode === 'chat' ? (
              <form onSubmit={handleSendText} className="flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-full px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500/50"
                  disabled={status !== 'connected'}
                />
                <button 
                  type="submit"
                  disabled={!inputText.trim() || status !== 'connected'}
                  className="w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 flex items-center justify-center text-slate-900 dark:text-white transition-colors flex-shrink-0 shadow-lg"
                >
                  <Send className="w-5 h-5 ml-0.5" />
                </button>
              </form>
            ) : (
              <div className="flex justify-center gap-6">
                <button 
                  onClick={toggleMute}
                  disabled={status !== 'connected'}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-amber-500/20 text-amber-600 dark:text-amber-500 hover:bg-amber-500/30' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-white hover:bg-slate-300 dark:hover:bg-white/20'}`}
                >
                  {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>
                <button 
                  onClick={endSession}
                  className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/20 transition-colors"
                >
                  <Phone className="w-6 h-6 text-slate-900 dark:text-white rotate-[135deg]" />
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
