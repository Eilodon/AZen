
import * as Tone from 'tone';
import { SoundPack, CueType, Language } from '../types';

// ============================================================================
// PROFESSIONAL ZEN AUDIO ENGINE V2
// ============================================================================

// Translation stubs
const TRANSLATIONS = {
    en: {
        phases: { inhale: 'Breathe in', exhale: 'Breathe out', hold: 'Hold' },
        ui: { finish: 'Complete' }
    },
    vi: {
        phases: { inhale: 'Hít vào', exhale: 'Thở ra', hold: 'Giữ' },
        ui: { finish: 'Hoàn thành' }
    }
};

// ============================================================================
// AUDIO SYSTEM STATE
// ============================================================================

let isInitialized = false;
let isInitializing = false;

// Master processing chain
let masterBus: Tone.Channel | null = null;
let spatializer: Tone.StereoWidener | null = null;
let masterEQ: Tone.EQ3 | null = null;
let warmth: Tone.Distortion | null = null;
let compressor: Tone.Compressor | null = null;
let reverb: Tone.Reverb | null = null;
let limiter: Tone.Limiter | null = null;

// Instrument layers
type SynthLayers = {
    sub: Tone.Synth;
    body: Tone.AMSynth;
    air: Tone.Synth;
    texture: Tone.FMSynth;
};
let synthLayers: SynthLayers | null = null;

// Breath synthesis
type BreathEngine = {
    white: Tone.Noise;
    pink: Tone.Noise;
    brown: Tone.Noise;
    formant1: Tone.Filter;
    formant2: Tone.Filter;
    formant3: Tone.Filter;
    highpass: Tone.Filter;
    lfo1: Tone.LFO;
    lfo2: Tone.LFO;
    whiteGain: Tone.Gain;
    pinkGain: Tone.Gain;
    brownGain: Tone.Gain;
    mixGain: Tone.Gain;
};
let breathEngine: BreathEngine | null = null;

// Singing bowls
type SingingBowl = {
    synth: Tone.Synth;
    vibrato: Tone.LFO;
    shimmer: Tone.LFO;
    gain: Tone.Gain;
};
let bowls: SingingBowl[] = [];

// Crystal bells
type CrystalBell = {
    synth: Tone.MetalSynth;
    chorus: Tone.Chorus;
    gain: Tone.Gain;
};
let bells: CrystalBell[] = [];

// Ambient pad
let ambientPad: Tone.PolySynth | null = null;
let padFilter: Tone.Filter | null = null;
let padGain: Tone.Gain | null = null;

// Sample bank
type SampleBank = {
    inhale: Tone.Player[];
    exhale: Tone.Player[];
    hold: Tone.Player[];
    finish: Tone.Player[];
    ambience?: Tone.Player;
};
let sampleBank: SampleBank | null = null;

let lastCueKey = '';
let lastCueTime = 0;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function clamp(x: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, x));
}

function randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function dbToGain(db: number): number {
    return Math.pow(10, db / 20);
}

function safeDispose(node: any): void {
    try {
        if (node && typeof node.dispose === 'function') {
            node.dispose();
        }
    } catch (e) {
        console.warn('Dispose error:', e);
    }
}

function randomPick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================================
// MASTER PROCESSING CHAIN
// ============================================================================

function buildMasterChain(): void {
    if (masterBus) return;
    masterBus = new Tone.Channel({ volume: -6 });
    spatializer = new Tone.StereoWidener(0.35);
    masterEQ = new Tone.EQ3({
        low: -1,
        mid: 0.5,
        high: -0.5,
        lowFrequency: 200,
        highFrequency: 5000
    });
    warmth = new Tone.Distortion({
        distortion: 0.05,
        oversample: '4x'
    });
    compressor = new Tone.Compressor({
        threshold: -18,
        ratio: 2.5,
        attack: 0.08,
        release: 0.35,
        knee: 10
    });
    reverb = new Tone.Reverb({
        decay: 3.2,
        preDelay: 0.015,
        wet: 0.28
    });
    limiter = new Tone.Limiter(-0.3);

    masterEQ.connect(warmth);
    warmth.connect(compressor);
    compressor.connect(reverb);
    reverb.connect(spatializer);
    spatializer.connect(limiter);
    limiter.connect(masterBus);
    masterBus.toDestination();
    
    reverb.generate().catch(() => {});
}

// ============================================================================
// SYNTH LAYERS
// ============================================================================

function buildSynthLayers(): SynthLayers {
    if (!masterEQ) buildMasterChain();
    
    const sub = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: {
            attack: 1.2,
            decay: 0.4,
            sustain: 0.65,
            release: 2.2,
            attackCurve: 'exponential',
            decayCurve: 'exponential',
            releaseCurve: 'exponential'
        }
    });
    sub.volume.value = -16;
    
    const body = new Tone.AMSynth({
        harmonicity: 1.8,
        oscillator: { type: 'triangle' },
        envelope: {
            attack: 0.6,
            decay: 0.3,
            sustain: 0.75,
            release: 1.8,
            attackCurve: 'cosine',
            releaseCurve: 'exponential'
        },
        modulation: { type: 'sine' },
        modulationEnvelope: {
            attack: 0.7,
            decay: 0.1,
            sustain: 0.85,
            release: 1.2
        }
    });
    body.volume.value = -11;
    
    const air = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: {
            attack: 0.3,
            decay: 1.2,
            sustain: 0.35,
            release: 2.8,
            releaseCurve: 'exponential'
        }
    });
    air.volume.value = -20;
    
    const texture = new Tone.FMSynth({
        harmonicity: 2.2,
        modulationIndex: 8,
        oscillator: { type: 'triangle' },
        envelope: {
            attack: 0.8,
            decay: 0.5,
            sustain: 0.5,
            release: 2.0
        },
        modulation: { type: 'sine' },
        modulationEnvelope: {
            attack: 0.4,
            decay: 0.3,
            sustain: 0.6,
            release: 1.5
        }
    });
    texture.volume.value = -22;

    sub.connect(masterEQ!);
    body.connect(masterEQ!);
    air.connect(masterEQ!);
    texture.connect(masterEQ!);
    
    return { sub, body, air, texture };
}

// ============================================================================
// BREATH ENGINE
// ============================================================================

function buildBreathEngine(): BreathEngine {
    if (!masterEQ) buildMasterChain();
    
    const white = new Tone.Noise('white');
    const pink = new Tone.Noise('pink');
    const brown = new Tone.Noise('brown');
    
    const formant1 = new Tone.Filter({
        type: 'bandpass',
        frequency: 750,
        Q: 3.5,
        rolloff: -24
    });
    const formant2 = new Tone.Filter({
        type: 'bandpass',
        frequency: 1150,
        Q: 4.0,
        rolloff: -24
    });
    const formant3 = new Tone.Filter({
        type: 'bandpass',
        frequency: 2400,
        Q: 2.8,
        rolloff: -12
    });
    
    const highpass = new Tone.Filter({
        type: 'highpass',
        frequency: 180,
        rolloff: -12
    });
    
    const lfo1 = new Tone.LFO({
        frequency: 0.35,
        min: 700,
        max: 850
    });
    lfo1.connect(formant1.frequency);
    lfo1.start();
    
    const lfo2 = new Tone.LFO({
        frequency: 0.42,
        min: 1100,
        max: 1250
    });
    lfo2.connect(formant2.frequency);
    lfo2.start();
    
    const whiteGain = new Tone.Gain(0.0);
    const pinkGain = new Tone.Gain(0.0);
    const brownGain = new Tone.Gain(0.0);
    const mixGain = new Tone.Gain(0.0);
    
    white.connect(formant1);
    formant1.connect(whiteGain);
    
    pink.connect(formant2);
    formant2.connect(pinkGain);
    
    brown.connect(formant3);
    formant3.connect(highpass);
    highpass.connect(brownGain);
    
    whiteGain.connect(mixGain);
    pinkGain.connect(mixGain);
    brownGain.connect(mixGain);
    mixGain.connect(masterEQ!);
    
    white.start();
    pink.start();
    brown.start();
    
    return {
        white, pink, brown,
        formant1, formant2, formant3, highpass,
        lfo1, lfo2,
        whiteGain, pinkGain, brownGain, mixGain
    };
}

// ============================================================================
// SINGING BOWLS
// ============================================================================

function createSingingBowl(): SingingBowl {
    if (!masterEQ) buildMasterChain();
    
    const partials = [1.0, 2.756, 5.404, 8.933, 13.347, 18.644];
    const amplitudes = partials.map((_, i) => Math.pow(0.65, i));
    
    const synth = new Tone.Synth({
        oscillator: {
            type: 'custom',
            partials: amplitudes
        },
        envelope: {
            attack: 0.008,
            decay: 5.5,
            sustain: 0.0,
            release: 8.0,
            decayCurve: 'exponential',
            releaseCurve: 'exponential'
        }
    });
    
    const vibrato = new Tone.LFO({
        frequency: 4.2,
        min: -8,
        max: 8
    });
    vibrato.connect(synth.detune);
    vibrato.start();
    
    const shimmer = new Tone.LFO({
        frequency: 0.15,
        min: 0.85,
        max: 1.0
    });
    const gain = new Tone.Gain(1.0);
    shimmer.connect(gain.gain);
    shimmer.start();
    
    synth.connect(gain);
    gain.connect(masterEQ!);
    
    return { synth, vibrato, shimmer, gain };
}

function initializeBowls(count: number = 3): void {
    for (let i = 0; i < count; i++) {
        bowls.push(createSingingBowl());
    }
}

// ============================================================================
// CRYSTAL BELLS
// ============================================================================

function createCrystalBell(): CrystalBell {
    if (!masterEQ) buildMasterChain();
    
    const synth = new Tone.MetalSynth({
        frequency: 220,
        envelope: {
            attack: 0.001,
            decay: 1.8,
            release: 0.6
        },
        harmonicity: 6.8,
        modulationIndex: 38,
        resonance: 7000,
        octaves: 1.8
    });
    
    const chorus = new Tone.Chorus({
        frequency: 2.5,
        delayTime: 3.5,
        depth: 0.6,
        wet: 0.5
    });
    chorus.start();
    
    const gain = new Tone.Gain(1.0);
    
    synth.connect(chorus);
    chorus.connect(gain);
    gain.connect(masterEQ!);
    
    return { synth, chorus, gain };
}

function initializeBells(count: number = 2): void {
    for (let i = 0; i < count; i++) {
        bells.push(createCrystalBell());
    }
}

// ============================================================================
// AMBIENT PAD
// ============================================================================

function buildAmbientPad(): void {
    if (!masterEQ) buildMasterChain();
    
    ambientPad = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: {
            attack: 0.05,
            decay: 0.2,
            sustain: 0.35,
            release: 1.8
        }
    });
    
    padFilter = new Tone.Filter({
        type: 'lowpass',
        frequency: 2500,
        rolloff: -12,
        Q: 1.2
    });
    
    padGain = new Tone.Gain(0.0);
    padGain.gain.value = 0.0;
    
    ambientPad.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(masterEQ!);
}

// ============================================================================
// SAMPLE BANK
// ============================================================================

const SAMPLE_URLS = {
    inhale: [
        '/audio/real-zen/inhale_01.wav',
        '/audio/real-zen/inhale_02.wav',
        '/audio/real-zen/inhale_03.wav'
    ],
    exhale: [
        '/audio/real-zen/exhale_01.wav',
        '/audio/real-zen/exhale_02.wav',
        '/audio/real-zen/exhale_03.wav'
    ],
    hold: [
        '/audio/real-zen/hold_01.wav',
        '/audio/real-zen/hold_02.wav'
    ],
    finish: [
        '/audio/real-zen/finish_01.wav'
    ],
    ambience: '/audio/real-zen/ambience_loop.wav'
};

async function loadSampleBank(): Promise<SampleBank | null> {
    if (sampleBank) return sampleBank;
    if (!masterEQ) buildMasterChain();
    
    try {
        // Simple check if we can fetch one file to fail fast before loading Tone.Players
        const check = await fetch(SAMPLE_URLS.inhale[0], { method: 'HEAD' });
        if (!check.ok) throw new Error("Samples missing");

        const createPlayers = (urls: string[], volumeDb: number) => 
            urls.map(url => {
                const player = new Tone.Player({
                    url,
                    autostart: false,
                    fadeIn: 0.02,
                    fadeOut: 0.03
                });
                player.volume.value = volumeDb;
                player.connect(masterEQ!);
                return player;
            });
            
        const bank: SampleBank = {
            inhale: createPlayers(SAMPLE_URLS.inhale, -12),
            exhale: createPlayers(SAMPLE_URLS.exhale, -12),
            hold: createPlayers(SAMPLE_URLS.hold, -14),
            finish: createPlayers(SAMPLE_URLS.finish, -10)
        };
        
        if (SAMPLE_URLS.ambience) {
            const ambience = new Tone.Player({
                url: SAMPLE_URLS.ambience,
                loop: true,
                autostart: false,
                fadeIn: 1.2,
                fadeOut: 1.5
            });
            ambience.volume.value = -32;
            ambience.connect(masterEQ!);
            bank.ambience = ambience;
        }
        
        sampleBank = bank;
        return bank;
    } catch (error) {
        console.warn('Sample loading failed, will use synthesis fallback:', error);
        return null;
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initializeAudioSystem(): Promise<void> {
    if (isInitialized || isInitializing) return;
    isInitializing = true;
    try {
        await Tone.start();
        buildMasterChain();
        synthLayers = buildSynthLayers();
        breathEngine = buildBreathEngine();
        initializeBowls(3);
        initializeBells(2);
        buildAmbientPad();
        
        isInitialized = true;
        console.log('✅ Zen Audio Engine initialized');
    } catch (error) {
        console.error('Audio initialization failed:', error);
    } finally {
        isInitializing = false;
    }
}

export const unlockAudio = async (): Promise<void> => {
    if (isInitialized || isInitializing) return;
    await initializeAudioSystem();
};

// ============================================================================
// PLAYBACK LOGIC
// ============================================================================

function shouldSkipCue(cue: CueType, pack: SoundPack, duration: number): boolean {
    const now = performance.now();
    const bucket = Math.floor(now / 80);
    const key = `${pack}:${cue}:${bucket}:${Math.round(duration * 100)}`;
    if (lastCueKey === key && (now - lastCueTime) < 120) return true;
    lastCueKey = key;
    lastCueTime = now;
    return false;
}

function speakCue(text: string, lang: Language): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
        utterance.rate = lang === 'vi' ? 0.88 : 0.92;
        utterance.pitch = 0.95;
        utterance.volume = 0.85;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    } catch (error) {
        console.warn('Speech synthesis error:', error);
    }
}

function playOrganicBreath(shape: 'inhale' | 'exhale', duration: number): void {
    if (!breathEngine) return;
    const now = Tone.now();
    const dur = clamp(duration, 0.3, 15);
    const { formant1, formant2, whiteGain, pinkGain, brownGain, mixGain } = breathEngine;
    
    if (shape === 'inhale') {
        formant1.frequency.setTargetAtTime(800, now, 0.08);
        formant2.frequency.setTargetAtTime(1200, now, 0.08);
    } else {
        formant1.frequency.setTargetAtTime(650, now, 0.08);
        formant2.frequency.setTargetAtTime(950, now, 0.08);
    }
    
    const rampStart = 0.05;
    mixGain.gain.cancelScheduledValues(now);
    mixGain.gain.setValueAtTime(mixGain.gain.value, now);
    mixGain.gain.linearRampToValueAtTime(dbToGain(-12), now + rampStart);
    mixGain.gain.linearRampToValueAtTime(dbToGain(-14), now + dur * 0.7);
    mixGain.gain.linearRampToValueAtTime(0, now + dur);
    
    whiteGain.gain.cancelScheduledValues(now);
    whiteGain.gain.setValueAtTime(0, now);
    whiteGain.gain.linearRampToValueAtTime(0.32, now + rampStart);
    whiteGain.gain.linearRampToValueAtTime(0, now + dur);
    
    pinkGain.gain.cancelScheduledValues(now);
    pinkGain.gain.setValueAtTime(0, now);
    pinkGain.gain.linearRampToValueAtTime(0.48, now + rampStart);
    pinkGain.gain.linearRampToValueAtTime(0, now + dur);
    
    brownGain.gain.cancelScheduledValues(now);
    brownGain.gain.setValueAtTime(0, now);
    brownGain.gain.linearRampToValueAtTime(0.20, now + rampStart);
    brownGain.gain.linearRampToValueAtTime(0, now + dur);
}

function playSynthCue(cue: CueType, duration: number): void {
    if (!synthLayers) return;
    const now = Tone.now();
    const dur = clamp(duration, 0.3, 15);
    const cents = randomRange(-12, 12);
    const { sub, body, air, texture } = synthLayers;
    
    if (cue === 'inhale') {
        sub.detune.value = cents;
        sub.triggerAttackRelease('C2', Math.min(dur * 0.85, 6), now);
        body.detune.value = cents;
        body.triggerAttackRelease('C3', Math.min(dur * 0.75, 5), now + 0.05);
        air.detune.value = cents + 5;
        air.triggerAttackRelease('C5', Math.min(dur * 0.65, 4), now + 0.1);
        texture.detune.value = cents - 3;
        texture.triggerAttackRelease('G3', Math.min(dur * 0.6, 4.5), now + 0.15);
        
        if (ambientPad && padGain) {
            padGain.gain.cancelScheduledValues(now);
            padGain.gain.setValueAtTime(0, now);
            padGain.gain.linearRampToValueAtTime(dbToGain(-28), now + 0.3);
            padGain.gain.linearRampToValueAtTime(0, now + dur * 0.5);
            ambientPad.triggerAttackRelease(['C4', 'E4', 'G4'], dur * 0.4, now + 0.1);
        }
    } else if (cue === 'exhale') {
        sub.detune.value = cents;
        sub.triggerAttackRelease('A1', Math.min(dur * 0.85, 6), now);
        body.detune.value = cents;
        body.triggerAttackRelease('A2', Math.min(dur * 0.75, 5), now + 0.05);
        air.detune.value = cents - 5;
        air.triggerAttackRelease('A4', Math.min(dur * 0.65, 4), now + 0.1);
        texture.detune.value = cents + 3;
        texture.triggerAttackRelease('E3', Math.min(dur * 0.6, 4.5), now + 0.15);
        
        if (ambientPad && padGain) {
            padGain.gain.cancelScheduledValues(now);
            padGain.gain.setValueAtTime(0, now);
            padGain.gain.linearRampToValueAtTime(dbToGain(-28), now + 0.3);
            padGain.gain.linearRampToValueAtTime(0, now + dur * 0.5);
            ambientPad.triggerAttackRelease(['A3', 'C4', 'E4'], dur * 0.4, now + 0.1);
        }
    } else if (cue === 'hold') {
        if (bells.length > 0) {
            const bell = randomPick(bells);
            bell.synth.frequency.value = 330 + randomRange(-15, 15);
            bell.gain.gain.setValueAtTime(dbToGain(-20), now);
            bell.synth.triggerAttackRelease(0.04, now);
        }
    } else if (cue === 'finish') {
        if (bells.length > 0) {
            bells.forEach((bell, i) => {
                bell.synth.frequency.value = [440, 550][i % 2] + randomRange(-10, 10);
                bell.gain.gain.setValueAtTime(dbToGain(-18), now + i * 0.08);
                bell.synth.triggerAttackRelease(0.1, now + i * 0.08);
            });
        }
        if (bowls.length > 0) {
            const bowl = bowls[0];
            bowl.gain.gain.setValueAtTime(dbToGain(-16), now + 0.05);
            bowl.synth.triggerAttackRelease('C3', 2.5, now + 0.05);
        }
    }
}

function playSingingBowl(cue: CueType): void {
    if (bowls.length === 0) return;
    const now = Tone.now();
    const bowl = randomPick(bowls);
    let note = 'C3';
    let duration = 3.0;
    if (cue === 'inhale') { note = 'E3'; duration = 3.5; }
    else if (cue === 'exhale') { note = 'A2'; duration = 3.5; }
    else if (cue === 'hold') { note = 'G3'; duration = 1.2; }
    else if (cue === 'finish') { note = 'C3'; duration = 5.0; }
    
    bowl.gain.gain.setValueAtTime(dbToGain(-14), now);
    bowl.synth.detune.value = randomRange(-8, 8);
    bowl.synth.triggerAttackRelease(note, duration, now);
}

export async function playCue(
    cue: CueType,
    enabled: boolean,
    pack: SoundPack,
    duration: number,
    lang: Language = 'en'
): Promise<void> {
    if (!enabled) return;
    if (shouldSkipCue(cue, pack, duration)) return;
    
    if (!isInitialized) await initializeAudioSystem();
    try { if (Tone.context.state !== 'running') await Tone.context.resume(); } catch {}
    
    if (pack.startsWith('voice')) {
        const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
        let text = '';
        if (pack === 'voice-12') {
            if (cue === 'inhale') text = lang === 'vi' ? 'Một' : 'One';
            else if (cue === 'exhale') text = lang === 'vi' ? 'Hai' : 'Two';
            else if (cue === 'hold') text = lang === 'vi' ? 'Giữ' : 'Hold';
        } else {
            if (cue === 'inhale') text = t.phases.inhale;
            else if (cue === 'exhale') text = t.phases.exhale;
            else if (cue === 'hold') text = t.phases.hold;
            else if (cue === 'finish') text = t.ui.finish;
        }
        if (text) speakCue(text.toLowerCase(), lang);
        return;
    }
    
    const dur = clamp(duration, 0.3, 15);
    
    if (pack === 'real-zen') {
        const bank = await loadSampleBank();
        if (bank) {
            if (bank.ambience) {
                try {
                    if (cue === 'inhale' && bank.ambience.state !== 'started') bank.ambience.start();
                    if (cue === 'finish' && bank.ambience.state === 'started') bank.ambience.stop('+0.2');
                } catch {}
            }
            const pool = cue === 'inhale' ? bank.inhale : cue === 'exhale' ? bank.exhale : cue === 'hold' ? bank.hold : bank.finish;
            if (pool && pool.length > 0) {
                const player = randomPick(pool);
                player.volume.value += randomRange(-1.5, 1.0);
                try { player.start(); } catch {}
            }
            if (cue === 'inhale' || cue === 'exhale') playOrganicBreath(cue, dur);
            return;
        }
        // Fallback to synth if loading failed or returned null
    }
    
    if (pack === 'synth' || pack === 'real-zen') {
        playSynthCue(cue, dur);
        if (cue === 'inhale' || cue === 'exhale') playOrganicBreath(cue, dur);
    }
    
    if (pack === 'breath') {
        if (cue === 'inhale' || cue === 'exhale') {
            playOrganicBreath(cue, dur);
            if (synthLayers) {
                synthLayers.sub.volume.value = -24;
                synthLayers.sub.triggerAttackRelease(cue === 'inhale' ? 'C2' : 'A1', Math.min(dur * 0.6, 4), Tone.now());
            }
        } else {
            playSingingBowl(cue);
        }
    }
    
    if (pack === 'bells') {
        playSingingBowl(cue);
        if (bells.length > 0) {
            const bell = randomPick(bells);
            const freq = cue === 'inhale' ? 330 : cue === 'exhale' ? 264 : cue === 'hold' ? 396 : 440;
            bell.synth.frequency.value = freq + randomRange(-12, 12);
            bell.gain.gain.setValueAtTime(dbToGain(-16), Tone.now());
            bell.synth.triggerAttackRelease(cue === 'hold' ? 0.05 : cue === 'finish' ? 0.12 : 0.08, Tone.now());
        }
    }
}

export function cleanupAudio(): void {
    try { sampleBank?.ambience?.stop(); } catch {}
    if (sampleBank) {
        [...sampleBank.inhale, ...sampleBank.exhale, ...sampleBank.hold, ...sampleBank.finish].forEach(safeDispose);
        safeDispose(sampleBank.ambience);
    }
    sampleBank = null;
    
    if (synthLayers) Object.values(synthLayers).forEach(safeDispose);
    synthLayers = null;
    
    if (breathEngine) {
        breathEngine.lfo1.stop();
        breathEngine.lfo2.stop();
        Object.values(breathEngine).forEach(safeDispose);
    }
    breathEngine = null;
    
    bowls.forEach(b => { b.vibrato.stop(); b.shimmer.stop(); safeDispose(b.synth); safeDispose(b.gain); });
    bowls = [];
    
    bells.forEach(b => { safeDispose(b.chorus); safeDispose(b.synth); safeDispose(b.gain); });
    bells = [];
    
    safeDispose(ambientPad); safeDispose(padFilter); safeDispose(padGain);
    ambientPad = null; padFilter = null; padGain = null;
    
    safeDispose(spatializer); safeDispose(masterEQ); safeDispose(warmth);
    safeDispose(compressor); safeDispose(reverb); safeDispose(limiter); safeDispose(masterBus);
    masterBus = null; spatializer = null; masterEQ = null; warmth = null; compressor = null; reverb = null; limiter = null;
    
    if (typeof window !== 'undefined' && window.speechSynthesis) try { window.speechSynthesis.cancel(); } catch {}
    
    isInitialized = false;
    isInitializing = false;
    console.log('🔇 Zen Audio Engine cleaned up');
}