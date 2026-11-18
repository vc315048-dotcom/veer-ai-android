import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Mic, Volume2, Radio, Shield, ExternalLink, AlertTriangle } from 'lucide-react';
import { soundFx } from '../utils/soundEffects';
import { speechManager, TtsDiagnosticResult } from '../utils/speechManager';
import { isNativeAndroid, nativeVoiceService } from '../utils/nativeVoiceService';
import { ChatMessage } from '../types';
import ManualSpeech from '../utils/manualSpeech';
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
    // Manual Android speech session references
  const manualSpeechSessionRef = useRef<number>(0);
  const manualSpeechActiveRef = useRef<boolean>(false);
  const manualSpeechPartialListenerRef = useRef<{ remove: () => Promise<void> } | null>(null);

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

    // Cancel any active Android manual speech session.
    manualSpeechSessionRef.current++;
    manualSpeechActiveRef.current = false;

    if (manualSpeechPartialListenerRef.current) {
      const listener = manualSpeechPartialListenerRef.current;
      manualSpeechPartialListenerRef.current = null;
      void listener.remove().catch(() => {});
    }

    if (isNativeAndroid()) {
      void ManualSpeech.cancelListening().catch(() => {});
    }
    
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
      // On Android, continuous listening belongs exclusively to the native
      // foreground service. Do not start Chrome/Web Speech recognition here: it
      // competes for the same microphone and triggers Google's "cannot record" error.
      if (isNativeAndroid() && continuousModeRef.current && !isManualTrigger) {
        setIsListening(false);
        setInterimTranscript('');
        onListeningStateChange?.('वीर का native माइक्रोफोन सुन रहा है');
        return;
      }

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

        
      // Android manual microphone: temporarily pause the foreground service
      // so the one-shot recognizer can safely take exclusive microphone access.
      if (isNativeAndroid()) {
        if (continuousModeRef.current) {
          await nativeVoiceService.pauseListening();
        }
        const manualSession = ++manualSpeechSessionRef.current;
        manualSpeechActiveRef.current = true;

        isStartingRef.current = false;
        isActivelyListeningRef.current = true;
        setIsListening(true);
        onListeningStateChange?.('वीर सुन रहा है... अब बोलिए');

        let partialListener: { remove: () => Promise<void> } | null = null;

        try {
          partialListener = await ManualSpeech.addListener(
            'partialResult',
            (data) => {
              if (manualSession !== manualSpeechSessionRef.current) return;

              setInterimTranscript(data.text);
              latestTranscriptRef.current = data.text;
            }
          );

          manualSpeechPartialListenerRef.current = partialListener;

          const result = await ManualSpeech.startListening();

          if (manualSession !== manualSpeechSessionRef.current) return;

          manualSpeechActiveRef.current = false;
          isActivelyListeningRef.current = false;
          setIsListening(false);

          await partialListener.remove();
          manualSpeechPartialListenerRef.current = null;

          // Some Android recognizers deliver useful partial text but return an
          // empty final result. Never throw away the words already shown to the user.
          const recognizedText =
            result?.text?.trim() || latestTranscriptRef.current.trim();

          if (recognizedText) {
            commitSpeechAndSend(recognizedText);
          } else {
            showTemporaryError('आवाज़ पूरी तरह समझ नहीं आई। कृपया दोबारा बोलें।');
            if (continuousModeRef.current) {
              await nativeVoiceService.resumeListening();
            }
          }
        } catch (error: any) {
          if (manualSession === manualSpeechSessionRef.current) {
            manualSpeechActiveRef.current = false;
            isActivelyListeningRef.current = false;
            setIsListening(false);

            // If Android fails after producing a partial transcript, send that
            // transcript instead of reverting to the previous question.
            const partialText = latestTranscriptRef.current.trim();
            if (partialText) {
              commitSpeechAndSend(partialText);
            } else {
              showTemporaryError(error?.message || 'माइक शुरू नहीं हो सका।');
              if (continuousModeRef.current) {
                await nativeVoiceService.resumeListening();
              }
            }
          }

          if (partialListener) {
            await partialListener.remove().catch(() => {});
          }

          manualSpeechPartialListenerRef.current = null;
        }

        return;
      }
      

      const SpeechRecognition =
  (window as any).SpeechRecognition ||
  (window as any).webkitSpeechRecognition;
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
  
  // Start listening automatically when Android Voice Mode opens.
  // Continuous mode uses the native foreground service.
  // Manual mode starts one native Hindi speech session.
  useEffect(() => {
    if (isOpen) {
      speechManager.unlockAudio();
      onStopPlayback?.();
      speechManager.stop();
      setSpeechError(null);
      setInterimTranscript('');
      hasCommittedRef.current = false;

      const shouldStartManualAndroid =
        isNativeAndroid() && !continuousModeRef.current;

      if (continuousModeRef.current || shouldStartManualAndroid) {
        const timer = setTimeout(() => {
          if (
            isOpenRef.current &&
            !isActivelyListeningRef.current &&
            !isStartingRef.current &&
            !isMicDisabledRef.current
          ) {
            if (isNativeAndroid() && !continuousModeRef.current) {
              startListening(true);
            } else if (continuousModeRef.current) {
              startListening(false);
            }
          }
        }, 300);

        return () => clearTimeout(timer);
      }
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
    // Voice Mode may already have started listening automatically.
    // A tap on the orb while recognition is active must NOT cancel the user's
    // speaking window; leave the microphone open so they can finish speaking.
    if (isActivelyListeningRef.current || isListening || isStartingRef.current) {
      return;
    }
    startListening(true);
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

  const currentVeerAnswer = lastVeerMessage?.text || lastMessageText || '';

  return (
    <div className="absolute inset-0 z-50 bg-black text-white select-none overflow-hidden animate-fadeIn">
      {/* Minimal Gemini Live-style screen: no conversation cards or diagnostic banners. */}
      <div className="absolute inset-0 pointer-events-none bg-black">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(18,45,105,0.18)_0%,_transparent_62%)]" />
        <div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(38vw,250px)] h-[min(38vw,250px)] rounded-full transition-all duration-700 ${
            isSpeaking
              ? 'scale-110 shadow-[0_0_110px_rgba(90,145,255,0.55)]'
              : isListening
              ? 'scale-105 shadow-[0_0_95px_rgba(0,205,235,0.42)]'
              : isLoading
              ? 'scale-100 shadow-[0_0_85px_rgba(110,125,255,0.38)]'
              : 'scale-100 shadow-[0_0_65px_rgba(55,110,245,0.30)]'
          }`}
          style={{ background: 'linear-gradient(145deg, #2468ed 0%, #6799ff 38%, #dce8ff 58%, #a9c5ff 100%)' }}
        >
          <div className="absolute inset-[5%] rounded-full bg-[radial-gradient(ellipse_at_68%_30%,_rgba(255,255,255,0.88),_rgba(255,255,255,0.08)_32%,_transparent_60%)]" />
          <div className="absolute inset-0 rounded-full bg-[linear-gradient(155deg,transparent_35%,rgba(255,255,255,0.42)_54%,transparent_72%)]" />
        </div>
      </div>

      <header className="absolute top-0 right-0 z-20 p-4 pt-[max(env(safe-area-inset-top),16px)]">
        <button
          type="button"
          onClick={handleRunTtsDiagnostic}
          disabled={isDiagnosticRunning || isLoading || isSpeaking}
          className="w-14 h-14 rounded-full bg-white/15 border border-white/20 backdrop-blur-xl flex items-center justify-center text-white shadow-lg active:scale-95 disabled:opacity-50"
          aria-label="Voice settings and sound test"
          title="आवाज़ जाँचें"
        >
          <Volume2 className="w-6 h-6" />
        </button>
      </header>

      {(speechError || ttsError || diagnosticStatus) && (
        <div className="absolute top-20 left-5 right-5 z-20 rounded-2xl bg-slate-900/85 border border-white/15 px-4 py-3 text-center text-sm text-slate-200 backdrop-blur-xl">
          {speechError || ttsError || diagnosticStatus}
        </div>
      )}

      <footer className="absolute bottom-0 left-0 right-0 z-20 px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
        <div className="mx-auto w-full max-w-xl flex items-center gap-3">
          <button
            type="button"
            onClick={handlePillOrbClick}
            disabled={isLoading}
            className="flex-1 h-[64px] rounded-full bg-white/20 border border-white/25 backdrop-blur-2xl flex items-center px-5 text-white shadow-[0_8px_35px_rgba(0,0,0,0.45)] outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 active:scale-[0.99] disabled:opacity-60"
            aria-label={isListening ? 'वीर सुन रहा है' : 'बोलने के लिए दबाएँ'}
          >
            <span className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 via-cyan-400 to-blue-700 shadow-[0_0_24px_rgba(0,190,255,0.7)] flex items-center justify-center shrink-0">
              {isListening ? (
                <span className="flex items-center gap-1 h-6">
                  {audioLevel.map((height, i) => (
                    <span key={i} style={{ height: `${Math.min(height, 22)}px` }} className="w-1 rounded-full bg-white transition-all duration-75" />
                  ))}
                </span>
              ) : isSpeaking ? (
                <Volume2 className="w-5 h-5 text-white animate-pulse" />
              ) : isLoading ? (
                <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : (
                <Mic className="w-5 h-5 text-white" />
              )}
            </span>
            <span className="flex-1 text-center text-sm font-semibold text-cyan-100 px-3 truncate">
              {isListening ? 'वीर सुन रहा है...' : isSpeaking ? 'वीर बोल रहा है...' : isLoading ? 'वीर सोच रहा है...' : 'वीर से बात करें'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleCloseVoiceMode}
            className="w-[60px] h-[60px] rounded-full bg-white text-black flex items-center justify-center shadow-lg active:scale-95 shrink-0"
            aria-label="Voice Mode बंद करें"
            title="बंद करें"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </footer>
    </div>
  );
};
