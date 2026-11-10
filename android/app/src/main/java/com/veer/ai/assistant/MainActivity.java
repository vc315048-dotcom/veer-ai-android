package com.veer.ai.assistant;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VeerVoicePlugin.class);
        registerPlugin(VeerNativeTTSPlugin.class);
        registerPlugin(VoiceMicPlugin.class);
        registerPlugin(VeerPhoneControlPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
