
import { useEffect, useState, useRef } from 'react';
import { CameraVitalsEngine } from '../services/CameraVitalsEngine.v2';
import { VitalSigns } from '../types';

export function useCameraVitals(enabled: boolean) {
  const [vitals, setVitals] = useState<VitalSigns>({
    heartRate: 0,
    confidence: 0,
    signalQuality: 'poor',
    snr: 0,
    motionLevel: 0
  });
  
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  
  const engineRef = useRef<CameraVitalsEngine | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }
    
    let mounted = true;
    
    const init = async () => {
      try {
        setError(null);
        // Initialize engine
        const engine = new CameraVitalsEngine();
        await engine.init();
        engineRef.current = engine;
        
        // Request camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 }
          }
        });
        streamRef.current = stream;
        
        // Create video element
        const video = document.createElement('video');
        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        await video.play();
        videoRef.current = video;
        
        if (!mounted) {
          cleanup();
          return;
        }
        
        setIsReady(true);
        
        // Processing loop with Adaptive Throttling
        let lastProcessTime = 0;
        
        const processLoop = async (now: number) => {
           if (!engineRef.current || !videoRef.current || !mounted) return;
           
           // Adaptive frame timing based on signal quality to save CPU/Battery
           let targetFrameTime = 1000 / 30; // Default 30fps
           
           // If we have very good confidence, we can slow down sampling slightly (15fps)
           // But rPPG needs high sampling for HR frequency precision, so we be careful.
           // However, for UI updates and heavier processing phases, we can skip frames if system is stressed.
           // For accurate rPPG, we actually want stable 30fps.
           // The "throttling" here is more about not exceeding 30fps and dealing with lag spikes.
           // But if confidence is super low (user away), we can check less often to save battery?
           // Actually, standard rPPG needs constant sampling. We will just ensure we don't over-process.
           
           if (now - lastProcessTime >= targetFrameTime) {
               try {
                   const result = await engineRef.current.processFrame(videoRef.current);
                   if (mounted) setVitals(result);
                   lastProcessTime = now;
               } catch (err) {
                   console.error('[rPPG] Processing error:', err);
               }
           }
           rafRef.current = requestAnimationFrame(processLoop);
        };
        
        rafRef.current = requestAnimationFrame(processLoop);
        
      } catch (err: any) {
        console.error('[rPPG] Initialization failed:', err);
        if (mounted) {
            // Provide user-friendly error messages
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setError('Camera permission denied. Please allow access in settings.');
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                setError('No camera found on this device.');
            } else {
                setError(err.message || 'Failed to access camera.');
            }
        }
      }
    };
    
    init();
    
    return () => {
      mounted = false;
      cleanup();
    };
  }, [enabled]);
  
  const cleanup = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    if (engineRef.current) engineRef.current.dispose();
    streamRef.current = null;
    videoRef.current = null;
    engineRef.current = null;
    
    setIsReady(false);
    setVitals({
        heartRate: 0,
        confidence: 0,
        signalQuality: 'poor',
        snr: 0,
        motionLevel: 0
    });
  };
  
  return { vitals, isReady, error };
}