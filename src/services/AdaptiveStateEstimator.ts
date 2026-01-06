
import { Observation, BreathPattern, BeliefState, BREATHING_PATTERNS } from '../types';

/**
 * ADAPTIVE STATE ESTIMATOR v5.0 (AFFECTIVE FUSION)
 * ================================================
 * Now fuses physiological arousal with facial valence for a holistic state.
 */

export interface EstimatorConfig {
    alpha?: number;             
    adaptive_r?: boolean;       
    r_adaptation_rate?: number; 
    q_base?: number;            
    r_base?: number;            
    outlier_threshold?: number; 
}

interface TargetState {
  arousal: number;
  attention: number;
  rhythm_alignment: number;
  valence: number; // Target emotional state
}

const PROTOCOL_TARGETS: Record<string, TargetState> = {
    'parasympathetic': { arousal: 0.2, attention: 0.5, rhythm_alignment: 0.8, valence: 0.6 },
    'balanced': { arousal: 0.4, attention: 0.7, rhythm_alignment: 0.9, valence: 0.5 },
    'sympathetic': { arousal: 0.7, attention: 0.8, rhythm_alignment: 0.6, valence: 0.7 },
    'default': { arousal: 0.5, attention: 0.6, rhythm_alignment: 0.7, valence: 0.5 }
};

const PATTERN_TO_TARGET: Record<string, keyof typeof PROTOCOL_TARGETS> = {
    '4-7-8': 'parasympathetic',
    'deep-relax': 'parasympathetic',
    '7-11': 'parasympathetic',
    'coherence': 'balanced',
    'calm': 'balanced',
    'box': 'balanced',
    'triangle': 'balanced',
    'tactical': 'balanced',
    'awake': 'sympathetic',
    'wim-hof': 'sympathetic',
    'buteyko': 'parasympathetic',
};

export class AdaptiveStateEstimator {
    private belief: BeliefState;
    private target: TargetState;
    private config: Required<EstimatorConfig>;

    private readonly TAU_AROUSAL = 15.0; 
    private readonly TAU_ATTENTION = 5.0; 
    private readonly TAU_RHYTHM = 10.0; 
    private readonly TAU_VALENCE = 8.0;

    constructor(config: EstimatorConfig = {}) {
        this.config = {
            alpha: config.alpha ?? 1e-3,
            adaptive_r: config.adaptive_r ?? true,
            r_adaptation_rate: config.r_adaptation_rate ?? 0.2,
            q_base: config.q_base ?? 0.01,
            r_base: config.r_base ?? 0.15,
            outlier_threshold: config.outlier_threshold ?? 3.0
        };

        this.belief = {
            arousal: 0.5,
            attention: 0.5,
            rhythm_alignment: 0.0,
            valence: 0.0,
            arousal_variance: 0.2,
            attention_variance: 0.2,
            rhythm_variance: 0.3,
            prediction_error: 0.0,
            innovation: 0.0,
            mahalanobis_distance: 0.0,
            confidence: 0.0
        };
        this.target = PROTOCOL_TARGETS.default;
    }

    public setProtocol(pattern: BreathPattern | null): void {
        if (!pattern) {
            this.target = PROTOCOL_TARGETS.default;
            return;
        }
        const targetKey = PATTERN_TO_TARGET[pattern.id] || 'default';
        this.target = PROTOCOL_TARGETS[targetKey];
    }

    public update(obs: Observation, dt: number): BeliefState {
        const predicted = this.predict(dt);
        const corrected = this.correct(predicted, obs, dt);

        corrected.prediction_error = this.computePredictionError(corrected);
        corrected.confidence = this.computeConfidence(corrected, obs);

        this.belief = corrected;
        return { ...this.belief };
    }

    private predict(dt: number): BeliefState {
        const { arousal, attention, rhythm_alignment, valence } = this.belief;
        const { arousal_variance, attention_variance, rhythm_variance } = this.belief;

        const alpha_arousal = 1 - Math.exp(-dt / this.TAU_AROUSAL);
        const alpha_attention = 1 - Math.exp(-dt / this.TAU_ATTENTION);
        const alpha_rhythm = 1 - Math.exp(-dt / this.TAU_RHYTHM);
        const alpha_valence = 1 - Math.exp(-dt / this.TAU_VALENCE);

        const predicted_arousal = arousal + alpha_arousal * (this.target.arousal - arousal);
        const predicted_attention = attention + alpha_attention * (this.target.attention - attention);
        const predicted_rhythm = rhythm_alignment + alpha_rhythm * (this.target.rhythm_alignment - rhythm_alignment);
        const predicted_valence = valence + alpha_valence * (this.target.valence - valence);

        const Q = this.config.q_base * dt;
        
        return {
            arousal: this.clamp(predicted_arousal),
            attention: this.clamp(predicted_attention),
            rhythm_alignment: this.clamp(predicted_rhythm),
            valence: this.clamp(predicted_valence, -1, 1),
            arousal_variance: arousal_variance + Q,
            attention_variance: attention_variance + Q,
            rhythm_variance: rhythm_variance + Q,
            prediction_error: 0,
            innovation: 0,
            mahalanobis_distance: 0,
            confidence: 0
        };
    }

    private correct(predicted: BeliefState, obs: Observation, dt: number): BeliefState {
        let corrected = { ...predicted };
        let currentInnovation = 0;
        let mahalanobis = 0;

        // ---- AROUSAL CORRECTION (Fused HR + Stress Index) ----
        if (obs.heart_rate !== undefined && obs.hr_confidence !== undefined && obs.hr_confidence > 0.3) {
            // v5.0: If Stress Index is available, use it to weight arousal
            let measured_arousal = (obs.heart_rate - 50) / 70;
            
            if (obs.stress_index !== undefined) {
                 const stress_norm = Math.min(1, obs.stress_index / 300); // 300 SI is high
                 measured_arousal = 0.6 * measured_arousal + 0.4 * stress_norm;
            }
            
            measured_arousal = this.clamp(measured_arousal);
            
            let R = this.config.r_base;
            if (this.config.adaptive_r) {
                const confidencePenalty = (1 - obs.hr_confidence) * this.config.r_adaptation_rate;
                R += confidencePenalty;
            }

            const S = predicted.arousal_variance + R; 
            const K_arousal = predicted.arousal_variance / S;
            
            const innovation = measured_arousal - predicted.arousal;
            mahalanobis = Math.sqrt((innovation * innovation) / S);

            if (mahalanobis < this.config.outlier_threshold) {
                corrected.arousal = predicted.arousal + K_arousal * innovation;
                corrected.arousal_variance = (1 - K_arousal) * predicted.arousal_variance;
                currentInnovation = innovation;
            } else {
                corrected.arousal_variance += 0.01; 
            }
        }

        // ---- VALENCE CORRECTION (Facial) ----
        if (obs.facial_valence !== undefined) {
            // Direct update for now, could add Kalman logic if noisy
            corrected.valence = 0.8 * corrected.valence + 0.2 * obs.facial_valence;
        }

        // ---- ATTENTION/RHYTHM CORRECTION ----
        // v5.0: Respiration Rate alignment check
        // If obs.respiration_rate matches target pattern rate, boost rhythm_alignment
        
        const isDistracted = obs.user_interaction === 'pause' || obs.visibilty_state === 'hidden';
        
        if (isDistracted) {
             // ... existing distraction logic
             corrected.attention = predicted.attention * 0.95;
        } else {
             corrected.attention = Math.min(1, corrected.attention + 0.15 * dt);
        }

        return {
            ...corrected,
            innovation: currentInnovation,
            mahalanobis_distance: mahalanobis,
            arousal: this.clamp(corrected.arousal),
            attention: this.clamp(corrected.attention),
            rhythm_alignment: this.clamp(corrected.rhythm_alignment),
            valence: this.clamp(corrected.valence, -1, 1)
        };
    }

    private computePredictionError(state: BeliefState): number {
        const error_arousal = Math.pow(state.arousal - this.target.arousal, 2);
        const error_rhythm = Math.pow(state.rhythm_alignment - this.target.rhythm_alignment, 2);
        // v5.0: Valence error matters less for control, but useful for stats
        return Math.sqrt(0.5 * error_arousal + 0.5 * error_rhythm);
    }

    private computeConfidence(state: BeliefState, obs: Observation): number {
        const certainty = 1 - Math.min(1, (state.arousal_variance + state.attention_variance) / 2);
        const sensor_quality = obs.hr_confidence ?? 0.5;
        return this.clamp(Math.pow(certainty * sensor_quality, 0.5));
    }

    private clamp(value: number, min = 0, max = 1): number {
        return Math.max(min, Math.min(max, value));
    }
}
