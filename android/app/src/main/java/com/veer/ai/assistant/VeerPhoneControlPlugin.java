package com.veer.ai.assistant;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Safe phone-control bridge. It opens apps/settings and hands content to Android's chooser;
 * it never silently sends, publishes, deletes, purchases, or places calls. */
@CapacitorPlugin(name = "VeerPhoneControl")
public class VeerPhoneControlPlugin extends Plugin {
    @PluginMethod
    public void openApp(PluginCall call) {
        String app = call.getString("app", "").toLowerCase();
        String pkg;
        switch (app) {
            case "whatsapp": pkg = "com.whatsapp"; break;
            case "instagram": pkg = "com.instagram.android"; break;
            case "facebook": pkg = "com.facebook.katana"; break;
            case "youtube": pkg = "com.google.android.youtube"; break;
            case "chrome": pkg = "com.android.chrome"; break;
            case "settings":
                Intent settings = new Intent(Settings.ACTION_SETTINGS);
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settings);
                call.resolve(new JSObject().put("opened", true));
                return;
            default: call.reject("यह ऐप सूची में उपलब्ध नहीं है।"); return;
        }
        try {
            Intent launch = getContext().getPackageManager().getLaunchIntentForPackage(pkg);
            if (launch == null) { call.reject("यह ऐप फोन में इंस्टॉल नहीं है।"); return; }
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(launch);
            call.resolve(new JSObject().put("opened", true));
        } catch (Exception e) { call.reject("ऐप नहीं खुल पाया: " + e.getMessage()); }
    }

    /** Called only after the app has shown its own explicit approval UI. Android still asks
     * the user to choose a target app; this method does not press Send/Post. */
    @PluginMethod
    public void shareText(PluginCall call) {
        String text = call.getString("text", "").trim();
        String title = call.getString("title", "VEER से साझा करें");
        if (text.isEmpty()) { call.reject("साझा करने के लिए टेक्स्ट खाली है।"); return; }
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, text);
        Intent chooser = Intent.createChooser(send, title);
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getContext().startActivity(chooser); call.resolve(new JSObject().put("opened", true)); }
        catch (ActivityNotFoundException e) { call.reject("साझा करने वाला ऐप उपलब्ध नहीं है।"); }
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("opened", true));
        } catch (Exception e) { call.reject("Accessibility सेटिंग नहीं खुली: " + e.getMessage()); }
    }
}
