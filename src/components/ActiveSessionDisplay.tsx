
import React, { useRef, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Activity, Gauge, AlertCircle } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useAnimationCoordinator } from '../hooks/useAnimationCoordinator';
import { useEngine } from '../engine/EngineProvider';
import { TRANSLATIONS } from '../translations';
import { ProgressArc } from './ProgressArc';
import { useKernel } from '../kernel/KernelProvider';
import { useCameraVitals } from '../hooks/useCameraVitals';

export function ActiveSessionDisplay() {
  const isActive = useSessionStore(s => s.isActive);
  const isPaused = useSessionStore(s => s.isPaused);
  const phase = useSessionStore(s => s.phase);
  const cycleCount = useSessionStore(s => s.cycleCount);
  const userSettings = useSettingsStore(s => s.userSettings);

  const { progressRef } = useEngine();
  const animationCoordinator = useAnimationCoordinator();
  const kernel = useKernel();
  
  // We consume this here purely for error UI state, actual processing is in Engine
  const { isReady, error: cameraError } = useCameraVitals(isActive && userSettings.cameraVitalsEnabled);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const ringCircleRef = useRef<SVGCircleElement>(null);

  const t = TRANSLATIONS[userSettings.language] || TRANSLATIONS.en;

  const [vitals, setVitals] = useState({ heartRate: 0, confidence: 0 });
  const [tempoScale, setTempoScale] = useState(1.0);

  const phaseLabel = useMemo(() => {
    if (phase === 'holdIn' || phase === 'holdOut') return t.phases.hold;
    return t.phases[phase];
  }, [phase, t]);

  useEffect(() => {
    const unsub = kernel.subscribe(state => {
      setTempoScale(state.tempoScale);
      if (state.lastObservation && state.lastObservation.heart_rate !== undefined) {
         setVitals({
             heartRate: Math.round(state.lastObservation.heart_rate),
             confidence: state.lastObservation.hr_confidence || 0
         });
      } else {
         setVitals({ heartRate: 0, confidence: 0 });
      }
    });
    return unsub;
  }, [kernel]);

  useEffect(() => {
    if (!isActive) {
      if (containerRef.current) containerRef.current.style.transform = 'scale(1)';
      return;
    }

    const RING_SIZE = 220;
    const STROKE = 2;
    const RADIUS = (RING_SIZE - STROKE) / 2;
    const CIRCUMFERENCE = RADIUS * 2 * Math.PI;

    return animationCoordinator.subscribe(() => {
      const p = progressRef.current;
      
      if (ringCircleRef.current) {
        const offset = CIRCUMFERENCE - p * CIRCUMFERENCE;
        ringCircleRef.current.style.strokeDashoffset = String(offset);
      }

      let scale = 1;
      if (phase === 'inhale') scale = 1 + (p * 0.08); 
      else if (phase === 'exhale') scale = 1.08 - (p * 0.08);
      else if (phase === 'holdIn') scale = 1.08;
      else if (phase === 'holdOut') scale = 1;
      
      if (containerRef.current) {
        containerRef.current.style.transform = `scale(${scale})`;
      }
    });
  }, [isActive, phase, animationCoordinator, progressRef]);

  if (!isActive) return null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
        
        {/* Main Breathing Center */}
        <div className={clsx("relative flex items-center justify-center transition-all duration-700", isPaused ? "opacity-30 blur-sm scale-95" : "opacity-100 scale-100")}>
            <div 
                ref={containerRef}
                className="absolute inset-0 flex flex-col items-center justify-center z-10 will-change-transform"
            >
                <div className="text-5xl md:text-6xl font-serif font-medium tracking-[0.05em] text-white/90 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] mix-blend-screen">
                    {phaseLabel}
                </div>
                {userSettings.showTimer && (
                    <div className="mt-4 flex items-center gap-2">
                        <div className="h-[1px] w-4 bg-white/20"></div>
                        <div className="text-[10px] font-mono text-white/40 uppercase tracking-[0.2em]">
                            {t.ui.cycle} {cycleCount + 1}
                        </div>
                        <div className="h-[1px] w-4 bg-white/20"></div>
                    </div>
                )}
            </div>
            {userSettings.showTimer && (
                <ProgressArc size={260} circleRef={ringCircleRef} />
            )}
        </div>

        {/* Pause Overlay */}
        {isPaused && (
        <div className="absolute inset-0 flex items-center justify-center z-30">
            <div className="px-8 py-4 rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl shadow-2xl animate-in fade-in zoom-in-95">
                <div className="text-xs font-bold tracking-[0.3em] uppercase text-white/90 text-center">
                    {t.ui.paused}
                </div>
                <div className="text-[9px] text-white/40 font-mono text-center mt-1 tracking-wider">
                    SYSTEM HALTED
                </div>
            </div>
        </div>
        )}

        {/* Adaptive Tempo Indicator */}
        {tempoScale > 1.05 && !isPaused && (
            <div className="absolute top-[20%] text-center animate-in fade-in slide-in-from-top-4 duration-700">
                <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-[10px] text-blue-300 backdrop-blur-sm flex items-center gap-2">
                <Gauge size={12} className="animate-pulse" />
                <span>Adjusting Rhythm... ({(tempoScale * 100).toFixed(0)}%)</span>
                </div>
            </div>
        )}

        {/* Camera Error State */}
        {userSettings.cameraVitalsEnabled && cameraError && !isPaused && (
            <div className="absolute bottom-[30%] text-center animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] text-red-400 backdrop-blur-sm flex items-center gap-2">
                    <AlertCircle size={12} />
                    <span>Sensors Offline: {cameraError}</span>
                </div>
            </div>
        )}

        {/* Camera Loading State */}
        {userSettings.cameraVitalsEnabled && !isReady && !cameraError && !isPaused && (
            <div className="absolute bottom-[20%] text-center animate-pulse">
                <div className="px-4 py-2 bg-white/5 rounded-xl text-[10px] text-white/40 backdrop-blur-sm flex items-center gap-2">
                    <Activity size={12} />
                    <span>Initializing Bio-Sensors...</span>
                </div>
            </div>
        )}

        {/* Bio-Metrics HUD */}
        {userSettings.cameraVitalsEnabled && vitals.confidence > 0.4 && !isPaused && (
            <div className="absolute bottom-[20%] text-center animate-in fade-in slide-in-from-bottom-4 duration-1000">
                <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-white/[0.02] border border-white/5 backdrop-blur-sm">
                    <div className="flex items-center gap-2 text-[9px] text-emerald-400 uppercase tracking-widest font-bold">
                        <Activity size={10} className="animate-pulse" /> Live Vitals
                    </div>
                    <div className="text-3xl font-light text-white/90 font-mono tracking-tighter tabular-nums leading-none">
                        {vitals.heartRate}
                        <span className="text-xs text-white/30 ml-1 font-sans">BPM</span>
                    </div>
                    <div className="w-full bg-white/10 h-0.5 rounded-full mt-1 overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${vitals.confidence * 100}%` }} />
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}