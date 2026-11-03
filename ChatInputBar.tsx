import React, { useState, useRef } from 'react';
import { Send, Mic, Volume2, Square } from 'lucide-react';
import { soundFx } from '../utils/soundEffects';

interface ChatInputBarProps {
  onSendMessage: (text: string) => void;
  onOpenVoiceMode: () => void;
  isLoading: boolean;
  isSpeaking: boolean;
  onStopPlayback?: () => void;
  statusText?: string;
  continuousModeEnabled: boolean;
  onToggleContinuousMode: (forced?: boolean) => void;
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  onSendMessage,
  onOpenVoiceMode,
  isLoading,
  isSpeaking,
  onStopPlayback,
  statusText,
  continuousModeEnabled,
  onToggleContinuousMode,
}) => {
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isLoading) return;

    soundFx.playTap();
    onSendMessage(trimmed);
    setInputText('');
  };

  const handleMicClick = () => {
    soundFx.playPowerUp();
    onOpenVoiceMode();
  };

  return (
    <footer className="sticky bottom-0 z-20 bg-slate-950/95 border-t border-slate-800/90 backdrop-blur-xl px-3.5 pt-2 pb-3.5 select-none shadow-[0_-8px_30px_rgba(0,0,0,0.6)]">
      {/* Speaking status bar if AI is currently talking */}
      {isSpeaking && (
        <div className="mb-2 px-3 py-1.5 rounded-xl bg-blue-950/80 border border-cyan-500/40 flex items-center justify-between text-xs text-cyan-200 animate-fadeIn shadow-sm">
          <div className="flex items-center space-x-2">
            <Volume2 className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="font-semibold">वीर बोल रहा है...</span>
          </div>
          <button
            type="button"
            onClick={onStopPlayback}
            className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-cyan-900/60 hover:bg-cyan-800/80 text-cyan-100 text-[11px] font-bold border border-cyan-500/40 active:scale-95 transition-all"
          >
            <Square className="w-3 h-3 fill-cyan-400 text-cyan-400" />
            <span>रोकें</span>
          </button>
        </div>
      )}

      {/* Main Chat Bar Container */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center space-x-2 bg-slate-900/95 border border-slate-800/90 rounded-2xl p-1.5 focus-within:border-cyan-500/60 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all shadow-inner"
      >
        {/* Dedicated Mic Button to Launch Full Screen Voice Mode */}
        <button
          type="button"
          onClick={handleMicClick}
          className="relative p-2.5 rounded-xl bg-gradient-to-tr from-blue-600 via-cyan-500 to-teal-400 text-slate-950 hover:brightness-110 active:scale-95 transition-all shadow-md shadow-cyan-500/30 shrink-0 group"
          title="वॉइस मोड खोलें (बोलकर पूछें)"
          aria-label="Open Voice Mode"
        >
          <div className="absolute inset-0 rounded-xl bg-cyan-400/30 animate-ping opacity-40 pointer-events-none" />
          <Mic className="w-5 h-5 text-slate-950 stroke-[2.4] group-hover:scale-105 transition-transform" />
        </button>

        {/* Text Input */}
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="यहाँ हिन्दी में लिखकर पूछें..."
          disabled={isLoading}
          className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 text-sm focus:outline-none px-2 py-1 min-w-0"
        />

        {/* Send Button */}
        <button
          type="submit"
          disabled={!inputText.trim() || isLoading}
          className={`p-2.5 rounded-xl transition-all shrink-0 ${
            inputText.trim() && !isLoading
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 hover:bg-amber-400 active:scale-95 cursor-pointer'
              : 'bg-slate-800/60 text-slate-600 cursor-not-allowed'
          }`}
          title="मैसेज भेजें"
          aria-label="Send message"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-slate-400 border-t-amber-400 rounded-full animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </form>

      {/* Helper Footer Row with Voice Mode prompt & quick continuous indicator */}
      <div className="flex items-center justify-between px-2 pt-1.5 text-[11px] text-slate-400">
        <span className="flex items-center gap-1 text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>बोलने के लिए माइक दबाएं</span>
        </span>

        <button
          type="button"
          onClick={() => onToggleContinuousMode()}
          className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
          title="लगातार सुनना चालू या बंद करें"
        >
          <span>लगातार सुनना:</span>
          <span className={continuousModeEnabled ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
            {continuousModeEnabled ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>
    </footer>
  );
};
