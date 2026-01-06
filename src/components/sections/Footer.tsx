
import React, { useRef, useEffect } from 'react';
import { Play, Pause, Square, Lock, Settings2, History, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { useSessionStore } from '../../stores/sessionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUIStore } from '../../stores/uiStore';
import { TRANSLATIONS } from '../../translations';
import { BREATHING_PATTERNS, BreathingType, BreathPattern, SafetyProfile } from '../../types';
import { unlockAudio, cleanupAudio } from '../../services/audio';
import { hapticTick } from '../../services/haptics';
import { useKernel, useKernelState } from '../../kernel/KernelProvider';

type FooterProps = {
  selectedPatternId: BreathingType;
  setSelectedPatternId: (id: BreathingType) => void;
};

export function Footer({ selectedPatternId, setSelectedPatternId }: FooterProps) {
  const isActive = useSessionStore(s => s.isActive);
  const isPaused = useSessionStore(s => s.isPaused);
  const startSession = useSessionStore(s => s.startSession);
  const togglePause = useSessionStore(s => s.togglePause);
  const finishSessionStore = useSessionStore(s => s.finishSession);
  
  const userSettings = useSettingsStore(s => s.userSettings);
  const setLastUsedPattern = useSettingsStore(s => s.setLastUsedPattern);
  const registerSessionComplete = useSettingsStore(s => s.registerSessionComplete);
  const history = useSettingsStore(s => s.history);

  const setSettingsOpen = useUIStore(s => s.setSettingsOpen);
  const setHistoryOpen = useUIStore(s => s.setHistoryOpen);

  const t = TRANSLATIONS[userSettings.language] || TRANSLATIONS.en;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const kernel = useKernel();
  const safetyRegistry = useKernelState(s => s.safetyRegistry);
  const sessionStartTime = useSessionStore(s => s.sessionStartTime);
  const cycleCount = useSessionStore(s => s.cycleCount);
  const currentPattern = useSessionStore(s => s.currentPattern);

  useEffect(() => {
    if (scrollContainerRef.current && !isActive) {
        const selectedBtn = scrollContainerRef.current.querySelector(`[data-pattern="${selectedPatternId}"]`);
        if (selectedBtn) {
            selectedBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }
  }, [selectedPatternId, isActive]);

  const isPatternLocked = (pattern: BreathPattern): { locked: boolean; reason?: string } => {
    const record = safetyRegistry[pattern.id];
    if (record && record.safety_lock_until > Date.now()) {
        const remainMs = Math.max(0, record.safety_lock_until - Date.now());
        const h = Math.floor(remainMs / 3600000);
        const m = Math.floor((remainMs % 3600000) / 60000);
        return { locked: true, reason: `Safety Lock Active (${h}h ${m}m remaining)` };
    }

    if (pattern.tier === 1) return { locked: false };
    
    const qualitySessions = history.filter(h => h.durationSec > 60);
    
    if (pattern.tier === 2) {
      const minSessions = 5;
      if (qualitySessions.length < minSessions) return { locked: true, reason: `Requires ${minSessions - qualitySessions.length} more sessions` };
      return { locked: false };
    }
    
    if (pattern.tier === 3) {
      const minSessions = 20;
      if (qualitySessions.length < minSessions) return { locked: true, reason: `Requires ${minSessions - qualitySessions.length} more sessions` };
      return { locked: false };
    }
    
    return { locked: false };
  };

  const triggerHaptic = (strength: 'light' | 'medium' | 'heavy' = 'light') => {
    if (userSettings.hapticEnabled) hapticTick(true, strength);
  };

  const handleStart = () => {
    const pattern = BREATHING_PATTERNS[selectedPatternId];
    const lock = isPatternLocked(pattern);
    if (lock.locked) {
        triggerHaptic('heavy');
        return;
    }

    triggerHaptic('medium');
    unlockAudio();
    setLastUsedPattern(selectedPatternId);
    startSession(selectedPatternId);
  };

  const handleStop = () => {
    triggerHaptic('medium');
    cleanupAudio();
    
    const durationSec = Math.floor((Date.now() - sessionStartTime) / 1000);
    const kernelState = kernel.getState();
    const finalBelief = kernelState.belief;
    
    registerSessionComplete(durationSec, currentPattern.id, cycleCount, finalBelief);
    
    const isSuccess = durationSec > 45 && finalBelief.prediction_error < 0.5;
    const record: SafetyProfile = safetyRegistry[currentPattern.id] || {
        patternId: currentPattern.id,
        cummulative_stress_score: 0,
        last_incident_timestamp: 0,
        safety_lock_until: 0,
        resonance_history: []
    };
    
    const newRecord = { ...record };
    if (isSuccess) {
        newRecord.resonance_history = [...record.resonance_history, 1.0].slice(-5);
    } else {
        newRecord.resonance_history = [...record.resonance_history, 0.0].slice(-5);
        newRecord.cummulative_stress_score += 1;
        if (newRecord.cummulative_stress_score > 5) {
            newRecord.safety_lock_until = Date.now() + (24 * 60 * 60 * 1000);
            newRecord.cummulative_stress_score = 0;
        }
    }
    kernel.updateSafetyProfile(currentPattern.id, newRecord);

    finishSessionStore({
        durationSec,
        cyclesCompleted: cycleCount,
        patternId: currentPattern.id,
        timestamp: Date.now()
    });
  };
  
  const handleTogglePause = () => {
    triggerHaptic('light');
    togglePause();
  };

  const handleSelectPattern = (id: BreathingType) => {
    triggerHaptic('light');
    setSelectedPatternId(id);
  };

  const currentPatternConfig = BREATHING_PATTERNS[selectedPatternId];
  const lockStatus = isPatternLocked(currentPatternConfig);

  return (
    <footer className="fixed bottom-0 inset-x-0 z-30 pb-[calc(1.5rem+env(safe-area-inset-bottom))] px-6 transition-all duration-700 ease-out">
        <div className="max-w-lg mx-auto w-full flex flex-col justify-end">
          
          {!isActive && (
            <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-10 fade-in duration-700">
               
               <div className="w-full overflow-visible relative">
                  <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-black via-black/80 to-transparent z-10 pointer-events-none" />
                  <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black via-black/80 to-transparent z-10 pointer-events-none" />
                  
                  <div 
                    ref={scrollContainerRef}
                    className="flex gap-4 overflow-x-auto pb-4 pt-4 px-[40%] snap-x snap-mandatory scrollbar-hide items-center"
                  >
                      {Object.values(BREATHING_PATTERNS).map((p: BreathPattern) => {
                        const isSelected = p.id === selectedPatternId;
                        const status = isPatternLocked(p);
                        
                        return (
                          <button
                            key={p.id}
                            data-pattern={p.id}
                            onClick={() => handleSelectPattern(p.id as BreathingType)}
                            disabled={status.locked && !isSelected} 
                            className={clsx(
                              "relative flex-shrink-0 snap-center transition-all duration-500 ease-out group",
                              isSelected ? "w-[240px] scale-100 opacity-100" : "w-[140px] scale-90 opacity-40 hover:opacity-60"
                            )}
                          >
                             <div className={clsx(
                                 "w-full rounded-2xl border backdrop-blur-md p-5 text-left transition-colors overflow-hidden",
                                 isSelected ? "bg-white/10 border-white/20 shadow-xl shadow-white/5" : "bg-white/5 border-white/5"
                             )}>
                                {status.locked && (
                                    <div className="absolute top-2 right-2 text-white/30">
                                        <Lock size={12} />
                                    </div>
                                )}

                                <div className="text-[9px] font-mono tracking-widest uppercase text-white/40 mb-2 truncate">
                                    {t.patterns[p.id as BreathingType]?.tag || p.tag}
                                </div>
                                <div className={clsx("font-serif text-white truncate mb-1", isSelected ? "text-2xl" : "text-lg")}>
                                    {t.patterns[p.id as BreathingType]?.label || p.label}
                                </div>
                                {isSelected && (
                                    <div className="text-[10px] text-white/50 font-sans leading-relaxed min-h-[2.5em]">
                                        {status.locked ? (
                                            <span className="text-yellow-200/70">{status.reason}</span>
                                        ) : (
                                            t.patterns[p.id as BreathingType]?.description || p.description
                                        )}
                                    </div>
                                )}
                             </div>
                          </button>
                        );
                      })}
                  </div>
               </div>

               <div className="flex items-center gap-3 h-[72px]">
                   <button 
                      onClick={() => { triggerHaptic(); setHistoryOpen(true); }}
                      className="h-full aspect-square flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition-all"
                   >
                       <History size={20} className="text-white/60" />
                   </button>

                   <button 
                      onClick={handleStart}
                      disabled={lockStatus.locked}
                      className={clsx(
                          "flex-1 h-full rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] group relative overflow-hidden",
                          lockStatus.locked 
                            ? "bg-white/5 border border-white/10 cursor-not-allowed opacity-50" 
                            : "bg-white text-black hover:bg-white/90 shadow-[0_0_30px_-5px_rgba(255,255,255,0.3)]"
                      )}
                   >
                        {lockStatus.locked ? (
                             <Lock size={18} className="text-white/50" />
                        ) : (
                             <>
                                <span className="text-sm font-bold tracking-widest uppercase">
                                    {t.ui.begin}
                                </span>
                                <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                             </>
                        )}
                   </button>

                   <button 
                      onClick={() => { triggerHaptic(); setSettingsOpen(true); }}
                      className="h-full aspect-square flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition-all"
                   >
                       <Settings2 size={20} className="text-white/60" />
                   </button>
               </div>
            </div>
          )}

          {isActive && (
            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-20 fade-in duration-700 pb-4">
              <button
                onClick={handleStop}
                className="py-6 bg-white/[0.05] backdrop-blur-xl border border-white/5 hover:bg-red-500/10 text-white/50 hover:text-red-300 rounded-2xl font-medium flex items-center justify-center gap-3 transition-all active:scale-95"
              >
                <Square size={18} fill="currentColor" className="opacity-60" />
                <span className="text-[10px] tracking-[0.2em] uppercase">{t.ui.end}</span>
              </button>

              <button
                onClick={handleTogglePause}
                className="py-6 bg-white text-black hover:bg-gray-200 rounded-2xl font-medium flex items-center justify-center gap-3 transition-all active:scale-95"
              >
                {isPaused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
                <span className="text-[10px] tracking-[0.2em] uppercase font-bold">{isPaused ? t.ui.resume : t.ui.pause}</span>
              </button>
            </div>
          )}
        </div>
    </footer>
  );
}