package com.veer.ai.assistant;

import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "VeerNativeTTS")
public class VeerNativeTTSPlugin extends Plugin {
    private static final String TAG = "VeerNativeTTS";
    private TextToSpeech tts;
    private boolean ready = false;
    private PluginCall pendingInitCall;

    @Override
    public void load() {
        super.load();
        tts = new TextToSpeech(getContext().getApplicationContext(), status -> {
            ready = status == TextToSpeech.SUCCESS;
            if (ready) {
                int lang = tts.setLanguage(new Locale("hi", "IN"));
                ready = lang != TextToSpeech.LANG_MISSING_DATA && lang != TextToSpeech.LANG_NOT_SUPPORTED;
            }
            if (pendingInitCall != null) {
                PluginCall call = pendingInitCall;
                pendingInitCall = null;
                JSObject result = new JSObject();
                result.put("ready", ready);
                result.put("language", "hi-IN");
                if (ready) call.resolve(result);
                else call.reject("Hindi TTS उपलब्ध नहीं है। Android में Hindi voice data डाउनलोड करें।");
            }
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "").trim();
        double rate = call.getDouble("rate", 1.0);
        double pitch = call.getDouble("pitch", 1.0);
        if (text.isEmpty()) { call.reject("बोलने के लिए टेक्स्ट खाली है।"); return; }
        if (tts == null) { call.reject("Android TTS अभी शुरू नहीं हुआ।"); return; }
        if (!ready) { pendingInitCall = call; return; }
        getActivity().runOnUiThread(() -> {
            try {
                tts.stop();
                tts.setLanguage(new Locale("hi", "IN"));
                tts.setSpeechRate((float)Math.max(0.5, Math.min(1.5, rate)));
                tts.setPitch((float)Math.max(0.7, Math.min(1.3, pitch)));
                String utteranceId = "veer-" + System.nanoTime();
                AtomicBoolean finished = new AtomicBoolean(false);
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) {
                        JSObject data = new JSObject(); data.put("utteranceId", id);
                        notifyListeners("speechStarted", data);
                    }
                    @Override public void onDone(String id) {
                        if (finished.compareAndSet(false, true)) {
                            JSObject data = new JSObject(); data.put("utteranceId", id);
                            notifyListeners("speechFinished", data);
                            call.resolve(data);
                        }
                    }
                    @Override public void onError(String id) { fail(id, "Android TTS ने आवाज़ चलाने में त्रुटि दी।", call, finished); }
                    @Override public void onError(String id, int errorCode) { fail(id, "Android TTS त्रुटि कोड: " + errorCode, call, finished); }
                    private void fail(String id, String message, PluginCall c, AtomicBoolean once) {
                        if (once.compareAndSet(false, true)) c.reject(message);
                    }
                });
                int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
                if (result == TextToSpeech.ERROR) call.reject("Android TTS ने बोलना शुरू नहीं किया।");
            } catch (Exception e) {
                Log.e(TAG, "speak failed", e);
                call.reject("आवाज़ चलाने में समस्या: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try { if (tts != null) tts.stop(); call.resolve(); }
        catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject(); result.put("available", ready); result.put("language", "hi-IN"); call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); tts = null; }
        super.handleOnDestroy();
    }
}
