
import React from 'react';
import { Flame, Activity, Wifi } from 'lucide-react';
import clsx from 'clsx';
import { useSessionStore } from '../../stores/sessionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { TRANSLATIONS } from '../../translations';
import { useCameraVitals } from '../../hooks/useCameraVitals';

export function Header() {
  const isActive = useSessionStore(s => s.isActive);
  const userSettings = useSettingsStore(s => s.userSettings);
  
  const t = TRANSLATIONS[userSettings.language] || TRANSLATIONS.en;
  
  // Quick check for sensor status (mocking the hook usage just for UI state existence check)
  // In a real optimized app, we might pass this state down, but checking settings is cheap.
  const sensorsActive = isActive && userSettings.cameraVitalsEnabled;

  return (
    <header 
        className={clsx(
          "fixed top-0 inset-x-0 z-40 p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] flex justify-between items-start transition-all duration-1000 ease-in-out pointer-events-none",
          isActive ? "opacity-60" : "opacity-100"
        )}
      >
        <div className="flex flex-col">
          <h1 className="text-xl font-serif font-medium tracking-wider text-white/90 drop-shadow-lg">ZENB <span className="text-[9px] font-sans font-light tracking-[0.3em] opacity-50 ml-1">OS</span></h1>
          
          <div className="flex flex-col gap-1 mt-1.5">
            {userSettings.streak > 0 && (
               <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2 duration-700 delay-300">
                  <Flame size={10} className={clsx("transition-colors", userSettings.streak > 1 ? "fill-orange-400 text-orange-400" : "text-white/20")} />
                  <span className="text-[9px] font-sans text-white/40 tracking-[0.2em] uppercase">{userSettings.streak} {t.ui.dayStreak}</span>
               </div>
            )}
            
            {/* Bio-Sensor Status Indicator */}
            {sensorsActive && (
               <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2 duration-700 text-emerald-500/80">
                  <Activity size={10} className="animate-pulse" />
                  <span className="text-[9px] font-mono tracking-widest uppercase">SENSORS ONLINE</span>
               </div>
            )}
          </div>
        </div>
        
        {/* Right side status (Battery/Network metaphor or just clean space) */}
        <div className="flex gap-2 opacity-30">
             {/* Keeping it clean for the "Ethereal" look */}
        </div>
      </header>
  );
}
