package com.veer.ai.assistant;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * VeerVoicePlugin
 *
 * Capacitor Native Plugin bridging the Web application UI with the native
 * Android Foreground Service (VeerVoiceForegroundService).
 *
 * Enables continuous voice recognition while phone screen is turned off.
 */
@CapacitorPlugin(
    name = "VeerVoiceService",
    permissions = {
        @Permission(
            alias = "microphone",
            strings = { Manifest.permission.RECORD_AUDIO }
        ),
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class VeerVoicePlugin extends Plugin {
    private static final String TAG = "VeerVoicePlugin";

    @Override
    public void load() {
        super.load();
        setupServiceListener();
    }

    private void setupServiceListener() {
        VeerVoiceForegroundService.setListener(new VeerVoiceForegroundService.VoiceServiceListener() {
            @Override
            public void onSpeechResult(String text) {
                JSObject data = new JSObject();
                data.put("text", text);
                notifyListeners("onSpeechResult", data);
            }

            @Override
            public void onPartialResult(String text) {
                JSObject data = new JSObject();
                data.put("text", text);
                notifyListeners("onPartialResult", data);
            }

            @Override
            public void onServiceStopped(String reason) {
                JSObject data = new JSObject();
                data.put("reason", reason);
                notifyListeners("onServiceStopped", data);
            }

            @Override
            public void onStatusChanged(String status) {
                JSObject data = new JSObject();
                data.put("status", status);
                notifyListeners("onStatusChanged", data);
            }
        });
    }

    @PluginMethod
    public void startContinuousService(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermsCallback");
            return;
        }

        // On Android 13+, check POST_NOTIFICATIONS permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (getPermissionState("notifications") != PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "notificationsPermsCallback");
                return;
            }
        }

        startServiceInternal(call);
    }

    @PermissionCallback
    private void microphonePermsCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            // Check notifications if Android 13+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                getPermissionState("notifications") != PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "notificationsPermsCallback");
            } else {
                startServiceInternal(call);
            }
        } else {
            call.reject("माइक्रोफ़ोन की अनुमति अस्वीकृत कर दी गई।");
        }
    }

    @PermissionCallback
    private void notificationsPermsCallback(PluginCall call) {
        // Even if notification permission is denied on Android 13, proceed to start if mic granted
        startServiceInternal(call);
    }

    private void startServiceInternal(PluginCall call) {
        try {
            setupServiceListener();
            Intent serviceIntent = new Intent(getContext(), VeerVoiceForegroundService.class);
            serviceIntent.setAction(VeerVoiceForegroundService.ACTION_START);
            ContextCompat.startForegroundService(getContext(), serviceIntent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("running", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error starting VeerVoiceForegroundService: " + e.getMessage());
            call.reject("सर्विस शुरू करने में त्रुटि: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopContinuousService(PluginCall call) {
        try {
            Intent serviceIntent = new Intent(getContext(), VeerVoiceForegroundService.class);
            serviceIntent.setAction(VeerVoiceForegroundService.ACTION_STOP);
            getContext().startService(serviceIntent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("running", false);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error stopping VeerVoiceForegroundService: " + e.getMessage());
            call.reject("सर्विस बंद करने में त्रुटि: " + e.getMessage());
        }
    }

    @PluginMethod
    public void pauseListening(PluginCall call) {
        try {
            Intent serviceIntent = new Intent(getContext(), VeerVoiceForegroundService.class);
            serviceIntent.setAction(VeerVoiceForegroundService.ACTION_PAUSE);
            getContext().startService(serviceIntent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("paused", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("त्रुटि: " + e.getMessage());
        }
    }

    @PluginMethod
    public void resumeListening(PluginCall call) {
        try {
            Intent serviceIntent = new Intent(getContext(), VeerVoiceForegroundService.class);
            serviceIntent.setAction(VeerVoiceForegroundService.ACTION_RESUME);
            getContext().startService(serviceIntent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("paused", false);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("त्रुटि: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isServiceRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", VeerVoiceForegroundService.isRunning());
        ret.put("paused", VeerVoiceForegroundService.isPausedListening());
        call.resolve(ret);
    }
}
