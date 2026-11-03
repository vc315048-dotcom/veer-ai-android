# VEER Phone Control – संशोधित परीक्षण रिपोर्ट

## इस संशोधन में किए गए बदलाव
- Android ऐप का `applicationId` और Capacitor `appId` `com.veer.ai` से मिलाए गए, ताकि नया APK पुराने VEER ऐप को अपडेट कर सके, अलग ऐप न बनाए। Android namespace `com.veer.ai.assistant` यथावत रखा गया है क्योंकि Java source उसी package में है।
- ऐप का नाम `VEER` किया गया और Android version `1.1` / versionCode `2` रखा गया।
- नया `src/utils/api.ts` जोड़ा गया: वेब बिल्ड same-origin `/api` इस्तेमाल करता है; Android बिल्ड पहले `VITE_API_BASE_URL` और उसके अभाव में पुराने APK में मिले Cloud Run API origin का उपयोग करता है।
- चैट, Gemini TTS और TTS diagnostics के API अनुरोध अब साझा API URL helper से जाते हैं।
- चैट का मोबाइल क्लाइंट timeout 24 सेकंड से बढ़ाकर 60 सेकंड किया गया।
- सर्वर पर प्रति Gemini मॉडल timeout 6/6/5 सेकंड से बढ़ाकर configurable 18 सेकंड किया गया। Timeout timer को हर प्रयास के बाद साफ किया जाता है।
- मॉडल fallback सूची `GEMINI_CHAT_MODELS` से बदली जा सकती है; default `gemini-3.5-flash-lite,gemini-3.8-flash` है। ये मॉडल IDs Google Gemini API की मौजूदा मॉडल सूची में दर्ज हैं।
- TTS मॉडल timeout बढ़ाए गए ताकि धीमे मोबाइल नेटवर्क पर तुरंत browser voice fallback न हो।
- `/api/health` से API key की लंबाई हटाई गई; अब केवल key configured होने का boolean संकेत दिया जाता है।
- `.env.example` और README में Android backend URL और सुरक्षित key handling का निर्देश जोड़ा गया। Gemini API key केवल server-side `GEMINI_API_KEY` में रखनी है।

## किए गए स्थिर परीक्षण
- ZIP extract और source file structure सफलतापूर्वक जाँचा गया।
- TypeScript transpile syntax check (`server.ts`, `App.tsx`, `api.ts`, `speechManager.ts`) सफल रहा।
- Android XML और Capacitor JSON parse सफल रहे।
- API helper के तीन routing paths (configured origin, Android fallback, web same-origin) source में मौजूद हैं।
- Chat और TTS endpoints के सभी frontend fetch calls API helper से बदले गए।
- Capacitor `appId` और Gradle `applicationId` दोनों `com.veer.ai` हैं।
- Android `versionCode` 2 और `versionName` 1.1 हैं।
- Gemini model IDs को Google की आधिकारिक Gemini API model documentation से cross-check किया गया।

## अभी सत्यापित नहीं हो सका
- `npm install` नेटवर्क/समय-सीमा में पूरा नहीं हुआ; offline cache में `@capacitor/android` उपलब्ध नहीं था।
- इसलिए TypeScript/Vite production build और Gradle APK build इस वातावरण में सफल घोषित नहीं किए जा सकते। `tsc --noEmit` भी Vite type package अनुपलब्ध होने के कारण रुक गया।
- Cloud Run health endpoint को इस वातावरण से DNS/network access नहीं मिला; लाइव backend और API key की वैधता जाँची नहीं जा सकी।
- वास्तविक iQOO फोन पर install/upgrade, microphone, screen-off foreground service, battery restrictions और phone-control intents का परीक्षण अभी आवश्यक है।

## जरूरी सीमाएँ
- Android के लिए default API origin पुराने APK से लिया गया है; यदि Cloud Run service बदल चुकी है, तो build करते समय `VITE_API_BASE_URL` को सही HTTPS backend URL से सेट करना होगा।
- फोन कंट्रोल केवल समर्थित ऐप खोलता है और Android Share Chooser दिखाता है। WhatsApp/Instagram पर Send/Post/Upload/Delete अपने-आप नहीं करता।
- Screen-off listening Android foreground microphone service पर निर्भर है। Android/iQOO की अनुमति, notification और battery settings के बिना इसकी गारंटी नहीं दी जा सकती।
