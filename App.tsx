
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { AndroidHeader } from './components/AndroidHeader';
import { ChatArea } from './components/ChatArea';
import { VoiceMicButton } from './components/VoiceMicButton';
import { SettingsModal } from './components/SettingsModal';
import { ChatMessage, VoiceSettings } from './types';
import { speechManager } from './speechManager';
import { soundFx } from './soundEffects';
import { detectVoiceCommand } from './voiceCommands';

const STORAGE_KEY_MESSAGES = 'veer_messages_v1';
const STORAGE_KEY_SETTINGS = 'veer_settings_v1';
const STORAGE_KEY_CONTINUOUS_MODE = 'veer_continuous_mode_v3';
const API_BASE_URL = 'https://ais-dev-d6vx7fbb2gwwxyvoxvgwhp-982249227133.asia-east1.run.app';

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
      if (saved) return JSON.parse(saved);
    } catch (error) {
      console.warn('[VEER] Could not load saved messages:', error);
    }
    return [];
  });

  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => {
    const defaultSettings: VoiceSettings = {
      autoSpeak: true,
      rate: 1.0,
      pitch: 1.0,
      soundEffects: true,
      preferGeminiVoice: true,
    };

    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (saved) return { ...defaultSettings, ...JSON.parse(saved) };
    } catch (error) {
      console.warn('[VEER] Could not load voice settings:', error);
    }

    return defaultSettings;
  });

  const [continuousModeEnabled, setContinuousModeEnabled] =
    useState<boolean>(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_CONTINUOUS_MODE);
        if (saved !== null) return saved === 'true';
      } catch (error) {
        console.warn('[VEER] Could not load continuous mode:', error);
      }
      return true;
    });

  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('अब बोलिए');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [autoListenTrigger, setAutoListenTrigger] = useState(0);

  const retryIntervalRef = useRef<any>(null);
  const autoRetryCountRef = useRef(0);
  const autoListenTimerRef = useRef<any>(null);
  const voiceSettingsRef = useRef<VoiceSettings>(voiceSettings);
  const continuousModeEnabledRef = useRef(continuousModeEnabled);
  const recognitionRef = useRef<any>(null);
  const wakeLockSentinelRef = useRef<any>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    voiceSettingsRef.current = voiceSettings;
  }, [voiceSettings]);

  useEffect(() => {
    continuousModeEnabledRef.current = continuousModeEnabled;
    try {
      localStorage.setItem(
        STORAGE_KEY_CONTINUOUS_MODE,
        String(continuousModeEnabled)
      );
    } catch (error) {
      console.warn('[VEER] Could not save continuous mode:', error);
    }
  }, [continuousModeEnabled]);

  useEffect(() => {
    soundFx.enabled = voiceSettings.soundEffects;
  }, [voiceSettings.soundEffects]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    } catch (error) {
      console.warn('[VEER] Could not save messages:', error);
    }
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY_SETTINGS,
        JSON.stringify(voiceSettings)
      );
    } catch (error) {
      console.warn('[VEER] Could not save settings:', error);
    }
  }, [voiceSettings]);

  const requestWakeLock = useCallback(async () => {
    if (
      typeof navigator === 'undefined' ||
      !('wakeLock' in navigator) ||
      document.visibilityState !== 'visible'
    ) {
      return;
    }

    try {
      if (!wakeLockSentinelRef.current) {
        const sentinel = await (navigator as any).wakeLock.request('screen');
        wakeLockSentinelRef.current = sentinel;

        sentinel.addEventListener('release', () => {
          if (wakeLockSentinelRef.current === sentinel) {
            wakeLockSentinelRef.current = null;
          }
        });
      }
    } catch (error) {
      // Wake Lock is optional and may be unavailable on some devices.
      console.warn('[VEER] Wake Lock unavailable:', error);
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    const sentinel = wakeLockSentinelRef.current;
    wakeLockSentinelRef.current = null;

    if (sentinel) {
      try {
        void sentinel.release();
      } catch (error) {
        console.warn('[VEER] Could not release Wake Lock:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (continuousModeEnabled) {
      void requestWakeLock();
    } else {
      releaseWakeLock();
    }
  }, [continuousModeEnabled, requestWakeLock, releaseWakeLock]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (continuousModeEnabledRef.current) {
          void requestWakeLock();
        }
      } else {
        releaseWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      );
      releaseWakeLock();
    };
  }, [requestWakeLock, releaseWakeLock]);

  const cancelAutoListen = useCallback(() => {
    if (autoListenTimerRef.current !== null) {
      clearTimeout(autoListenTimerRef.current);
      autoListenTimerRef.current = null;
    }
  }, []);

  const scheduleAutoListen = useCallback(() => {
    cancelAutoListen();

    if (!continuousModeEnabledRef.current || loadingRef.current) return;

    autoListenTimerRef.current = setTimeout(() => {
      autoListenTimerRef.current = null;

      if (
        continuousModeEnabledRef.current &&
        !loadingRef.current &&
        document.visibilityState === 'visible'
      ) {
        setAutoListenTrigger((previous) => previous + 1);
      }
    }, 700);
  }, [cancelAutoListen]);

  const updateStatus = useCallback((text: string) => {
    setStatusText(text);
  }, []);

  const handleStopPlayback = useCallback(() => {
    cancelAutoListen();

    try {
      speechManager.stop();
    } catch (error) {
      console.warn('[VEER] Could not stop speech:', error);
    }

    setIsSpeaking(false);
    setActivePlayingId(null);

    setStatusText(
      continuousModeEnabledRef.current
        ? 'अब बोलिए'
        : 'लगातार सुनना बंद है (माइक दबाकर बोलें)'
    );
  }, [cancelAutoListen]);

  const handleToggleContinuousMode = useCallback(
    (forcedValue?: boolean) => {
      const next =
        typeof forcedValue === 'boolean'
          ? forcedValue
          : !continuousModeEnabledRef.current;

      continuousModeEnabledRef.current = next;
      setContinuousModeEnabled(next);

      try {
        localStorage.setItem(STORAGE_KEY_CONTINUOUS_MODE, String(next));
      } catch (error) {
        console.warn('[VEER] Could not save continuous mode:', error);
      }

      if (!next) {
        cancelAutoListen();

        try {
          recognitionRef.current?.stop?.();
        } catch (error) {
          console.warn('[VEER] Could not stop microphone:', error);
        }

        recognitionRef.current = null;
        setIsListening(false);

        try {
          speechManager.stop();
        } catch (error) {
          console.warn('[VEER] Could not stop speech:', error);
        }

        setIsSpeaking(false);
        setActivePlayingId(null);

        try {
          soundFx.playPowerDown();
        } catch (error) {
          console.warn('[VEER] Sound effect unavailable:', error);
        }

        setStatusText('लगातार सुनना बंद है (माइक दबाकर बोलें)');
      } else {
        try {
          soundFx.playPowerUp();
        } catch (error) {
          console.warn('[VEER] Sound effect unavailable:', error);
        }

        setStatusText('लगातार सुनना चालू • अब बोलिए');

        if (!loadingRef.current) {
          scheduleAutoListen();
        }
      }
    },
    [cancelAutoListen, scheduleAutoListen]
  );

  const handleCancelCountdown = useCallback(() => {
    cancelAutoListen();

    if (retryIntervalRef.current !== null) {
      clearInterval(retryIntervalRef.current);
      retryIntervalRef.current = null;
    }

    setRetryCountdown(null);
    autoRetryCountRef.current = 0;

    setStatusText(
      continuousModeEnabledRef.current
        ? 'अब बोलिए'
        : 'लगातार सुनना बंद है (माइक दबाकर बोलें)'
    );
  }, [cancelAutoListen]);

  const handlePlayMessage = useCallback(
    (msg: ChatMessage) => {
      handleStopPlayback();
      setActivePlayingId(msg.id);
      setIsSpeaking(true);
      setStatusText('वीर बोल रहा है');

      try {
        speechManager.speak(
          msg.text,
          voiceSettingsRef.current,
          () => {
            setIsSpeaking(true);
            setActivePlayingId(msg.id);
            setStatusText('वीर बोल रहा है');
          },
          () => {
            setIsSpeaking(false);
            setActivePlayingId(null);

            if (continuousModeEnabledRef.current) {
              setStatusText('वीर सुन रहा है… अब बोलिए');
              scheduleAutoListen();
            } else {
              setStatusText('लगातार सुनना बंद है (माइक दबाकर बोलें)');
            }
          },
          () => {
            setIsSpeaking(false);
            setActivePlayingId(null);

            if (continuousModeEnabledRef.current) {
              setStatusText('अब बोलिए');
              scheduleAutoListen();
            } else {
              setStatusText('लगातार सुनना बंद है (माइक दबाकर बोलें)');
            }
          }
        );
      } catch (error) {
        console.warn('[VEER] Speech playback failed:', error);
        setIsSpeaking(false);
        setActivePlayingId(null);
        setStatusText('आवाज़ चलाने में समस्या आई।');
      }
    },
    [handleStopPlayback, scheduleAutoListen]
  );

  const handleSendMessage = async (text: string) => {
    const cleanText = text.trim();

    if (!cleanText || loadingRef.current) return;

    cancelAutoListen();
    handleStopPlayback();

    if (retryIntervalRef.current !== null) {
      clearInterval(retryIntervalRef.current);
      retryIntervalRef.current = null;
    }

    setRetryCountdown(null);

    const timestamp = new Date().toLocaleTimeString('hi-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: cleanText,
      timestamp,
    };

    setMessages((previous) => [...previous, userMessage]);

    const voiceCmd = detectVoiceCommand(cleanText);

    if (voiceCmd === 'pause') {
      handleToggleContinuousMode(false);

      const pauseMessage: ChatMessage = {
        id: `veer-pause-${Date.now()}`,
        sender: 'veer',
        text:
          'ठीक है साथी, लगातार सुनना बंद कर दिया गया है। ' +
          'बात करने के लिए माइक दबाएँ या लगातार सुनना चालू करें।',
        timestamp: new Date().toLocaleTimeString('hi-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
      };

      setMessages((previous) => [...previous, pauseMessage]);

      if (voiceSettingsRef.current.autoSpeak) {
        handlePlayMessage(pauseMessage);
      } else {
        setStatusText('लगातार सुनना बंद है (माइक दबाकर बोलें)');
      }

      return;
    }

    if (voiceCmd === 'resume') {
      handleToggleContinuousMode(true);

      const resumeMessage: ChatMessage = {
        id: `veer-resume-${Date.now()}`,
        sender: 'veer',
        text:
          'लगातार सुनना चालू हो गया है साथी! ' +
          'बताइए, मैं आपकी क्या सहायता करूँ?',
        timestamp: new Date().toLocaleTimeString('hi-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
      };

      setMessages((previous) => [...previous, resumeMessage]);

      if (voiceSettingsRef.current.autoSpeak) {
        handlePlayMessage(resumeMessage);
      } else {
        setStatusText('लगातार सुनना चालू • अब बोलिए');
        scheduleAutoListen();
      }

      return;
    }

    loadingRef.current = true;
    setIsLoading(true);
    setStatusText('वीर जवाब दे रहा है');

    const abortController = new AbortController();
    const abortTimer = setTimeout(() => abortController.abort(), 13000);

    try {
      const history = messages.slice(-6).map((message) => ({
        role: message.sender === 'user' ? 'user' : 'model',
        text: message.text,
      }));

      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: cleanText, history }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.is503) {
        const errorMessage: ChatMessage = {
          id: `veer-503-${Date.now()}`,
          sender: 'veer',
          text:
            data.reply ||
            'क्षमा करें साथी, AI सर्वर अभी व्यस्त है। कृपया दोबारा प्रयास करें।',
          timestamp: new Date().toLocaleTimeString('hi-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          }),
          is503Error: true,
          retryQuery: cleanText,
        };

        setMessages((previous) => [...previous, errorMessage]);

        try {
          soundFx.playPowerDown();
        } catch (error) {
          console.warn('[VEER] Sound effect unavailable:', error);
        }

        setStatusText('AI सर्वर व्यस्त है। थोड़ी देर बाद फिर प्रयास करें।');
        return;
      }

      const replyText =
        data.reply ||
        'नमस्ते साथी! वीर आपकी सेवा में तत्पर है। कृपया दोबारा पूछें।';

      const veerMessage: ChatMessage = {
        id: `veer-${Date.now()}`,
        sender: 'veer',
        text: replyText,
        timestamp: new Date().toLocaleTimeString('hi-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
        modelUsed: data.model || data.source,
      };

      setMessages((previous) => [...previous, veerMessage]);

      try {
        soundFx.playHeroResponse();
      } catch (error) {
        console.warn('[VEER] Sound effect unavailable:', error);
      }

      if (voiceSettingsRef.current.autoSpeak) {
        handlePlayMessage(veerMessage);
      } else if (continuousModeEnabledRef.current) {
        setStatusText('अब बोलिए');
        scheduleAutoListen();
      } else {
        setStatusText('लगातार सुनना बंद है (माइक दबाकर बोलें)');
      }
    } catch (error: any) {
      console.warn('[VEER] Request error:', error);

      const isTimeout = error?.name === 'AbortError';
      const is503 =
        error?.message?.includes('503') ||
        error?.message?.includes('high demand');

      const errorText = is503
        ? 'AI सर्वर अभी व्यस्त है। कृपया दोबारा प्रयास करें।'
        : isTimeout
          ? 'जवाब आने में समय लग रहा है। इंटरनेट जाँचकर फिर प्रयास करें।'
          : 'नेटवर्क या AI सर्वर से जुड़ने में समस्या आई है। इंटरनेट जाँचें।';

      const errorMessage: ChatMessage = {
        id: `veer-err-${Date.now()}`,
        sender: 'veer',
        text: errorText,
        timestamp: new Date().toLocaleTimeString('hi-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
        isError: true,
        is503Error: true,
        retryQuery: cleanText,
      };

      setMessages((previous) => [...previous, errorMessage]);

      try {
        soundFx.playPowerDown();
      } catch (soundError) {
        console.warn('[VEER] Sound effect unavailable:', soundError);
      }

      setIsSpeaking(false);
      setActivePlayingId(null);

      setStatusText(
        continuousModeEnabledRef.current
          ? 'अब बोलिए (या पुनः प्रयास करें)'
          : 'लगातार सुनना बंद है (माइक दबाकर बोलें)'
      );
    } finally {
      clearTimeout(abortTimer);
      loadingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleMicClick = useCallback(async () => {
    if (loadingRef.current) return;

    if (isSpeaking) {
      handleStopPlayback();
      return;
    }

    // Stop an active native or browser recognition session.
    if (isListening) {
      try {
        if (Capacitor.isNativePlatform()) {
          await SpeechRecognition.stop();
        } else {
          recognitionRef.current?.stop?.();
        }
      } catch (error) {
        console.warn('[VEER] Could not stop microphone:', error);
      }

      recognitionRef.current = null;
      setIsListening(false);
      setStatusText('माइक बंद कर दिया गया');
      return;
    }

    // Capacitor Android/iOS: use the native speech-recognition plugin.
    if (Capacitor.isNativePlatform()) {
      const session = {
        stop: () => SpeechRecognition.stop(),
        abort: () => SpeechRecognition.stop(),
      };
      recognitionRef.current = session;
      setIsListening(true);
      setStatusText('वीर सुन रहा है… अब बोलिए');

      try {
        try {
          soundFx.playActivate();
        } catch (error) {
          console.warn('[VEER] Sound effect unavailable:', error);
        }

        const permission = await SpeechRecognition.requestPermissions();
        if (recognitionRef.current !== session) return;

        if (permission.speechRecognition !== 'granted') {
          setStatusText(
            'माइक्रोफ़ोन की अनुमति नहीं मिली। Android App Info में VEER की Microphone अनुमति चालू करें।'
          );
          return;
        }

        const availability = await SpeechRecognition.available();
        if (recognitionRef.current !== session) return;

        if (!availability.available) {
          setStatusText(
            'इस फ़ोन में आवाज़ पहचान सेवा उपलब्ध नहीं है। Google ऐप और इंटरनेट जाँचें।'
          );
          return;
        }

        // popup:true returns final matches when the Android speech dialog finishes.
        const result = await SpeechRecognition.start({
          language: 'hi-IN',
          maxResults: 1,
          popup: true,
          partialResults: false,
        });

        if (recognitionRef.current !== session) return;

        const transcript = (result.matches?.[0] || '').trim();
        if (transcript) {
          void handleSendMessage(transcript);
        } else {
          setStatusText('आवाज़ समझ नहीं आई। माइक दबाकर फिर बोलें।');
        }
      } catch (error: any) {
        console.warn('[VEER] Native speech recognition failed:', error);
        if (recognitionRef.current === session) {
          const message = String(error?.message || '').toLowerCase();
          if (message.includes('permission') || message.includes('denied')) {
            setStatusText(
              'माइक्रोफ़ोन की अनुमति दें और फिर कोशिश करें।'
            );
          } else {
            setStatusText(
              'माइक शुरू नहीं हुआ। अनुमति, Google ऐप और इंटरनेट जाँचें।'
            );
          }
        }
      } finally {
        if (recognitionRef.current === session) {
          recognitionRef.current = null;
          setIsListening(false);
        }
      }

      return;
    }

    // Browser fallback: use the Web Speech API where available.
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setStatusText(
        'इस ब्राउज़र में आवाज़ पहचान उपलब्ध नहीं है। Chrome और Google ऐप अपडेट करके फिर कोशिश करें।'
      );
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      recognitionRef.current = recognition;

      recognition.lang = 'hi-IN';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setStatusText('वीर सुन रहा है… अब बोलिए');

        try {
          soundFx.playActivate();
        } catch (error) {
          console.warn('[VEER] Sound effect unavailable:', error);
        }
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results || [])
          .map((result: any) => result?.[0]?.transcript || '')
          .join(' ')
          .trim();

        if (transcript) {
          void handleSendMessage(transcript);
        } else {
          setStatusText('आवाज़ समझ नहीं आई। माइक दबाकर फिर बोलें।');
        }
      };

      recognition.onerror = (event: any) => {
        const error = event?.error;

        if (error === 'not-allowed' || error === 'service-not-allowed') {
          setStatusText('माइक्रोफ़ोन की अनुमति दें और फिर कोशिश करें।');
        } else if (error === 'no-speech') {
          setStatusText('आवाज़ नहीं मिली। माइक दबाकर फिर बोलें।');
        } else {
          setStatusText('माइक में समस्या आई। अनुमति और इंटरनेट जाँचें।');
        }
      };

      recognition.onend = () => {
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
        setIsListening(false);
      };

      recognition.start();
    } catch (error) {
      recognitionRef.current = null;
      setIsListening(false);
      setStatusText(
        'माइक शुरू नहीं हुआ। Android की माइक्रोफ़ोन अनुमति जाँचें।'
      );
      console.warn('[VEER] Browser speech recognition failed:', error);
    }
  }, [isListening, isSpeaking, handleStopPlayback, handleSendMessage]);

  useEffect(() => {
    return () => {
      cancelAutoListen();

      if (retryIntervalRef.current !== null) {
        clearInterval(retryIntervalRef.current);
      }

      try {
        recognitionRef.current?.abort?.();
      } catch (error) {
        console.warn('[VEER] Could not close microphone:', error);
      }

      recognitionRef.current = null;
      releaseWakeLock();
    };
  }, [cancelAutoListen, releaseWakeLock]);

  const handleClearChat = () => {
    cancelAutoListen();
    handleStopPlayback();
    handleCancelCountdown();

    setMessages([]);

    try {
      localStorage.removeItem(STORAGE_KEY_MESSAGES);
    } catch (error) {
      console.warn('[VEER] Could not clear saved messages:', error);
    }

    try {
      soundFx.playPowerDown();
    } catch (error) {
      console.warn('[VEER] Sound effect unavailable:', error);
    }

    setStatusText(
      continuousModeEnabledRef.current
        ? 'अब बोलिए'
        : 'लगातार सुनना बंद है (माइक दबाकर बोलें)'
    );
  };

  return (
    <div className="min-h-screen bg-[#070a12] flex items-center justify-center p-0 sm:p-4 text-slate-100 overflow-hidden">
      <div className="w-full max-w-md h-screen sm:h-[880px] sm:max-h-[96vh] bg-slate-950 sm:rounded-[40px] sm:border-[5px] sm:border-slate-800/90 shadow-2xl flex flex-col relative overflow-hidden ring-1 ring-white/10 sm:shadow-amber-500/10">
        <div className="absolute inset-0 bg-radial from-amber-500/5 via-transparent to-transparent pointer-events-none" />

        <AndroidHeader
          statusText={statusText}
          isSpeaking={isSpeaking}
          isListening={isListening}
          voiceSettings={voiceSettings}
          onToggleAutoSpeak={() =>
            setVoiceSettings((settings) => ({
              ...settings,
              autoSpeak: !settings.autoSpeak,
            }))
          }
          onOpenSettings={() => setIsSettingsOpen(true)}
          onClearChat={handleClearChat}
          continuousModeEnabled={continuousModeEnabled}
          onToggleContinuousMode={handleToggleContinuousMode}
        />

        <ChatArea
          messages={messages}
          isLoading={isLoading}
          activePlayingId={activePlayingId}
          retryCountdown={retryCountdown}
          onPlayMessage={handlePlayMessage}
          onStopPlayback={handleStopPlayback}
          onSelectSuggestion={(suggestionText) =>
            void handleSendMessage(suggestionText)
          }
          onRetryMessage={(query) => void handleSendMessage(query)}
          onCancelCountdown={handleCancelCountdown}
        />

        <VoiceMicButton
          onClick={handleMicClick}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          isSpeaking={isSpeaking}
          isListening={isListening}
          onListeningStateChange={updateStatus}
          onStopPlayback={handleStopPlayback}
          autoListenTrigger={autoListenTrigger}
          continuousModeEnabled={continuousModeEnabled}
          onToggleContinuousMode={handleToggleContinuousMode}
        />

        <div className="w-full pb-1 pt-0.5 flex justify-center bg-slate-950 pointer-events-none">
          <div className="w-32 h-1 bg-slate-700/80 rounded-full" />
        </div>

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          voiceSettings={voiceSettings}
          onUpdateSettings={(newSettings) =>
            setVoiceSettings((previous) => ({
              ...previous,
              ...newSettings,
            }))
          }
          onClearChat={handleClearChat}
          continuousModeEnabled={continuousModeEnabled}
          onToggleContinuousMode={handleToggleContinuousMode}
        />
      </div>
    </div>
  );
}
