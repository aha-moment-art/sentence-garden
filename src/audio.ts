import bundled from "./demo-audio.json";
export type AudioClip = { text: string; audio: string };
export type AudioPack = {
  format: "sentence-garden-audio";
  version: 1;
  voice: string;
  clips: AudioClip[];
};
export function validateAudio(value: unknown): AudioClip[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10000)
    throw Error("音频包格式无效。");
  let total = 0;
  const seen = new Set<string>();
  const clips = value.map((c) => {
    if (
      !c ||
      typeof c.text !== "string" ||
      !c.text.trim() ||
      c.text.length > 600 ||
      typeof c.audio !== "string" ||
      c.audio.length > 3000000 ||
      !/^data:audio\/mpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(c.audio) ||
      seen.has(c.text)
    )
      throw Error("音频包中存在无效、重复或过大的音频。");
    total += c.audio.length;
    seen.add(c.text);
    return { text: c.text, audio: c.audio };
  });
  if (total > 90 * 1024 * 1024)
    throw Error("音频总大小超过 90 MB，请拆分句库。");
  return clips;
}
export function mergeAudio(
  existing: AudioClip[],
  incoming: AudioClip[],
): AudioClip[] {
  return validateAudio([
    ...new Map([...existing, ...incoming].map((c) => [c.text, c])).values(),
  ]);
}
export function audioSource(text: string, clips: AudioClip[]) {
  const clip = clips.find((c) => c.text === text);
  if (clip) return clip.audio;
  const relative = (bundled as Record<string, string>)[text];
  return typeof relative === "string"
    ? new URL(relative, document.baseURI).href
    : null;
}
