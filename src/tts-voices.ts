export const ttsModel = 'eleven_multilingual_v2';
export const ttsVoices = [
  { name: 'Alice', id: 'Xb7hH8MSUJpSbSDYk0k2' },
  { name: 'Lily', id: 'pFZP5JQG7iQjIQuC4Bku' },
  { name: 'George', id: 'JBFqnCBsd6RMkjVDRZzb' },
  { name: 'Daniel', id: 'onwK4e9ZLuTAKqWW03F9' },
] as const;

// Assignment depends only on the exact text, never on order or practice count.
export function voiceForText(text: string) {
  const demoVoices: Record<string, string> = {
    'Small steps lead to meaningful progress.': 'George',
    'I am learning to express my ideas clearly.': 'Alice',
    'Every mistake is a chance to learn.': 'Lily',
    'Practice makes a little more possible each day.': 'Daniel',
    'Take your time and enjoy the process.': 'George',
  };
  const demo = Object.hasOwn(demoVoices, text) ? demoVoices[text] : undefined;
  if (demo) return ttsVoices.find(voice => voice.name === demo)!;
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  return ttsVoices[(hash >>> 0) % ttsVoices.length];
}
