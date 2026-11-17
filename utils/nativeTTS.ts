import { Capacitor, registerPlugin } from '@capacitor/core';

interface NativeTTSPlugin {
  speak(options: { text: string; rate?: number; pitch?: number }): Promise<{ utteranceId?: string }>;
  addListener(eventName: 'speechStarted', listener: (event: { utteranceId?: string }) => void): Promise<{ remove: () => Promise<void> }>;
  stop(): Promise<void>;
  isAvailable(): Promise<{ available: boolean; language: string }>;
}

const NativeTTS = registerPlugin<NativeTTSPlugin>('VeerNativeTTS');
// Use the explicit Capacitor platform instead of isNativePlatform() so Android
// builds always select the registered Java plugin and never fall through to Web Speech.
export const isNativeTTSAvailable = () => Capacitor.getPlatform() === 'android';
export const nativeTTS = NativeTTS;
