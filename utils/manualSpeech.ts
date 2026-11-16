
import { registerPlugin } from '@capacitor/core';

interface ManualSpeechPlugin {
  startListening(): Promise<{
    success: boolean;
    text: string;
  }>;

  stopListening(): Promise<{
    success: boolean;
    stopping: boolean;
  }>;

  cancelListening(): Promise<{
    success: boolean;
    cancelled: boolean;
  }>;

  addListener(
    eventName: 'partialResult',
    listenerFunc: (data: { text: string }) => void
  ): Promise<{ remove: () => Promise<void> }>;

  addListener(
    eventName: 'speechStatus',
    listenerFunc: (data: { status: string }) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

const ManualSpeech = registerPlugin<ManualSpeechPlugin>(
  'VeerManualSpeech'
);

export default ManualSpeech;
