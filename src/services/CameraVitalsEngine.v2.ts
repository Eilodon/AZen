
import * as tf from '@tensorflow/tfjs';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import type { Keypoint } from '@tensorflow-models/face-landmarks-detection';
import type { ProcessingRequest, ProcessingResponse, ErrorResponse } from './fft.worker';
import { SignalQuality, VitalSigns, AffectiveState } from '../types';

/**
 * ZENB BIO-SIGNAL PIPELINE v5.0 (AFFECTIVE ENGINE)
 * ================================================
 * Upgrades:
 * - Multi-ROI extraction (Forehead + Cheeks) for robust signal.
 * - Geometric Valence Calculation (Facial AUs proxy).
 * - Motion-compensated RGB Stream.
 * - Integration with v5.0 POS Worker.
 */

interface ROI {
  x: number; y: number; width: number; height: number;
}

export class CameraVitalsEngine {
  private detector: faceLandmarksDetection.FaceLandmarksDetector | null = null;
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  
  // Data Buffers
  private rgbBuffer: { r: number; g: number; b: number; timestamp: number }[] = [];
  private readonly BUFFER_DURATION = 6; // shorter window for faster POS response
  private readonly SAMPLE_RATE = 30;
  
  private worker: Worker | null = null;
  private isProcessing = false;
  
  // Affective State Tracking
  private valenceSmoother = 0;
  private arousalSmoother = 0;

  constructor() {
    this.canvas = new OffscreenCanvas(640, 480);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  }

  async init(): Promise<void> {
    try {
      await tf.ready();
      await tf.setBackend('webgl');
      
      this.detector = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        { 
            runtime: 'tfjs', 
            maxFaces: 1, 
            refineLandmarks: true // Needed for Iris/Lips precision
        }
      );
      
      this.worker = new Worker(new URL('./fft.worker.ts', import.meta.url), { type: 'module' });
      console.log('[ZenB] Affective Engine v5.0 initialized');
    } catch (error) {
      console.error('[ZenB] Engine init failed', error);
      throw error;
    }
  }

  async processFrame(video: HTMLVideoElement): Promise<VitalSigns> {
    if (!this.detector || !this.worker) return this.getDefaultVitals();
    
    const timestamp = performance.now();
    const faces = await this.detector.estimateFaces(video, { flipHorizontal: false });
    
    if (faces.length === 0) {
        // Decay signals if face lost
        return this.decayVitals();
    }

    const face = faces[0];
    const keypoints = face.keypoints;

    // 1. EXTRACT MULTI-ROI RGB (Forehead + Cheeks)
    // Using a weighted average of regions improves SNR significantly over just forehead
    const forehead = this.extractROIColor(video, this.getForeheadROI(keypoints, video.videoWidth, video.videoHeight));
    const leftCheek = this.extractROIColor(video, this.getCheekROI(keypoints, video.videoWidth, video.videoHeight, true));
    const rightCheek = this.extractROIColor(video, this.getCheekROI(keypoints, video.videoWidth, video.videoHeight, false));
    
    // Average color (Fusion)
    const fusedColor = {
        r: (forehead.r + leftCheek.r + rightCheek.r) / 3,
        g: (forehead.g + leftCheek.g + rightCheek.g) / 3,
        b: (forehead.b + leftCheek.b + rightCheek.b) / 3,
        timestamp
    };
    
    this.rgbBuffer.push(fusedColor);
    const maxSamples = this.BUFFER_DURATION * this.SAMPLE_RATE;
    if (this.rgbBuffer.length > maxSamples) this.rgbBuffer.shift();

    // 2. CALCULATE GEOMETRIC VALENCE (Rule-based AUs)
    const valence = this.calculateGeometricValence(keypoints);
    this.valenceSmoother = this.valenceSmoother * 0.9 + valence * 0.1; // Smooth updates

    // 3. DETECT MOTION (Head Pose stability)
    const motion = this.calculateMotion(keypoints);

    // 4. ASYNC WORKER PROCESSING
    let workerResult = null;
    if (this.rgbBuffer.length > 64 && !this.isProcessing) {
        workerResult = await this.triggerWorker(motion);
    }

    // 5. FUSION & RETURN
    // If worker returned new data, use it. Otherwise return last known + current Valence.
    const currentVitals = workerResult || this.lastKnownVitals;
    
    // Combine Physio Arousal (Stress Index) + Facial Valence
    // Arousal map: Low Stress -> 0, High Stress -> 1
    const rawStress = currentVitals.hrv?.stressIndex || 0;
    const arousal = Math.min(1, rawStress / 500); // 500 is arbitrary high stress baseline
    this.arousalSmoother = this.arousalSmoother * 0.95 + arousal * 0.05;

    const affectiveState: AffectiveState = {
        valence: this.valenceSmoother,
        arousal: this.arousalSmoother,
        mood_label: this.classifyMood(this.valenceSmoother, this.arousalSmoother)
    };

    const finalResult = {
        ...currentVitals,
        affective: affectiveState,
        motionLevel: motion
    };
    
    this.lastKnownVitals = finalResult;
    return finalResult;
  }

  private lastKnownVitals: VitalSigns = this.getDefaultVitals();

  private async triggerWorker(motion: number): Promise<VitalSigns | null> {
      if (!this.worker) return null;
      this.isProcessing = true;
      
      return new Promise((resolve) => {
          // Clone buffer to avoid race conditions
          const bufferCopy = [...this.rgbBuffer];
          const req: ProcessingRequest = {
              type: 'process_signal',
              rgbData: bufferCopy,
              motionScore: motion,
              sampleRate: this.SAMPLE_RATE
          };
          
          const handler = (e: MessageEvent<ProcessingResponse | ErrorResponse>) => {
              this.worker?.removeEventListener('message', handler);
              this.isProcessing = false;
              if (e.data.type === 'vitals_result') {
                  resolve(this.mapWorkerResponse(e.data));
              } else {
                  resolve(null);
              }
          };
          
          this.worker!.addEventListener('message', handler);
          this.worker!.postMessage(req);
      });
  }

  private mapWorkerResponse(res: ProcessingResponse): VitalSigns {
      return {
          heartRate: res.heartRate,
          respirationRate: res.respirationRate,
          hrv: res.hrv,
          confidence: res.confidence,
          snr: res.snr,
          signalQuality: res.confidence > 0.7 ? 'excellent' : res.confidence > 0.4 ? 'good' : 'poor',
          motionLevel: 0
      };
  }

  // --- GEOMETRIC FEATURES (Valence Proxy) ---
  
  private calculateGeometricValence(pts: Keypoint[]): number {
      // 1. Mouth Smile: Distance between lip corners (61, 291) relative to face width
      // 2. Brow Furrow: Distance between brow inners (107, 336) relative to eye width
      
      const dist = (a: Keypoint, b: Keypoint) => Math.hypot(a.x - b.x, a.y - b.y);
      
      const leftLip = pts[61];
      const rightLip = pts[291];
      const upperLip = pts[0]; // cupid bow
      const lowerLip = pts[17];
      
      const mouthWidth = dist(leftLip, rightLip);
      const mouthHeight = dist(upperLip, lowerLip);
      
      const leftEye = pts[33];
      const rightEye = pts[263];
      const faceWidth = dist(pts[234], pts[454]); // Cheek to cheek
      
      const smileRatio = mouthWidth / faceWidth;
      const openMouthRatio = mouthHeight / faceWidth;
      
      // Heuristic: Smile widens mouth. Frown/Stress tightens or corners drop (y-axis check needed for better acc)
      // For V5.0, we use a simple ratio baseline.
      // Average neutral smileRatio is approx 0.35
      
      const smileScore = (smileRatio - 0.35) * 5.0; // Amplify small changes
      
      // Brow Furrow (Stress/Negative)
      const leftBrow = pts[107];
      const rightBrow = pts[336];
      const browDist = dist(leftBrow, rightBrow) / faceWidth;
      // Neutral browDist ~ 0.25. Stress < 0.22
      const furrowScore = (0.25 - browDist) * 8.0; 
      
      // Combine: Valence = Smile - Furrow
      // This is a simplification but works for "Training-Free" estimation
      return Math.max(-1, Math.min(1, smileScore - Math.max(0, furrowScore)));
  }

  private classifyMood(val: number, aro: number): AffectiveState['mood_label'] {
      if (aro > 0.7) return 'anxious';
      if (val > 0.3 && aro < 0.5) return 'calm';
      if (val > 0.2 && aro > 0.4 && aro < 0.7) return 'focused';
      if (aro < 0.2) return 'distracted'; // or drowsy
      return 'neutral';
  }

  // --- ROI HELPERS ---

  private getForeheadROI(pts: Keypoint[], w: number, h: number): ROI {
     // Standard indices
     const xs = [pts[109].x, pts[338].x, pts[297].x, pts[332].x].map(x=>Math.max(0, Math.min(w, x)));
     const ys = [pts[109].y, pts[338].y, pts[297].y].map(y=>Math.max(0, Math.min(h, y)));
     return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs)-Math.min(...xs), height: Math.max(...ys)-Math.min(...ys) };
  }
  
  private getCheekROI(pts: Keypoint[], w: number, h: number, isLeft: boolean): ROI {
     const indices = isLeft ? [123, 50, 205] : [352, 280, 425];
     const regionPts = indices.map(i => pts[i]);
     const xs = regionPts.map(p => p.x);
     const ys = regionPts.map(p => p.y);
     return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs)-Math.min(...xs), height: Math.max(...ys)-Math.min(...ys) };
  }

  private extractROIColor(video: HTMLVideoElement, roi: ROI) {
      if (roi.width <= 0 || roi.height <= 0) return { r:0, g:0, b:0 };
      this.canvas.width = roi.width;
      this.canvas.height = roi.height;
      this.ctx.drawImage(video, roi.x, roi.y, roi.width, roi.height, 0, 0, roi.width, roi.height);
      const data = this.ctx.getImageData(0, 0, roi.width, roi.height).data;
      
      let r=0, g=0, b=0, c=0;
      for(let i=0; i<data.length; i+=16) { // Downsample for speed
          r+=data[i]; g+=data[i+1]; b+=data[i+2]; c++;
      }
      return c>0 ? { r:r/c, g:g/c, b:b/c } : { r:0, g:0, b:0 };
  }

  private calculateMotion(pts: Keypoint[]): number {
      const nose = pts[1];
      if (!this.lastPos) { this.lastPos = nose; return 0; }
      const d = Math.hypot(nose.x - this.lastPos.x, nose.y - this.lastPos.y);
      this.lastPos = nose;
      return Math.min(1, d / 10);
  }
  private lastPos: Keypoint | null = null;

  private decayVitals(): VitalSigns {
      // Slowly decay confidence if face is lost
      const v = { ...this.lastKnownVitals };
      v.confidence *= 0.95;
      v.signalQuality = v.confidence > 0.4 ? 'fair' : 'poor';
      this.lastKnownVitals = v;
      return v;
  }

  private getDefaultVitals(): VitalSigns {
      return { heartRate: 0, confidence: 0, signalQuality: 'poor', snr: 0, motionLevel: 0 };
  }

  dispose() {
      this.detector?.dispose();
      this.worker?.terminate();
  }
}
