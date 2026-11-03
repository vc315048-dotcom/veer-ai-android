# वीर (VEER) AI - Android APK निर्माण गाइड (100% निःशुल्क)

इस गाइड की सहायता से आप बिना किसी पेड सेवा या API की के अपने VEER AI असिस्टेंट का **Android APK** तैयार कर सकते हैं।

---

## 🛠️ क्या प्रोजेक्ट में पहले से व्यवस्था थी?
* **जाँच परिणाम:** पहले इस प्रोजेक्ट में केवल React SPA (Vite) और Express सर्वर था। Android APK बनाने के लिए कोई native प्रोजेक्ट या Capacitor कॉन्फ़िगरेशन मौजूद नहीं था।
* **अब क्या तैयार किया गया:** हमने आपके मौजूदा कोड को बिना छुए इसमें **Capacitor (Free & Open-Source by Ionic)** और **Native Android प्रोजेक्ट (`/android`)** पूरी तरह तैयार और सिंक कर दिया है।
* साथ ही `RECORD_AUDIO`, `INTERNET`, और `WAKE_LOCK` की आवश्यक अनुमतियाँ `AndroidManifest.xml` में जोड़ दी गई हैं।

---

## 🚀 APK बनाने के 3 सबसे आसान और 100% फ्री तरीके

### तरीका 1: Android Studio द्वारा (सबसे आसान व अनुशंसित)
Android Studio गूगल का 100% फ्री आधिकारिक टूल है।

1. **Android Studio डाउनलोड करें:**
   * यदि आपके पास नहीं है, तो [developer.android.com/studio](https://developer.android.com/studio) से मुफ्त डाउनलोड करें।
2. **प्रोजेक्ट खोलें:**
   * Android Studio खोलें और **"Open an Existing Project"** चुनें।
   * इस प्रोजेक्ट के अंदर बने **`android`** फ़ोल्डर को चुनें।
3. **APK बनाएं:**
   * ऊपर मेनू बार में **Build** ➔ **Build Bundle(s) / APK(s)** ➔ **Build APK(s)** पर क्लिक करें।
   * 1-2 मिनट में Gradle बिल्ड पूरा होगा और नीचे **"locate"** का लिंक आएगा।
   * आपका APK यहाँ मिलेगा:
     `android/app/build/outputs/apk/debug/app-debug.apk`
4. **फोन में इंस्टॉल करें:**
   * इस `app-debug.apk` फ़ाइल को अपने Android फोन में भेजें और "Install" करें।

---

### तरीका 2: कमांड लाइन (Terminal / CMD) द्वारा (बिना Android Studio खोले)
यदि आपके कंप्यूटर पर Java (JDK 17) और Android SDK पहले से स्थापित हैं:

```bash
# 1. वेब प्रोजेक्ट को बिल्ड और सिंक करें
npm run cap:sync

# 2. Android डायरेक्टरी में जाएं
cd android

# 3. APK बनाएं (Windows पर):
gradlew.bat assembleDebug

# या (Mac / Linux पर):
chmod +x gradlew
./gradlew assembleDebug
```
बिल्ड होने के बाद APK यहाँ तैयार मिलेगा:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

### तरीका 3: GitHub Actions द्वारा (क्लाउड में 100% फ्री - बिना कोई भारी सॉफ्टवेयर डाउनलोड किए!)
यदि आप अपने कंप्यूटर पर 3GB का Android Studio डाउनलोड नहीं करना चाहते:

1. हमने आपके प्रोजेक्ट में `.github/workflows/build-apk.yml` फ़ाइल जोड़ दी है।
2. जब आप इस कोड को अपने फ्री GitHub रिपॉजिटरी में पुश करेंगे:
   * GitHub का फ्री क्लाउड सर्वर अपने आप कोड को बिल्ड करेगा।
   * GitHub के **Actions** टैब में जाकर आप तैयार **`VEER-AI-Assistant-Debug-APK`** सीधे एक क्लिक में डाउनलोड कर सकते हैं।

---

## ⚙️ मुख्य फ़ाइलें जो प्रोजेक्ट में तैयार की गई हैं:
1. `capacitor.config.json` - Capacitor ऐप कॉन्फ़िगरेशन।
2. `/android` - संपूर्ण Native Android Studio प्रोजेक्ट (Gradle, Kotlin/Java, Resources)।
3. `android/app/src/main/AndroidManifest.xml` - माइक्रोफ़ोन (`RECORD_AUDIO`), इंटरनेट और वेकलॉक अनुमतियाँ।
4. `.github/workflows/build-apk.yml` - स्वचालित फ्री क्लाउड बिल्ड पाइपलाइन।
5. `package.json` में स्क्रिप्ट्स:
   * `npm run cap:sync` (वेब कोड में बदलाव के बाद Android में तुरंत अपडेट करने के लिए)।
   * `npm run cap:open` (सीधे Android Studio खोलने के लिए)।
