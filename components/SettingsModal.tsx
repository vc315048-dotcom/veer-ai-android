import React from 'react';
import { X, Volume2, Gauge, Music, Trash2, Shield, Info, Sparkles, Mic } from 'lucide-react';
import { VoiceSettings } from '../types';
import { soundFx } from '../utils/soundEffects';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  voiceSettings: VoiceSettings;
  onUpdateSettings: (newSettings: Partial<VoiceSettings>) => void;
  onClearChat: () => void;
  continuousModeEnabled?: boolean;
  onToggleContinuousMode?: (forced?: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  voiceSettings,
  onUpdateSettings,
  onClearChat,
  continuousModeEnabled = true,
  onToggleContinuousMode,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      {/* Modal Card / Bottom Sheet */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80 bg-slate-950/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-500 flex items-center justify-center text-white">
              <Shield className="w-4 h-4 fill-white/20" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">वीर सेटिंग्स</h3>
              <p className="text-[11px] text-slate-400">आवाज़ और प्राथमिकताएं</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800/80 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto custom-scrollbar">
          {/* Setting 0: Continuous Listening (लगातार सुनना) */}
          {onToggleContinuousMode && (
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/70 border border-emerald-500/30 shadow-sm">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-xl ${continuousModeEnabled ? 'bg-emerald-950/70 text-emerald-400 ring-1 ring-emerald-500/40' : 'bg-slate-800/60 text-slate-400'}`}>
                  <Mic className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <span>लगातार सुनना (Continuous Mode)</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${continuousModeEnabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                      {continuousModeEnabled ? 'चालू (ON)' : 'बंद (OFF)'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    AI का जवाब बोलने के बाद माइक खुद दोबारा चालू होगा
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleContinuousMode()}
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                  continuousModeEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
                aria-label="Toggle continuous mode"
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform transform shadow-md ${
                    continuousModeEnabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          )}

          {/* Setting 1: Auto-Speak Aloud */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800/80">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-cyan-950/60 text-cyan-400">
                <Volume2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-200">
                  जवाब बोलकर सुनाएं
                </div>
                <div className="text-xs text-slate-400">
                  हर उत्तर को स्वचालित रूप से हिन्दी में बोलें
                </div>
              </div>
            </div>
            <button
              onClick={() =>
                onUpdateSettings({ autoSpeak: !voiceSettings.autoSpeak })
              }
              className={`w-12 h-6 rounded-full transition-colors relative ${
                voiceSettings.autoSpeak ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform transform shadow-md ${
                  voiceSettings.autoSpeak ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Setting 2: Speech Speed */}
          <div className="p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-amber-950/60 text-amber-400">
                  <Gauge className="w-4 h-4" />
                </div>
                <div className="text-sm font-semibold text-slate-200">
                  बोलने की गति (Speech Speed)
                </div>
              </div>
              <span className="text-xs font-mono text-amber-400 font-bold">
                {voiceSettings.rate}x
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { label: 'धीमी (0.85x)', val: 0.85 },
                { label: 'सामान्य (1.0x)', val: 1.0 },
                { label: 'तेज़ (1.2x)', val: 1.2 },
              ].map((item) => (
                <button
                  key={item.val}
                  onClick={() => onUpdateSettings({ rate: item.val })}
                  className={`py-2 px-1 text-xs rounded-xl font-medium border transition-all ${
                    voiceSettings.rate === item.val
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Setting 3: Sound Effects */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800/80">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-purple-950/60 text-purple-400">
                <Music className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-200">
                  सुपरहीरो साउंड इफेक्ट्स
                </div>
                <div className="text-xs text-slate-400">
                  माइक एक्टिवेशन और एक्शन चाइम ध्वनियां
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                const newVal = !voiceSettings.soundEffects;
                soundFx.enabled = newVal;
                onUpdateSettings({ soundEffects: newVal });
              }}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                voiceSettings.soundEffects ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform transform shadow-md ${
                  voiceSettings.soundEffects ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Setting 4: Prefer Gemini Cloud Voice */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800/80">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-emerald-950/60 text-emerald-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-200">
                  एचडी एआई वॉइस (Gemini TTS)
                </div>
                <div className="text-xs text-slate-400">
                  उच्च गुणवत्ता स्टूडियो आवाज़ (उपलब्ध होने पर)
                </div>
              </div>
            </div>
            <button
              onClick={() =>
                onUpdateSettings({
                  preferGeminiVoice: !voiceSettings.preferGeminiVoice,
                })
              }
              className={`w-12 h-6 rounded-full transition-colors relative ${
                voiceSettings.preferGeminiVoice ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform transform shadow-md ${
                  voiceSettings.preferGeminiVoice
                    ? 'translate-x-6'
                    : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Screen-Off & WakeLock Android Architecture Card */}
          <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 space-y-2">
            <div className="flex items-center space-x-1.5 font-bold text-amber-300">
              <Shield className="w-4 h-4 text-amber-400" />
              <span>स्क्रीन बंद होने पर सुनना (Android vs Web App):</span>
            </div>
            
            <p className="text-slate-300 text-[11.5px] leading-relaxed">
              <strong>वेब ब्राउज़र सीमा:</strong> Android Chrome सुरक्षा नीति किसी भी वेबसाइट या वेब ऐप को स्क्रीन लॉक होने पर बैकग्राउंड में माइक्रोफ़ोन रिकॉर्ड करने की अनुमति नहीं देती। बातचीत जारी रखने के लिए VEER <strong>Screen WakeLock</strong> का उपयोग करता है जिससे स्क्रीन बातचीत के दौरान खुद बंद नहीं होती।
            </p>

            <div className="pt-1 border-t border-amber-500/20 text-[11px] text-slate-300">
              <div className="font-semibold text-amber-300 mb-1">
                🔒 फोन लॉक होने पर सुनने के लिए क्या चाहिए? (Native APK):
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                <li><strong className="text-slate-300">Android Foreground Service:</strong> <code className="text-amber-300 text-[10px]">type="microphone"</code> + स्टेटस बार नोटिफिकेशन</li>
                <li><strong className="text-slate-300">CPU WakeLock:</strong> <code className="text-amber-300 text-[10px]">PARTIAL_WAKE_LOCK</code> ताकि स्क्रीन ऑफ पर CPU न सोए</li>
                <li><strong className="text-slate-300">Battery Unrestricted:</strong> Doze mode से सुरक्षा</li>
                <li><strong className="text-slate-300">On-Device Hotword:</strong> "वीर" पहचानने के लिए ऑन-डिवाइस मॉडल</li>
              </ul>
            </div>
          </div>

          {/* Guide Card */}
          <div className="p-3.5 rounded-2xl bg-blue-950/30 border border-blue-900/40 text-xs text-blue-200/90 space-y-1.5">
            <div className="flex items-center space-x-1.5 font-bold text-blue-300">
              <Info className="w-4 h-4" />
              <span>वीर के साथ बेहतरीन अनुभव के लिए टिप्स:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11.5px] leading-relaxed">
              <li>माइक बटन दबाने के बाद स्पष्ट हिन्दी में बोलें।</li>
              <li>लगातार सुनना चालू रखने पर फोन की स्क्रीन खुली रहती है और आप हैंड्स-फ़्री बात कर सकते हैं।</li>
              <li>दिनचर्या, विज्ञान, गणित, विचार, चुटकुले कुछ भी पूछ सकते हैं।</li>
              <li>पूरी तरह से निःशुल्क व सुरक्षित।</li>
            </ul>
          </div>

          {/* Clear History Button */}
          <button
            onClick={() => {
              onClearChat();
              onClose();
            }}
            className="w-full py-3 rounded-2xl bg-rose-950/40 border border-rose-900/60 hover:bg-rose-900/50 text-rose-300 font-semibold text-xs transition-colors flex items-center justify-center space-x-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>सारी बातचीत हटाएं (Clear Chat)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
