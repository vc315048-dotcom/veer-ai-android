package com.veer.ai.assistant;

import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;
import android.media.AudioAttributes;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "VeerNativeTTS")
public class VeerNativeTTSPlugin extends Plugin {
    private static final String TAG = "VeerNativeTTS";
    private TextToSpeech tts;
    private boolean ready = false;
    private PluginCall pendingInitCall;
    private PluginCall activeSpeakCall;
    private AtomicBoolean activeFinished;
    private int speakSession = 0;

    @Override
    public void load() {
        super.load();
        tts = new TextToSpeech(
            getContext().getApplicationContext(),
            status -> {
                ready = status == TextToSpeech.SUCCESS;

                if (ready) {
                    int lang = tts.setLanguage(new Locale("hi", "IN"));
                    ready = lang != TextToSpeech.LANG_MISSING_DATA
                        && lang != TextToSpeech.LANG_NOT_SUPPORTED;
                }

                if (pendingInitCall != null) {
                    PluginCall call = pendingInitCall;
                    pendingInitCall = null;

                    JSObject result = new JSObject();
                    result.put("ready", ready);
                    result.put("language", "hi-IN");

                    if (ready) {
                        call.resolve(result);
                    } else {
                        call.reject("Hindi TTS उपलब्ध नहीं है। Android में Hindi voice data डाउनलोड करें।");
                    }
                }
            }
        );
    }

    // लंबे जवाब को Android TTS की सीमा के अनुसार छोटे हिस्सों में बाँटता है।
    private List<String> splitText(String text) {
        List<String> chunks = new ArrayList<>();

        int maxLength = Math.min(
            3500,
            TextToSpeech.getMaxSpeechInputLength() - 100
        );

        if (maxLength < 500) {
            maxLength = 3500;
        }

        String remaining = text.trim();

        while (!remaining.isEmpty()) {
            if (remaining.length() <= maxLength) {
                chunks.add(remaining);
                break;
            }

            int cut = remaining.lastIndexOf(' ', maxLength);

            if (cut < maxLength / 2) {
                cut = maxLength;
            }

            // किसी Unicode surrogate pair को बीच से न काटें।
            if (cut > 0 && cut < remaining.length()
                && Character.isHighSurrogate(remaining.charAt(cut - 1))
                && Character.isLowSurrogate(remaining.charAt(cut))) {
                cut--;
            }

            String part = remaining.substring(0, cut).trim();

            if (!part.isEmpty()) {
                chunks.add(part);
            }

            remaining = remaining.substring(cut).trim();
        }

        return chunks;
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "").trim();
        double rate = call.getDouble("rate", 1.0);
        double pitch = call.getDouble("pitch", 1.0);

        if (text.isEmpty()) {
            call.reject("बोलने के लिए टेक्स्ट खाली है।");
            return;
        }

        if (tts == null) {
            call.reject("Android TTS अभी शुरू नहीं हुआ।");
            return;
        }

        if (!ready) {
            pendingInitCall = call;
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                // पुरानी आवाज़ और पुराने अनुरोध को रोकें।
                if (activeSpeakCall != null && activeFinished != null
                    && activeFinished.compareAndSet(false, true)) {
                    activeSpeakCall.reject("नई आवाज़ शुरू की गई।");
                }

                tts.stop();

                final int thisSession = ++speakSession;
                final AtomicBoolean finished = new AtomicBoolean(false);

                activeSpeakCall = call;
                activeFinished = finished;

                tts.setLanguage(new Locale("hi", "IN"));

                if (android.os.Build.VERSION.SDK_INT
                    >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                    tts.setAudioAttributes(
                        new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    );
                }

                tts.setSpeechRate(
                    (float) Math.max(0.5, Math.min(1.5, rate))
                );
                tts.setPitch(
                    (float) Math.max(0.7, Math.min(1.3, pitch))
                );

                List<String> chunks = splitText(text);

                if (chunks.isEmpty()) {
                    call.reject("बोलने के लिए टेक्स्ट खाली है।");
                    return;
                }

                final String utterancePrefix =
                    "veer-" + System.nanoTime() + "-";

                final int lastChunk = chunks.size() - 1;

                tts.setOnUtteranceProgressListener(
                    new UtteranceProgressListener() {

                        @Override
                        public void onStart(String id) {
                            if (thisSession != speakSession) return;

                            JSObject data = new JSObject();
                            data.put("utteranceId", id);
                            notifyListeners("speechStarted", data);
                        }

                        @Override
                        public void onDone(String id) {
                            if (thisSession != speakSession) return;

                            if (id.equals(utterancePrefix + lastChunk)
                                && finished.compareAndSet(false, true)) {

                                JSObject data = new JSObject();
                                data.put("utteranceId", id);

                                notifyListeners("speechFinished", data);
                                call.resolve(data);

                                activeSpeakCall = null;
                                activeFinished = null;
                            }
                        }

                        @Override
                        public void onError(String id) {
                            fail(
                                "Android TTS ने आवाज़ चलाने में त्रुटि दी।"
                            );
                        }

                        @Override
                        public void onError(String id, int errorCode) {
                            fail("Android TTS त्रुटि कोड: " + errorCode);
                        }

                        private void fail(String message) {
                            if (thisSession != speakSession) return;

                            if (finished.compareAndSet(false, true)) {
                                call.reject(message);
                                activeSpeakCall = null;
                                activeFinished = null;
                            }
                        }
                    }
                );

                // सारे हिस्से क्रम से queue में भेजें।
                for (int i = 0; i < chunks.size(); i++) {
                    String utteranceId = utterancePrefix + i;

                    int queueMode = (i == 0)
                        ? TextToSpeech.QUEUE_FLUSH
                        : TextToSpeech.QUEUE_ADD;

                    int result = tts.speak(
                        chunks.get(i),
                        queueMode,
                        null,
                        utteranceId
                    );

                    if (result == TextToSpeech.ERROR) {
                        if (finished.compareAndSet(false, true)) {
                            activeSpeakCall = null;
                            activeFinished = null;
                            call.reject("Android TTS ने बोलना शुरू नहीं किया।");
                        }
                        tts.stop();
                        return;
                    }
                }

            } catch (Exception e) {
                Log.e(TAG, "speak failed", e);
                call.reject("आवाज़ चलाने में समस्या: " + e.getMessage());
            }
        });
    }
       @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                speakSession++;

                if (activeSpeakCall != null && activeFinished != null
                    && activeFinished.compareAndSet(false, true)) {
                    activeSpeakCall.reject("बोलना रोक दिया गया।");
                }

                activeSpeakCall = null;
                activeFinished = null;

                if (tts != null) {
                    tts.stop();
                }

                call.resolve();

            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", ready);
        result.put("language", "hi-IN");
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        speakSession++;

        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }

        super.handleOnDestroy();
    }
} 
