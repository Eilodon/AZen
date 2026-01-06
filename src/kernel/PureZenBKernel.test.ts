
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PureZenBKernel, RuntimeState } from '../services/PureZenBKernel';
import { SafetyConfig } from '../config/SafetyConfig';
import { BREATHING_PATTERNS, KernelEvent } from '../types';

// --- MOCKS ---

// Mock BioFS to avoid IndexedDB calls during tests
const mockFS = {
  getMeta: vi.fn(),
  setMeta: vi.fn(),
  writeEvent: vi.fn(),
  garbageCollect: vi.fn(),
  getSessionLog: vi.fn()
};

// --- TEST SUITE ---

describe('PureZenBKernel v3.5 (Hardened)', () => {
  let kernel: PureZenBKernel;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockFS.getMeta.mockResolvedValue(undefined); // Default: empty registry
    kernel = new PureZenBKernel(SafetyConfig, mockFS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- 1. CORE STATE MACHINE TESTS ---

  it('should initialize in IDLE state', () => {
    const state = kernel.getState();
    expect(state.status).toBe('IDLE');
    expect(state.phase).toBe('inhale');
    expect(state.cycleCount).toBe(0);
  });

  it('should load a breathing protocol correctly', () => {
    kernel.dispatch({ type: 'LOAD_PROTOCOL', patternId: '4-7-8', timestamp: Date.now() });
    
    const state = kernel.getState();
    expect(state.pattern).toBeDefined();
    expect(state.pattern?.id).toBe('4-7-8');
    expect(state.phaseDuration).toBe(4); // Inhale is 4s in 4-7-8
  });

  it('should start a session and transition phases correctly (Time Machine)', () => {
    // 1. Load & Start
    kernel.dispatch({ type: 'LOAD_PROTOCOL', patternId: 'box', timestamp: Date.now() });
    kernel.dispatch({ type: 'START_SESSION', timestamp: Date.now() });

    expect(kernel.getState().status).toBe('RUNNING');
    expect(kernel.getState().phase).toBe('inhale');

    // 2. Advance time by 4.1 seconds (Box breath: Inhale 4s)
    // We simulate the loop calling tick
    const now = Date.now();
    const future = now + 4100;
    vi.setSystemTime(future);
    
    // Simulate Tick: dt = 4.1s (cumulative)
    // In reality, tick is called frequently with small dt, but logic should handle large dt too
    // However, phase logic relies on `phaseStartTime`. We need to simulate the tick passing.
    
    // Let's verify phase transition logic by forcing a tick that crosses the boundary
    kernel.tick(4.1, { timestamp: future, delta_time: 4.1, visibilty_state: 'visible' });

    const state = kernel.getState();
    // Box: Inhale(4) -> HoldIn(4)
    expect(state.phase).toBe('holdIn'); 
    expect(state.phaseDuration).toBe(4); // Hold duration
  });

  it('should increment cycle count at cycle boundary', () => {
    kernel.dispatch({ type: 'LOAD_PROTOCOL', patternId: 'awake', timestamp: Date.now() });
    // Awake: Inhale(4) -> Exhale(2) -> Loop
    kernel.dispatch({ type: 'START_SESSION', timestamp: Date.now() });

    // Complete Inhale
    vi.setSystemTime(Date.now() + 4100);
    kernel.tick(4.1, { timestamp: Date.now(), delta_time: 4.1, visibilty_state: 'visible' });
    expect(kernel.getState().phase).toBe('exhale');

    // Complete Exhale (Cycle End)
    vi.setSystemTime(Date.now() + 2100);
    kernel.tick(2.1, { timestamp: Date.now(), delta_time: 2.1, visibilty_state: 'visible' });
    
    expect(kernel.getState().phase).toBe('inhale'); // Back to start
    expect(kernel.getState().cycleCount).toBe(1); // Cycle incremented
  });

  // --- 2. SAFETY GUARD TESTS (CRITICAL) ---

  it('should prevent starting a session if system is locked', () => {
    // Force lock state
    kernel.dispatch({ 
        type: 'SAFETY_INTERDICTION', 
        riskLevel: 1.0, 
        action: 'EMERGENCY_HALT', 
        timestamp: Date.now() 
    });

    expect(kernel.getState().status).toBe('SAFETY_LOCK');

    // Attempt to start
    kernel.dispatch({ type: 'START_SESSION', timestamp: Date.now() });

    // Should remain locked
    expect(kernel.getState().status).toBe('SAFETY_LOCK');
    
    // Check logs for rejection
    const logs = kernel.getLogBuffer();
    expect(logs.some(e => e.type === 'SAFETY_INTERDICTION' && e.action === 'REJECT_START')).toBe(true);
  });

  it('should trigger EMERGENCY_HALT upon Hyperarousal (High Prediction Error)', () => {
    kernel.dispatch({ type: 'LOAD_PROTOCOL', patternId: '4-7-8', timestamp: Date.now() });
    kernel.dispatch({ type: 'START_SESSION', timestamp: Date.now() });

    // Advance time past minimum safety duration (e.g., 10s)
    vi.setSystemTime(Date.now() + 15000);
    kernel.tick(15, { timestamp: Date.now(), delta_time: 15, visibilty_state: 'visible' });

    // Inject a DANGEROUS belief update (Simulating extreme anomaly)
    // The kernel's `safetyGuard` intercepts BELIEF_UPDATE events.
    kernel.dispatch({
        type: 'BELIEF_UPDATE',
        belief: {
            arousal: 1.0,
            attention: 0.0,
            rhythm_alignment: 0.0,
            valence: -0.8,
            arousal_variance: 0,
            attention_variance: 0,
            rhythm_variance: 0,
            prediction_error: 0.99, // > 0.95 threshold
            innovation: 1.0,
            mahalanobis_distance: 10.0,
            confidence: 0
        },
        timestamp: Date.now()
    });

    const state = kernel.getState();
    expect(state.status).toBe('SAFETY_LOCK');
    expect(mockFS.writeEvent).toHaveBeenCalled(); // Should persist the crash
  });

  it('should enforce Lockout Period for dangerous patterns', () => {
    const futureUnlockTime = Date.now() + 100000;
    
    // Pre-load registry with a lock
    kernel.loadSafetyRegistry({
        'wim-hof': {
            patternId: 'wim-hof',
            cummulative_stress_score: 10,
            last_incident_timestamp: Date.now(),
            safety_lock_until: futureUnlockTime,
            resonance_history: []
        }
    });

    // Attempt to load the locked pattern
    kernel.dispatch({ type: 'LOAD_PROTOCOL', patternId: 'wim-hof', timestamp: Date.now() });

    // Should NOT load
    expect(kernel.getState().pattern).toBeNull();
    
    // Should trigger interdiction
    const logs = kernel.getLogBuffer();
    expect(logs.some(e => e.type === 'SAFETY_INTERDICTION' && e.action === 'PATTERN_LOCKED')).toBe(true);
  });

  // --- 3. ACTIVE INFERENCE & BIOFEEDBACK ---

  it('should adjust tempoScale when biofeedback suggests low alignment', () => {
    kernel.dispatch({ type: 'LOAD_PROTOCOL', patternId: 'coherence', timestamp: Date.now() });
    kernel.dispatch({ type: 'START_SESSION', timestamp: Date.now() });
    
    // Simulate running for a bit
    vi.setSystemTime(Date.now() + 12000);
    kernel.tick(12, { timestamp: Date.now(), delta_time: 12, visibilty_state: 'visible' });

    // Inject Low Alignment Belief (User struggling to keep up)
    kernel.dispatch({
        type: 'BELIEF_UPDATE',
        belief: {
            arousal: 0.5,
            attention: 0.5,
            rhythm_alignment: 0.1, // Very low alignment
            valence: 0.0,
            arousal_variance: 0, attention_variance: 0, rhythm_variance: 0, prediction_error: 0, innovation: 0, mahalanobis_distance: 0, confidence: 1
        },
        timestamp: Date.now()
    });

    // Check if middleware queued a tempo adjustment
    // Note: Middleware acts async via command queue, but PureZenBKernel processes queue in dispatch loop.
    // However, the middleware logic has a condition `after.sessionDuration > 10`. We met that.
    
    const state = kernel.getState();
    // Expect tempoScale to increase (slow down) to help user
    expect(state.tempoScale).toBeGreaterThan(1.0);
  });

  // --- 4. PERSISTENCE ---

  it('should write critical events to BioFS', () => {
    kernel.dispatch({ type: 'BOOT', timestamp: Date.now() });
    // BOOT is not critical enough for strict write in some configs, 
    // but START_SESSION is.
    
    kernel.dispatch({ type: 'LOAD_PROTOCOL', patternId: 'calm', timestamp: Date.now() });
    kernel.dispatch({ type: 'START_SESSION', timestamp: Date.now() });

    expect(mockFS.writeEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'START_SESSION'
    }));
  });

});
