
package com.veer.ai.assistant;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Locale;

/**
 * VEER Manual Speech Plugin
 * One-time Hindi voice recognition for the manual microphone button.
 */
@CapacitorPlugin(
    name = "VeerManualSpeech",
    permissions = {
        @Permission(
            alias = "microphone",
            strings = { Manifest.permission.RECORD_AUDIO }
        )
    }
)
public class VeerManualSpeechPlugin extends Plugin {

    private static final String TAG = "VeerManualSpeech";

    private SpeechRecognizer speechRecognizer;
    private PluginCall pendingCall;
    private boolean listening = false;

    @PluginMethod
    public void startListening(PluginCall call) {
        if (listening) {
            call.reject("माइक्रोफ़ोन पहले से चालू है।");
            return;
        }

        if (getPermissionState("microphone")
            != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias(
                "microphone",
                call,
                "microphonePermissionCallback"
            );
            return;
        }

        startRecognition(call);
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        if (getPermissionState("microphone")
            == com.getcapacitor.PermissionState.GRANTED) {
            startRecognition(call);
        } else {
            call.reject("माइक्रोफ़ोन की अनुमति नहीं मिली।");
        }
    }

    private void startRecognition(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject(
                "इस Android डिवाइस में आवाज़ पहचानने की सुविधा उपलब्ध नहीं है।"
            );
            return;
        }

        try {
            destroyRecognizer();

            pendingCall = call;
            listening = true;

            speechRecognizer =
                SpeechRecognizer.createSpeechRecognizer(getContext());

            speechRecognizer.setRecognitionListener(
                new RecognitionListener() {

                    @Override
                    public void onReadyForSpeech(Bundle params) {
                        JSObject data = new JSObject();
                        data.put("status", "listening");
                        notifyListeners("speechStatus", data);
                    }

                    @Override
                    public void onBeginningOfSpeech() {
                        JSObject data = new JSObject();
                        data.put("status", "hearing");
                        notifyListeners("speechStatus", data);
                    }

                    @Override
                    public void onRmsChanged(float rmsdB) {}

                    @Override
                    public void onBufferReceived(byte[] buffer) {}

                    @Override
                    public void onEndOfSpeech() {
                        JSObject data = new JSObject();
                        data.put("status", "processing");
                        notifyListeners("speechStatus", data);
                    }

                    @Override
                    public void onError(int error) {
                        finishWithError(error);
                    }

                    @Override
                    public void onResults(Bundle results) {
                        ArrayList<String> matches =
                            results.getStringArrayList(
                                SpeechRecognizer.RESULTS_RECOGNITION
                            );

                        String text = "";

                        if (matches != null && !matches.isEmpty()) {
                            text = matches.get(0);
                        }

                        finishWithResult(text);
                    }

                    @Override
                    public void onPartialResults(Bundle partialResults) {
                        ArrayList<String> matches =
                            partialResults.getStringArrayList(
                                SpeechRecognizer.RESULTS_RECOGNITION
                            );

                        if (matches != null && !matches.isEmpty()) {
                            JSObject data = new JSObject();
                            data.put("text", matches.get(0));
                            notifyListeners("partialResult", data);
                        }
                    }

                    @Override
                    public void onEvent(int eventType, Bundle params) {}
                }
            );

            Intent intent = new Intent(
                RecognizerIntent.ACTION_RECOGNIZE_SPEECH
            );

            intent.putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
            );

            intent.putExtra(
                RecognizerIntent.EXTRA_LANGUAGE,
                "hi-IN"
            );

            intent.putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE,
                "hi-IN"
            );

            intent.putExtra(
                RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE,
                false
            );

            intent.putExtra(
                RecognizerIntent.EXTRA_PARTIAL_RESULTS,
                true
            );

            intent.putExtra(
                RecognizerIntent.EXTRA_MAX_RESULTS,
                1
            );

            intent.putExtra(
                RecognizerIntent.EXTRA_PREFER_OFFLINE,
                true
            );

            intent.putExtra(
                RecognizerIntent.EXTRA_CALLING_PACKAGE,
                getContext().getPackageName()
            );

            speechRecognizer.startListening(intent);

        } catch (Exception e) {
            Log.e(TAG, "Speech recognition start failed", e);
            listening = false;
            destroyRecognizer();

            if (pendingCall != null) {
                pendingCall.reject(
                    "माइक शुरू नहीं हो सका: " + e.getMessage()
                );
                pendingCall = null;
            }
        }
    }

    private void finishWithResult(String text) {
        listening = false;

        PluginCall call = pendingCall;
        pendingCall = null;

        destroyRecognizer();

        if (call != null) {
            if (text == null || text.trim().isEmpty()) {
                call.reject("आवाज़ समझ में नहीं आई। दोबारा बोलें।");
                return;
            }

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("text", text.trim());
            call.resolve(result);
        }
    }

    private void finishWithError(int error) {
        listening = false;

        PluginCall call = pendingCall;
        pendingCall = null;

        destroyRecognizer();

        String message;

        switch (error) {
            case SpeechRecognizer.ERROR_AUDIO:
                message = "माइक्रोफ़ोन में समस्या आई।";
                break;

            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                message = "माइक्रोफ़ोन की अनुमति नहीं मिली।";
                break;

            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                message = "आवाज़ पहचानने के लिए नेटवर्क की समस्या आई।";
                break;

            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                message = "आवाज़ सुनाई नहीं दी। कृपया दोबारा बोलें।";
                break;

            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                message = "आवाज़ पहचानने की सुविधा व्यस्त है।";
                break;

            default:
                message = "आवाज़ पहचानने में समस्या आई। Error: " + error;
                break;
        }

        Log.w(TAG, message);

        if (call != null) {
            call.reject(message);
        }
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        try {
            if (speechRecognizer != null && listening) {
                speechRecognizer.stopListening();
            }

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("stopping", true);
            call.resolve(result);

        } catch (Exception e) {
            call.reject("माइक बंद नहीं हो सका: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancelListening(PluginCall call) {
        listening = false;

        PluginCall oldCall = pendingCall;
        pendingCall = null;

        destroyRecognizer();

        if (oldCall != null) {
            oldCall.reject("आवाज़ पहचान रद्द कर दी गई।");
        }

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("cancelled", true);
        call.resolve(result);
    }

    private void destroyRecognizer() {
        if (speechRecognizer != null) {
            try {
                speechRecognizer.cancel();
                speechRecognizer.destroy();
            } catch (Exception e) {
                Log.w(TAG, "Recognizer cleanup issue", e);
            }

            speechRecognizer = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        listening = false;

        if (pendingCall != null) {
            pendingCall.reject("ऐप बंद होने के कारण आवाज़ पहचान रुक गई।");
            pendingCall = null;
        }

        destroyRecognizer();
        super.handleOnDestroy();
    }
}
