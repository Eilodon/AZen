
import React from 'react';
import { Camera, AlertCircle, X } from 'lucide-react';

export function CameraPermissionModal({ 
  onAllow, 
  onDeny 
}: { 
  onAllow: () => void; 
  onDeny: () => void; 
}) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="max-w-sm w-full bg-[#050505] border border-white/10 rounded-3xl p-8 text-center shadow-2xl relative">
        <button onClick={onDeny} className="absolute top-4 right-4 text-white/30 hover:text-white p-2"><X size={16} /></button>
        
        <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
             <Camera size={32} className="text-emerald-500" />
        </div>
        
        <h2 className="text-2xl font-serif mb-4 text-white">
          Enable Bio-Sensors
        </h2>
        
        <p className="text-white/60 text-sm mb-6 leading-relaxed">
          ZenB uses your camera to measure heart rate variations via your face. This data tunes your breathing rhythm in real-time.
        </p>
        
        <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 mb-8">
          <div className="flex items-start gap-3 text-left">
            <AlertCircle size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-200/80 leading-relaxed">
              <strong>Privacy First</strong>: All processing happens locally on your device (Edge Computing). 
              Your camera feed never leaves your browser.
            </div>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={onDeny}
            className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-white/60 text-sm font-medium"
          >
            Not Now
          </button>
          <button 
            onClick={onAllow}
            className="flex-1 py-3.5 bg-white text-black hover:bg-white/90 rounded-xl transition-colors font-medium text-sm"
          >
            Allow Access
          </button>
        </div>
      </div>
    </div>
  );
}