import { Capacitor, registerPlugin } from '@capacitor/core';

export interface VeerVoicePluginInterface {
  startContinuousService(options?: { language?: string }): Promise<{ success: boolean; running: boolean }>;
  stopContinuousService(): Promise<{ success: boolean; running: boolean }>;
  pauseListening(): Promise<{ success: boolean; paused: boolean }>;
  resumeListening(): Promise<{ success: boolean; paused: boolean }>;
  isServiceRunning(): Promise<{ running: boolean; paused: boolean }>;
  addListener(
    eventName: 'onSpeechResult',
    listenerFunc: (data: { text: string }) => void
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: 'onPartialResult',
    listenerFunc: (data: { text: string }) => void
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: 'onServiceStopped',
    listenerFunc: (data: { reason: string }) => void
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: 'onStatusChanged',
    listenerFunc: (data: { status: string }) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

export const VeerVoiceNative = registerPlugin<VeerVoicePluginInterface>('VeerVoiceService');

/**
 * Check if the application is currently running inside native Android runtime (Capacitor)
 */
export const isNativeAndroid = (): boolean => {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
};

class NativeVoiceService {
  private activeListeners: Array<{ remove: () => Promise<void> }> = [];
  private isNativeActive: boolean = false;

  public async startContinuousService(
    callbacks: {
      onSpeechResult: (text: string) => void;
      onPartialResult?: (text: string) => void;
      onServiceStopped?: (reason: string) => void;
      onStatusChanged?: (status: string) => void;
    }
  ): Promise<boolean> {
    if (!isNativeAndroid()) {
      return false;
    }

    try {
      await this.clearListeners();

      const resultListener = await VeerVoiceNative.addListener('onSpeechResult', (data) => {
        if (data && data.text) {
          callbacks.onSpeechResult(data.text);
        }
      });
      this.activeListeners.push(resultListener);

      if (callbacks.onPartialResult) {
        const partialListener = await VeerVoiceNative.addListener('onPartialResult', (data) => {
          if (data && data.text) {
            callbacks.onPartialResult?.(data.text);
          }
        });
        this.activeListeners.push(partialListener);
      }

      if (callbacks.onServiceStopped) {
        const stopListener = await VeerVoiceNative.addListener('onServiceStopped', (data) => {
          this.isNativeActive = false;
          callbacks.onServiceStopped?.(data?.reason || 'Service stopped');
        });
        this.activeListeners.push(stopListener);
      }

      if (callbacks.onStatusChanged) {
        const statusListener = await VeerVoiceNative.addListener('onStatusChanged', (data) => {
          if (data && data.status) {
            callbacks.onStatusChanged?.(data.status);
          }
        });
        this.activeListeners.push(statusListener);
      }

      const res = await VeerVoiceNative.startContinuousService();
      this.isNativeActive = !!res.success;
      return this.isNativeActive;
    } catch (err) {
      console.warn('[VEER NativeVoiceService] start failed:', err);
      return false;
    }
  }

  public async stopContinuousService(): Promise<void> {
    if (!isNativeAndroid()) return;
    try {
      this.isNativeActive = false;
      await VeerVoiceNative.stopContinuousService();
    } catch (err) {
      console.warn('[VEER NativeVoiceService] stop failed:', err);
    } finally {
      await this.clearListeners();
    }
  }

  public async pauseListening(): Promise<void> {
    if (!isNativeAndroid() || !this.isNativeActive) return;
    try {
      await VeerVoiceNative.pauseListening();
    } catch (e) {}
  }

  public async resumeListening(): Promise<void> {
    if (!isNativeAndroid() || !this.isNativeActive) return;
    try {
      await VeerVoiceNative.resumeListening();
    } catch (e) {}
  }

  public async isRunning(): Promise<boolean> {
    if (!isNativeAndroid()) return false;
    try {
      const state = await VeerVoiceNative.isServiceRunning();
      return state.running;
    } catch (e) {
      return false;
    }
  }

  private async clearListeners(): Promise<void> {
    for (const l of this.activeListeners) {
      try {
        await l.remove();
      } catch (e) {}
    }
    this.activeListeners = [];
  }
}

export const nativeVoiceService = new NativeVoiceService();
