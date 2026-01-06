
export type BreathPhase = 'inhale' | 'holdIn' | 'exhale' | 'holdOut';
export type CueType = 'inhale' | 'exhale' | 'hold' | 'finish';

export type BreathingType = 
  | '4-7-8' 
  | 'box' 
  | 'calm'
  | 'coherence'
  | 'deep-relax'
  | '7-11'
  | 'awake'
  | 'triangle'
  | 'tactical'
  | 'buteyko'
  | 'wim-hof';

export type PatternTier = 1 | 2 | 3; 

export type ColorTheme = 'warm' | 'cool' | 'neutral';
export type Language = 'en' | 'vi';

export type SoundPack = 'synth' | 'breath' | 'bells' | 'real-zen' | 'voice-full' | 'voice-12';

export type QualityTier = 'auto' | 'low' | 'medium' | 'high';

export type SignalQuality = 'excellent' | 'good' | 'fair' | 'poor';

export interface HRVMetrics {
  rmssd: number;       // Root Mean Square of Successive Differences (Parasympathetic tone)
  sdnn: number;        // Standard Deviation of NN intervals (Overall variability)
  stressIndex: number; // Baevsky Stress Index (Sympathetic tone)
}

export interface AffectiveState {
  valence: number;     // -1.0 (Negative) to 1.0 (Positive)
  arousal: number;     // 0.0 (Calm) to 1.0 (Excited/Stressed)
  dominance?: number;  // 0.0 (Helpless) to 1.0 (In Control) - optional
  mood_label: 'anxious' | 'calm' | 'focused' | 'neutral' | 'distracted';
}

export interface VitalSigns {
  heartRate: number;
  respirationRate?: number; // v5.0 addition
  hrv?: HRVMetrics;         // v5.0 addition
  affective?: AffectiveState; // v5.0 addition
  confidence: number;
  signalQuality: SignalQuality;
  snr: number;
  motionLevel: number;
}

// --- PRIMITIVE 3: UNIVERSAL CONTROL (Active Inference) ---

export type BeliefState = {
  // Point estimates (best guess)
  arousal: number;          // 0.0 (Coma) -> 1.0 (Panic)
  attention: number;        // 0.0 (Dissociated) -> 1.0 (Hyper-focused)
  rhythm_alignment: number; // 0.0 (Arrhythmia) -> 1.0 (Resonance)
  valence: number;          // v5.0: Emotional Valence (-1 to 1)
  
  // Uncertainty estimates (confidence in our belief)
  arousal_variance: number;
  attention_variance: number;
  rhythm_variance: number;
  
  // v2.0 Metrics
  prediction_error: number; // The "Surprisal" or Free Energy
  innovation: number;       // Difference between predicted and observed
  mahalanobis_distance: number; // Outlier score
  confidence: number;       // Overall confidence [0,1]
};

export type Observation = {
  timestamp: number;
  delta_time: number;
  // External
  user_interaction?: 'pause' | 'resume' | 'touch';
  visibilty_state: 'visible' | 'hidden';
  // Bio-Metrics (The Input Vector)
  heart_rate?: number;
  hr_confidence?: number;
  respiration_rate?: number; // v5.0
  stress_index?: number;     // v5.0
  facial_valence?: number;   // v5.0
};

// --- PRIMITIVE 1: TIME-TRAVELING DEBUGGER (Event Log) ---

export type KernelEvent = 
  | { type: 'BOOT'; timestamp: number }
  | { type: 'LOAD_PROTOCOL'; patternId: BreathingType; timestamp: number }
  | { type: 'START_SESSION'; timestamp: number }
  | { type: 'TICK'; dt: number; observation: Observation; timestamp: number } 
  | { type: 'BELIEF_UPDATE'; belief: BeliefState; timestamp: number }
  | { type: 'PHASE_TRANSITION'; from: BreathPhase; to: BreathPhase; timestamp: number }
  | { type: 'CYCLE_COMPLETE'; count: number; timestamp: number }
  | { type: 'INTERRUPTION'; kind: 'pause' | 'background'; timestamp: number }
  | { type: 'RESUME'; timestamp: number }
  | { type: 'HALT'; reason: string; timestamp: number }
  | { type: 'SAFETY_INTERDICTION'; riskLevel: number; action: string; timestamp: number }
  | { type: 'LOAD_SAFETY_REGISTRY'; registry: Record<string, SafetyProfile>; timestamp: number }
  | { type: 'ADJUST_TEMPO'; scale: number; reason: string; timestamp: number }
  // --- V6.0 AI INTERVENTION EVENTS ---
  | { type: 'AI_INTERVENTION'; intent: string; parameters: any; timestamp: number }
  | { type: 'AI_VOICE_MESSAGE'; text: string; sentiment: string; timestamp: number };

// --- PRIMITIVE 2: SAFETY-BY-CONSTRUCTION (Trauma Registry) ---

export type SafetyProfile = {
  patternId: BreathingType;
  cummulative_stress_score: number; // Accumulates when prediction_error is high
  last_incident_timestamp: number;
  safety_lock_until: number; // Unix timestamp
  resonance_history: number[]; // Last 5 sessions
};

// --- USER SPACE ---

export type UserSettings = {
  soundEnabled: boolean;
  hapticEnabled: boolean;
  hapticStrength: 'light' | 'medium' | 'heavy';
  theme: ColorTheme;
  quality: QualityTier;
  reduceMotion: boolean;
  showTimer: boolean;
  language: Language; 
  soundPack: SoundPack;
  streak: number;
  lastBreathDate: string;
  lastUsedPattern: BreathingType;
  safetyRegistry: Record<string, SafetyProfile>;
  cameraVitalsEnabled: boolean;
  showKernelMonitor: boolean;
  // v6.0 AI Settings
  aiCoachEnabled: boolean;
  apiKey?: string; // Stored in memory/env usually, but here for demo structure
};

export type SessionHistoryItem = {
  id: string;
  timestamp: number;
  durationSec: number;
  patternId: BreathingType;
  cycles: number;
  finalBelief: BeliefState;
};

export type SessionStats = {
  durationSec: number;
  cyclesCompleted: number;
  patternId: BreathingType;
  timestamp: number;
};

export type BreathPattern = {
  id: BreathingType;
  label: string;
  tag: string;
  description: string;
  timings: Record<BreathPhase, number>;
  colorTheme: ColorTheme;
  recommendedCycles: number;
  tier: PatternTier; 
};

export const BREATHING_PATTERNS: Record<string, BreathPattern> = {
  '4-7-8': {
    id: '4-7-8',
    label: 'Tranquility',
    tag: 'Sleep & Anxiety',
    description: 'A natural tranquilizer for the nervous system.',
    timings: { inhale: 4, holdIn: 7, exhale: 8, holdOut: 0 },
    colorTheme: 'warm',
    recommendedCycles: 4,
    tier: 1,
  },
  box: {
    id: 'box',
    label: 'Focus',
    tag: 'Concentration',
    description: 'Used by Navy SEALs to heighten performance.',
    timings: { inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 },
    colorTheme: 'neutral',
    recommendedCycles: 6,
    tier: 1,
  },
  calm: {
    id: 'calm',
    label: 'Balance',
    tag: 'Coherence',
    description: 'Restores balance to your heart rate variability.',
    timings: { inhale: 4, holdIn: 0, exhale: 6, holdOut: 0 },
    colorTheme: 'cool',
    recommendedCycles: 8,
    tier: 1,
  },
  coherence: {
    id: 'coherence',
    label: 'Coherence',
    tag: 'Heart Health',
    description: 'Optimizes Heart Rate Variability (HRV). The "Golden Ratio" of breathing.',
    timings: { inhale: 6, holdIn: 0, exhale: 6, holdOut: 0 },
    colorTheme: 'cool',
    recommendedCycles: 10,
    tier: 2,
  },
  'deep-relax': {
    id: 'deep-relax',
    label: 'Deep Rest',
    tag: 'Stress Relief',
    description: 'Doubling the exhalation to trigger the parasympathetic system.',
    timings: { inhale: 4, holdIn: 0, exhale: 8, holdOut: 0 },
    colorTheme: 'warm',
    recommendedCycles: 6,
    tier: 1,
  },
  '7-11': {
    id: '7-11',
    label: '7-11',
    tag: 'Deep Calm',
    description: 'A powerful technique for panic attacks and deep anxiety.',
    timings: { inhale: 7, holdIn: 0, exhale: 11, holdOut: 0 },
    colorTheme: 'warm',
    recommendedCycles: 4,
    tier: 2,
  },
  'awake': {
    id: 'awake',
    label: 'Energize',
    tag: 'Wake Up',
    description: 'Fast-paced rhythm to boost alertness and energy levels.',
    timings: { inhale: 4, holdIn: 0, exhale: 2, holdOut: 0 },
    colorTheme: 'cool',
    recommendedCycles: 15,
    tier: 2,
  },
  'triangle': {
    id: 'triangle',
    label: 'Triangle',
    tag: 'Yoga',
    description: 'A geometric pattern for emotional stability and control.',
    timings: { inhale: 4, holdIn: 4, exhale: 4, holdOut: 0 },
    colorTheme: 'neutral',
    recommendedCycles: 8,
    tier: 1,
  },
  'tactical': {
    id: 'tactical',
    label: 'Tactical',
    tag: 'Advanced Focus',
    description: 'Extended Box Breathing for high-stress situations.',
    timings: { inhale: 5, holdIn: 5, exhale: 5, holdOut: 5 },
    colorTheme: 'neutral',
    recommendedCycles: 5,
    tier: 2,
  },
  'buteyko': {
    id: 'buteyko',
    label: 'Light Air',
    tag: 'Health',
    description: 'Reduced breathing to improve oxygen uptake (Buteyko Method).',
    timings: { inhale: 3, holdIn: 0, exhale: 3, holdOut: 4 },
    colorTheme: 'cool',
    recommendedCycles: 12,
    tier: 3,
  },
  'wim-hof': {
    id: 'wim-hof',
    label: 'Tummo Power',
    tag: 'Immunity',
    description: 'Charge the body. Inhale deeply, let go. Repeat.',
    timings: { inhale: 2, holdIn: 0, exhale: 1, holdOut: 15 },
    colorTheme: 'warm',
    recommendedCycles: 30,
    tier: 3,
  }
};
