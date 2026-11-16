import React, { useState, useEffect } from 'react';
import {
  Shield,
  Volume2,
  VolumeX,
  Settings,
  Trash2,
  ExternalLink,
  MoreVertical,
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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

        {/* VEER Logo, Name and Status */}
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

        {/* Three Dot Menu */}
        <div className="relative">

          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            className="p-2.5 rounded-xl bg-slate-900/90 text-slate-200 border border-slate-700/80 hover:bg-slate-800 transition-all active:scale-95"
            title="मेन्यू खोलें"
            aria-label="Open menu"
            aria-expanded={isMenuOpen}
            aria-haspopup="true"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {/* Dropdown Menu */}
          {isMenuOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-60 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-2 z-50"
              role="menu"
            >

              {/* Continuous Listening */}
              {onToggleContinuousMode && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onToggleContinuousMode();
                    setIsMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl text-sm text-slate-200 hover:bg-slate-800 transition-all"
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        continuousModeEnabled
                          ? 'bg-emerald-400 animate-pulse'
                          : 'bg-slate-500'
                      }`}
                    />
                    लगातार सुनना
                  </span>

                  <span
                    className={`text-xs font-bold ${
                      continuousModeEnabled
                        ? 'text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {continuousModeEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>
              )}

              {/* Standalone Tab */}
              {isInIframe && (
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                  onClick={() => setIsMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-slate-200 hover:bg-slate-800 transition-all"
                >
                  <ExternalLink className="w-4 h-4 text-amber-400" />
                  अलग टैब में खोलें
                </a>
              )}

              {/* Voice Output */}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onToggleAutoSpeak();
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl text-sm text-slate-200 hover:bg-slate-800 transition-all"
              >
                <span className="flex items-center gap-3">
                  {voiceSettings.autoSpeak ? (
                    <Volume2 className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-slate-400" />
                  )}
                  आवाज़
                </span>

                <span
                  className={`text-xs font-bold ${
                    voiceSettings.autoSpeak
                      ? 'text-cyan-400'
                      : 'text-slate-400'
                  }`}
                >
                  {voiceSettings.autoSpeak ? 'ON' : 'OFF'}
                </span>
              </button>

              <div className="h-px bg-slate-700/80 my-1" />

              {/* Settings */}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpenSettings();
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-slate-200 hover:bg-slate-800 transition-all"
              >
                <Settings className="w-4 h-4 text-amber-400" />
                सेटिंग्स
              </button>

              {/* Clear Chat */}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onClearChat();
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-slate-200 hover:bg-slate-800 transition-all"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                बातचीत साफ़ करें
              </button>

            </div>
          )}
        </div>
      </div>
    </header>
  );
};
