
import React, { createContext, useContext, useRef, useEffect, useState } from 'react';
import { PureZenBKernel, RuntimeState } from '../services/PureZenBKernel';
import { SafetyConfig } from '../config/SafetyConfig';
import { bioFS } from '../services/bioFS';

const KernelContext = createContext<{ kernel: PureZenBKernel; state: RuntimeState } | null>(null);

export const KernelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const kernelRef = useRef<PureZenBKernel | null>(null);
  
  if (!kernelRef.current) {
    kernelRef.current = new PureZenBKernel(SafetyConfig, bioFS);
  }

  const [state, setState] = useState<RuntimeState>(kernelRef.current.getState());

  useEffect(() => {
    return kernelRef.current!.subscribe(setState);
  }, []);

  return (
    <KernelContext.Provider value={{ kernel: kernelRef.current!, state }}>
      {children}
    </KernelContext.Provider>
  );
};

export function useKernel() {
  const ctx = useContext(KernelContext);
  if (!ctx) throw new Error("useKernel must be used within KernelProvider");
  return ctx.kernel;
}

export function useKernelState<T>(selector: (state: RuntimeState) => T): T {
  const ctx = useContext(KernelContext);
  if (!ctx) throw new Error("useKernelState must be used within KernelProvider");
  return selector(ctx.state);
}

export const useBioFSHealth = () => bioFS.getHealth();
