export interface ChatMessage {
  id: string;
  sender: 'user' | 'veer';
  text: string;
  timestamp: string;
  isPlaying?: boolean;
  audioBlobUrl?: string | null;
  isError?: boolean;
  is503Error?: boolean;
  errorCode?: string;
  retryQuery?: string;
  modelUsed?: string;
}

export interface VoiceSettings {
  autoSpeak: boolean;
  rate: number; // 0.8 to 1.4
  pitch: number; // 0.8 to 1.2
  soundEffects: boolean;
  preferGeminiVoice: boolean;
}

export type HandsFreeMode = 'active' | 'standby' | 'disabled';

