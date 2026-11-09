import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Send, AlertCircle, ExternalLink, MessageSquare, Volume2, Radio } from 'lucide-react';
import { soundFx } from '../utils/soundEffects';
import { speechManager } from '../utils/speechManager';
import { isNativeAndroid } from '../utils/nativeVoiceService';

interface VoiceMicButtonProps {
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  setIsListening: (val: boolean) => void;
  onListeningStateChange?: (stateText: string) => void;
  onStopPlayback?: () => void;
  autoListenTrigger: number;
  continuousModeEnabled: boolean;
  onToggleContinuousMode: (forced?: boolean) => void;
}

export const VoiceMicButton: React.FC<VoiceMicButtonProps> = ({
  onSendMessage,
  isLoading,
  isSpeaking,
  isListening,
  setIsListening,
  onListeningStateChange,
  onStopPlayback,
  autoListenTrigger,
  continuousModeEnabled,
  onToggleContinuousMode,
}) => {
  const [inputText, setInputText] = useState('');
  const [speechLanguage, setSpeechLanguage] = useState<'hi-IN' | 'en-IN'>('hi-IN');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [showIframeNotice, setShowIframeNotice] = useState<boolean>(false);
  const [isInIframe, setIsInIframe] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number[]>([6, 10, 16, 10, 6]);

  // Authoritative continuous mode ref synced on every render
  const continuousModeRef = useRef<boolean>(continuousModeEnabled);
  useEffect(() => {
    continuousModeRef.current = continuousModeEnabled;
  }, [continuousModeEnabled]);

  // Session guard to guarantee duplicate or stale recognition sessions can never run
  const sessionIdRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);
  const isActivelyListeningRef = useRef<boolean>(false);
  const isStartingRef = useRef<boolean>(false);
  const silenceRetryCountRef = useRef<number>(0);
  const retryListenTimeoutRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>('');
  const latestTranscriptRef = useRef<string>('');
  const animIntervalRef = useRef<any>(null);
  const errorTimerRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Microphone is disabled only while AI request is in-flight or actively speaking
  const isMicDisabled = isLoading || isSpeaking;

  // Check if running inside embedded iframe
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const inIframe = window.self !== window.top;
        setIsInIframe(inIframe);
      } catch (e) {
        setIsInIframe(true);
      }
    }
  }, []);

  const clearWaveAnimation = () => {
    if (animIntervalRef.current) {
      clearInterval(animIntervalRef.current);
      animIntervalRef.current = null;
    }
    setAudioLevel([6, 10, 16, 10, 6]);
  };

  const startWaveAnimation = () => {
    clearWaveAnimation();
    animIntervalRef.current = setInterval(() => {
      setAudioLevel([
        Math.floor(Math.random() * 16) + 6,
        Math.floor(Math.random() * 24) + 10,
        Math.floor(Math.random() * 28) + 12,
        Math.floor(Math.random() * 24) + 10,
        Math.floor(Math.random() * 16) + 6,
      ]);
    }, 100);
  };

  const showTemporaryError = (msg: string, duration: number = 4000) => {
    setSpeechError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => {
      setSpeechError(null);
    }, duration);
  };

  // Immediate and strict cancellation of speech recognition and any pending retries
  const stopListening = useCallback(() => {
    sessionIdRef.current++; // Invalidate any in-flight session callbacks
    isStartingRef.current = false;
    isActivelyListeningRef.current = false;
    silenceRetryCountRef.current = 0;
    if (retryListenTimeoutRef.current) {
      clearTimeout(retryListenTimeoutRef.current);
      retryListenTimeoutRef.current = null;
    }
    setIsListening(false);
    clearWaveAnimation();
    onListeningStateChange?.(
      continuousModeRef.current ? 'अब बोलिए' : 'लगातार सुनना बंद है (माइक दबाकर बोलें)'
    );

    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      try {
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.abort();
      } catch (e) {}
    }
  }, [setIsListening, onListeningStateChange]);

  // CRITICAL REQUIREMENT 2:
  // When continuousMode turns OFF, immediately stop speech recognition and cancel pending timers
  useEffect(() => {
    if (!continuousModeEnabled) {
      stopListening();
    }
  }, [continuousModeEnabled, stopListening]);

  // Start listening with session guard and authoritative continuousMode checking
  const startListening = useCallback(
    (isManualClick: boolean = false) => {
      // If this is an automatic restart and continuous mode is OFF, abort immediately!
      if (!isManualClick && !continuousModeRef.current) {
        return;
      }

      // In native Android, continuous voice is handled by VeerVoiceForegroundService.
      // Never launch a second browser recognizer (even from a manual mic tap) while
      // that native listener is active; both engines compete for the microphone.
      if (isNativeAndroid() && continuousModeRef.current) {
        setSpeechError(null);
        setIsListening(false);
        onListeningStateChange?.('वीर का native माइक्रोफोन सुन रहा है');
        return;
      }

      // If processing, speaking, or already listening/starting, abort
      if (isMicDisabled || isActivelyListeningRef.current || isStartingRef.current) {
        return;
      }

      if (retryListenTimeoutRef.current) {
        clearTimeout(retryListenTimeoutRef.current);
        retryListenTimeoutRef.current = null;
      }

      // 1. Ensure any lingering audio playback is stopped
      onStopPlayback?.();
      speechManager.stop();

      // 2. Reset transcript buffers
      setSpeechError(null);
      setInterimTranscript('');
      setShowIframeNotice(false);
      finalTranscriptRef.current = '';
      latestTranscriptRef.current = '';

      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        showTemporaryError(
          'ब्राउज़र में वॉइस रिकॉग्निशन समर्थित नहीं है। आप नीचे लिखकर बात कर सकते हैं।',
          5000
        );
        inputRef.current?.focus();
        return;
      }

      // 3. Clean up any previous recognition instance safely
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onstart = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch (e) {}
        recognitionRef.current = null;
      }

      // 4. Session guard: increment session counter for each new start
      const currentSessionId = ++sessionIdRef.current;
      isStartingRef.current = true;

      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.lang = speechLanguage;

        recognition.onstart = () => {
          if (currentSessionId !== sessionIdRef.current) {
            try {
              recognition.abort();
            } catch (e) {}
            return;
          }
          isStartingRef.current = false;
          isActivelyListeningRef.current = true;
          setIsListening(true);
          setSpeechError(null);
          setShowIframeNotice(false);
          setInterimTranscript('');
          onListeningStateChange?.('वीर सुन रहा है');
          startWaveAnimation();
        };

        recognition.onresult = (event: any) => {
          if (currentSessionId !== sessionIdRef.current) return;
          let fullFinal = '';
          let fullInterim = '';

          for (let i = 0; i < event.results.length; ++i) {
            const res = event.results[i];
            if (res.isFinal) {
              fullFinal += res[0].transcript;
            } else {
              fullInterim += res[0].transcript;
            }
          }

          const combined = (fullFinal + ' ' + fullInterim).trim();
          if (combined) {
            setInterimTranscript(combined);
            latestTranscriptRef.current = combined;
          }

          if (fullFinal.trim()) {
            finalTranscriptRef.current = fullFinal.trim();
          }
        };

        recognition.onerror = (event: any) => {
          if (currentSessionId !== sessionIdRef.current) return;
          console.warn('[VEER Voice] recognition error:', event.error);
          clearWaveAnimation();
          isStartingRef.current = false;
          isActivelyListeningRef.current = false;
          setIsListening(false);
          recognitionRef.current = null;

          // If the phone screen was turned off or tab was minimized,
          // the browser intentionally suspends microphone access.
          // Silently clean up without showing confusing error banners.
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            silenceRetryCountRef.current = 0;
            return;
          }

          if (event.error === 'not-allowed') {
            silenceRetryCountRef.current = 0;
            if (isInIframe) {
              setShowIframeNotice(true);
            } else {
              showTemporaryError(
                'माइक्रोफ़ोन अनुमति नहीं मिली। कृपया ब्राउज़र सेटिंग्स में अनुमति दें।',
                5000
              );
            }
            onListeningStateChange?.('अब बोलिए');
            inputRef.current?.focus();
          } else if (event.error === 'no-speech') {
            // Handled gracefully in onend
          } else if (event.error === 'audio-capture') {
            showTemporaryError(
              'माइक्रोफ़ोन अन्य प्रक्रिया द्वारा व्यस्त है। कृपया पुनः प्रयास करें।',
              4000
            );
            onListeningStateChange?.('अब बोलिए');
          } else if (event.error !== 'aborted') {
            showTemporaryError('आवाज़ पहचानने में समस्या हुई। कृपया दोबारा माइक दबाकर बोलें।', 3500);
            onListeningStateChange?.('अब बोलिए');
          }
        };

        recognition.onend = () => {
          if (currentSessionId !== sessionIdRef.current) return;
          clearWaveAnimation();
          isStartingRef.current = false;
          isActivelyListeningRef.current = false;
          setIsListening(false);
          recognitionRef.current = null;

          const spoken = (finalTranscriptRef.current || latestTranscriptRef.current || '').trim();
          finalTranscriptRef.current = '';
          latestTranscriptRef.current = '';

          if (spoken) {
            silenceRetryCountRef.current = 0;
            onListeningStateChange?.('वीर जवाब दे रहा है');
            onSendMessage(spoken);
            return;
          }

          // If silence / no speech detected:
          // CRITICAL: Only retry if continuousModeRef.current is strictly TRUE!
          if (continuousModeRef.current && silenceRetryCountRef.current < 4) {
            silenceRetryCountRef.current += 1;
            onListeningStateChange?.('वीर सुन रहा है... अब बोलिए');
            retryListenTimeoutRef.current = setTimeout(() => {
              if (
                currentSessionId === sessionIdRef.current &&
                continuousModeRef.current &&
                !isMicDisabled &&
                !isActivelyListeningRef.current
              ) {
                startListening(false);
              }
            }, 300);
          } else {
            silenceRetryCountRef.current = 0;
            onListeningStateChange?.(
              continuousModeRef.current ? 'लगातार सुनना चालू • जब भी बोलना हो, बोलिए' : 'लगातार सुनना बंद है (माइक दबाकर बोलें)'
            );
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch (err: any) {
        console.warn('[VEER Voice] Start error:', err);
        clearWaveAnimation();
        isStartingRef.current = false;
        isActivelyListeningRef.current = false;
        setIsListening(false);
        recognitionRef.current = null;
        onListeningStateChange?.(
          continuousModeRef.current ? 'अब बोलिए' : 'लगातार सुनना बंद है (माइक दबाकर बोलें)'
        );
        if (err.name !== 'InvalidStateError') {
          showTemporaryError(
            'माइक्रोफ़ोन शुरू नहीं हो पाया। कृपया दोबारा प्रयास करें या लिखें।',
            4000
          );
        }
      }
    },
    [
      isMicDisabled,
      speechLanguage,
      isInIframe,
      setIsListening,
      onListeningStateChange,
      onSendMessage,
      onStopPlayback,
    ]
  );

  // Automatically start listening after assistant finishes speaking, ONLY if continuousMode is true
  useEffect(() => {
    if (isNativeAndroid()) return;
    if (
      autoListenTrigger > 0 &&
      continuousModeRef.current &&
      !isMicDisabled &&
      !isActivelyListeningRef.current &&
      !isStartingRef.current
    ) {
      silenceRetryCountRef.current = 0;
      startListening(false);
    }
  }, [autoListenTrigger, isMicDisabled, startListening]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      stopListening();
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      if (retryListenTimeoutRef.current) clearTimeout(retryListenTimeoutRef.current);
    };
  }, [stopListening]);

  // Manual microphone button toggle (single turn if continuousMode is OFF)
  const handleMicToggle = () => {
    if (isMicDisabled) {
      if (isSpeaking) {
        onStopPlayback?.();
      }
      return;
    }

    soundFx.playTap();
    if (isActivelyListeningRef.current || isListening || isStartingRef.current) {
      silenceRetryCountRef.current = 0;
      stopListening();
    } else {
      silenceRetryCountRef.current = 0;
      startListening(true); // Manual single-turn click
    }
  };

  const handleSendText = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isMicDisabled) return;

    soundFx.playTap();
    onSendMessage(trimmed);
    setInputText('');
  };

  return (
    <footer className="sticky bottom-0 z-20 bg-slate-950/95 border-t border-slate-800/80 backdrop-blur-lg px-4 pt-2.5 pb-4 select-none">
      {/* AI Studio Iframe Notice with Safe Standalone Tab Option */}
      {showIframeNotice && (
        <div className="mb-2.5 p-3 rounded-2xl bg-slate-900 border border-amber-500/40 shadow-xl text-xs animate-fadeIn relative">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800">
            <span className="font-bold text-amber-300 flex items-center gap-1.5">
              <span>⚠️ AI Studio प्रीव्यू में माइक्रोफ़ोन प्रतिबंध</span>
            </span>
            <button
              type="button"
              onClick={() => setShowIframeNotice(false)}
              className="text-slate-400 hover:text-white p-0.5 text-xs"
            >
              ✕
            </button>
          </div>

          <p className="text-slate-300 text-[11.5px] leading-relaxed mb-2.5">
            AI Studio के एम्बेडेड प्रीव्यू (Iframe) में ब्राउज़र सुरक्षा नीति माइक्रोफ़ोन को सीधे एक्सेस नहीं करने देती। 
            यहाँ <strong>टेक्स्ट चैट 100% काम कर रहा है</strong> और वीर बोलकर उत्तर सुनाएगा।
          </p>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
            <a
              href={typeof window !== 'undefined' ? window.location.href : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition-all flex items-center gap-1.5 shadow-sm text-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>अलग टैब में वॉइस टेस्ट करें ↗</span>
            </a>

            <button
              type="button"
              onClick={() => {
                setShowIframeNotice(false);
                inputRef.current?.focus();
              }}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors flex items-center gap-1 text-xs"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>यहाँ लिखकर पूछें</span>
            </button>
          </div>
        </div>
      )}

      {/* Real-time Interim Voice Transcript Notification */}
      {isListening && (
        <div className="mb-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs animate-fadeIn">
          <div className="flex items-center space-x-2 text-amber-300 overflow-hidden">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
            <span className="font-semibold shrink-0">वीर सुन रहे हैं:</span>
            <span className="truncate italic text-slate-200">
              {interimTranscript || 'बोलिए, मैं सुन रहा हूँ...'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleMicToggle}
            className="text-[11px] text-amber-400 font-bold ml-2 underline hover:text-amber-300 shrink-0"
          >
            पूरा हुआ
          </button>
        </div>
      )}

      {/* Standalone Error / Status Toast */}
      {speechError && !showIframeNotice && (
        <div className="mb-2 px-3 py-2 rounded-xl bg-amber-950/40 border border-amber-600/40 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center space-x-1.5 flex-1 mr-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="leading-tight">{speechError}</span>
          </div>
          <button
            type="button"
            onClick={() => setSpeechError(null)}
            className="text-slate-400 hover:text-slate-200 text-xs px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Interactive Controls */}
      <div className="flex flex-col items-center">
        {/* Superhero Arc-Reactor Center Mic Button */}
        <div className="relative flex items-center justify-center my-1">
          {/* Animated Energy Rings when Listening */}
          {isListening && (
            <>
              <div className="absolute w-24 h-24 rounded-full border-2 border-amber-400/30 animate-pulse-ring pointer-events-none" />
              <div className="absolute w-28 h-28 rounded-full border border-rose-500/20 animate-ping pointer-events-none" />
            </>
          )}

          {/* Central Superhero Mic Button */}
          <button
            type="button"
            onClick={handleMicToggle}
            disabled={isMicDisabled && !isSpeaking}
            className={`relative z-10 w-16 h-16 sm:w-18 sm:h-18 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-2xl active:scale-95 ${
              isListening
                ? 'bg-gradient-to-tr from-rose-600 via-amber-500 to-yellow-400 text-white ring-4 ring-amber-400/40 shadow-rose-500/50'
                : isSpeaking
                ? 'bg-gradient-to-tr from-cyan-600 to-blue-500 text-white ring-4 ring-cyan-400/40 shadow-cyan-500/40 animate-pulse cursor-pointer'
                : isLoading
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-400 text-slate-950 hover:brightness-110 ring-4 ring-amber-500/20 shadow-amber-500/40'
            }`}
            title={
              isListening
                ? 'बोलना पूरा हुआ (टैप करें)'
                : isSpeaking
                ? 'वीर बोल रहा है (टैप कर रोकें)'
                : isLoading
                ? 'वीर जवाब दे रहा है...'
                : continuousModeEnabled
                ? 'लगातार सुनना चालू (माइक दबाएं)'
                : 'माइक दबाकर बोलें'
            }
            aria-label="Microphone button"
          >
            {isListening ? (
              <div className="flex items-center space-x-1 h-6">
                {audioLevel.map((height, i) => (
                  <span
                    key={i}
                    style={{ height: `${height}px` }}
                    className="w-1 bg-white rounded-full transition-all duration-75"
                  />
                ))}
              </div>
            ) : isSpeaking ? (
              <Volume2 className="w-7 h-7 text-white animate-pulse" />
            ) : (
              <Mic className="w-7 h-7 text-slate-950 stroke-[2.3]" />
            )}
          </button>
        </div>

        {/* Audio Status Label */}
        <div className="text-center mt-1 mb-2">
          <span
            className={`text-xs font-semibold tracking-wide ${
              isListening
                ? 'text-amber-400 animate-pulse'
                : isSpeaking
                ? 'text-cyan-400 animate-pulse'
                : isLoading
                ? 'text-amber-300 animate-pulse'
                : continuousModeEnabled
                ? 'text-amber-400 font-bold'
                : 'text-slate-400'
            }`}
          >
            {isListening
              ? 'वीर सुन रहा है...'
              : isLoading
              ? 'वीर जवाब दे रहा है...'
              : isSpeaking
              ? 'वीर बोल रहा है...'
              : continuousModeEnabled
              ? 'अब बोलिए (लगातार सुनना चालू)'
              : 'लगातार सुनना बंद है (माइक दबाएं)'}
          </span>
        </div>

        {/* Prominent Continuous Listening ON/OFF Control Card */}
        <div className="w-full max-w-lg mb-2 px-1">
          <div
            className={`w-full p-2.5 rounded-2xl border transition-all shadow-md ${
              continuousModeEnabled
                ? 'bg-gradient-to-r from-emerald-950/80 via-slate-900/90 to-teal-950/70 border-emerald-500/60 ring-1 ring-emerald-500/30'
                : 'bg-slate-900/90 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              {/* Left Info & Status */}
              <div
                className="flex items-center space-x-2.5 cursor-pointer flex-1 min-w-0"
                onClick={() => {
                  if (continuousModeEnabled) {
                    stopListening();
                  }
                  onToggleContinuousMode();
                }}
              >
                <div
                  className={`p-2 rounded-xl shrink-0 transition-colors ${
                    continuousModeEnabled
                      ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                      : 'bg-slate-800/80 text-slate-400'
                  }`}
                >
                  <Radio className={`w-4 h-4 ${continuousModeEnabled ? 'animate-pulse' : ''}`} />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-white tracking-wide truncate">
                      लगातार सुनना (Continuous Mode)
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-extrabold uppercase shrink-0 ${
                        continuousModeEnabled
                          ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {continuousModeEnabled ? 'चालू (ON)' : 'बंद (OFF)'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-300 truncate">
                    {continuousModeEnabled
                      ? 'AI उत्तर के बाद माइक अपने आप खुलेगा'
                      : 'मैन्युअल मोड: बोलने के लिए माइक दबाएं'}
                  </span>
                </div>
              </div>

              {/* Right: Tactile Switch & Language Pill */}
              <div className="flex items-center space-x-2 shrink-0">
                {/* Language Switch Pill */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isListening) stopListening();
                    const next = speechLanguage === 'hi-IN' ? 'en-IN' : 'hi-IN';
                    setSpeechLanguage(next);
                  }}
                  className="text-[11px] px-2 py-1 rounded-xl bg-slate-950 border border-slate-800 text-amber-300 font-medium hover:bg-slate-800 transition-colors shadow-sm"
                  title="भाषा बदलें"
                >
                  {speechLanguage === 'hi-IN' ? '🇮🇳 हि' : '🇮🇳 En'}
                </button>

                {/* Tactile ON/OFF Toggle Switch Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (continuousModeEnabled) {
                      stopListening();
                    }
                    onToggleContinuousMode();
                  }}
                  className={`w-14 h-7 rounded-full p-0.5 transition-colors relative flex items-center shadow-inner cursor-pointer active:scale-95 ${
                    continuousModeEnabled
                      ? 'bg-emerald-500 justify-end'
                      : 'bg-slate-700 justify-start'
                  }`}
                  title={
                    continuousModeEnabled
                      ? 'लगातार सुनना बंद करें (OFF)'
                      : 'लगातार सुनना चालू करें (ON)'
                  }
                  aria-label="Toggle Continuous Mode"
                >
                  <span
                    className={`text-[9px] font-black tracking-wider px-1.5 select-none ${
                      continuousModeEnabled ? 'text-emerald-950 mr-auto' : 'text-slate-300 ml-auto'
                    }`}
                  >
                    {continuousModeEnabled ? 'ON' : 'OFF'}
                  </span>
                  <div className="w-6 h-6 rounded-full bg-white shadow-md transform transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Companion Text Input Bar */}
        <form
          onSubmit={handleSendText}
          className="w-full max-w-lg flex items-center space-x-1.5 bg-slate-900/90 border border-slate-800/90 rounded-2xl px-2.5 py-1.5 focus-within:border-amber-500/50 focus-within:ring-1 focus-within:ring-amber-500/20 transition-all shadow-inner"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="यहाँ हिन्दी में लिखकर पूछें..."
            disabled={isLoading || isListening}
            className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 text-sm focus:outline-none px-2 py-0.5"
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className={`p-2 rounded-xl transition-all ${
              inputText.trim() && !isLoading
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 hover:bg-amber-400 active:scale-95'
                : 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
            }`}
            title="भेजें"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </footer>
  );
};
