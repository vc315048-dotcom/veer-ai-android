package com.veer.ai.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.util.ArrayList;

/**
 * VeerVoiceForegroundService
 *
 * Native Android Foreground Service for VEER Personal AI Superhero Assistant.
 * Keeps microphone listening active while the service is allowed to run.
 *
 * Android microphone foreground-service permissions and background-start
 * restrictions still apply. The user must start this service while permitted.
 */
public class VeerVoiceForegroundService extends Service {
    private static final String TAG = "VeerVoiceService";

    public static final String ACTION_START = "com.veer.ai.assistant.action.START_CONTINUOUS_VOICE";
    public static final String ACTION_STOP = "com.veer.ai.assistant.action.STOP_CONTINUOUS_VOICE";
    public static final String ACTION_PAUSE = "com.veer.ai.assistant.action.PAUSE_LISTENING";
    public static final String ACTION_RESUME = "com.veer.ai.assistant.action.RESUME_LISTENING";

    private static final String CHANNEL_ID = "veer_continuous_voice_channel";
    private static final int NOTIFICATION_ID = 2026;

    private static boolean isServiceRunning = false;
    private static boolean isPaused = false;
    private static VoiceServiceListener serviceListener;

    private PowerManager.WakeLock wakeLock;
    private SpeechRecognizer speechRecognizer;
    private Handler mainHandler;
    private Runnable restartListeningRunnable;
    private boolean isListeningActive = false;
    private boolean awaitingWakeCommand = false;

    public interface VoiceServiceListener {
        void onSpeechResult(String text);
        void onPartialResult(String text);
        void onServiceStopped(String reason);
        void onStatusChanged(String status);
    }

    public static void setListener(VoiceServiceListener listener) {
        serviceListener = listener;
    }

    public static boolean isRunning() {
        return isServiceRunning;
    }

    public static boolean isPausedListening() {
        return isPaused;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        mainHandler = new Handler(Looper.getMainLooper());
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        Log.d(TAG, "onStartCommand received action: " + action);

        if (ACTION_STOP.equals(action)) {
            stopContinuousListening("उपयोगकर्ता ने सुनना बंद किया");
            return START_NOT_STICKY;
        }

        if (ACTION_PAUSE.equals(action)) {
            pauseRecognition();
            return START_STICKY;
        }

        if (ACTION_RESUME.equals(action)) {
            resumeRecognition();
            return START_STICKY;
        }

        if (ACTION_START.equals(action)) {
            startContinuousListening();
            return START_STICKY;
        }

        return START_NOT_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "वीर वॉइस असिस्टेंट (हैंड्स-फ़्री)",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("लगातार हिंदी आवाज़ सुनने और स्क्रीन बंद होने पर बात करने के लिए आवश्यक");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildPersistentNotification() {
        Intent stopIntent = new Intent(this, VeerVoiceForegroundService.class);
        stopIntent.setAction(ACTION_STOP);
        int pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingIntentFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent stopPendingIntent = PendingIntent.getService(this, 1, stopIntent, pendingIntentFlags);

        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPendingIntent = PendingIntent.getActivity(this, 0, openAppIntent, pendingIntentFlags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("वीर वॉइस असिस्टेंट सक्रिय है")
                .setContentText("स्क्रीन बंद होने पर भी आपकी आवाज़ सुन रहा है • वीर से बोलें")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentIntent(openPendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "सुनना बंद करें", stopPendingIntent)
                .build();
    }

    private void startContinuousListening() {
        if (isServiceRunning) {
            Log.d(TAG, "Service is already running");
            return;
        }

        isServiceRunning = true;
        isPaused = false;
        awaitingWakeCommand = false;

        Notification notification = buildPersistentNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        try {
            if (wakeLock == null) {
                PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (powerManager != null) {
                    wakeLock = powerManager.newWakeLock(
                            PowerManager.PARTIAL_WAKE_LOCK,
                            "Veer:ContinuousListeningWakeLock"
                    );
                    wakeLock.setReferenceCounted(false);
                    wakeLock.acquire(12 * 60 * 60 * 1000L);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to acquire WakeLock: " + e.getMessage());
        }

        mainHandler.post(this::initAndStartSpeechRecognizer);

        if (serviceListener != null) {
            serviceListener.onStatusChanged("वीर सुन रहा है (स्क्रीन बंद होने पर भी सक्रिय)");
        }
    }

    private void initAndStartSpeechRecognizer() {
        if (!isServiceRunning || isPaused) return;

        try {
            if (speechRecognizer == null) {
                if (!SpeechRecognizer.isRecognitionAvailable(this)) {
                    Log.e(TAG, "Speech recognition is not available on this device");
                    if (serviceListener != null) {
                        serviceListener.onStatusChanged("इस फोन में Speech Recognition उपलब्ध नहीं है");
                    }
                    return;
                }

                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
                speechRecognizer.setRecognitionListener(new RecognitionListener() {
                    @Override
                    public void onReadyForSpeech(Bundle params) {
                        isListeningActive = true;
                        Log.d(TAG, "SpeechRecognizer: onReadyForSpeech");
                    }

                    @Override
                    public void onBeginningOfSpeech() {
                        Log.d(TAG, "SpeechRecognizer: onBeginningOfSpeech");
                    }

                    @Override
                    public void onRmsChanged(float rmsdB) { }

                    @Override
                    public void onBufferReceived(byte[] buffer) { }

                    @Override
                    public void onEndOfSpeech() {
                        isListeningActive = false;
                        Log.d(TAG, "SpeechRecognizer: onEndOfSpeech");
                    }

                    @Override
                    public void onError(int error) {
                        isListeningActive = false;
                        Log.w(TAG, "SpeechRecognizer onError: " + error);

                        if (!isServiceRunning || isPaused) return;

                        if (error == SpeechRecognizer.ERROR_NO_MATCH ||
                                error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                            scheduleRestartListening(400);
                        } else if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                            stopContinuousListening("माइक्रोफ़ोन अनुमति नहीं है");
                        } else {
                            scheduleRestartListening(1000);
                        }
                    }

                    @Override
                    public void onResults(Bundle results) {
                        isListeningActive = false;

                        ArrayList<String> matches = results.getStringArrayList(
                                SpeechRecognizer.RESULTS_RECOGNITION);
                        String spokenText = (matches != null && !matches.isEmpty())
                                ? matches.get(0) : null;

                        if (spokenText == null || spokenText.trim().isEmpty()) {
                            if (isServiceRunning && !isPaused) {
                                scheduleRestartListening(450);
                            }
                            return;
                        }

                        String commandText;
                        if (awaitingWakeCommand) {
                            commandText = spokenText.trim();
                            awaitingWakeCommand = false;
                        } else {
                            String normalized = spokenText.trim().toLowerCase(java.util.Locale.ROOT);
                            java.util.regex.Matcher wakeMatcher = java.util.regex.Pattern
                                    .compile("(वीर\\s*सुनो?|veer\\s*suno?)",
                                            java.util.regex.Pattern.CASE_INSENSITIVE)
                                    .matcher(normalized);

                            if (!wakeMatcher.find()) {
                                Log.d(TAG, "Ignored speech without VEER wake word");
                                if (isServiceRunning && !isPaused) {
                                    scheduleRestartListening(450);
                                }
                                return;
                            }

                            commandText = spokenText.substring(wakeMatcher.end()).trim();
                            commandText = commandText.replaceFirst("^[\\s,，:;.!?।-]+", "").trim();

                            if (commandText.isEmpty()) {
                                awaitingWakeCommand = true;
                                if (serviceListener != null) {
                                    serviceListener.onStatusChanged("जी, बोलिए। वीर सुन रहा है...");
                                }
                                if (isServiceRunning && !isPaused) {
                                    scheduleRestartListening(350);
                                }
                                return;
                            }
                        }

                        Log.d(TAG, "VEER wake word accepted");
                        pauseRecognition();
                        if (serviceListener != null) {
                            serviceListener.onSpeechResult(commandText);
                        }
                    }

                    @Override
                    public void onPartialResults(Bundle partialResults) {
                        ArrayList<String> partials = partialResults.getStringArrayList(
                                SpeechRecognizer.RESULTS_RECOGNITION);
                        if (partials != null && !partials.isEmpty()) {
                            String text = partials.get(0);
                            if (text != null && !text.trim().isEmpty() && serviceListener != null) {
                                serviceListener.onPartialResult(text.trim());
                            }
                        }
                    }

                    @Override
                    public void onEvent(int eventType, Bundle params) { }
                });
            }

            Intent recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "hi-IN");
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "hi-IN");
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, "hi-IN");
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            recognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);

            speechRecognizer.startListening(recognizerIntent);
            isListeningActive = true;
        } catch (Exception e) {
            Log.e(TAG, "Error starting SpeechRecognizer: " + e.getMessage());
            scheduleRestartListening(1500);
        }
    }

    private void scheduleRestartListening(long delayMillis) {
        if (!isServiceRunning || isPaused) return;

        if (restartListeningRunnable != null) {
            mainHandler.removeCallbacks(restartListeningRunnable);
        }

        restartListeningRunnable = () -> {
            if (isServiceRunning && !isPaused && !isListeningActive) {
                initAndStartSpeechRecognizer();
            }
        };

        mainHandler.postDelayed(restartListeningRunnable, delayMillis);
    }

    public void pauseRecognition() {
        isPaused = true;
        if (restartListeningRunnable != null) {
            mainHandler.removeCallbacks(restartListeningRunnable);
            restartListeningRunnable = null;
        }

        mainHandler.post(() -> {
            if (speechRecognizer != null) {
                try {
                    speechRecognizer.cancel();
                } catch (Exception e) {
                    Log.w(TAG, "Error canceling recognizer: " + e.getMessage());
                }
            }
            isListeningActive = false;
        });

        if (serviceListener != null) {
            serviceListener.onStatusChanged("वीर जवाब दे रहा है...");
        }
    }

    public void resumeRecognition() {
        if (!isServiceRunning) return;
        isPaused = false;
        scheduleRestartListening(300);
    }

    private void stopContinuousListening(String reason) {
        isServiceRunning = false;
        isPaused = false;
        isListeningActive = false;
        awaitingWakeCommand = false;

        if (restartListeningRunnable != null) {
            mainHandler.removeCallbacks(restartListeningRunnable);
            restartListeningRunnable = null;
        }

        mainHandler.post(() -> {
            if (speechRecognizer != null) {
                try {
                    speechRecognizer.cancel();
                    speechRecognizer.destroy();
                } catch (Exception e) {
                    Log.w(TAG, "Error destroying recognizer: " + e.getMessage());
                }
                speechRecognizer = null;
            }
        });

        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
            wakeLock = null;
        } catch (Exception e) {
            Log.w(TAG, "Error releasing wakeLock: " + e.getMessage());
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Exception e) {
            Log.w(TAG, "Error in stopForeground: " + e.getMessage());
        }

        stopSelf();

        if (serviceListener != null) {
            serviceListener.onServiceStopped(reason);
        }
    }

    @Override
    public void onDestroy() {
        stopContinuousListening("सर्विस बंद की गई");
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
