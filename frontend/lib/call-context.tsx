'use client';
import React, { createContext, useContext } from 'react';

const CallContext = createContext<null>(null);
export function CallProvider({ children }: { children: React.ReactNode }) {
  return <CallContext.Provider value={null}>{children}</CallContext.Provider>;
}
export function useCall() { return useContext(CallContext); }
