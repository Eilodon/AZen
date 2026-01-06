
import React, { useEffect, useState, useRef } from 'react';
import { Activity, Terminal, Shield, Cpu, X, Zap, Gauge, Heart, Smile } from 'lucide-react';
import { useKernel } from '../kernel/KernelProvider';
import { RuntimeState } from '../services/PureZenBKernel';
import { KernelEvent } from '../types';

export function KernelMonitor({ onClose }: { onClose: () => void }) {
  const kernel = useKernel();
  const [state, setState] = useState<RuntimeState>(kernel.getState());
  const [log, setLog] = useState<KernelEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = kernel.subscribe((s) => {
      setState({ ...s });
      setLog(kernel.getLogBuffer());
    });
    return unsub;
  }, [kernel]);

  const fepColor = state.belief.prediction_error > 0.8 ? 'text-red-500' : 
                   state.belief.prediction_error > 0.4 ? 'text-yellow-500' : 'text-green-500';
                   
  const anomalyColor = state.belief.mahalanobis_distance > 3.0 ? 'text-red-500' : 'text-emerald-500';

  const obs = state.lastObservation;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl font-mono text-xs p-4 overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-10 duration-300">
      
      {/* Header */}
      <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-4">
        <div className="flex items-center gap-2">
            <Cpu size={16} className="text-emerald-500" />
            <span className="text-emerald-500 font-bold tracking-widest uppercase">ZenB Affective Engine // v5.0 (POS+RSA)</span>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X size={16} className="text-white/50" /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden">
        
        {/* Left Col: State Inspection */}
        <div className="flex flex-col gap-4">
            
            {/* Status Card */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="text-white/40 uppercase tracking-widest mb-2 flex items-center gap-2"><Activity size={12}/> Kernel Status</div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <div className="text-[10px] text-white/30">STATUS</div>
                        <div className="text-lg text-white font-bold">{state.status}</div>
                    </div>
                    <div>
                        <div className="text-[10px] text-white/30">TEMPO SCALE</div>
                        <div className={`text-lg font-bold flex items-center gap-2 ${state.tempoScale > 1.05 ? 'text-yellow-400' : 'text-white'}`}>
                            {state.tempoScale.toFixed(2)}x
                            {state.tempoScale > 1.05 && <Gauge size={14} className="animate-pulse"/>}
                        </div>
                    </div>
                </div>
            </div>

            {/* Affective Fusion Model */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 flex-1 overflow-y-auto">
                <div className="text-white/40 uppercase tracking-widest mb-4 flex items-center gap-2"><Shield size={12}/> Affective State Estimator</div>
                
                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between mb-1">
                            <span className="text-white/60">Arousal (Stress/HRV)</span>
                            <span className="text-blue-400">{state.belief.arousal.toFixed(2)}</span>
                        </div>
                        <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${state.belief.arousal * 100}%` }} />
                        </div>
                    </div>

                    <div>
                         <div className="flex justify-between mb-1">
                            <span className="text-white/60">Valence (Facial/Mood)</span>
                            <span className={state.belief.valence > 0 ? "text-emerald-400" : "text-rose-400"}>
                                {state.belief.valence.toFixed(2)}
                            </span>
                        </div>
                        {/* Valence bar -1 to 1 */}
                        <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden relative">
                             <div className="absolute left-1/2 h-full w-0.5 bg-white/50"></div>
                             <div className={`h-full absolute top-0 ${state.belief.valence > 0 ? 'bg-emerald-500 left-1/2' : 'bg-rose-500 right-1/2'}`} 
                                  style={{ width: `${Math.abs(state.belief.valence) * 50}%`, [state.belief.valence > 0 ? 'left' : 'right']: '50%' }} />
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-white/10">
                        <div className="p-2 bg-black/20 rounded">
                             <div className="text-[9px] text-white/40">FREE ENERGY</div>
                             <div className={fepColor}>{state.belief.prediction_error.toFixed(4)}</div>
                        </div>
                        <div className="p-2 bg-black/20 rounded">
                             <div className="text-[9px] text-white/40">ANOMALY σ</div>
                             <div className={anomalyColor}>{state.belief.mahalanobis_distance.toFixed(2)}</div>
                        </div>
                    </div>
                </div>

                <div className="mt-6 border-t border-white/10 pt-4">
                     <div className="text-[10px] text-white/30 mb-2 flex items-center justify-between">
                        <span>MULTI-MODAL SENSOR FUSION</span>
                        <span className="text-emerald-500/80">{obs?.hr_confidence ? (obs.hr_confidence * 100).toFixed(0) : 0}% CONF</span>
                     </div>
                     <div className="grid grid-cols-3 gap-2 text-[10px] text-white/60 font-mono">
                        <div className="bg-white/5 p-2 rounded">
                            <Heart size={10} className="mb-1 text-rose-400"/>
                            <div>HR: {obs?.heart_rate ? Math.round(obs.heart_rate) : '--'}</div>
                            <div className="text-white/30">RR: {obs?.respiration_rate ? Math.round(obs.respiration_rate) : '--'}</div>
                        </div>
                        <div className="bg-white/5 p-2 rounded">
                             <Zap size={10} className="mb-1 text-yellow-400"/>
                             <div>SI: {obs?.stress_index ? Math.round(obs.stress_index) : '--'}</div>
                        </div>
                        <div className="bg-white/5 p-2 rounded">
                             <Smile size={10} className="mb-1 text-blue-400"/>
                             <div>VAL: {obs?.facial_valence?.toFixed(2) ?? '--'}</div>
                        </div>
                     </div>
                </div>
            </div>
        </div>

        {/* Right Col: Event Log */}
        <div className="bg-black border border-white/10 rounded-lg p-4 flex flex-col font-mono">
             <div className="text-white/40 uppercase tracking-widest mb-2 flex items-center gap-2"><Terminal size={12}/> Event Stream</div>
             <div className="flex-1 overflow-y-auto space-y-1 scrollbar-hide opacity-80" ref={scrollRef}>
                {log.slice().reverse().map((e, i) => (
                    <div key={i} className="flex gap-2 text-[10px] border-b border-white/5 pb-1 mb-1 last:border-0">
                        <span className="text-white/30 shrink-0">{new Date(e.timestamp).toISOString().split('T')[1].slice(0, -1)}</span>
                        <span className={e.type === 'SAFETY_INTERDICTION' ? 'text-red-500 font-bold' : e.type === 'ADJUST_TEMPO' ? 'text-yellow-400' : 'text-emerald-500'}>{e.type}</span>
                        <span className="text-white/60 truncate">{JSON.stringify(e).slice(0, 50)}...</span>
                    </div>
                ))}
             </div>
        </div>

      </div>
    </div>
  );
}
