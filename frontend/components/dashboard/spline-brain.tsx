'use client';

import { motion } from 'motion/react';

export function SplineBrain() {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8 }}
      className="w-full h-[400px] rounded-3xl overflow-hidden relative glass-card flex items-center justify-center"
    >
      <div className="absolute inset-0 z-10 pointer-events-none rounded-3xl ring-1 ring-white/10 dark:ring-white/5" />
      
      {/* AI Core Effect */}
      <div className="relative w-48 h-48">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 rounded-full bg-cyan-500/20 blur-3xl"
        />
        {/* Core rings */}
        <motion.div 
          animate={{ rotate: 360, scale: [1, 1.05, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 rounded-full border-2 border-dashed border-cyan-400/30"
        />
        <motion.div 
          animate={{ rotate: -360, scale: [0.9, 0.95, 0.9] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute inset-4 rounded-full border border-emerald-400/40"
        />
        {/* Center Node */}
        <motion.div 
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-16 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 shadow-[0_0_30px_rgba(6,182,212,0.6)]"
        />
      </div>
      
      <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-background/20 pointer-events-none z-10" />
    </motion.div>
  );
}
