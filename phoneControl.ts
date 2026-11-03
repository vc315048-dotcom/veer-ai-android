import { registerPlugin, Capacitor } from '@capacitor/core';

export type VeerApp = 'whatsapp' | 'instagram' | 'facebook' | 'youtube' | 'chrome' | 'settings';
interface PhoneControlPlugin {
  openApp(options: { app: VeerApp }): Promise<{ opened: boolean }>;
  shareText(options: { text: string; title?: string }): Promise<{ opened: boolean }>;
  openAccessibilitySettings(): Promise<{ opened: boolean }>;
}

const NativePhoneControl = registerPlugin<PhoneControlPlugin>('VeerPhoneControl');

export const phoneControl = {
  isAvailable: () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android',
  async openApp(app: VeerApp) {
    if (!this.isAvailable()) throw new Error('फोन कंट्रोल केवल Android ऐप में उपलब्ध है।');
    return NativePhoneControl.openApp({ app });
  },
  /** Invoke only from an explicit user-approved button. Android opens a chooser; it never sends. */
  async shareAfterApproval(text: string, title = 'VEER से साझा करें') {
    if (!this.isAvailable()) throw new Error('यह सुविधा Android ऐप में उपलब्ध है।');
    if (!text.trim()) throw new Error('साझा करने के लिए टेक्स्ट खाली है।');
    return NativePhoneControl.shareText({ text, title });
  },
  async openAccessibilitySettings() {
    if (!this.isAvailable()) throw new Error('यह सुविधा Android ऐप में उपलब्ध है।');
    return NativePhoneControl.openAccessibilitySettings();
  },
};
