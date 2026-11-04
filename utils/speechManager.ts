import { apiUrl } from './api';
import { VoiceSettings } from '../types';

export interface TtsDiagnosticResult {
  success: boolean;
  method: 'HTMLAudioElement' | 'AudioContext' | 'SpeechSynthesis' | 'None';
  voicesCount: number;
  hindiVoices: string[];
  cloudTtsStatus: 'SUCCESS' | 'FALLBACK_QUOTA' | 'NETWORK_ERROR' | 'DISABLED';
  error?: string;
  details: string;
  audioStarted: boolean;
}

class SpeechManager {
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private persistentAudio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private currentBufferSource: AudioBufferSourceNode | null = null;
  private currentBlobUrl: string | null = null;
  private isCurrentlySpeaking: boolean = false;
  private hindiVoice: SpeechSynthesisVoice | null = null;
  private safetyTimeout: any = null;
  private chromeKeepAliveInterval: any = null;
  private currentSpeechId: number = 0;
  private isAudioUnlocked: boolean = false;
  public lastDiagnosticResult: TtsDiagnosticResult | null = null;

  constructor() {
    this.refreshVoices();
    if (typeof window !== 'undefined') {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = () => {
          this.refreshVoices();
        };
      }

      // Proactively unlock audio on first document user interaction
      const autoUnlock = () => {
        this.unlockAudio();
        window.removeEventListener('click', autoUnlock);
        window.removeEventListener('touchstart', autoUnlock);
      };
      window.addEventListener('click', autoUnlock, { once: true, passive: true });
      window.addEventListener('touchstart', autoUnlock, { once: true, passive: true });
    }
  }

  /**
   * Refreshes and inspects installed speech synthesis voices, finding Hindi
   */
  public refreshVoices(): { total: number; hindiVoices: string[] } {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return { total: 0, hindiVoices: [] };
    }

    const voices = window.speechSynthesis.getVoices() || [];
    const hindiMatches: SpeechSynthesisVoice[] = [];

    for (const v of voices) {
      const lang = (v.lang || '').toLowerCase().replace(/_/g, '-');
      const name = (v.name || '').toLowerCase();
      if (
        lang.startsWith('hi') ||
        lang === 'hin-ind' ||
        name.includes('hindi') ||
        name.includes('हिन्दी')
      ) {
        hindiMatches.push(v);
      }
    }

    if (hindiMatches.length > 0) {
      // Prefer Google Hindi voice if available
      const googleHindi = hindiMatches.find((v) => v.name.toLowerCase().includes('google'));
      this.hindiVoice = googleHindi || hindiMatches[0];
    } else {
      this.hindiVoice = null;
    }

    return {
      total: voices.length,
      hindiVoices: hindiMatches.map((v) => `${v.name} (${v.lang})`),
    };
  }

  public getAvailableVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices();
  }

  public getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  /**
   * Converts base64 string to Blob
   */
  public base64ToBlob(base64: string, mimeType: string = 'audio/wav'): Blob {
    const cleanBase64 = base64.replace(/\s/g, '');
    const byteCharacters = atob(cleanBase64);
    const byteNumbers = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([byteNumbers], { type: mimeType });
  }

  /**
   * Unlocks HTML Audio, Web Audio, and SpeechSynthesis during a user gesture.
   */
  public async unlockAudio(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    try {
      // 1. Resume Web Audio AudioContext
      const ctx = this.getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      // 2. Unlock HTMLAudioElement with silent WAV
      if (!this.persistentAudio) {
        this.persistentAudio = new Audio();
        this.persistentAudio.preload = 'auto';
      }

      if (!this.isAudioUnlocked) {
        const validSilentWav =
          'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
        this.persistentAudio.src = validSilentWav;
        this.persistentAudio.volume = 0.01;
        await this.persistentAudio.play().catch(() => {});
        this.persistentAudio.pause();
        this.persistentAudio.currentTime = 0;
        this.persistentAudio.volume = 1.0;
        this.isAudioUnlocked = true;
      }

      // 3. Unpause Web SpeechSynthesis
      if ('speechSynthesis' in window) {
        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
          this.refreshVoices();
        } catch (e) {}
      }

      return true;
    } catch (e) {
      console.warn('[SpeechManager] Audio unlock notice:', e);
      return false;
    }
  }

  public cleanTextForSpeech(text: string): string {
    return text
      .replace(/[*#_`~>\[\]]/g, ' ')
      .replace(/https?:\/\/\S+/g, 'वेबसाइट लिंक')
      .replace(/[\(\)\{\}]/g, ', ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public stop() {
    this.currentSpeechId++;
    this.isCurrentlySpeaking = false;

    if (this.safetyTimeout) {
      clearTimeout(this.safetyTimeout);
      this.safetyTimeout = null;
    }

    if (this.chromeKeepAliveInterval) {
      clearInterval(this.chromeKeepAliveInterval);
      this.chromeKeepAliveInterval = null;
    }

    // Stop HTML Audio
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (e) {}
      this.currentAudio = null;
    }

    // Stop Web Audio BufferSource
    if (this.currentBufferSource) {
      try {
        this.currentBufferSource.stop();
        this.currentBufferSource.disconnect();
      } catch (e) {}
      this.currentBufferSource = null;
    }

    // Revoke blob URL
    if (this.currentBlobUrl) {
      try {
        URL.revokeObjectURL(this.currentBlobUrl);
      } catch (e) {}
      this.currentBlobUrl = null;
    }

    // Stop Web Speech Synthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
      this.currentUtterance = null;
      if ((window as any).__veerUtterance) {
        (window as any).__veerUtterance = null;
      }
    }
  }

  /**
   * Primary Audio Player using HTMLAudioElement & Blob URL
   * Strictly awaits audio.play() Promise to verify real playback and catch Autoplay errors.
   */
  private async playWithAudioElement(
    blob: Blob,
    speechId: number,
    cleanText: string,
    onStart?: () => void,
    safeEnd?: () => void,
    onStatusUpdate?: (status: string) => void
  ): Promise<void> {
    const blobUrl = URL.createObjectURL(blob);

    if (this.currentBlobUrl) {
      try {
        URL.revokeObjectURL(this.currentBlobUrl);
      } catch (e) {}
    }
    this.currentBlobUrl = blobUrl;

    let audio = this.persistentAudio;
    if (!audio) {
      audio = new Audio();
      this.persistentAudio = audio;
    }
    this.currentAudio = audio;

    // Reset handlers
    audio.onplay = null;
    audio.onplaying = null;
    audio.onended = null;
    audio.onerror = null;

    audio.src = blobUrl;
    audio.load();

    return new Promise<void>((resolve, reject) => {
      let playbackStarted = false;

      const triggerStart = () => {
        if (playbackStarted || this.currentSpeechId !== speechId) return;
        playbackStarted = true;
        this.isCurrentlySpeaking = true;
        onStatusUpdate?.('वीर बोल रहा है (क्लाउड आवाज़)');
        onStart?.();

        if (this.safetyTimeout) clearTimeout(this.safetyTimeout);
        const durationMs =
          audio.duration && !isNaN(audio.duration) && audio.duration > 0
            ? Math.round(audio.duration * 1000) + 1500
            : Math.max(4000, (cleanText.length / 6) * 1000 + 3000);

        this.safetyTimeout = setTimeout(() => {
          if (this.currentSpeechId === speechId) {
            safeEnd?.();
          }
        }, durationMs);

        resolve();
      };

      audio.onplay = triggerStart;
      audio.onplaying = triggerStart;

      audio.onended = () => {
        if (this.currentSpeechId === speechId) {
          onStatusUpdate?.('आवाज़ समाप्त');
          safeEnd?.();
        }
      };

      audio.onerror = () => {
        if (this.currentSpeechId === speechId) {
          const mediaErr = audio.error;
          const msg = mediaErr
            ? `MediaError code ${mediaErr.code}: ${mediaErr.message || 'Audio playback error'}`
            : 'HTMLAudioElement playback failed';
          reject(new Error(msg));
        }
      };

      // Directly await play() Promise to capture Android Chrome Autoplay restrictions
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            triggerStart();
          })
          .catch((playErr) => {
            if (!playbackStarted && this.currentSpeechId === speechId) {
              console.warn('[VEER] HTMLAudioElement play() promise rejected:', playErr);
              reject(playErr);
            }
          });
      }
    });
  }

  /**
   * Secondary Audio Player using Web Audio API AudioContext
   */
  private async playWithAudioContext(
    blob: Blob,
    speechId: number,
    onStart?: () => void,
    safeEnd?: () => void,
    onStatusUpdate?: (status: string) => void
  ): Promise<void> {
    const arrayBuffer = await blob.arrayBuffer();
    const ctx = this.getAudioContext();
    if (!ctx) throw new Error('Web Audio API (AudioContext) उपलब्ध नहीं है');

    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    if (ctx.state !== 'running') {
      throw new Error(`AudioContext ${ctx.state} अवस्था में है (स्क्रीन पर टैप करें)`);
    }

    // Safely copy array buffer so decodeAudioData does not detach shared memory
    const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
      ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
    });

    if (this.currentSpeechId !== speechId) return;

    if (this.currentBufferSource) {
      try {
        this.currentBufferSource.stop();
        this.currentBufferSource.disconnect();
      } catch (e) {}
      this.currentBufferSource = null;
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    this.currentBufferSource = source;

    this.isCurrentlySpeaking = true;
    onStatusUpdate?.('वीर बोल रहा है (Web Audio)');
    onStart?.();

    if (this.safetyTimeout) clearTimeout(this.safetyTimeout);
    const durationMs = Math.round(audioBuffer.duration * 1000) + 1200;
    this.safetyTimeout = setTimeout(() => {
      if (this.currentSpeechId === speechId) {
        onStatusUpdate?.('आवाज़ समाप्त');
        safeEnd?.();
      }
    }, durationMs);

    source.onended = () => {
      if (this.currentSpeechId === speechId) {
        this.currentBufferSource = null;
        onStatusUpdate?.('आवाज़ समाप्त');
        safeEnd?.();
      }
    };

    source.start(0);
  }

  /**
   * Browser Speech Synthesis Fallback (optimized for Android Chrome)
   */
  private speakWithBrowser(
    text: string,
    settings: VoiceSettings,
    speechId: number,
    onStart?: () => void,
    safeEnd?: () => void,
    onError?: (err: any) => void,
    onStatusUpdate?: (status: string) => void
  ) {
    if (this.currentSpeechId !== speechId) return;

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      const err = new Error('ब्राउज़र में स्पीच सिंथेसिस समर्थित नहीं है');
      onError?.(err);
      safeEnd?.();
      return;
    }

    // Refresh voices immediately
    this.refreshVoices();

    try {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch (e) {}

    const utterance = new SpeechSynthesisUtterance(text);
    this.currentUtterance = utterance;

    // Pin utterance to window to protect against Android Chrome garbage collection
    if (typeof window !== 'undefined') {
      (window as any).__veerUtterance = utterance;
    }

    // Set voice: Prefer verified Hindi voice
    if (this.hindiVoice) {
      utterance.voice = this.hindiVoice;
    }
    utterance.lang = 'hi-IN';
    utterance.rate = settings.rate || 1.0;
    utterance.pitch = settings.pitch || 1.0;

    let hasStarted = false;
    const triggerStart = () => {
      if (hasStarted || this.currentSpeechId !== speechId) return;
      hasStarted = true;
      this.isCurrentlySpeaking = true;
      const voiceLabel = this.hindiVoice ? this.hindiVoice.name : 'डिफ़ॉल्ट हिन्दी';
      onStatusUpdate?.(`वीर बोल रहा है (${voiceLabel})`);
      onStart?.();

      if (this.safetyTimeout) clearTimeout(this.safetyTimeout);
      const estDurationMs = Math.max(
        3500,
        (text.length / 4.5) * 1000 * (1 / (settings.rate || 1.0)) + 3000
      );
      this.safetyTimeout = setTimeout(() => {
        if (this.currentSpeechId === speechId) {
          safeEnd?.();
        }
      }, estDurationMs);

      // Android Chrome keep-alive: pulse resume() every 4s to prevent cut-off
      if (this.chromeKeepAliveInterval) clearInterval(this.chromeKeepAliveInterval);
      this.chromeKeepAliveInterval = setInterval(() => {
        if (this.currentSpeechId === speechId && this.isCurrentlySpeaking) {
          try {
            if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
              window.speechSynthesis.pause();
              window.speechSynthesis.resume();
            }
          } catch (e) {}
        } else {
          clearInterval(this.chromeKeepAliveInterval);
        }
      }, 4000);
    };

    utterance.onstart = triggerStart;

    utterance.onend = () => {
      if (this.chromeKeepAliveInterval) {
        clearInterval(this.chromeKeepAliveInterval);
        this.chromeKeepAliveInterval = null;
      }
      if (typeof window !== 'undefined') {
        (window as any).__veerUtterance = null;
      }
      if (this.currentSpeechId === speechId) {
        onStatusUpdate?.('आवाज़ समाप्त');
        safeEnd?.();
      }
    };

    utterance.onerror = (e) => {
      if (this.chromeKeepAliveInterval) {
        clearInterval(this.chromeKeepAliveInterval);
        this.chromeKeepAliveInterval = null;
      }
      if (typeof window !== 'undefined') {
        (window as any).__veerUtterance = null;
      }
      this.isCurrentlySpeaking = false;
      this.currentUtterance = null;

      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        console.warn('[VEER TTS] Speech synthesis error:', e.error);
        let errorMsg = `ब्राउज़र आवाज़ त्रुटि: ${e.error}`;
        if (e.error === 'not-allowed') {
          errorMsg = 'ऑडियो प्लेबैक ब्लॉक हुआ (Android Autoplay) — कृपया स्क्रीन पर टैप करें या स्पीकर बटन दबाएं।';
        } else if (e.error === 'language-unavailable') {
          errorMsg = 'डिवाइस में हिन्दी वॉइस पैक नहीं मिला — कृपया Android Settings > Speech Services में Hindi Voice डाउनलोड करें।';
        } else if (e.error === 'audio-busy') {
          errorMsg = 'माइक्रोफ़ोन या अन्य मीडिया सक्रिय है — आवाज़ रुकी।';
        }
        onError?.(new Error(errorMsg));
      }

      if (this.currentSpeechId === speechId) {
        safeEnd?.();
      }
    };

    // Dispatch immediately without delayed setTimeout to preserve mobile gesture context
    try {
      this.isCurrentlySpeaking = true;
      window.speechSynthesis.speak(utterance);
    } catch (speakErr: any) {
      console.warn('[VEER TTS] window.speechSynthesis.speak exception:', speakErr);
      onError?.(speakErr);
      safeEnd?.();
    }
  }

  /**
   * Main Speak Entry Point
   */
  public async speak(
    text: string,
    settings: VoiceSettings,
    onStart?: () => void,
    onEnd?: () => void,
    onError?: (err: any) => void,
    onStatusUpdate?: (status: string) => void
  ) {
    this.stop();
    const speechId = ++this.currentSpeechId;
    const cleanText = this.cleanTextForSpeech(text);

    if (!cleanText) {
      onEnd?.();
      return;
    }

    let hasEnded = false;
    const safeEnd = () => {
      if (hasEnded || this.currentSpeechId !== speechId) return;
      hasEnded = true;

      if (this.safetyTimeout) {
        clearTimeout(this.safetyTimeout);
        this.safetyTimeout = null;
      }
      if (this.chromeKeepAliveInterval) {
        clearInterval(this.chromeKeepAliveInterval);
        this.chromeKeepAliveInterval = null;
      }
      this.isCurrentlySpeaking = false;
      this.currentAudio = null;
      this.currentBufferSource = null;
      this.currentUtterance = null;
      onEnd?.();
    };

    // 1. Try Gemini Cloud TTS if enabled
    if (settings.preferGeminiVoice) {
      onStatusUpdate?.('क्लाउड आवाज़ तैयार हो रही है...');
      const abortController = new AbortController();
      const fetchTimeout = setTimeout(() => abortController.abort(), 25000);

      try {
        const res = await fetch(apiUrl('/api/tts'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanText }),
          signal: abortController.signal,
        });

        clearTimeout(fetchTimeout);

        if (this.currentSpeechId !== speechId) {
          return;
        }

        if (res.ok) {
          const data = await res.json();
          if (data.audio && this.currentSpeechId === speechId) {
            const blob = this.base64ToBlob(data.audio, data.mimeType || 'audio/wav');

            // Strategy A: HTMLAudioElement with Blob URL
            try {
              onStatusUpdate?.('ऑडियो प्ले हो रहा है...');
              await this.playWithAudioElement(
                blob,
                speechId,
                cleanText,
                onStart,
                safeEnd,
                onStatusUpdate
              );
              return;
            } catch (playErr: any) {
              console.warn('[VEER] HTMLAudioElement blocked or failed, trying Web Audio API:', playErr);

              // Strategy B: Web Audio API (AudioContext)
              try {
                await this.playWithAudioContext(blob, speechId, onStart, safeEnd, onStatusUpdate);
                return;
              } catch (ctxErr) {
                console.warn('[VEER] Web Audio API failed, fallback to Web Speech Synthesis:', ctxErr);
                if (this.currentSpeechId === speechId) {
                  this.speakWithBrowser(
                    cleanText,
                    settings,
                    speechId,
                    onStart,
                    safeEnd,
                    onError,
                    onStatusUpdate
                  );
                }
                return;
              }
            }
          }
        }
      } catch (err) {
        clearTimeout(fetchTimeout);
        console.warn('[VEER TTS] /api/tts notice, falling back to browser speech synthesis:', err);
      }
    }

    if (this.currentSpeechId !== speechId) return;

    // Strategy C: Browser Web Speech Synthesis
    onStatusUpdate?.('डिवाइस आवाज़ से बोला जा रहा है...');
    this.speakWithBrowser(cleanText, settings, speechId, onStart, safeEnd, onError, onStatusUpdate);
  }

  /**
   * Diagnostic Test: "नमस्ते, मैं वीर हूँ"
   * Runs an end-to-end audit of all TTS pathways and tests audio playback.
   */
  public async runTtsDiagnostic(
    onProgress?: (step: string) => void
  ): Promise<TtsDiagnosticResult> {
    onProgress?.('ऑडियो सिस्टम अनलॉक किया जा रहा है...');
    await this.unlockAudio();

    const voiceInfo = this.refreshVoices();
    onProgress?.(`वॉइस मिली: कुल ${voiceInfo.total}, हिन्दी ${voiceInfo.hindiVoices.length}`);

    const testText = 'नमस्ते, मैं वीर हूँ';
    let cloudStatus: 'SUCCESS' | 'FALLBACK_QUOTA' | 'NETWORK_ERROR' | 'DISABLED' = 'DISABLED';
    let cloudAudioBase64: string | null = null;

    onProgress?.('क्लाउड TTS API की जाँच हो रही है...');
    try {
      const res = await fetch(apiUrl('/api/tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testText }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.audio) {
          cloudStatus = 'SUCCESS';
          cloudAudioBase64 = data.audio;
        } else if (data.fallback) {
          cloudStatus = 'FALLBACK_QUOTA';
        }
      } else {
        cloudStatus = 'NETWORK_ERROR';
      }
    } catch (e) {
      cloudStatus = 'NETWORK_ERROR';
    }

    return new Promise<TtsDiagnosticResult>((resolve) => {
      const defaultSettings: VoiceSettings = {
        autoSpeak: true,
        rate: 1.0,
        pitch: 1.0,
        soundEffects: true,
        preferGeminiVoice: !!cloudAudioBase64,
      };

      let audioActuallyStarted = false;
      let usedMethod: 'HTMLAudioElement' | 'AudioContext' | 'SpeechSynthesis' | 'None' = 'None';

      onProgress?.('ऑडियो प्लेबैक शुरू किया जा रहा है...');

      this.speak(
        testText,
        defaultSettings,
        () => {
          audioActuallyStarted = true;
          usedMethod = cloudAudioBase64 ? 'HTMLAudioElement' : 'SpeechSynthesis';
          onProgress?.(`✅ आवाज़ शुरू हुई (${usedMethod})`);
        },
        () => {
          const result: TtsDiagnosticResult = {
            success: audioActuallyStarted,
            method: usedMethod,
            voicesCount: voiceInfo.total,
            hindiVoices: voiceInfo.hindiVoices,
            cloudTtsStatus: cloudStatus,
            details: audioActuallyStarted
              ? `आवाज़ सफलतापूर्वक बजाई गई (${usedMethod})`
              : 'ऑडियो प्लेबैक शुरू नहीं हो सका',
            audioStarted: audioActuallyStarted,
          };
          this.lastDiagnosticResult = result;
          resolve(result);
        },
        (err) => {
          const result: TtsDiagnosticResult = {
            success: false,
            method: 'None',
            voicesCount: voiceInfo.total,
            hindiVoices: voiceInfo.hindiVoices,
            cloudTtsStatus: cloudStatus,
            error: err?.message || 'अज्ञात प्लेबैक त्रुटि',
            details: `प्लेबैक त्रुटि: ${err?.message || 'त्रुटि'}`,
            audioStarted: audioActuallyStarted,
          };
          this.lastDiagnosticResult = result;
          resolve(result);
        },
        (status) => {
          onProgress?.(status);
        }
      );

      // Timeout safety for the diagnostic test
      setTimeout(() => {
        if (!audioActuallyStarted) {
          const result: TtsDiagnosticResult = {
            success: false,
            method: 'None',
            voicesCount: voiceInfo.total,
            hindiVoices: voiceInfo.hindiVoices,
            cloudTtsStatus: cloudStatus,
            error: 'समय समाप्त: प्लेबैक शुरू नहीं हुआ (Android Autoplay या Speech Services की जाँच करें)',
            details: 'Android Chrome ने बिना यूज़र टच के ऑडियो रोका',
            audioStarted: false,
          };
          this.lastDiagnosticResult = result;
          resolve(result);
        }
      }, 5000);
    });
  }

  public getSpeakingState(): boolean {
    return this.isCurrentlySpeaking;
  }
}

export const speechManager = new SpeechManager();
