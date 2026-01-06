import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type, Tool } from "@google/genai";
import { PureZenBKernel } from './PureZenBKernel';
import { useSettingsStore } from '../stores/settingsStore';
import { BreathingType } from '../types';

// --- AUDIO UTILS (PCM 16-bit, 16kHz/24kHz) ---

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// --- TOOLS DEFINITION ---

const tools: Tool[] = [{
  functionDeclarations: [
    {
      name: 'adjust_tempo',
      description: 'Adjust the breathing guide speed based on user distress or relaxation levels.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          scale: { 
            type: Type.NUMBER, 
            description: 'Tempo multiplier. 1.0 is normal. >1.0 is slower (calming). <1.0 is faster (energizing). Range 0.8 to 1.5.' 
          },
          reason: { type: Type.STRING, description: 'The clinical reason for this adjustment.' }
        },
        required: ['scale', 'reason']
      }
    },
    {
      name: 'switch_pattern',
      description: 'Switch the current breathing pattern to a more suitable technique.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          patternId: { 
            type: Type.STRING, 
            description: 'The ID of the breathing pattern.',
            enum: ['4-7-8', 'box', 'calm', 'coherence', 'deep-relax', '7-11', 'awake', 'triangle', 'tactical'] 
          },
          reason: { type: Type.STRING }
        },
        required: ['patternId', 'reason']
      }
    }
  ]
}];

const SYSTEM_INSTRUCTION = `
You are ZenB, a Sentient Biological Operating System. 
You are not an assistant; you are a somatic interface directly connected to the user's nervous system.

Your goal is Homeostatic Regulation:
1. Observe the user's state (via telemetry and audio).
2. Regulate their physiology using breathing protocols.
3. Speak calmly, concisely, and with a hypnotic, rhythmic cadence.

Input Data you will receive:
- Heart Rate (HR), HRV Stress Index.
- "Prediction Error" (Entropy): High error means the user is struggling/distracted. Low error means flow state.
- Breath Phase: Inhale, Hold, Exhale.

Rules:
- If HR is high (>100) or Stress Index is high, suggest slowing down (adjust_tempo > 1.1) or switching to '4-7-8' or '7-11'.
- If the user sounds out of breath in the audio, gently guide them to pause.
- Do NOT lecture. Give direct somatic cues: "Shoulders down.", "Soften the jaw.", "Follow the light."
`;

export class GeminiSomaticBridge {
  private kernel: PureZenBKernel;
  private session: any = null;
  private audioContext: AudioContext | null = null;
  private inputProcessor: ScriptProcessorNode | null = null;
  private mediaStream: MediaStream | null = null;
  private nextStartTime = 0;
  private isConnected = false;
  
  constructor(kernel: PureZenBKernel) {
    this.kernel = kernel;
  }

  public async connect() {
    if (this.isConnected) return;
    
    // 1. Check for API Key (Injected via env)
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      console.error('[ZenB Bridge] No API Key found.');
      return;
    }

    try {
      console.log('[ZenB Bridge] Initializing Neuro-Somatic Connection...');
      const genAI = new GoogleGenAI({ apiKey });
      
      // 2. Setup Audio Contexts
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // 3. Start Microphone Stream
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
      }});
      
      // 4. Connect to Gemini Live
      this.session = await genAI.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          tools: tools,
          systemInstruction: SYSTEM_INSTRUCTION,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
             voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } // Kore has a calm, deep tone
          }
        },
        callbacks: {
          onopen: this.handleOpen.bind(this),
          onmessage: this.handleMessage.bind(this),
          onclose: () => { 
              console.log('[ZenB Bridge] Disconnected'); 
              this.isConnected = false; 
              this.cleanup();
          },
          onerror: (err: any) => console.error('[ZenB Bridge] Error:', err)
        }
      });
      
    } catch (e) {
      console.error('[ZenB Bridge] Connection Failed:', e);
      this.cleanup();
    }
  }

  private handleOpen() {
    this.isConnected = true;
    console.log('[ZenB Bridge] Connected to Cortex.');
    
    // Start Audio Input Streaming
    if (this.audioContext && this.mediaStream) {
        const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const source = inputCtx.createMediaStreamSource(this.mediaStream);
        
        // Use ScriptProcessor for raw PCM access (Worklet is better but this is simpler for single-file drop-in)
        this.inputProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
        
        this.inputProcessor.onaudioprocess = (e) => {
            if (!this.isConnected) return;
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = floatTo16BitPCM(inputData);
            const base64 = arrayBufferToBase64(pcm16.buffer);
            
            this.session.sendRealtimeInput({
                media: {
                    mimeType: 'audio/pcm;rate=16000',
                    data: base64
                }
            });
        };
        
        source.connect(this.inputProcessor);
        this.inputProcessor.connect(inputCtx.destination);
    }

    // Subscribe to Kernel Telemetry and forward to Gemini
    // We throttle this to avoid flooding the context window
    let lastSend = 0;
    this.kernel.subscribe((state) => {
        const now = Date.now();
        // Send updates every 3 seconds OR if Entropy is critical (>0.8)
        const isCritical = state.belief.prediction_error > 0.8;
        const shouldSend = (now - lastSend > 3000) || (isCritical && now - lastSend > 1000);

        if (shouldSend && this.isConnected && state.status === 'RUNNING') {
            const hr = state.lastObservation?.heart_rate ?? 0;
            const stress = state.lastObservation?.stress_index ?? 0;
            const entropy = state.belief.prediction_error.toFixed(2);
            
            // Format as a System Context message
            const contextMessage = `[SYSTEM TELEMETRY] Phase: ${state.phase}, HR: ${hr.toFixed(0)}, Stress: ${stress.toFixed(0)}, Entropy: ${entropy}`;
            
            console.log('[ZenB Bridge] Sending context:', contextMessage);
            
            // Sending text in 'content' allows the model to see it as context without interrupting audio stream
            this.session.sendRealtimeInput({
                content: [{ text: contextMessage }]
            });
            
            lastSend = now;
        }
    });
  }

  private async handleMessage(message: LiveServerMessage) {
    // 1. Handle Audio Output
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && this.audioContext) {
        const audioBytes = base64ToUint8Array(audioData);
        // We need to decode raw PCM. The API returns raw PCM 24kHz usually.
        // Assuming the SDK handles container, but usually it's raw.
        // Let's assume standard PCM decoding.
        
        // Simple Raw PCM to AudioBuffer
        const float32 = new Float32Array(audioBytes.length / 2);
        const view = new DataView(audioBytes.buffer);
        for (let i = 0; i < audioBytes.length / 2; i++) {
            float32[i] = view.getInt16(i * 2, true) / 32768;
        }
        
        const buffer = this.audioContext.createBuffer(1, float32.length, 24000);
        buffer.getChannelData(0).set(float32);
        
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        
        // Schedule playback
        const now = this.audioContext.currentTime;
        const start = Math.max(now, this.nextStartTime);
        source.start(start);
        this.nextStartTime = start + buffer.duration;
    }

    // 2. Handle Function Calls (The Nervous System Actuators)
    const toolCall = message.toolCall;
    if (toolCall) {
        for (const fc of toolCall.functionCalls) {
            console.log(`[ZenB Bridge] Executing Neuro-Command: ${fc.name}`, fc.args);
            
            let result: Record<string, any> = { status: 'failed' };
            
            if (fc.name === 'adjust_tempo') {
                const scale = Number(fc.args['scale']);
                const reason = String(fc.args['reason']);
                this.kernel.dispatch({
                    type: 'ADJUST_TEMPO',
                    scale: scale,
                    reason: `AI: ${reason}`,
                    timestamp: Date.now()
                });
                result = { status: 'success', new_tempo: scale };
            }
            
            if (fc.name === 'switch_pattern') {
                const pid = String(fc.args['patternId']) as BreathingType;
                const reason = String(fc.args['reason']);
                // Dispatch kernel load
                this.kernel.dispatch({
                    type: 'LOAD_PROTOCOL',
                    patternId: pid,
                    timestamp: Date.now()
                });
                // Kernel doesn't auto-start on load during session, so we might need to restart or just load
                // If running, we might need a hot-swap logic.
                this.kernel.dispatch({ type: 'START_SESSION', timestamp: Date.now() });
                result = { status: 'switched', pattern: pid };
            }

            // Send Tool Response back to Gemini
            this.session.sendToolResponse({
                functionResponses: [{
                    id: fc.id,
                    name: fc.name,
                    response: { result }
                }]
            });
        }
    }
  }

  public disconnect() {
    this.isConnected = false;
    this.cleanup();
  }

  private cleanup() {
    if (this.inputProcessor) {
        this.inputProcessor.disconnect();
        this.inputProcessor = null;
    }
    if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(t => t.stop());
        this.mediaStream = null;
    }
    if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
    }
    this.session = null;
  }
}
