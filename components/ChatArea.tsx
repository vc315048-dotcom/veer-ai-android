import React, { useRef, useEffect, useState } from 'react';
import { Shield, Sparkles, Volume2, Square, Copy, Check, User, RefreshCw, AlertTriangle } from 'lucide-react';
import { ChatMessage } from '../types';

interface ChatAreaProps {
  messages: ChatMessage[];
  isLoading: boolean;
  activePlayingId: string | null;
  retryCountdown?: number | null;
  onPlayMessage: (message: ChatMessage) => void;
  onStopPlayback: () => void;
  onSelectSuggestion: (text: string) => void;
  onRetryMessage?: (query: string) => void;
  onCancelCountdown?: () => void;
}

const HINDI_SUGGESTIONS = [
  { label: '🌟 आज का सुविचार', query: 'आज का एक बहुत सुंदर और प्रेरक सुविचार सुनाइए।' },
  { label: '⚡ तुम्हारी सुपरपावर्स क्या हैं?', query: 'वीर, तुम एक सहायक के रूप में मेरी क्या-क्या मदद कर सकते हो?' },
  { label: '📖 एक प्रेरक कहानी', query: 'मुझको एक छोटी और प्रेरणादायक कहानी सुनाइए।' },
  { label: '🇮🇳 भारत के 3 रोचक तथ्य', query: 'भारत के बारे में तीन अनोखे और रोचक तथ्य बताइए।' },
  { label: '😄 एक मज़ेदार चुटकुला', query: 'एक हँसाने वाला बढ़िया हिन्दी चुटकुला सुनाओ।' },
  { label: '🎯 मन को शांत रखने के उपाय', query: 'दिनभर ऊर्जावान और तनावमुक्त रहने के 3 सरल उपाय बताइए।' },
];

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  isLoading,
  activePlayingId,
  retryCountdown,
  onPlayMessage,
  onStopPlayback,
  onSelectSuggestion,
  onRetryMessage,
  onCancelCountdown,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, retryCountdown]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <main className="flex-1 overflow-y-auto px-3.5 py-4 space-y-4 custom-scrollbar">
      {/* Empty State / Welcome Screen */}
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-2 py-6">
          {/* Superhero Hero Core Avatar */}
          <div className="relative mb-4">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-600 via-orange-500 to-yellow-400 p-0.5 shadow-xl shadow-amber-500/20 animate-hero-glow">
              <div className="w-full h-full bg-slate-950 rounded-[22px] flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 to-transparent pointer-events-none" />
                <Shield className="w-9 h-9 text-amber-400 fill-amber-400/20" />
                <span className="text-[12px] font-black text-amber-300 tracking-wider">VEER</span>
              </div>
            </div>
          </div>

          <h2 className="text-xl font-bold text-white tracking-wide flex items-center justify-center gap-1.5 mb-1.5">
            <span>जय हिंद! मैं हूँ</span>
            <span className="text-amber-400 font-extrabold">वीर</span>
          </h2>
          <p className="text-sm text-slate-300 max-w-sm leading-relaxed mb-3 font-normal">
            आपका व्यक्तिगत AI सुपरहीरो सहायक। बोलकर सवाल पूछें, वीर समझदारी से जवाब देगा और बोलकर सुनाएगा!
          </p>

          {/* Voice Command Quick Guide */}
          <div className="mb-5 px-3.5 py-2.5 rounded-2xl bg-slate-900/90 border border-amber-500/25 max-w-sm text-[11.5px] text-slate-300 flex flex-col gap-1.5 shadow-md">
            <div className="font-semibold text-amber-300 flex items-center justify-center gap-1.5 text-xs">
              <span>🎙️ हैंड्स-फ़्री वॉइस कमांड्स</span>
            </div>
            <div className="flex items-center justify-center gap-2.5 text-[11px] text-slate-300">
              <button
                type="button"
                onClick={() => onSelectSuggestion('वीर, आराम करो')}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-200 border border-slate-700 hover:border-amber-500/40 transition-all active:scale-95"
                title="हैंड्स-फ़्री विराम कमांड टेस्ट करें"
              >
                ⏸️ “वीर, आराम करो”
              </button>
              <button
                type="button"
                onClick={() => onSelectSuggestion('वीर, फिर सुनो')}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-200 border border-slate-700 hover:border-emerald-500/40 transition-all active:scale-95"
                title="हैंड्स-फ़्री फिर शुरू करने का कमांड टेस्ट करें"
              >
                ▶️ “वीर, फिर सुनो”
              </button>
            </div>
          </div>

          {/* Quick Hindi Suggestion Chips */}
          <div className="w-full max-w-md">
            <div className="flex items-center justify-center gap-1.5 text-xs text-amber-400/90 font-medium mb-3 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>इनमें से कुछ पूछकर देखें</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
              {HINDI_SUGGESTIONS.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => onSelectSuggestion(item.query)}
                  className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/90 hover:border-amber-500/40 hover:bg-slate-800/70 text-slate-200 text-xs transition-all active:scale-[0.98] flex items-center justify-between group shadow-sm"
                >
                  <span className="font-medium text-slate-200 group-hover:text-amber-300 transition-colors">
                    {item.label}
                  </span>
                  <span className="text-slate-500 group-hover:text-amber-400 text-xs transition-colors">
                    ➔
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Message List */}
      {messages.map((msg, index) => {
        const isVeer = msg.sender === 'veer';
        const isPlayingThis = activePlayingId === msg.id;
        const isLastMessage = index === messages.length - 1;

        return (
          <div
            key={msg.id}
            className={`flex flex-col ${isVeer ? 'items-start' : 'items-end'} transition-all`}
          >
            <div
              className={`flex items-end gap-2 max-w-[92%] sm:max-w-[85%] ${
                isVeer ? 'flex-row' : 'flex-row-reverse'
              }`}
            >
              {/* Avatar Icon */}
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                  isVeer
                    ? msg.is503Error
                      ? 'bg-amber-600 text-white shadow-amber-500/20'
                      : 'bg-gradient-to-tr from-amber-600 to-orange-500 text-white shadow-amber-500/20'
                    : 'bg-indigo-600 text-white shadow-indigo-500/20'
                }`}
              >
                {isVeer ? (
                  msg.is503Error ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <Shield className="w-4 h-4 fill-white/20" />
                  )
                ) : (
                  <User className="w-4 h-4" />
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={`rounded-2xl px-4 py-3 shadow-md relative group ${
                  isVeer
                    ? msg.is503Error
                      ? 'bg-slate-900/95 border border-amber-600/40 text-slate-100 rounded-bl-sm'
                      : 'bg-slate-900/95 border border-slate-800 text-slate-100 rounded-bl-sm'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-sm'
                }`}
              >
                {/* Sender Title for VEER */}
                {isVeer && (
                  <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-800/60">
                    <span className="text-[11px] font-bold text-amber-400 tracking-wide flex items-center gap-1">
                      <span>वीर</span>
                      {msg.is503Error ? (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-medium">
                          सर्वर व्यस्त (503)
                        </span>
                      ) : (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-300 font-mono">
                          AI
                        </span>
                      )}
                    </span>

                    {/* Speech Control & Copy */}
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() =>
                          isPlayingThis ? onStopPlayback() : onPlayMessage(msg)
                        }
                        className={`p-1 rounded-md transition-all ${
                          isPlayingThis
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'text-slate-400 hover:text-amber-300 hover:bg-slate-800'
                        }`}
                        title={isPlayingThis ? 'आवाज़ रोकें' : 'बोलकर सुनाएं'}
                        aria-label="Speak response"
                      >
                        {isPlayingThis ? (
                          <div className="flex items-center gap-1 text-[11px] font-medium text-amber-300">
                            <Square className="w-3 h-3 fill-amber-400" />
                            <div className="flex items-center gap-0.5">
                              <span className="w-1 h-2 bg-amber-400 rounded-full animate-bounce" />
                              <span className="w-1 h-3 bg-amber-300 rounded-full animate-bounce [animation-delay:0.15s]" />
                              <span className="w-1 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:0.3s]" />
                            </div>
                          </div>
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => handleCopy(msg.text, msg.id)}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        title="कॉपी करें"
                        aria-label="Copy text"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Message Body */}
                <div className="text-[14.5px] leading-relaxed whitespace-pre-wrap font-normal break-words">
                  {msg.text}
                </div>

                {/* Server Busy / Error Manual Retry Action */}
                {(msg.is503Error || msg.isError) && msg.retryQuery && (
                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex flex-col gap-2">
                    {/* Active Countdown Bar if this is the latest message */}
                    {isLastMessage && retryCountdown !== null && retryCountdown !== undefined && retryCountdown > 0 && (
                      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11.5px] text-amber-300">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                          <span>स्वतः प्रयास हो रहा है: <strong>{retryCountdown}s</strong></span>
                        </div>
                        {onCancelCountdown && (
                          <button
                            type="button"
                            onClick={onCancelCountdown}
                            className="text-[10px] text-slate-400 hover:text-slate-200 underline"
                          >
                            रद्द करें
                          </button>
                        )}
                      </div>
                    )}

                    {/* Manual Retry Button */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onRetryMessage?.(msg.retryQuery!)}
                        disabled={isLoading}
                        className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-amber-500/20 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        <span>दोबारा प्रयास करें</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Timestamp */}
                <div
                  className={`text-[10px] mt-1.5 text-right ${
                    isVeer ? 'text-slate-500' : 'text-blue-200/80'
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Loading Indicator when VEER is thinking */}
      {isLoading && (
        <div className="flex items-start gap-2 max-w-[85%]">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-500 flex items-center justify-center text-white shrink-0 shadow-sm animate-pulse">
            <Shield className="w-4 h-4 fill-white/20" />
          </div>
          <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-slate-900/90 border border-slate-800 text-slate-200 shadow-md">
            <div className="flex items-center space-x-2">
              <span className="text-xs text-amber-400 font-semibold tracking-wide">
                वीर सोच रहे हैं...
              </span>
              <div className="flex space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </main>
  );
};
