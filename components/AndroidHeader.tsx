
import React, { useState, useEffect } from 'react';
import {
  Shield,
  Volume2,
  VolumeX,
  Settings,
  Trash2,
  ExternalLink,
} from 'lucide-react';
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
  continuousModeEnabled = false,
  onToggleContinuousMode,
}) => {
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }
  }, []);

  return (
    <header className="flex flex-col bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-30 select-none">

      {/* VEER Brand App Bar */}
      <div className="flex items-center justify-between px-3 py-2.5">

        <div className="flex items-center space-x-2.5">

          {/* VEER Shield Logo */}
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
              <span className="absolute text-[10px] font-extrabold text-white tracking-wider top-[11px]">
                V
              </span>
            </div>

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

          {/* VEER Name and Status */}
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

        {/* Header Controls */}
        <div className="flex items-center space-x-1.5">

          {/* Continuous Listening ON/OFF */}
          {onToggleContinuousMode && (
            <button
              type="button"
              onClick={() => onToggleContinuousMode()}
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 ${
                continuousModeEnabled
                  ? 'bg-emerald-950/80 border-emerald-500/70 text-emerald-300 ring-1 ring-emerald-500/40'
                  : 'bg-slate-900/90 border-slate-700/80 text-slate-400'
              }`}
              title={
                continuousModeEnabled
                  ? 'लगातार सुनना बंद करें'
                  : 'लगातार सुनना चालू करें'
              }
              aria-label="Toggle continuous listening"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  continuousModeEnabled
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-slate-500'
                }`}
              />

              <span>लगातार</span>

              <span>
                {continuousModeEnabled ? 'ON' : 'OFF'}
              </span>
            </button>
          )}

          {/* Open Standalone Tab */}
          {isInIframe && (
            <a
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/30 transition-all flex items-center"
              title="अलग टैब में खोलें"
              aria-label="Open in standalone tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          {/* Auto Speak Toggle */}
          <button
            type="button"
            onClick={onToggleAutoSpeak}
            className={`p-2 rounded-xl border transition-all ${
              voiceSettings.autoSpeak
                ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60'
                : 'bg-slate-900/80 text-slate-400 border-slate-800'
            }`}
            title={
              voiceSettings.autoSpeak
                ? 'आवाज़ बंद करें'
                : 'आवाज़ चालू करें'
            }
            aria-label="Toggle voice output"
          >
            {voiceSettings.autoSpeak ? (
              <Volume2 className="w-4 h-4 text-cyan-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {/* Clear Chat */}
          <button
            type="button"
            onClick={onClearChat}
            className="p-2 rounded-xl bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-rose-400 transition-all"
            title="बातचीत साफ़ करें"
            aria-label="Clear chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-amber-400 transition-all"
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
