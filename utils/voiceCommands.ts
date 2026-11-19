/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type VoiceCommandType = 'pause' | 'resume';

export type AppLaunchCommand = 'whatsapp' | 'instagram' | 'facebook' | 'youtube' | 'chrome' | 'settings';

/**
 * Recognizes built-in VEER hands-free control commands in spoken or written Hindi / Hinglish.
 *
 * Supported commands:
 * - Pause: "वीर, आराम करो", "वीर बंद हो जाओ", "वीर रुक जाओ", "आराम करो", "veer aaram karo", "veer pause", etc.
 * - Resume: "वीर, फिर सुनो", "वीर फिर से सुनो", "वीर दोबारा सुनो", "वीर सुनना शुरू करो", "वीर सुनो", "veer phir suno", "phir suno", etc.
 */
export function detectVoiceCommand(text: string): VoiceCommandType | null {
  if (!text) return null;

  // Normalize punctuation and whitespace
  const cleaned = text
    .toLowerCase()
    .replace(/[।,!?.…\-_'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Pause regex patterns (Hindi + common Hinglish transcripts)
  const pauseRegex =
    /(वीर\s*(आराम\s*करो|बंद\s*हो\s*जाओ|रुक\s*जाओ|विश्राम\s*करो|चुप\s*हो\s*जाओ|चुप\s*रहो|शांत\s*हो\s*जाओ|सो\s*जाओ))|((आराम\s*करो|बंद\s*हो\s*जाओ|विश्राम\s*करो|चुप\s*हो\s*जाओ|शांत\s*हो\s*जाओ)\s*(वीर)?)|(veer\s*(aaram\s*karo|aram\s*karo|pause|rest|stop|band\s*ho\s*jao))|(aaram\s*karo|aram\s*karo)/i;

  // Resume regex patterns (Hindi + common Hinglish transcripts)
  const resumeRegex =
    /(वीर\s*(फिर(\s*से)?\s*सुनो|दोबारा(\s*से)?\s*सुनो|पुनः\s*सुनो|सुनना\s*शुरू\s*करो|सुनो|जाग\s*जाओ|चालू\s*हो\s*जाओ))|((फिर(\s*से)?\s*सुनो|दोबारा(\s*से)?\s*सुनो|पुनः\s*सुनो|सुनना\s*शुरू\s*करो)\s*(वीर)?)|(veer\s*(phir(\s*se)?\s*suno|fir(\s*se)?\s*suno|dobara\s*suno|resume|wake\s*up|listen))|(phir(\s*se)?\s*suno|fir(\s*se)?\s*suno)/i;

  if (pauseRegex.test(cleaned)) {
    return 'pause';
  }

  if (resumeRegex.test(cleaned)) {
    return 'resume';
  }

  return null;
}


/**
 * Detect explicit app-launch requests for Android hands-free control.
 * This only opens the requested app; it never sends messages or publishes content.
 */
export function detectAppLaunchCommand(text: string): AppLaunchCommand | null {
  if (!text) return null;

  const cleaned = text
    .toLowerCase()
    .replace(/[।,!?.…\-_'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const openIntent = /(?:खोलो|खोल दो|खोलिए|ओपन करो|चालू करो|शुरू करो|open|launch|kholo|khol do)/i;
  if (!openIntent.test(cleaned)) return null;

  const appPatterns: Array<[AppLaunchCommand, RegExp]> = [
    ['whatsapp', /(?:whats\s*app|whatsapp|व्हाट्स\s*ऐप|व्हाट्सएप|व्हाट्सऐप)/i],
    ['instagram', /(?:instagram|इंस्टाग्राम|इन्स्टाग्राम)/i],
    ['facebook', /(?:facebook|फेसबुक)/i],
    ['youtube', /(?:youtube|यूट्यूब|यू ट्यूब)/i],
    ['chrome', /(?:chrome|क्रोम|गूगल क्रोम)/i],
    ['settings', /(?:फोन सेटिंग|सेटिंग्स|settings|setting)/i],
  ];

  for (const [command, pattern] of appPatterns) {
    if (pattern.test(cleaned)) return command;
  }
  return null;
}
