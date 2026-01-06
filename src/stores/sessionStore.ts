
import { create } from 'zustand';
import { BREATHING_PATTERNS, BreathPattern, BreathPhase, BreathingType, SessionStats } from '../types';

type SessionState = {
  isActive: boolean;
  isPaused: boolean;
  currentPattern: BreathPattern;
  phase: BreathPhase;
  cycleCount: number;
  sessionStartTime: number;
  lastSessionStats: SessionStats | null;

  // Actions
  startSession: (type: BreathingType) => void;
  stopSession: () => void;
  togglePause: () => void;
  finishSession: (stats?: SessionStats) => void;
  
  // Kernel Bridge
  syncState: (phase: BreathPhase, cycleCount: number) => void;
};

export const useSessionStore = create<SessionState>((set, get) => ({
  isActive: false,
  isPaused: false,
  currentPattern: BREATHING_PATTERNS['4-7-8'],
  phase: 'inhale',
  cycleCount: 0,
  sessionStartTime: 0,
  lastSessionStats: null,

  startSession: (type) =>
    set({
      isActive: true,
      isPaused: false,
      currentPattern: BREATHING_PATTERNS[type],
      phase: 'inhale',
      cycleCount: 0,
      sessionStartTime: Date.now(),
      lastSessionStats: null,
    }),

  stopSession: () => set({ isActive: false, isPaused: false, cycleCount: 0, phase: 'inhale', sessionStartTime: 0 }),
  
  togglePause: () => set((s) => ({ isPaused: !s.isPaused })),

  finishSession: (stats) => {
    // If stats are provided (by the component that has access to kernel), use them.
    // Otherwise calculate simple duration.
    if (stats) {
        set({
            isActive: false,
            isPaused: false,
            sessionStartTime: 0,
            lastSessionStats: stats
        });
        return;
    }

    const state = get();
    const durationSec = Math.floor((Date.now() - state.sessionStartTime) / 1000);
    
    set({
      isActive: false,
      isPaused: false,
      sessionStartTime: 0,
      lastSessionStats: {
        durationSec,
        cyclesCompleted: state.cycleCount,
        patternId: state.currentPattern.id,
        timestamp: Date.now()
      }
    });
  },

  syncState: (phase, cycleCount) => set({ phase, cycleCount }),
}));
