import { apiUrl } from './api';


type LiveVoiceCallbacks = {
  onListening: (active: boolean) => void;
  onSpeaking: (active: boolean) => void;
  onTranscript?: (text: string) => void;
  onError: (message: string) => void;
};

const MODEL = 'gemini-3.8-live';

function floatToPcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function resampleTo16k(input: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === 16000) return input;
  const ratio = sourceRate / 16000;
  const output = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < output.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    output[i] = sum / Math.max(1, end - start);
  }
  return output;
}

export class VeerLiveVoice {
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private nextPlayTime = 0;
  private playbackSources = new Set<AudioBufferSourceNode>();
  private stopped = true;
  private callbacks: LiveVoiceCallbacks | null = null;
  private setupReady = false;

  async start(callbacks: LiveVoiceCallbacks): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof WebSocket === 'undefined') {
      throw new Error('इस डिवाइस में Live माइक्रोफ़ोन उपलब्ध नहीं है।');
    }
    await this.stop();
    this.callbacks = callbacks;
    this.stopped = false;
    try {
      const tokenResponse = await fetch(apiUrl('/api/live-token', { method: 'POST' });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData?.token) {
        throw new Error(tokenData?.error || 'Live Voice token नहीं मिला।');
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.audioContext = new AudioContext();
      await this.audioContext.resume();

      const url = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=' + encodeURIComponent(tokenData.token);
      this.socket = new WebSocket(url);
      await new Promise<void>((resolve, reject) => {
        const socket = this.socket!;
        const timeout = window.setTimeout(() => reject(new Error('Live Voice कनेक्शन में समय लग रहा है।')), 15000);
        socket.onopen = () => {
          window.clearTimeout(timeout);
          socket.send(JSON.stringify({ setup: {
            model: 'models/' + MODEL,
            generation_config: {
              response_modalities: ['AUDIO'],
              speech_config: { voice_config: { prebuilt_voice_config: { voice_name: 'Kore' } } },
            },
            input_audio_transcription: {},
            output_audio_transcription: {},
            realtime_input_config: { automatic_activity_detection: { disabled: false, silence_duration_ms: 1200 } },
            system_instruction: { parts: [{ text: 'आप वीर हैं। उपयोगकर्ता से स्वाभाविक, दोस्ताना और स्पष्ट हिन्दी में बात करें। उत्तर बोलचाल के हों और सामान्यतः छोटे रखें। उपयोगकर्ता बोलना शुरू करे तो अपनी आवाज़ तुरंत रोकें और उसे सुनें।' }] },
          } }));
        };
        socket.onmessage = (event) => {
          void this.handleMessage(event);
          try {
            const parsed = JSON.parse(typeof event.data === 'string' ? event.data : '');
            if (parsed.setupComplete) {
              window.clearTimeout(timeout);
              this.setupReady = true;
              resolve();
            }
          } catch {}
        };
        socket.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error('Live Voice सर्वर से कनेक्शन नहीं बन पाया।'));
        };
        socket.onclose = (event) => {
          window.clearTimeout(timeout);
          if (!this.stopped) callbacks.onError('Live Voice कनेक्शन बंद हुआ (' + event.code + ')');
          reject(new Error('Live Voice कनेक्शन बंद हो गया।'));
        };
      });

      if (this.stopped) return;
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = (event) => {
        const silentOutput = event.outputBuffer.getChannelData(0);
        silentOutput.fill(0);
        if (this.stopped || !this.setupReady || this.socket?.readyState !== WebSocket.OPEN) return;
        const pcm = resampleTo16k(event.inputBuffer.getChannelData(0), this.audioContext?.sampleRate || 48000);
        this.socket.send(JSON.stringify({ realtime_input: { audio: {
          mime_type: 'audio/pcm;rate=16000', data: floatToPcm16Base64(pcm),
        } } }));
      };
      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
      callbacks.onListening(true);
    } catch (error: any) {
      await this.stop();
      throw error;
    }
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    let raw = event.data;
    if (raw instanceof Blob) raw = await raw.text();
    if (typeof raw !== 'string') return;
    try {
      const message = JSON.parse(raw);
      if (message.serverContent?.interrupted || message.serverContent?.generationComplete === false && message.serverContent?.turnComplete === false) this.stopPlayback();
      const transcript = message.serverContent?.inputTranscription?.text || message.serverContent?.outputTranscription?.text;
      if (transcript) this.callbacks?.onTranscript?.(transcript);
      const parts = message.serverContent?.modelTurn?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith('audio/pcm') && part.inlineData.data) {
          this.playPcm(part.inlineData.data);
        }
      }
      if (message.serverContent?.turnComplete) {
        this.callbacks?.onSpeaking(false);
        this.callbacks?.onListening(true);
      }
    } catch (error) {
      console.warn('[VEER Live] message parse failed', error);
    }
  }

  private playPcm(base64: string): void {
    if (!this.audioContext) return;
    const binary = atob(base64);
    const samples = new Int16Array(binary.length / 2);
    for (let i = 0; i < samples.length; i++) {
      const lo = binary.charCodeAt(i * 2);
      const hi = binary.charCodeAt(i * 2 + 1);
      samples[i] = (hi << 8) | lo;
    }
    const buffer = this.audioContext.createBuffer(1, samples.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    const startAt = Math.max(this.audioContext.currentTime, this.nextPlayTime);
    source.start(startAt);
    this.nextPlayTime = startAt + buffer.duration;
    this.playbackSources.add(source);
    source.onended = () => this.playbackSources.delete(source);
    this.callbacks?.onSpeaking(true);
    this.callbacks?.onListening(false);
  }

  stopPlayback(): void {
    for (const source of this.playbackSources) {
      try { source.stop(); } catch {}
    }
    this.playbackSources.clear();
    this.nextPlayTime = this.audioContext?.currentTime || 0;
    this.callbacks?.onSpeaking(false);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.setupReady = false;
    this.stopPlayback();
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    }
    if (this.audioContext) {
      await this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.callbacks?.onListening(false);
    this.callbacks = null;
  }
}
