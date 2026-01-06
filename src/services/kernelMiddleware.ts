
import { KernelEvent } from '../types';
import { RuntimeState } from './PureZenBKernel';
import { playCue } from './audio';
import { hapticPhase } from './haptics';
import { useSettingsStore } from '../stores/settingsStore';

export type Middleware = (
  event: KernelEvent,
  beforeState: RuntimeState,
  afterState: RuntimeState,
  api: { queue: (cmd: KernelEvent) => void }
) => void;

function phaseToCueType(phase: string): 'inhale' | 'exhale' | 'hold' {
  if (phase === 'holdIn' || phase === 'holdOut') return 'hold';
  return phase as 'inhale' | 'exhale';
}

/**
 * Middleware to handle audio cues on phase transitions
 */
export const audioMiddleware: Middleware = (event, before, after) => {
  if (event.type === 'PHASE_TRANSITION' && after.status === 'RUNNING') {
    const cueType = phaseToCueType(after.phase);
    const settings = useSettingsStore.getState().userSettings;
    
    playCue(
      cueType,
      settings.soundEnabled,
      settings.soundPack,
      after.phaseDuration,
      settings.language
    );
  }
};

/**
 * Middleware to handle haptic feedback
 */
export const hapticMiddleware: Middleware = (event, before, after) => {
  if (event.type === 'PHASE_TRANSITION' && after.status === 'RUNNING') {
    const settings = useSettingsStore.getState().userSettings;
    const cueType = phaseToCueType(after.phase);
    
    hapticPhase(settings.hapticEnabled, settings.hapticStrength, cueType);
  }
};

/**
 * ACTIVE INFERENCE CONTROLLER
 * This closes the biological loop. It adjusts the 'tempoScale' (breathing speed)
 * based on the user's 'rhythm_alignment' (Free Energy proxy).
 */
export const biofeedbackMiddleware: Middleware = (event, before, after, api) => {
    // Check periodically or on specific events to avoid thrashing
    if (event.type === 'BELIEF_UPDATE' && after.status === 'RUNNING' && after.sessionDuration > 10) {
        
        const alignment = after.belief.rhythm_alignment;
        const currentScale = after.tempoScale;
        let newScale = currentScale;

        // --- CONTROL LAW ---
        // CASE 1: User is struggling (Low alignment) -> Co-regulation: Slow down (increase scale)
        if (alignment < 0.35) {
             newScale = Math.min(1.3, currentScale + 0.002); 
        } 
        // CASE 2: User is locked in (High alignment) -> Return to Baseline (1.0)
        else if (alignment > 0.8) {
             if (currentScale > 1.0) {
                 newScale = Math.max(1.0, currentScale - 0.001);
             }
        }

        // Only queue if change is significant
        if (Math.abs(newScale - currentScale) > 0.01) {
            api.queue({
                type: 'ADJUST_TEMPO',
                scale: newScale,
                reason: alignment < 0.35 ? 'low_alignment' : 'resonance_restore',
                timestamp: Date.now()
            });
        }
    }
};
