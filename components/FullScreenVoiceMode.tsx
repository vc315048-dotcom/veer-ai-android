import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Mic, Volume2, Radio, Shield, ExternalLink, AlertTriangle } from 'lucide-react';
import { soundFx } from '../utils/soundEffects';
import { speechManager, TtsDiagnosticResult } from '../utils/speechManager';
import { isNativeAndroid, nativeVoiceService } from '../utils/nativeVoiceService';
import { ChatMessage } from '../types';

interface FullScreenVoiceModeProps {
  isOpen: boolean;
  onClose: () => void;
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
  lastMessageText?: string;
  lastVeerMessage?: ChatMessage;
  lastUserPrompt?: string;
  ttsError?: string | null;
  onPlayMessage?: (msg: ChatMessage) => void;
}

export const FullScreenVoiceMode: React.FC<FullScreenVoiceModeProps> = ({
  isOpen,
  onClose,
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
  lastMessageText,
  lastVeerMessage,
  lastUserPrompt,
  ttsError,
  onPlayMessage,
}) => {
  const [speechLanguage, setSpeechLanguage] = useState<'hi-IN' | 'en-IN'>('hi-IN');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [liveUserPrompt, setLiveUserPrompt] = useState<string>('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [showIframeNotice, setShowIframeNotice] = useState<boolean>(false);
  const [isInIframe, setIsInIframe] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number[]>([10, 18, 28, 18, 10]);

  // TTS Playback Diagnostic State
  const [isDiagnosticRunning, setIsDiagnosticRunning] = useState<boolean>(false);
  const [diagnosticResult, setDiagnosticResult] = useState<TtsDiagnosticResult | null>(null);
  const [diagnosticStatus, setDiagnosticStatus] = useState<string | null>(null);

  // Synchronized authoritative refs to completely eliminate stale closure issues
  const isOpenRef = useRef<boolean>(isOpen);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const continuousModeRef = useRef<boolean>(continuousModeEnabled);
  useEffect(() => {
    continuousModeRef.current = continuousModeEnabled;
  }, [continuousModeEnabled]);

  const isMicDisabled = isLoading || isSpeaking;
  const isMicDisabledRef = useRef<boolean>(isMicDisabled);
  useEffect(() => {
    isMicDisabledRef.current = isMicDisabled;
  }, [isMicDisabled]);

  const speechLanguageRef = useRef<'hi-IN' | 'en-IN'>(speechLanguage);
  useEffect(() => {
    speechLanguageRef.current = speechLanguage;
  }, [speechLanguage]);

  // Single-session guarantees & commit guards
  const sessionIdRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);
  const isActivelyListeningRef = useRef<boolean>(false);
  const isStartingRef = useRef<boolean>(false);
  const hasCommittedRef = useRef<boolean>(false);
  const silenceCommitTimerRef = useRef<any>(null);
  const restartListenTimeoutRef = useRef<any>(null);
  const latestTranscriptRef = useRef<string>('');
  const animIntervalRef = useRef<any>(null);
  const errorTimerRef = useRef<any>(null);
  const lastTriggerHandledRef = useRef<number>(0);

  // Sync live user prompt from parent if available
  useEffect(() => {
    if (lastUserPrompt) {
      setLiveUserPrompt(lastUserPrompt);
    }
  }, [lastUserPrompt]);

  // Detect iframe environment
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        setIsInIframe(window.self !== window.top);
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
    setAudioLevel([10, 18, 28, 18, 10]);
  };

  const startWaveAnimation = () => {
    clearWaveAnimation();
    animIntervalRef.current = setInterval(() => {
      setAudioLevel([
        Math.floor(Math.random() * 16) + 8,
        Math.floor(Math.random() * 24) + 12,
        Math.floor(Math.random() * 30) + 14,
        Math.floor(Math.random() * 24) + 12,
        Math.floor(Math.random() * 16) + 8,
      ]);
    }, 90);
  };

  const showTemporaryError = (msg: string, duration: number = 4000) => {
    setSpeechError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => {
      setSpeechError(null);
    }, duration);
  };

  const handleRunTtsDiagnostic = async () => {
    if (isDiagnosticRunning) return;
    setIsDiagnosticRunning(true);
    setDiagnosticResult(null);
    setDiagnosticStatus('ऑडियो सिस्टम शुरू किया जा रहा है...');
    try {
      const res = await speechManager.runTtsDiagnostic((status) => {
        setDiagnosticStatus(status);
      });
      setDiagnosticResult(res);
    } catch (e: any) {
      setDiagnosticResult({
        success: false,
        method: 'None',
        voicesCount: 0,
        hindiVoices: [],
        cloudTtsStatus: 'DISABLED',
        error: e?.message || 'जाँच विफल',
        details: 'डायग्नोस्टिक में अप्रत्याशित समस्या आई',
        audioStarted: false,
      });
    } finally {
      setIsDiagnosticRunning(false);
      setTimeout(() => setDiagnosticStatus(null), 5000);
    }
  };

  // Immediate and strict cancellation of active speech recognition session
  const stopListening = useCallback(() => {
    sessionIdRef.current++; // Invalidate any in-flight callbacks
    isStartingRef.current = false;
    isActivelyListeningRef.current = false;

    if (silenceCommitTimerRef.current) {
      clearTimeout(silenceCommitTimerRef.current);
      silenceCommitTimerRef.current = null;
    }

    if (restartListenTimeoutRef.current) {
      clearTimeout(restartListenTimeoutRef.current);
      restartListenTimeoutRef.current = null;
    }

    setIsListening(false);
    clearWaveAnimation();

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
  }, [setIsListening]);

  // When continuousMode turns OFF, immediately stop speech recognition
  useEffect(() => {
    if (!continuousModeEnabled) {
      stopListening();
      onListeningStateChange?.('लगातार सुनना बंद है (माइक दबाकर बोलें)');
    }
  }, [continuousModeEnabled, stopListening, onListeningStateChange]);

  // CRITICAL FUNCTION: Commit recognized speech and send directly to /api/chat backend
  const commitSpeechAndSend = useCallback(
    (textToSend: string) => {
      const clean = textToSend.trim();
      if (!clean || hasCommittedRef.current) {
        return;
      }
      hasCommittedRef.current = true;

      if (silenceCommitTimerRef.current) {
        clearTimeout(silenceCommitTimerRef.current);
        silenceCommitTimerRef.current = null;
      }

      // 1. Immediately store prompt and clear interim speech so UI transitions to loading/responding
      setLiveUserPrompt(clean);
      setInterimTranscript('');
      latestTranscriptRef.current = '';

      // 2. Stop listening immediately so phone speaker audio does not loop into microphone
      stopListening();

      // 3. Update status and send to backend via shared handleSendMessage
      onListeningStateChange?.('वीर जवाब तैयार कर रहा है...');
      onSendMessage(clean);
    },
    [stopListening, onListeningStateChange, onSendMessage]
  );

  // Primary Hands-Free Speech Recognition Launcher
  const startListening = useCallback(
    async (isManualTrigger: boolean = false) => {
      // 1. Guard conditions: Must be open, not disabled (not speaking/loading), and not already running
      if (!isOpenRef.current) {
        return;
      }
      if (isMicDisabledRef.current) {
        return;
      }
      if (isActivelyListeningRef.current || isStartingRef.current) {
        return;
      }
      if (!isManualTrigger && !continuousModeRef.current) {
        return;
      }

      // 2. Clear any pending timers and reset commit flag for this new turn
      hasCommittedRef.current = false;
      if (silenceCommitTimerRef.current) {
        clearTimeout(silenceCommitTimerRef.current);
        silenceCommitTimerRef.current = null;
      }
      if (restartListenTimeoutRef.current) {
        clearTimeout(restartListenTimeoutRef.current);
        restartListenTimeoutRef.current = null;
      }

      // 3. Ensure no lingering audio playback
      onStopPlayback?.();
      speechManager.stop();

      // 4. Reset transcript buffers
      setSpeechError(null);
      setInterimTranscript('');
      setShowIframeNotice(false);
      latestTranscriptRef.current = '';

      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        showTemporaryError(
          'ब्राउज़र में वॉइस रिकॉग्निशन समर्थित नहीं है। कृपया चैट बॉक्स में लिखकर बात करें।',
          5000
        );
        return;
      }

      // 5. Proactively verify and request Android / Browser microphone permission
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
        } catch (permErr: any) {
          console.warn('[VEER] Microphone permission check:', permErr);
          if (permErr.name === 'NotAllowedError' || permErr.name === 'PermissionDeniedError') {
            isStartingRef.current = false;
            setIsListening(false);
            if (isInIframe) {
              setShowIframeNotice(true);
            } else {
              showTemporaryError(
                'माइक्रोफ़ोन अनुमति नहीं मिली। कृपया Android सेटिंग्स में अनुमति दें।',
                5000
              );
            }
            return;
          }
        }
      }

      // 6. Safely clean up previous instance
      if (recognitionRef.current) {
        try {
          const old = recognitionRef.current;
          recognitionRef.current = null;
          old.onstart = null;
          old.onresult = null;
          old.onerror = null;
          old.onend = null;
          old.abort();
        } catch (e) {}
      }

      // 7. Increment session counter for strict single-session guarantee
      const currentSessionId = ++sessionIdRef.current;
      isStartingRef.current = true;

      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false; // Single utterance per recognition session with auto-restart is the gold standard for mobile speech!
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.lang = speechLanguageRef.current;

        recognition.onstart = () => {
          if (currentSessionId !== sessionIdRef.current || !isOpenRef.current) {
            try { recognition.abort(); } catch (e) {}
            return;
          }
          isStartingRef.current = false;
          isActivelyListeningRef.current = true;
          setIsListening(true);
          setSpeechError(null);
          setShowIframeNotice(false);
          setInterimTranscript('');
          onListeningStateChange?.('वीर सुन रहा है... अब बोलिए');
          startWaveAnimation();
        };

        recognition.onresult = (event: any) => {
          if (currentSessionId !== sessionIdRef.current || hasCommittedRef.current) return;

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

          // Case A: The engine provided a final result (isFinal === true)
          // Commit immediately without waiting for onend!
          const hasFinal = Array.from(event.results).some((r: any) => r.isFinal);
          if (hasFinal && combined) {
            commitSpeechAndSend(combined);
            return;
          }

          // Case B: The user spoke words in interim and paused for 1000ms
          // Automatically commit and send!
          if (silenceCommitTimerRef.current) {
            clearTimeout(silenceCommitTimerRef.current);
            silenceCommitTimerRef.current = null;
          }

          if (combined.length > 2) {
            silenceCommitTimerRef.current = setTimeout(() => {
              silenceCommitTimerRef.current = null;
              if (!hasCommittedRef.current && latestTranscriptRef.current.trim()) {
                commitSpeechAndSend(latestTranscriptRef.current.trim());
              }
            }, 1000);
          }
        };

        recognition.onerror = (event: any) => {
          if (currentSessionId !== sessionIdRef.current) return;
          console.warn('[VEER Voice] recognition error:', event.error);

          isStartingRef.current = false;
          isActivelyListeningRef.current = false;
          clearWaveAnimation();
          setIsListening(false);
          recognitionRef.current = null;

          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            return;
          }

          if (event.error === 'not-allowed') {
            if (isInIframe) {
              setShowIframeNotice(true);
            } else {
              showTemporaryError(
                'माइक्रोफ़ोन अनुमति नहीं मिली। कृपया ब्राउज़र/सिस्टम सेटिंग्स में अनुमति दें।',
                5000
              );
            }
            return; // Do NOT auto-restart if permission was denied
          }

          // For other non-fatal errors (no-speech, audio-capture), onend will handle continuous auto-restart!
        };

        recognition.onend = () => {
          if (currentSessionId !== sessionIdRef.current) return;

          clearWaveAnimation();
          isStartingRef.current = false;
          isActivelyListeningRef.current = false;
          setIsListening(false);
          recognitionRef.current = null;

          // Case C: onend fired with an uncommitted transcript
          const spoken = latestTranscriptRef.current.trim();
          if (spoken && !hasCommittedRef.current) {
            commitSpeechAndSend(spoken);
            return;
          }

          // NO SPEECH / SILENCE TIMEOUT:
          // In Hands-Free mode, seamlessly restart listening without requiring any button click!
          if (
            isOpenRef.current &&
            continuousModeRef.current &&
            !isMicDisabledRef.current &&
            !hasCommittedRef.current
          ) {
            onListeningStateChange?.('वीर सुन रहा है... अब बोलिए');
            if (restartListenTimeoutRef.current) {
              clearTimeout(restartListenTimeoutRef.current);
            }
            restartListenTimeoutRef.current = setTimeout(() => {
              restartListenTimeoutRef.current = null;
              if (
                isOpenRef.current &&
                continuousModeRef.current &&
                !isMicDisabledRef.current &&
                !isActivelyListeningRef.current &&
                !isStartingRef.current
              ) {
                startListening(false);
              }
            }, 250);
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

        // Auto-recover after 400ms if still in voice mode
        if (
          isOpenRef.current &&
          continuousModeRef.current &&
          !isMicDisabledRef.current &&
          err.name !== 'NotAllowedError'
        ) {
          setTimeout(() => {
            if (isOpenRef.current && continuousModeRef.current && !isMicDisabledRef.current) {
              startListening(false);
            }
          }, 400);
        }
      }
    },
    [
      isInIframe,
      setIsListening,
      onListeningStateChange,
      onStopPlayback,
      commitSpeechAndSend,
    ]
  );

  // Requirement 1 & 4: Auto-start listening and unlock audio playback when Voice Mode opens
  useEffect(() => {
    if (isOpen) {
      speechManager.unlockAudio();
      onStopPlayback?.();
      speechManager.stop();
      setSpeechError(null);
      setInterimTranscript('');
      hasCommittedRef.current = false;

      // Immediate start with a minimal 80ms tick so DOM renders first
      const timer = setTimeout(() => {
        if (!isActivelyListeningRef.current && !isStartingRef.current && !isMicDisabledRef.current) {
          startListening(true);
        }
      }, 80);
      return () => clearTimeout(timer);
    } else {
      sessionIdRef.current++;
      stopListening();
      if (restartListenTimeoutRef.current) {
        clearTimeout(restartListenTimeoutRef.current);
        restartListenTimeoutRef.current = null;
      }
    }
  }, [isOpen, startListening, stopListening, onStopPlayback]);

  // Requirement 4: Pause/stop listening immediately whenever AI is preparing or speaking
  useEffect(() => {
    if (isLoading || isSpeaking) {
      if (isActivelyListeningRef.current || isListening || isStartingRef.current) {
        stopListening();
      }
    }
  }, [isLoading, isSpeaking, isListening, stopListening]);

  // Requirement 5: Automatically start listening after assistant finishes speaking (Continuous Mode)
  useEffect(() => {
    if (!isOpen || autoListenTrigger === 0 || autoListenTrigger === lastTriggerHandledRef.current) {
      return;
    }
    lastTriggerHandledRef.current = autoListenTrigger;

    // Small delay ensuring audio output hardware is fully silent
    const timer = setTimeout(() => {
      if (
        isOpenRef.current &&
        continuousModeRef.current &&
        !isMicDisabledRef.current &&
        !isActivelyListeningRef.current &&
        !isStartingRef.current
      ) {
        startListening(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [autoListenTrigger, isOpen, startListening]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      sessionIdRef.current++;
      stopListening();
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      if (silenceCommitTimerRef.current) clearTimeout(silenceCommitTimerRef.current);
      if (restartListenTimeoutRef.current) clearTimeout(restartListenTimeoutRef.current);
    };
  }, [stopListening]);

  // Toggle listening by clicking the pill orb
  const handlePillOrbClick = () => {
    if (isSpeaking) {
      onStopPlayback?.();
      return;
    }

    soundFx.playTap();
    if (isActivelyListeningRef.current || isListening || isStartingRef.current) {
      stopListening();
      onListeningStateChange?.('सुनना रोका गया (ओर्ब दबाकर फिर बोलें)');
    } else {
      startListening(true);
    }
  };

  // Requirement 9 & 10: X button immediately halts all sessions, auto-restarts, and returns to Chat Box
  const handleCloseVoiceMode = () => {
    soundFx.playPowerDown();
    isOpenRef.current = false;
    sessionIdRef.current++;
    stopListening();

    if (silenceCommitTimerRef.current) {
      clearTimeout(silenceCommitTimerRef.current);
      silenceCommitTimerRef.current = null;
    }
    if (restartListenTimeoutRef.current) {
      clearTimeout(restartListenTimeoutRef.current);
      restartListenTimeoutRef.current = null;
    }

    onStopPlayback?.();
    speechManager.stop();
    onClose();
  };

  if (!isOpen) return null;

  // Active veer message (text or error)
  const currentVeerAnswer = lastVeerMessage?.text || lastMessageText || '';
  const isCurrentVeerError = !!lastVeerMessage?.isError;
  const activePromptText = liveUserPrompt || lastUserPrompt || '';

  return (
    <div className="absolute inset-0 z-50 bg-[#070b18] flex flex-col justify-between p-4 text-slate-100 select-none overflow-hidden animate-fadeIn">
      {/* Dark navy background with subtle ambient radial blue glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[480px] h-[480px] bg-gradient-to-b from-blue-700/15 via-cyan-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-[480px] h-[480px] bg-gradient-to-t from-indigo-700/20 via-blue-600/10 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Top Header Bar */}
      <header className="relative z-10 flex items-center justify-between pt-2 px-1">
        {/* Left: Superhero Badge */}
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-cyan-500 to-indigo-400 p-0.5 shadow-md shadow-cyan-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Shield className="w-4 h-4 text-cyan-400" />
            </div>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="font-extrabold text-sm text-white tracking-wide">वीर</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold uppercase tracking-wider">
              वॉइस मोड
            </span>
          </div>
        </div>

        {/* Right Settings Pills */}
        <div className="flex items-center space-x-2">
          {/* Language Switch */}
          <button
            type="button"
            onClick={() => {
              stopListening();
              const next = speechLanguage === 'hi-IN' ? 'en-IN' : 'hi-IN';
              setSpeechLanguage(next);
              speechLanguageRef.current = next;
              setTimeout(() => {
                if (isOpenRef.current && !isMicDisabledRef.current) {
                  startListening(true);
                }
              }, 200);
            }}
            className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-slate-900/90 border border-slate-800 text-cyan-300 hover:bg-slate-800 active:scale-95 transition-all shadow-sm"
            title="भाषा बदलें"
          >
            {speechLanguage === 'hi-IN' ? '🇮🇳 हि' : '🇮🇳 En'}
          </button>

          {/* Continuous Mode Pill */}
          <button
            type="button"
            onClick={() => {
              if (continuousModeEnabled) {
                stopListening();
              }
              onToggleContinuousMode();
            }}
            className={`text-[11px] font-bold px-2.5 py-1 rounded-xl border flex items-center gap-1.5 active:scale-95 transition-all shadow-sm ${
              continuousModeEnabled
                ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 ring-1 ring-emerald-500/30'
                : 'bg-slate-900/90 border-slate-800 text-slate-400'
            }`}
            title="लगातार सुनना चालू / बंद करें"
          >
            <Radio className={`w-3 h-3 ${continuousModeEnabled ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            <span>लगातार: {continuousModeEnabled ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </header>

      {/* Main Conversation Canvas (Clean, Responsive, Accurate Status) */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-3 my-auto">
        <div className="w-full max-w-sm flex flex-col items-center justify-center space-y-4">
          {/* 1. Live Spoken Words (While speaking into mic) */}
          {interimTranscript && (
            <div className="w-full px-5 py-4 rounded-3xl bg-cyan-950/50 border border-cyan-500/40 text-center animate-fadeIn shadow-[0_4px_25px_rgba(6,182,212,0.15)] backdrop-blur-md">
              <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider block mb-1">
                🎙️ आपकी आवाज़:
              </span>
              <p className="text-base font-medium text-cyan-100 leading-relaxed italic">
                “{interimTranscript}”
              </p>
            </div>
          )}

          {/* 2. Committed User Question (Persists while AI is thinking and replying) */}
          {!interimTranscript && activePromptText && (
            <div className="w-full px-4 py-2.5 rounded-2xl bg-slate-900/80 border border-slate-800 text-center animate-fadeIn">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-0.5">
                आपने पूछा:
              </span>
              <p className="text-sm font-medium text-slate-200 line-clamp-2">
                “{activePromptText}”
              </p>
            </div>
          )}

          {/* 3. AI Processing / Thinking State */}
          {isLoading && (
            <div className="w-full p-5 rounded-3xl bg-slate-900/80 border border-cyan-500/30 text-center space-y-3 animate-fadeIn shadow-lg backdrop-blur-md">
              <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-300 rounded-full animate-spin mx-auto" />
              <p className="text-sm font-semibold text-amber-300 animate-pulse">
                वीर जवाब तैयार कर रहा है...
              </p>
            </div>
          )}

          {/* 4. Real AI Response or Error (Displayed & Spoken via TTS) */}
          {!isLoading && currentVeerAnswer && (
            <div
              className={`w-full px-5 py-4 rounded-3xl border text-center animate-fadeIn shadow-lg backdrop-blur-md ${
                isCurrentVeerError
                  ? 'bg-rose-950/50 border-rose-500/40 text-rose-100'
                  : 'bg-blue-950/40 border-blue-500/30 text-slate-100'
              }`}
            >
              <div
                className={`flex items-center justify-center gap-2 text-xs font-bold mb-2 ${
                  isCurrentVeerError ? 'text-rose-400' : 'text-cyan-300'
                }`}
              >
                {isCurrentVeerError ? (
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isSpeaking) {
                        onStopPlayback?.();
                      } else if (lastVeerMessage) {
                        onPlayMessage?.(lastVeerMessage);
                      }
                    }}
                    className="p-1 rounded-lg hover:bg-cyan-500/20 text-cyan-400 transition-colors flex items-center gap-1 active:scale-95 cursor-pointer"
                    title={isSpeaking ? 'आवाज़ रोकें' : 'दोबारा सुनें (Replay)'}
                    aria-label="Play or stop voice response"
                  >
                    <Volume2 className={`w-4 h-4 ${isSpeaking ? 'animate-pulse text-cyan-300' : 'text-cyan-400'}`} />
                  </button>
                )}
                <span>{isCurrentVeerError ? 'त्रुटि (Error)' : isSpeaking ? 'वीर बोल रहा है' : 'वीर का उत्तर'}</span>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">
                {currentVeerAnswer}
              </p>
            </div>
          )}

          {/* 5. Listening Status Hint when ready for next input */}
          {!isLoading && isListening && !interimTranscript && (
            <div className="text-center space-y-2 py-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span>वीर सुन रहा है... अब बोलिए</span>
              </div>
              <p className="text-xs text-slate-400">आप जो बोलेंगे, वह सीधे वीर तक पहुँचेगा</p>
            </div>
          )}

          {/* 6. Idle State (if listening is paused) */}
          {!isLoading && !isListening && !isSpeaking && !interimTranscript && !currentVeerAnswer && (
            <div className="text-center space-y-2 py-4">
              <p className="text-sm font-medium text-slate-300">
                बोलना शुरू करने के लिए नीचे दिए गए ओर्ब पर टैप करें
              </p>
            </div>
          )}

          {/* Hands-Free Voice Commands Hints & TTS Diagnostic Trigger */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 bg-slate-900/60 px-3.5 py-1.5 rounded-full border border-slate-800/80">
              <span className="text-amber-300 font-medium">⏸️ “वीर, आराम करो”</span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-300 font-medium">▶️ “वीर, फिर सुनो”</span>
            </div>

            {/* Diagnostic Test Button (speaks "नमस्ते, मैं वीर हूँ") */}
            <button
              type="button"
              onClick={handleRunTtsDiagnostic}
              disabled={isDiagnosticRunning || isLoading || isSpeaking}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-cyan-300 hover:text-white border border-cyan-500/40 text-[11px] font-medium transition-all active:scale-95 shadow-sm disabled:opacity-50 cursor-pointer"
              title="TTS आवाज़ टेस्ट करें: 'नमस्ते, मैं वीर हूँ'"
              aria-label="Run TTS audio diagnostic test"
            >
              <Volume2 className={`w-3.5 h-3.5 ${isDiagnosticRunning ? 'animate-pulse text-amber-400' : 'text-cyan-400'}`} />
              <span>{isDiagnosticRunning ? (diagnosticStatus || 'जाँच हो रही है...') : '🔊 TTS टेस्ट'}</span>
            </button>
          </div>

          {/* Diagnostic Result Banner */}
          {diagnosticResult && (
            <div
              className={`w-full max-w-sm px-3.5 py-2 rounded-2xl text-xs text-center border animate-fadeIn shadow-md ${
                diagnosticResult.success
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
                  : 'bg-amber-950/80 border-amber-500/50 text-amber-200'
              }`}
            >
              <div className="font-semibold flex items-center justify-center gap-1.5">
                <span>{diagnosticResult.success ? '✅ TTS प्लेबैक सफल' : '⚠️ TTS प्लेबैक सूचना'}</span>
                <span className="text-[10px] text-slate-300 font-mono">[{diagnosticResult.method}]</span>
              </div>
              <p className="text-[11px] mt-0.5">{diagnosticResult.details}</p>
              {diagnosticResult.error && (
                <p className="text-[10.5px] mt-1 text-rose-300 font-mono bg-black/40 px-2 py-0.5 rounded">
                  {diagnosticResult.error}
                </p>
              )}
              {diagnosticResult.hindiVoices.length > 0 ? (
                <p className="text-[10px] text-cyan-300 mt-1 truncate">
                  हिन्दी आवाज़ें ({diagnosticResult.hindiVoices.length}): {diagnosticResult.hindiVoices.join(', ')}
                </p>
              ) : (
                <p className="text-[10px] text-amber-300 mt-1">
                  डिफ़ॉल्ट सिस्टम आवाज़ सक्रिय (कोई विशिष्ट Hindi Voice पैक नहीं मिला)
                </p>
              )}
            </div>
          )}

          {/* Error notification if microphone fails */}
          {speechError && (
            <div className="px-3.5 py-2 rounded-2xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs text-center animate-fadeIn shadow-md">
              {speechError}
            </div>
          )}

          {/* Error notification if TTS audio playback fails */}
          {ttsError && (
            <div className="px-3.5 py-2 rounded-2xl bg-amber-950/80 border border-amber-500/50 text-amber-200 text-xs text-center animate-fadeIn shadow-md">
              ⚠️ आवाज़ (TTS): {ttsError}
            </div>
          )}

          {/* Iframe notice if in AI Studio embedded preview */}
          {showIframeNotice && (
            <div className="p-3 rounded-2xl bg-slate-900 border border-amber-500/40 text-xs text-center shadow-lg">
              <p className="text-amber-300 font-bold mb-1">⚠️ माइक्रोफ़ोन अनुमति आवश्यक</p>
              <a
                href={typeof window !== 'undefined' ? window.location.href : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 text-xs mt-1"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>अलग टैब में खोलें</span>
              </a>
            </div>
          )}
        </div>
      </main>

      {/* COMPACT HORIZONTAL FLOATING VOICE PANEL (Near Bottom Center - Exactly Preserved) */}
      <footer className="relative z-10 w-full flex justify-center pb-5 sm:pb-7 px-3">
        <div
          className="w-full max-w-[320px] sm:max-w-[350px] rounded-full p-2 bg-gradient-to-r from-[#0d1530] via-[#151c46] to-[#1c153b] border border-blue-500/30 shadow-[0_12px_36px_rgba(15,23,65,0.7),0_0_24px_rgba(6,182,212,0.22)] flex items-center justify-between gap-3 backdrop-blur-xl"
        >
          {/* LEFT SIDE: Small Horizontal Pill-Shaped Animated Blue/Cyan Gradient Voice Orb */}
          <button
            type="button"
            onClick={handlePillOrbClick}
            className={`w-20 h-10 sm:w-22 sm:h-11 rounded-full p-0.5 relative flex items-center justify-center cursor-pointer transition-all active:scale-95 select-none shrink-0 ${
              isListening
                ? 'bg-gradient-to-r from-blue-600 via-cyan-400 to-teal-300 animate-pill-orb-glow shadow-[0_0_20px_rgba(6,182,212,0.7)] ring-2 ring-cyan-300/60'
                : isSpeaking
                ? 'bg-gradient-to-r from-blue-700 via-cyan-500 to-indigo-500 animate-pill-orb-glow shadow-[0_0_20px_rgba(59,130,246,0.65)] ring-2 ring-blue-400/50'
                : isLoading
                ? 'bg-gradient-to-r from-blue-600 via-amber-500 to-cyan-500 animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                : 'bg-gradient-to-r from-blue-700 via-cyan-500 to-indigo-600 hover:brightness-110 shadow-[0_0_14px_rgba(6,182,212,0.4)]'
            }`}
            title={
              isListening
                ? 'सुनना रोकें'
                : isSpeaking
                ? 'बोलना रोकें'
                : isLoading
                ? 'जवाब आ रहा है...'
                : 'बोलने के लिए दबाएं'
            }
            aria-label="Toggle voice listening"
          >
            {/* Inner Pill Core with Dynamic Audio Waves or State Icon */}
            <div className="w-full h-full rounded-full bg-gradient-to-r from-slate-950/80 via-blue-950/70 to-slate-950/80 flex items-center justify-center px-2 border border-cyan-300/30">
              {isListening ? (
                <div className="flex items-center space-x-1 h-6">
                  {audioLevel.map((height, i) => (
                    <span
                      key={i}
                      style={{ height: `${Math.min(height, 22)}px` }}
                      className="w-1 bg-gradient-to-t from-cyan-400 to-white rounded-full transition-all duration-75 shadow-sm shadow-cyan-300"
                    />
                  ))}
                </div>
              ) : isSpeaking ? (
                <div className="flex items-center space-x-1 text-cyan-300">
                  <Volume2 className="w-4 h-4 animate-pulse drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                  <span className="text-[10px] font-bold text-cyan-200">बोल रहा है</span>
                </div>
              ) : isLoading ? (
                <div className="w-4 h-4 border-2 border-cyan-400/40 border-t-cyan-300 rounded-full animate-spin" />
              ) : (
                <div className="flex items-center space-x-1 text-cyan-300">
                  <Mic className="w-4 h-4 stroke-[2.2] drop-shadow-[0_0_6px_rgba(6,182,212,0.6)]" />
                  <span className="text-[10px] font-bold text-slate-200">बोलें</span>
                </div>
              )}
            </div>
          </button>

          {/* MIDDLE: Status Hint Label */}
          <div className="flex-1 text-center min-w-0 px-1">
            <span
              className={`text-xs font-semibold tracking-wide truncate block ${
                isListening
                  ? 'text-cyan-300 animate-pulse'
                  : isSpeaking
                  ? 'text-blue-300'
                  : isLoading
                  ? 'text-amber-300 animate-pulse'
                  : 'text-slate-400'
              }`}
            >
              {isListening
                ? 'वीर सुन रहा है...'
                : isSpeaking
                ? 'वीर बोल रहा है...'
                : isLoading
                ? 'सोच रहा है...'
                : 'टैप कर बोलें'}
            </span>
          </div>

          {/* RIGHT SIDE: Round Dark Close (X) Button */}
          <button
            type="button"
            onClick={handleCloseVoiceMode}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-slate-900/95 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-400/60 text-slate-300 hover:text-white flex items-center justify-center transition-all shadow-md active:scale-90 cursor-pointer shrink-0 group"
            title="वॉइस मोड बंद करें और चैट बॉक्स पर लौटें (X)"
            aria-label="Close Voice Mode"
          >
            <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-200 text-slate-300 group-hover:text-white" />
          </button>
        </div>
      </footer>
    </div>
  );
};
