import React, { useState, useEffect } from 'react';
import { Shield, Volume2, VolumeX, Settings, Trash2, Wifi, BatteryMedium, Signal, ExternalLink } from 'lucide-react';
import { VoiceSettings } from '../types';

interface AndroidHeaderProps {
  statusText: string;
  isSpeaking: boolean;
  isListening: boolean;
  voiceSettings: VoiceSettings;
  onToggleAutoSpeak: () => void;
  onOpenSettings: () => void;
  onClearChat: () => void;
  continuousModeEnabled?: boolean;
  onToggleContinuousMode?: (forced?: boolean) => void;
}

export const AndroidHeader: React.FC<AndroidHeaderProps> = ({
  statusText,
  isSpeaking,
  isListening,
  voiceSettings,
  onToggleAutoSpeak,
  onOpenSettings,
  onClearChat,
  continuousModeEnabled = true,
  onToggleContinuousMode,
}) => {
  const [time, setTime] = useState<string>('');
  const [isInIframe, setIsInIframe] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        setIsInIframe(window.self !== window.top);
      } catch (e) {
        setIsInIframe(true);
      }
    }
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('hi-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="flex flex-col bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-30 select-none">
      {/* Android System Status Bar */}
      <div className="flex items-center justify-between px-4 pt-1.5 pb-1 text-[11px] font-medium text-slate-400">
        <span className="tracking-wide text-slate-300 font-mono">{time || '10:00 AM'}</span>
        <div className="flex items-center space-x-2 text-slate-400">
          <Signal className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] font-bold tracking-tight text-emerald-400">5G</span>
          <Wifi className="w-3.5 h-3.5" />
          <div className="flex items-center space-x-1">
            <span className="text-[10px]">98%</span>
            <BatteryMedium className="w-3.5 h-3.5 text-slate-300" />
          </div>
        </div>
      </div>

      {/* VEER Brand App Bar */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center space-x-2.5">
          {/* Animated Superhero Shield Emblem */}
          <div className="relative flex items-center justify-center">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-lg ${
                isListening
                  ? 'bg-gradient-to-tr from-rose-600 via-amber-500 to-amber-300 ring-2 ring-rose-400 animate-pulse'
                  : isSpeaking
                  ? 'bg-gradient-to-tr from-blue-600 via-cyan-500 to-teal-300 ring-2 ring-cyan-400 shadow-cyan-500/30'
                  : 'bg-gradient-to-tr from-amber-600 via-orange-500 to-yellow-400 shadow-amber-500/20'
              }`}
            >
              <Shield className="w-5 h-5 text-white fill-white/20" />
              <span className="absolute text-[10px] font-extrabold text-white tracking-wider top-[11px]">V</span>
            </div>
            
            {/* Live Status Pip */}
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-950 ${
                isListening
                  ? 'bg-rose-500 animate-ping'
                  : isSpeaking
                  ? 'bg-cyan-400 animate-pulse'
                  : 'bg-emerald-400'
              }`}
            />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center space-x-1.5">
              <h1 className="text-base font-bold text-white tracking-wide flex items-center gap-1">
                <span>वीर</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-semibold">
                  VEER
                </span>
              </h1>
            </div>
            <div className="flex items-center space-x-1.5 text-xs">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isListening
                    ? 'bg-rose-400 animate-ping'
                    : isSpeaking
                    ? 'bg-cyan-400 animate-pulse'
                    : 'bg-emerald-400'
                }`}
              />
              <span className="text-[11px] text-slate-300 font-medium truncate max-w-[170px]">
                {statusText}
              </span>
            </div>
          </div>
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center space-x-1.5">
          {/* Continuous Listening Mode Quick Header Button */}
          {onToggleContinuousMode && (
            <button
              type="button"
              onClick={() => onToggleContinuousMode()}
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 ${
                continuousModeEnabled
                  ? 'bg-emerald-950/80 border-emerald-500/70 text-emerald-300 ring-1 ring-emerald-500/40 shadow-emerald-950/50'
                  : 'bg-slate-900/90 border-slate-700/80 text-slate-400 hover:text-slate-200'
              }`}
              title={
                continuousModeEnabled
                  ? 'लगातार सुनना चालू है (बंद करने के लिए टैप करें)'
                  : 'लगातार सुनना बंद है (चालू करने के लिए टैप करें)'
              }
              aria-label="Toggle continuous listening"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  continuousModeEnabled
                    ? 'bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400'
                    : 'bg-slate-500'
                }`}
              />
              <span className="hidden xs:inline sm:inline">लगातार</span>
              <span className={continuousModeEnabled ? 'text-emerald-300 font-extrabold' : 'text-slate-400 font-semibold'}>
                {continuousModeEnabled ? 'ON' : 'OFF'}
              </span>
            </button>
          )}

          {/* Open in Standalone Tab button when inside iframe */}
          {isInIframe && (
            <a
              href={typeof window !== 'undefined' ? window.location.href : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 hover:text-amber-200 transition-all flex items-center"
              title="माइक टेस्ट के लिए अलग टैब में खोलें"
              aria-label="Open in standalone tab for microphone testing"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          {/* Mute/Unmute Audio Toggle */}
          <button
            onClick={onToggleAutoSpeak}
            className={`p-2 rounded-xl border transition-all ${
              voiceSettings.autoSpeak
                ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60 shadow-sm shadow-cyan-900/30'
                : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title={voiceSettings.autoSpeak ? 'आवाज़ चालू है (टैप करें म्यूट करने के लिए)' : 'आवाज़ बंद है (टैप करें चालू करने के लिए)'}
            aria-label="Toggle voice output"
          >
            {voiceSettings.autoSpeak ? (
              <Volume2 className="w-4 h-4 text-cyan-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {/* Clear Chat Button */}
          <button
            onClick={onClearChat}
            className="p-2 rounded-xl bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-rose-400 hover:border-rose-900/50 transition-all"
            title="बातचीत साफ़ करें"
            aria-label="Clear chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Settings Modal Toggle */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-amber-400 hover:border-amber-900/50 transition-all"
            title="सेटिंग्स"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
