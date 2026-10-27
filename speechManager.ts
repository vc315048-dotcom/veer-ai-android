import { VoiceSettings } from '../types';

class SpeechManager {
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private isCurrentlySpeaking: boolean = false;
  private hindiVoice: SpeechSynthesisVoice | null = null;
  private safetyTimeout: any = null;
  private currentSpeechId: number = 0;

  constructor() {
    this.initVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.initVoices();
      };
    }
  }

  private initVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();

    // Look for dedicated Hindi voice
    const hiVoice = voices.find(
      (v) => v.lang.toLowerCase().includes('hi-in') || v.lang.toLowerCase().includes('hi')
    );

    // Fallback to Indian English or first suitable voice
    const fallbackIndianVoice = voices.find((v) => v.lang.toLowerCase().includes('en-in'));

    this.hindiVoice = hiVoice || fallbackIndianVoice || null;
  }

  public getAvailableVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices();
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
    // Invalidate any in-flight speak requests or TTS fetches
    this.currentSpeechId++;
    this.isCurrentlySpeaking = false;

    if (this.safetyTimeout) {
      clearTimeout(this.safetyTimeout);
      this.safetyTimeout = null;
    }

    // Stop HTML Audio if playing
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (e) {}
      this.currentAudio = null;
    }

    // Stop Web Speech Synthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
      this.currentUtterance = null;
    }
  }

  public async speak(
    text: string,
    settings: VoiceSettings,
    onStart?: () => void,
    onEnd?: () => void,
    onError?: (err: any) => void
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
      this.isCurrentlySpeaking = false;
      this.currentAudio = null;
      this.currentUtterance = null;
      onEnd?.();
    };

    // Absolute safety timeout: ensures speaking state CANNOT get stuck even if browser audio stalls
    const approxDurationMs = Math.max(
      3500,
      (cleanText.length / 8) * 1000 * (1 / (settings.rate || 1.0)) + 3000
    );
    this.safetyTimeout = setTimeout(() => {
      if (this.currentSpeechId === speechId) {
        safeEnd();
      }
    }, approxDurationMs);

    // Try Gemini TTS first if preferGeminiVoice is enabled (with 3.5s timeout)
    if (settings.preferGeminiVoice) {
      const abortController = new AbortController();
      const fetchTimeout = setTimeout(() => abortController.abort(), 3500);

      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanText }),
          signal: abortController.signal,
        });

        clearTimeout(fetchTimeout);

        // If stopped during fetch, abort immediately
        if (this.currentSpeechId !== speechId) {
          return;
        }

        if (res.ok) {
          const data = await res.json();
          if (data.audio && this.currentSpeechId === speechId) {
            const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audio}`);
            this.currentAudio = audio;
            this.isCurrentlySpeaking = true;

            audio.onplay = () => {
              if (this.currentSpeechId !== speechId) {
                audio.pause();
                return;
              }
              onStart?.();
            };

            audio.onended = () => {
              if (this.currentSpeechId === speechId) {
                safeEnd();
              }
            };

            audio.onerror = (e) => {
              if (this.currentSpeechId === speechId) {
                console.warn('Audio playback error, falling back to browser speech synthesis', e);
                this.speakWithBrowser(cleanText, settings, speechId, onStart, safeEnd, onError);
              }
            };

            try {
              await audio.play();
              return;
            } catch (playErr) {
              // Autoplay policy or playback error: immediately fallback to browser synthesis
              if (this.currentSpeechId === speechId) {
                this.speakWithBrowser(cleanText, settings, speechId, onStart, safeEnd, onError);
              }
              return;
            }
          }
        }
      } catch (err) {
        clearTimeout(fetchTimeout);
        // Fallback gracefully if TTS fetch failed or timed out
      }
    }

    if (this.currentSpeechId !== speechId) return;

    // Fallback: Browser Web SpeechSynthesis (Fast, offline, zero-latency)
    this.speakWithBrowser(cleanText, settings, speechId, onStart, safeEnd, onError);
  }

  private speakWithBrowser(
    text: string,
    settings: VoiceSettings,
    speechId: number,
    onStart?: () => void,
    safeEnd?: () => void,
    onError?: (err: any) => void
  ) {
    if (this.currentSpeechId !== speechId) return;

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('SpeechSynthesis not supported in this browser.');
      onError?.(new Error('Speech synthesis not supported'));
      safeEnd?.();
      return;
    }

    // Reset synthesis queue
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}

    const utterance = new SpeechSynthesisUtterance(text);
    this.currentUtterance = utterance;

    // Refresh voice if needed
    if (!this.hindiVoice) {
      this.initVoices();
    }

    if (this.hindiVoice) {
      utterance.voice = this.hindiVoice;
    }

    utterance.lang = 'hi-IN';
    utterance.rate = settings.rate || 1.0;
    utterance.pitch = settings.pitch || 1.0;

    utterance.onstart = () => {
      if (this.currentSpeechId !== speechId) {
        try {
          window.speechSynthesis.cancel();
        } catch (e) {}
        return;
      }
      this.isCurrentlySpeaking = true;
      onStart?.();
    };

    utterance.onend = () => {
      if (this.currentSpeechId === speechId) {
        safeEnd?.();
      }
    };

    utterance.onerror = (e) => {
      this.isCurrentlySpeaking = false;
      this.currentUtterance = null;
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        console.warn('Speech synthesis error:', e);
        onError?.(e);
      }
      if (this.currentSpeechId === speechId) {
        safeEnd?.();
      }
    };

    this.isCurrentlySpeaking = true;
    window.speechSynthesis.speak(utterance);
  }

  public getSpeakingState(): boolean {
    return this.isCurrentlySpeaking;
  }
}

export const speechManager = new SpeechManager();
