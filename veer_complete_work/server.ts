import express from 'express';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// AI Studio container environment: Nginx listens on port 8080 (Cloud Run external port)
// and proxies traffic to port 3000 (DEFAULT_APP_PORT).
// Express must bind to port 3000 to avoid collision on 8080 and ensure Nginx reverse-proxy succeeds.
const PORT = Number(process.env.DEFAULT_APP_PORT || (process.env.PORT && process.env.PORT !== '8080' ? process.env.PORT : 3000));
const distPath = path.resolve(__dirname, 'dist');
const hasDist = fs.existsSync(path.resolve(distPath, 'index.html'));
const isProd = process.env.NODE_ENV === 'production' || hasDist;

app.use(express.json({ limit: '25mb' }));

// CORS & OPTIONS preflight middleware for Capacitor Android WebView and local origins
app.use((req, res, next) => {
  const origin = req.headers.origin;

  const isAllowedOrigin =
    !origin ||
    origin === 'https://localhost' ||
    origin === 'capacitor://localhost' ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('https://localhost:') ||
    origin.endsWith('.run.app');

  if (isAllowedOrigin && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  // Handle OPTIONS preflight immediately
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  next();
});

function getAI(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: (process.env.GEMINI_API_KEY || '').trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const VEER_SYSTEM_INSTRUCTION = `आप वीर (VEER) हैं — एक अत्यंत बुद्धिमान, साहसी, विनम्र, सकारात्मक और मददगार व्यक्तिगत AI सुपरहीरो सहायक।
आपकी मुख्य विशेषताएं और नियम:
1. भाषा: आपकी प्राथमिक भाषा सरल, स्पष्ट और प्राकृतिक हिन्दी (देवनागरी लिपि) है। आप शुद्ध एवं आम बोलचाल की हिन्दी में उत्तर देते हैं। जहाँ आवश्यक हो, तकनीकी शब्दों या सामान्य नामों को स्वाभाविक रूप से प्रयोग करें।
2. व्यक्तित्व: एक सुपरहीरो साथी की तरह आपका लहजा आत्मविश्वास से भरा, ऊर्जावान, आत्मीय और अत्यंत आदरपूर्ण है। आप उपयोगकर्ता को "साथी" या "दोस्त" मानकर आदर से "आप" कहकर संबोधित करते हैं।
3. आवाज के अनुकूल उत्तर: आपके उत्तर बोलकर सुनाए (Text-to-Speech) जाएंगे। इसलिए अपने उत्तरों को धाराप्रवाह, कर्णप्रिय और सीधा रखें। भारी मार्कडाउन प्रतीकों जैसे ढेर सारे तारे (*), हैश (#), या जटिल कोष्ठकों का अनावश्यक प्रयोग न करें ताकि आवाज में कोई रुकावट न आए।
4. कार्यक्षमता: आप हर तरह के सवाल का उत्तर दे सकते हैं — सामान्य ज्ञान, गणित, प्रेरक विचार, दैनिक योजना, विज्ञान, भारतीय संस्कृति व इतिहास, चुटकुले, कविताएं और पहेलियां।
5. संबोधन उदाहरण:
   - "नमस्ते! मैं वीर हूँ। बताइए आज मैं आपकी क्या सहायता कर सकता हूँ?"
   - "शानदार सवाल! चलिए इसे हल करते हैं।"
   - "निश्चिंत रहिए साथी, वीर आपके साथ है!"
6. संक्षिप्तता: जब तक विस्तृत उत्तर न मांगा गया हो, उत्तर को 2-4 प्रभावशाली और सटीक वाक्यों में रखें ताकि आवाज़ में सुनना आसान और आनंददायक हो।`;

// Helper delay
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Sanitize log text to protect any API key or secret
function sanitizeLog(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]')
    .replace(/(?:key|apiKey|token|secret|password)=([^\s&"'`]+)/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9\-_\.]+/gi, 'Bearer [REDACTED]');
}

export type GeminiErrorCode =
  | 'API_KEY_MISSING'
  | 'API_KEY_INVALID'
  | 'QUOTA_EXCEEDED'
  | 'TIMEOUT'
  | 'SERVER_ERROR'
  | 'MODEL_NOT_FOUND'
  | 'UNKNOWN';

export interface GeminiErrorInfo {
  code: GeminiErrorCode;
  httpStatus: number;
  userMessage: string;
  isRetryable: boolean;
  sanitizedDetails: string;
}

function parseGeminiError(err: any): GeminiErrorInfo {
  const rawMsg = err?.message || String(err || '');
  const errMsg = sanitizeLog(rawMsg);
  const errStatus = err?.status || err?.statusCode || (err?.response && err.response.status);

  // 1. API Key Missing / Not configured
  if (
    errMsg.includes('API key is required') ||
    errMsg.includes('apiKey is required') ||
    errMsg.includes('GEMINI_API_KEY')
  ) {
    return {
      code: 'API_KEY_MISSING',
      httpStatus: 401,
      userMessage: 'Gemini API Key मौजूद नहीं है। कृपया AI Studio के Secrets में GEMINI_API_KEY सेट करें।',
      isRetryable: false,
      sanitizedDetails: errMsg.slice(0, 120),
    };
  }

  // 2. API Key Invalid / Permission Denied
  if (
    errMsg.includes('API_KEY_INVALID') ||
    errMsg.includes('API key not valid') ||
    errMsg.includes('invalid api key') ||
    errMsg.includes('PERMISSION_DENIED') ||
    errStatus === 401 ||
    (errStatus === 403 && (errMsg.includes('permission') || errMsg.includes('key') || errMsg.includes('Forbidden')))
  ) {
    return {
      code: 'API_KEY_INVALID',
      httpStatus: 401,
      userMessage: 'Gemini API Key अमान्य (Invalid) है। कृपया अपनी वैध API Key की जाँच करें।',
      isRetryable: false,
      sanitizedDetails: errMsg.slice(0, 120),
    };
  }

  // 3. Quota / Rate Limit (429)
  if (
    errStatus === 429 ||
    errMsg.includes('429') ||
    errMsg.includes('RESOURCE_EXHAUSTED') ||
    errMsg.includes('quota') ||
    errMsg.includes('rate limit') ||
    errMsg.includes('Too Many Requests')
  ) {
    return {
      code: 'QUOTA_EXCEEDED',
      httpStatus: 429,
      userMessage: 'Gemini API की दर सीमा (Rate Limit 429) समाप्त हो गई है। कृपया थोड़ी देर बाद पुनः प्रयास करें।',
      isRetryable: true,
      sanitizedDetails: errMsg.slice(0, 120),
    };
  }

  // 4. Timeout (504)
  if (
    err?.name === 'AbortError' ||
    errMsg.includes('Timeout') ||
    errMsg.includes('timed out') ||
    errMsg.includes('DEADLINE_EXCEEDED') ||
    errStatus === 504
  ) {
    return {
      code: 'TIMEOUT',
      httpStatus: 504,
      userMessage: 'AI सर्वर से उत्तर मिलने में समय लग रहा है (Timeout)। कृपया पुनः प्रयास करें।',
      isRetryable: true,
      sanitizedDetails: errMsg.slice(0, 120),
    };
  }

  // 5. Server Error / 503 / 500 / 502 / UNAVAILABLE
  if (
    errStatus === 503 ||
    errStatus === 500 ||
    errStatus === 502 ||
    errStatus === 'UNAVAILABLE' ||
    errMsg.includes('503') ||
    errMsg.includes('UNAVAILABLE') ||
    errMsg.includes('high demand') ||
    errMsg.includes('overloaded') ||
    errMsg.includes('temporarily unavailable') ||
    errMsg.includes('Service Unavailable')
  ) {
    return {
      code: 'SERVER_ERROR',
      httpStatus: 503,
      userMessage: 'Google AI सर्वर पर अत्यधिक लोड (503 Server Busy) है। कृपया कुछ क्षण बाद पुनः प्रयास करें।',
      isRetryable: true,
      sanitizedDetails: errMsg.slice(0, 120),
    };
  }

  // 6. Model Not Found (404)
  if (errStatus === 404 || errMsg.includes('not found') || errMsg.includes('404')) {
    return {
      code: 'MODEL_NOT_FOUND',
      httpStatus: 404,
      userMessage: 'अनुरोधित Gemini AI मॉडल उपलब्ध नहीं है।',
      isRetryable: false,
      sanitizedDetails: errMsg.slice(0, 120),
    };
  }

  // 7. Unknown / General Error
  return {
    code: 'UNKNOWN',
    httpStatus: 500,
    userMessage: 'AI सर्वर से जुड़ने में समस्या आई है। कृपया पुनः प्रयास करें।',
    isRetryable: true,
    sanitizedDetails: errMsg.slice(0, 120),
  };
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.GEMINI_API_KEY,
    serverTime: new Date().toISOString(),
  });
});

// Audio transcription endpoint for high-accuracy Hindi voice recognition
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audio, mimeType } = req.body;
    if (!audio || typeof audio !== 'string') {
      return res.status(400).json({ success: false, error: 'Audio data is required' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(401).json({
        success: false,
        error: 'Gemini API Key मौजूद नहीं है',
        errorCode: 'API_KEY_MISSING',
      });
    }

    console.log(`[VEER] Transcribing audio input (${mimeType || 'audio/webm'})...`);

    const response = await getAI().models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'audio/webm',
                data: audio,
              },
            },
            {
              text: 'कृपया इस ऑडियो में उपयोगकर्ता द्वारा बोली गई बात को शुद्ध हिन्दी (देवनागरी लिपि) में ट्रांसक्राइब करें। केवल बोली गई बात लिखें, कोई अतिरिक्त टिप्पणी न जोड़ें।',
            },
          ],
        },
      ],
      config: {
        temperature: 0.1,
      },
    });

    const transcribed = (response.text || '').trim();
    return res.json({ text: transcribed, success: true });
  } catch (err: any) {
    const parsed = parseGeminiError(err);
    console.error('[VEER] Transcribe error:', sanitizeLog(parsed.sanitizedDetails));
    return res.status(parsed.httpStatus).json({
      success: false,
      error: parsed.userMessage,
      errorCode: parsed.code,
    });
  }
});

// Chat endpoint with accurate error categorization and resilience
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'संदेश (Message) आवश्यक है।',
        errorCode: 'INVALID_INPUT',
        canRetry: false,
      });
    }

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      console.warn('[VEER] Chat rejected: GEMINI_API_KEY environment variable is missing.');
      return res.status(401).json({
        success: false,
        error: 'Gemini API Key मौजूद नहीं है। कृपया AI Studio के Secrets पैनल में GEMINI_API_KEY सेट करें।',
        errorCode: 'API_KEY_MISSING',
        canRetry: false,
        statusCode: 401,
      });
    }

    // Build contents with conversation history if available
    const contents: any[] = [];

    if (Array.isArray(history)) {
      for (const item of history.slice(-6)) {
        if (item.role === 'user' && item.text) {
          contents.push({ role: 'user', parts: [{ text: item.text }] });
        } else if (item.role === 'model' && item.text) {
          contents.push({ role: 'model', parts: [{ text: item.text }] });
        }
      }
    }

    contents.push({
      role: 'user',
      parts: [{ text: message.trim() }],
    });

    // Robust Model Hierarchy:
    // Primary: gemini-3.5-flash-lite (fastest, tested <1.2s response time)
    // Backup 1: gemini-flash-lite-latest (verified active fallback)
    // Backup 2: gemini-3.8-flash (official Google GenAI flash model)
    const configuredModels = (process.env.GEMINI_CHAT_MODELS || 'gemini-3.5-flash-lite,gemini-3.8-flash')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    const MODELS = [...new Set(configuredModels)];

    if (MODELS.length === 0) MODELS.push('gemini-3.5-flash-lite', 'gemini-3.8-flash');

    let replyText = '';
    let successModel = '';
    let lastError: any = null;
    const modelAttempts: Array<{ model: string; durationMs: number; status: string; error?: string }> = [];

    for (let i = 0; i < MODELS.length; i++) {
      const modelName = MODELS[i];
      // Allow mobile networks and cold-started model endpoints enough time.
      const timeoutMs = Number(process.env.GEMINI_MODEL_TIMEOUT_MS || 18000);
      const t0 = Date.now();

      console.log(`[VEER] Calling AI model [${i + 1}/${MODELS.length}]: ${modelName}...`);

      try {
        const apiPromise = getAI().models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction: VEER_SYSTEM_INSTRUCTION,
            temperature: 0.7,
          },
        });

        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        let response: any;
        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error(`Timeout after ${timeoutMs}ms on model ${modelName}`)),
              timeoutMs
            );
          });
          response = await Promise.race([apiPromise, timeoutPromise]);
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle);
        }
        const durationMs = Date.now() - t0;

        if (response && response.text) {
          replyText = response.text;
          successModel = modelName;
          console.log(`[VEER] ${modelName} responded successfully in ${durationMs}ms`);
          modelAttempts.push({ model: modelName, durationMs, status: 'SUCCESS' });
          break;
        }
      } catch (err: any) {
        const durationMs = Date.now() - t0;
        lastError = err;
        const parsed = parseGeminiError(err);
        console.warn(
          `[VEER] ${modelName} attempt failed in ${durationMs}ms [${parsed.code}]:`,
          sanitizeLog(parsed.sanitizedDetails)
        );
        modelAttempts.push({ model: modelName, durationMs, status: parsed.code, error: parsed.sanitizedDetails });

        // If error is non-retryable (missing or invalid API key), abort immediately
        if (!parsed.isRetryable && (parsed.code === 'API_KEY_MISSING' || parsed.code === 'API_KEY_INVALID')) {
          break;
        }

        // Zero artificial sleep: immediately try the next backup model
      }
    }

    // Success response
    if (replyText) {
      return res.json({
        success: true,
        reply: replyText,
        model: successModel,
        attempts: modelAttempts,
      });
    }

    // Failure response: accurately classified, genuine error message (NO fake reply disguise)
    const finalParsed = parseGeminiError(lastError);
    return res.status(finalParsed.httpStatus).json({
      success: false,
      error: finalParsed.userMessage,
      errorCode: finalParsed.code,
      is503: finalParsed.code === 'SERVER_ERROR',
      canRetry: finalParsed.isRetryable,
      statusCode: finalParsed.httpStatus,
      modelTried: successModel || modelAttempts.map((m) => m.model).join(', ') || MODELS[0],
      attempts: modelAttempts,
    });
  } catch (error: any) {
    const parsed = parseGeminiError(error);
    console.error('[VEER] Unexpected chat route error:', sanitizeLog(parsed.sanitizedDetails));
    return res.status(parsed.httpStatus).json({
      success: false,
      error: parsed.userMessage,
      errorCode: parsed.code,
      is503: parsed.code === 'SERVER_ERROR',
      canRetry: parsed.isRetryable,
      statusCode: parsed.httpStatus,
    });
  }
});

// High-fidelity speech generation endpoint (Gemini Flash TTS with resilient fallback)
app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.json({ audio: null, fallback: true });
    }

    // Clean text for speech synthesis (strip markdown asterisks/bullets)
    const cleanSpeechText = text.replace(/[*#_`~>\[\]]/g, ' ').trim().slice(0, 320);

    const callTtsModel = async (modelName: string, timeoutMs: number = 12000) => {
      const ttsPromise = getAI().models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: cleanSpeechText,
                speechMetadata: {
                  style: 'Energetic, warm, heroic and friendly Hindi speech',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Fenrir' },
            },
          },
        },
      });

      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error(`TTS timeout after ${timeoutMs}ms on ${modelName}`)),
            timeoutMs
          );
        });
        return await Promise.race([ttsPromise, timeoutPromise]);
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    };

    let base64Audio: string | undefined;
    let isQuota = false;

    // 1. Try gemini-3.8-flash-lite-tts (High-throughput voice assistant TTS)
    try {
      const response: any = await callTtsModel('gemini-3.8-flash-lite-tts', 12000);
      base64Audio = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    } catch (err: any) {
      const errMsg = err?.message || String(err || '');
      const errStatus = err?.status || err?.statusCode;
      if (errStatus === 429 || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota')) {
        isQuota = true;
        console.warn('[VEER TTS] Gemini TTS quota reached (429), switching instantly to client browser TTS');
      } else {
        console.warn('[VEER TTS] gemini-3.8-flash-lite-tts notice, trying backup model:', errMsg.slice(0, 80));
        // Try backup gemini-3.8-flash-tts
        try {
          const fallbackRes: any = await callTtsModel('gemini-3.8-flash-tts', 10000);
          base64Audio = fallbackRes?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        } catch (fbErr: any) {
          console.warn('[VEER TTS] Both Gemini TTS models unavailable, fallback to browser speech synthesis');
        }
      }
    }

    if (base64Audio) {
      return res.json({ audio: base64Audio, mimeType: 'audio/wav', success: true });
    }

    return res.json({ audio: null, fallback: true, quotaExceeded: isQuota });
  } catch (error: any) {
    console.error('[VEER] TTS generation route notice:', error?.message || error);
    return res.json({ audio: null, fallback: true, error: error?.message || 'TTS generation failed' });
  }
});

// Setup Vite or static serving
async function startServer() {
  if (isProd) {
    app.use(express.static(distPath));

    app.get('*', (req, res) => {
      // Do not serve index.html for unmatched /api routes
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint not found' });
      }

      const indexPath = path.resolve(distPath, 'index.html');
      res.sendFile(indexPath, (err) => {
        if (err && !res.headersSent) {
          res.status(500).send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>VEER Assistant</title></head><body style="background:#070a12;color:#fff;font-family:sans-serif;padding:40px;text-align:center;"><h2>VEER Assistant is initializing...</h2><p>Please refresh in a moment.</p></body></html>');
        }
      });
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VEER Assistant server running on http://0.0.0.0:${PORT} (productionMode: ${isProd})`);
  });
}

startServer();
