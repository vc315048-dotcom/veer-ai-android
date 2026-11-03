# VEER Phone Control – सुरक्षित Android Add-on

इस पैकेज में VEER के मौजूदा प्रोजेक्ट के लिए Android native bridge जोड़ा गया है।

## अभी जोड़ा गया
- VEER Android ऐप से WhatsApp, Instagram, Facebook, YouTube, Chrome और Settings खोलने का native तरीका।
- `shareAfterApproval()` Android Share Chooser खोलता है। यह केवल सामग्री साझा करने का विकल्प दिखाता है; यह अपने-आप Send/Post नहीं दबाता।
- Accessibility सेटिंग खोलने का native तरीका। उपयोगकर्ता को Android की सेटिंग में स्वयं अनुमति चालू करनी होगी।
- GitHub APK workflow को Node.js 22 पर अपडेट किया गया है (प्रोजेक्ट की package.json आवश्यकता के अनुरूप)।

## सुरक्षा नियम
1. ऐप खोलना जैसे सामान्य काम सीधे किए जा सकते हैं।
2. मैसेज भेजना, पोस्ट प्रकाशित करना, वीडियो अपलोड करना, कॉल करना, खरीदारी करना या डेटा मिटाना जैसे काम से पहले VEER की UI में स्पष्ट अनुमति लें।
3. अनुमति मिलने के बाद भी `shareAfterApproval()` सिर्फ Android का शेयर पैनल खोलता है। अंतिम Send/Post बटन उपयोगकर्ता स्वयं दबाता है।
4. यह Add-on अभी Accessibility Service नहीं बनाता और न ही पूरे फोन का असीमित नियंत्रण देता है। Android अलग-अलग अनुमतियाँ और ऐप प्रतिबंध लागू करता है।
5. किसी भी निजी स्क्रीन/ऐप पर स्वचालित क्लिक, OTP पढ़ना, सुरक्षा रोकों को बायपास करना या बिना पुष्टि के संदेश/पोस्ट भेजना शामिल नहीं है।

## डेवलपर उपयोग
```ts
import { phoneControl } from './utils/phoneControl';

// सामान्य काम: ऐप खोलें
await phoneControl.openApp('whatsapp');

// केवल अपनी UI में उपयोगकर्ता की स्पष्ट स्वीकृति मिलने के बाद:
await phoneControl.shareAfterApproval('आपका तैयार संदेश', 'WhatsApp पर साझा करें');

// उपयोगकर्ता की कार्रवाई से Android Accessibility Settings खोलें
await phoneControl.openAccessibilitySettings();
```

`shareAfterApproval` को AI के जवाब या voice transcript से सीधे न चलाएँ। इसे केवल ऐसे Confirm/Approve बटन के `onClick` में कॉल करें जिसे उपयोगकर्ता ने स्वयं दबाया हो। Cancel पर कोई native action न चलाएँ।

## APK बनाना
- GitHub पर प्रोजेक्ट push करें और Actions → Build Android APK → Run workflow चुनें।
- सफल workflow के Artifacts से `VEER-AI-Assistant-Debug-APK` डाउनलोड करें।
- या Android Studio में प्रोजेक्ट खोलकर Gradle `assembleDebug` चलाएँ।

यह source add-on है, तैयार/साइन किया हुआ APK नहीं। Android Studio/CI build और असली iQOO फोन पर परीक्षण आवश्यक है।
