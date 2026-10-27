/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type VoiceCommandType = 'pause' | 'resume';

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
