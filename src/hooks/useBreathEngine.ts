
import React, { useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useSettingsStore } from '../stores/settingsStore';
import { RuntimeState } from '../services/PureZenBKernel';
import { useCameraVitals } from './useCameraVitals';
import { useKernel } from '../kernel/KernelProvider';
import { SafetyConfig } from '../config/SafetyConfig';

type EngineRefs = {
  progressRef: React.MutableRefObject<number>;
  entropyRef: React.MutableRefObject<number>;
};

/**
 * 🜂 DRIVER (View-Controller Bridge) V5.0
 */
export function useBreathEngine(): EngineRefs {
  const isActive = useSessionStore((s) => s.isActive);
  const isPaused = useSessionStore((s) => s.isPaused);
  const currentPattern = useSessionStore((s) => s.currentPattern);
  const stopSession = useSessionStore((s) => s.stopSession);
  const syncState = useSessionStore((s) => s.syncState);
  
  const storeUserSettings = useSettingsStore((s) => s.userSettings);
  
  // Visual Interpolation Refs
  const progressRef = useRef<number>(0);
  const entropyRef = useRef<number>(0); 
  
  // Inject Kernel
  const kernel = useKernel();

  // --- SENSOR DRIVER: CAMERA VITALS ---
  const { vitals } = useCameraVitals(isActive && storeUserSettings.cameraVitalsEnabled);
  
  // --- KERNEL CONTROL BUS ---
  
  // 1. Handle START / STOP
  useEffect(() => {
    if (isActive) {
        kernel.dispatch({ type: 'LOAD_PROTOCOL', patternId: currentPattern.id, timestamp: Date.now() });
        kernel.dispatch({ type: 'START_SESSION', timestamp: Date.now() });
    } else {
        progressRef.current = 0;
        kernel.dispatch({ type: 'HALT', reason: 'cleanup', timestamp: Date.now() });
    }
  }, [isActive, currentPattern.id, kernel]);

  // 2. Handle PAUSE / RESUME
  useEffect(() => {
    if (!isActive) return;
    if (isPaused) {
       kernel.dispatch({ type: 'INTERRUPTION', kind: 'pause', timestamp: Date.now() });
    } else {
       kernel.dispatch({ type: 'RESUME', timestamp: Date.now() });
    }
  }, [isPaused, isActive, kernel]);

  // --- KERNEL OBSERVER (Visuals & React State) ---
  useEffect(() => {
      const unsub = kernel.subscribe((state: RuntimeState) => {
          // Safety Monitor
          if (state.status === 'SAFETY_LOCK') {
              stopSession();
          }

          // Visual Cortex Driver
          progressRef.current = state.phaseElapsed / (state.phaseDuration || 1);
          entropyRef.current = state.belief.prediction_error;

          // UI State Sync
          if (state.phase !== useSessionStore.getState().phase || state.cycleCount !== useSessionStore.getState().cycleCount) {
              syncState(state.phase, state.cycleCount);
          }
      });
      return unsub;
  }, [stopSession, syncState, kernel]);

  // --- CLOCK DRIVER (Fixed Timestep Tick Loop) ---
  useEffect(() => {
      if (!isActive) return;

      let lastTime = performance.now();
      let frameId: number;
      let accumulator = 0;
      
      const TARGET_HZ = SafetyConfig.clocks.controlHz;
      const STEP_SEC = 1 / TARGET_HZ;
      const MAX_STEPS = SafetyConfig.clocks.maxControlStepsPerFrame;

      const tickLoop = (now: number) => {
          if (isPaused) {
              lastTime = now;
              frameId = requestAnimationFrame(tickLoop);
              return;
          }

          const dt = Math.min((now - lastTime) / 1000, SafetyConfig.clocks.maxFrameDtSec);
          lastTime = now;
          accumulator += dt;

          let steps = 0;
          while (accumulator >= STEP_SEC && steps < MAX_STEPS) {
             kernel.tick(STEP_SEC, {
                  timestamp: Date.now(),
                  delta_time: STEP_SEC,
                  visibilty_state: document.hidden ? 'hidden' : 'visible',
                  user_interaction: undefined,
                  // v5.0 Data Injection
                  heart_rate: vitals.heartRate,
                  hr_confidence: vitals.confidence,
                  respiration_rate: vitals.respirationRate,
                  stress_index: vitals.hrv?.stressIndex,
                  facial_valence: vitals.affective?.valence
             });
             accumulator -= STEP_SEC;
             steps++;
          }

          frameId = requestAnimationFrame(tickLoop);
      };

      frameId = requestAnimationFrame(tickLoop);
      return () => cancelAnimationFrame(frameId);
  }, [isActive, isPaused, vitals, kernel]);

  return { progressRef, entropyRef };
}
