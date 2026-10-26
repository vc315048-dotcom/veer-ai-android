/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AndroidHeader } from './components/AndroidHeader';
import { ChatArea } from './components/ChatArea';
import { VoiceMicButton } from './components/VoiceMicButton';
import { SettingsModal } from './components/SettingsModal';
import { ChatMessage, VoiceSettings } from './types';
import { speechManager } from './utils/speechManager';
import { soundFx } from './utils/soundEffects';
import { detectVoiceCommand } from './utils/voiceCommands';

const STORAGE_KEY_MESSAGES = 'veer_messages_v1';
const STORAGE_KEY_SETTINGS = 'veer_settings_v1';
const STORAGE_KEY_CONTINUOUS_MODE = 'veer_continuous_mode_v3';

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
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
    } catch (e) {}
    return defaultSettings;
  });

  // Single authoritative state: Continuous Mode ON/OFF
  const [continuousModeEnabled, setContinuousModeEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CONTINUOUS_MODE);
      if (saved !== null) {
        return saved === 'true';
      }
    } catch (e) {}
    return true; // Enabled by default for natural back-and-forth conversation
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>('अब बोलिए');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [autoListenTrigger, setAutoListenTrigger] = useState<number>(0);

  const retryIntervalRef = useRef<any>(null);
  const autoRetryCountRef = useRef<number>(0);
  const autoListenTimerRef = useRef<any>(null);
  const voiceSettingsRef = useRef<VoiceSettings>(voiceSettings);
  const continuousModeEnabledRef = useRef<boolean>(continuousModeEnabled);

  // Keep refs strictly in sync
  useEffect(() => {
    voiceSettingsRef.current = voiceSettings;
  }, [voiceSettings]);

  useEffect(() => {
    continuousModeEnabledRef.current = continuousModeEnabled;
    try {
      localStorage.setItem(STORAGE_KEY_CONTINUOUS_MODE, String(continuousModeEnabled));
    } catch (e) {}
  }, [continuousModeEnabled]);

  // Sync soundFx config
  useEffect(() => {
    soundFx.enabled = voiceSettings.soundEffects;
  }, [voiceSettings.soundEffects]);

  // Persist messages
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    } catch (e) {}
  }, [messages]);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(voiceSettings));
    } catch (e) {}
  }, [voiceSettings]);

  // Screen WakeLock ref (Keeps phone screen on while continuous listening is active)
  const wakeLockSentinelRef = useRef<any>(null);

  const requestWakeLock = useCallback(async () => {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        if (!wakeLockSentinelRef.current && document.visibilityState === 'visible') {
          wakeLockSentinelRef.current = await (navigator as any).wakeLock.request('screen');
          wakeLockSentinelRef.current.addEventListener('release', () => {
            wakeLockSentinelRef.current = null;
          });
        }
      } catch (err) {
        // WakeLock may fail if device is in aggressive battery saver or page is hidden
      }
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockSentinelRef.current) {
      try {
        wakeLockSentinelRef.current.release();
      } catch (e) {}
      wakeLockSentinelRef.current = null;
    }
  }, []);

  // Sync Screen WakeLock with continuousModeEnabled
  useEffect(() => {
    if (continuousModeEnabled) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
  }, [continuousModeEnabled, requestWakeLock, releaseWakeLock]);

  // Handle visibility changes safely (screen lock / unlock / tab switch)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (continuousModeEnabledRef.current) {
          requestWakeLock();
        }
      } else {
        releaseWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [requestWakeLock, releaseWakeLock]);

  // Cancel any pending auto-listen restart timer immediately
  const cancelAutoListen = useCallback(() => {
    if (autoListenTimerRef.current) {
      clearTimeout(autoListenTimerRef.current);
      autoListenTimerRef.current = null;
    }
  }, []);

  // Schedule auto-listen ONLY if continuous mode is authoritatively enabled
  const scheduleAutoListen = useCallback(() => {
    cancelAutoListen();
    if (!continuousModeEnabledRef.current) return;

    // 450ms safety buffer to ensure audio playback is completely silent before opening mic
    autoListenTimerRef.current = setTimeout(() => {
      autoListenTimerRef.current = null;
      if (continuousModeEnabledRef.current) {
        setAutoListenTrigger((prev) => prev + 1);
      }
    }, 450);
  }, [cancelAutoListen]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      cancelAutoListen();
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
      }
    };
  }, [cancelAutoListen]);

  const updateStatus = useCallback((text: string) => {
    setStatusText(text);
  }, []);

  const handleStopPlayback = useCallback(() => {
    cancelAutoListen();
    speechManager.stop();
    setIsSpeaking(false);
    setActivePlayingId(null);
    if (continuousModeEnabledRef.current) {
      setStatusText('अब बोलिए');
    } else {
      setStatusText('लगातार सुनना बंद है (माइक दबाकर बोलें)');
    }
  }, [cancelAutoListen]);

  // Reliable ON/OFF toggle: turns OFF immediately and stays OFF until turned ON again
  const handleToggleContinuousMode = useCallback(
    (forcedValue?: boolean) => {
      setContinuousModeEnabled((prev) => {
        const next = typeof forcedValue === 'boolean' ? forcedValue : !prev;
        continuousModeEnabledRef.current = next;
        try {
          localStorage.setItem(STORAGE_KEY_CONTINUOUS_MODE, String(next));
        } catch (e) {}

        if (!next) {
          // Turning OFF: immediately cancel restart timers, stop speech, and clear speaking/playing state!
          cancelAutoListen();
          speechManager.stop();
          setIsSpeaking(false);
          setActivePlayingId(null);
          soundFx.playPowerDown();
          setStatusText('लगातार सुनना बंद है (माइक दबाकर बोलें)');
        } else {
          // Turning ON: play chime, start listening if idle
          soundFx.playPowerUp();
          setStatusText('लगातार सुनना चालू • अब बोलिए');
          if (!isLoading && !isSpeaking) {
            scheduleAutoListen();
          }
        }
        return next;
      });
    },
    [cancelAutoListen, isLoading, isSpeaking, scheduleAutoListen]
  );

  const handlePlayMessage = useCallback(
    (msg: ChatMessage) => {
      handleStopPlayback();
      setActivePlayingId(msg.id);
      setIsSpeaking(true);
      setStatusText('वीर बोल रहा है');

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
            setStatusText('वीर सुन रहा है... अब बोलिए');
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
    },
    [handleStopPlayback, scheduleAutoListen]
  );

  const handleCancelCountdown = useCallback(() => {
    cancelAutoListen();
    if (retryIntervalRef.current) {
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

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    // Stop ongoing speech & cancel any active countdown
    handleStopPlayback();
    if (retryIntervalRef.current) {
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
      text: text.trim(),
      timestamp,
    };

    setMessages((prev) => [...prev, userMessage]);

    // Check for hands-free voice commands ("वीर, आराम करो" / "वीर, फिर सुनो")
    const voiceCmd = detectVoiceCommand(text);

    if (voiceCmd === 'pause') {
      handleToggleContinuousMode(false);

      const pauseMessage: ChatMessage = {
        id: `veer-pause-${Date.now()}`,
        sender: 'veer',
        text: 'ठीक है साथी, लगातार सुनना बंद कर दिया गया है। जब भी बात करनी हो, नारंगी माइक दबाएं या "लगातार सुनना" बटन चालू करें।',
        timestamp: new Date().toLocaleTimeString('hi-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
      };

      setMessages((prev) => [...prev, pauseMessage]);

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
        text: 'लगातार सुनना चालू हो गया है साथी! अब आप बिना बटन दबाए लगातार बातचीत कर सकते हैं। बताइए, मैं आपकी क्या सहायता करूँ?',
        timestamp: new Date().toLocaleTimeString('hi-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
      };

      setMessages((prev) => [...prev, resumeMessage]);

      if (voiceSettingsRef.current.autoSpeak) {
        handlePlayMessage(resumeMessage);
      } else {
        setStatusText('लगातार सुनना चालू • अब बोलिए');
        scheduleAutoListen();
      }
      return;
    }

    setIsLoading(true);
    setStatusText('वीर जवाब दे रहा है');

    // 13-second safety timeout so app and mic never get stuck waiting forever
    const abortController = new AbortController();
    const abortTimer = setTimeout(() => abortController.abort(), 13000);

    try {
      // Build history for context
      const history = messages.slice(-6).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'model',
        text: m.text,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), history }),
        signal: abortController.signal,
      });

      clearTimeout(abortTimer);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      // If AI Server returned 503 indicator or failure
      if (data.is503) {
        const veer503Message: ChatMessage = {
          id: `veer-503-${Date.now()}`,
          sender: 'veer',
          text: data.reply || 'क्षमा करें साथी, Google AI सर्वर पर अत्यधिक लोड (503 Server Busy) है। कृपया नीचे "दोबारा प्रयास करें" दबाएं।',
          timestamp: new Date().toLocaleTimeString('hi-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          }),
          is503Error: true,
          retryQuery: text.trim(),
        };

        setMessages((prev) => [...prev, veer503Message]);
        soundFx.playPowerDown();

        // REQUIREMENT: When an AI request fails, clear loading/speaking state and re-enable controls
        handleStopPlayback();
        setIsLoading(false);
        setIsSpeaking(false);
        setStatusText(
          continuousModeEnabledRef.current
            ? 'अब बोलिए (या पुनः प्रयास करें)'
            : 'लगातार सुनना बंद है (माइक दबाकर बोलें)'
        );
        return;
      }

      const replyText =
        data.reply ||
        'नमस्ते साथी! वीर आपकी सेवा में सदैव तत्पर है। कृपया दोबारा पूछें।';

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

      setMessages((prev) => [...prev, veerMessage]);
      soundFx.playHeroResponse();

      // Automatically speak aloud if autoSpeak enabled
      if (voiceSettingsRef.current.autoSpeak) {
        handlePlayMessage(veerMessage);
      } else {
        if (continuousModeEnabledRef.current) {
          setStatusText('अब बोलिए');
          scheduleAutoListen();
        } else {
          setStatusText('लगातार सुनना बंद है (माइक दबाकर बोलें)');
        }
      }
    } catch (error: any) {
      clearTimeout(abortTimer);
      console.warn('[VEER] Request error / timeout / 503:', error);

      const isTimeout = error?.name === 'AbortError';
      const is503 = error?.message?.includes('503') || error?.message?.includes('high demand');
      const errorText = is503
        ? 'क्षमा करें साथी, Google AI सर्वर व्यस्त (503 Server Busy) है। माइक्रोफ़ोन सुरक्षित है — आप नीचे "दोबारा प्रयास करें" दबा सकते हैं।'
        : isTimeout
        ? 'क्षमा करें साथी, AI सर्वर से जवाब मिलने में समय लग रहा है। माइक्रोफ़ोन सुरक्षित है — आप नीचे "दोबारा प्रयास करें" दबा सकते हैं।'
        : 'क्षमा करें साथी, नेटवर्क या AI सर्वर से जुड़ने में समस्या आई है। माइक्रोफ़ोन सुरक्षित है — आप नीचे "दोबारा प्रयास करें" दबा सकते हैं।';

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
        retryQuery: text.trim(),
      };

      setMessages((prev) => [...prev, errorMessage]);
      soundFx.playPowerDown();

      // REQUIREMENT: When an AI request fails, clear loading/speaking state and re-enable controls immediately!
      handleStopPlayback();
      setIsLoading(false);
      setIsSpeaking(false);
      setStatusText(
        continuousModeEnabledRef.current
          ? 'अब बोलिए (या पुनः प्रयास करें)'
          : 'लगातार सुनना बंद है (माइक दबाकर बोलें)'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    cancelAutoListen();
    handleStopPlayback();
    handleCancelCountdown();
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY_MESSAGES);
    soundFx.playPowerDown();
    setStatusText(
      continuousModeEnabledRef.current
        ? 'अब बोलिए'
        : 'लगातार सुनना बंद है (माइक दबाकर बोलें)'
    );
  };

  return (
    <div className="min-h-screen bg-[#070a12] flex items-center justify-center p-0 sm:p-4 text-slate-100 overflow-hidden">
      {/* Android Device Mockup Shell on Desktop / Direct Fullscreen on Mobile */}
      <div className="w-full max-w-md h-screen sm:h-[880px] sm:max-h-[96vh] bg-slate-950 sm:rounded-[40px] sm:border-[5px] sm:border-slate-800/90 shadow-2xl flex flex-col relative overflow-hidden ring-1 ring-white/10 sm:shadow-amber-500/10">
        {/* Subtle superhero background gradient */}
        <div className="absolute inset-0 bg-radial from-amber-500/5 via-transparent to-transparent pointer-events-none" />

        {/* Android Top Header */}
        <AndroidHeader
          statusText={statusText}
          isSpeaking={isSpeaking}
          isListening={isListening}
          voiceSettings={voiceSettings}
          onToggleAutoSpeak={() =>
            setVoiceSettings((s) => ({ ...s, autoSpeak: !s.autoSpeak }))
          }
          onOpenSettings={() => setIsSettingsOpen(true)}
          onClearChat={handleClearChat}
          continuousModeEnabled={continuousModeEnabled}
          onToggleContinuousMode={handleToggleContinuousMode}
        />

        {/* Central Chat Area */}
        <ChatArea
          messages={messages}
          isLoading={isLoading}
          activePlayingId={activePlayingId}
          retryCountdown={retryCountdown}
          onPlayMessage={handlePlayMessage}
          onStopPlayback={handleStopPlayback}
          onSelectSuggestion={(suggestionText) => handleSendMessage(suggestionText)}
          onRetryMessage={(query) => handleSendMessage(query)}
          onCancelCountdown={handleCancelCountdown}
        />

        {/* Floating Voice Mic & Bottom Dock */}
        <VoiceMicButton
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          isSpeaking={isSpeaking}
          isListening={isListening}
          setIsListening={setIsListening}
          onListeningStateChange={updateStatus}
          onStopPlayback={handleStopPlayback}
          autoListenTrigger={autoListenTrigger}
          continuousModeEnabled={continuousModeEnabled}
          onToggleContinuousMode={handleToggleContinuousMode}
        />

        {/* Android Gesture Bar */}
        <div className="w-full pb-1 pt-0.5 flex justify-center bg-slate-950 pointer-events-none">
          <div className="w-32 h-1 bg-slate-700/80 rounded-full" />
        </div>

        {/* Settings Modal */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          voiceSettings={voiceSettings}
          onUpdateSettings={(newSettings) =>
            setVoiceSettings((prev) => ({ ...prev, ...newSettings }))
          }
          onClearChat={handleClearChat}
          continuousModeEnabled={continuousModeEnabled}
          onToggleContinuousMode={handleToggleContinuousMode}
        />
      </div>
    </div>
  );
}
