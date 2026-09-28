import bundled from "./demo-audio.json";
import generated from "./generated-audio.json";
import generatedTracks from "./generated-tracks.json";
import { isProjectAudioUrl, type Sentence } from "./engine";
export type AudioClip = { text: string; audio: string; voice?: string; model?: string };
type GeneratedAudio = { file: string; voice: string; voiceId: string; model: string };
declare const __AUDIO_BASE_URL__: string;
const resolveAudio = (file: string) => new URL(file, typeof __AUDIO_BASE_URL__ === 'string' && __AUDIO_BASE_URL__ ? __AUDIO_BASE_URL__ : document.baseURI);
const generatedClips = generated as Record<string, GeneratedAudio>;
const generatedClip = (text: string) => Object.hasOwn(generatedClips, text) ? generatedClips[text] : undefined;
export function trackAudio(url: string) {
  const tracks = generatedTracks as Record<string, GeneratedAudio>;
  const entry = Object.hasOwn(tracks, url) ? tracks[url] : undefined;
  return entry ? { url: resolveAudio(entry.file).href, label: `ElevenLabs · ${entry.voice} · 英音` } : { url, label: "原项目录音" };
}
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
      (c.voice !== undefined && (typeof c.voice !== "string" || c.voice.length > 100)) ||
      (c.model !== undefined && (typeof c.model !== "string" || c.model.length > 100)) ||
      seen.has(c.text)
    )
      throw Error("音频包中存在无效、重复或过大的音频。");
    total += c.audio.length;
    seen.add(c.text);
    return { text: c.text, audio: c.audio,
      ...(c.voice !== undefined ? { voice: c.voice } : {}),
      ...(c.model !== undefined ? { model: c.model } : {}),
    };
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
export function audioSource(
  text: string,
  clips: AudioClip[],
  sentence?: Sentence,
) {
  const ready = generatedClip(text);
  if (ready) {
    const url = resolveAudio(ready.file);
    // Demo filenames predate the voice change; bypass cached George recordings.
    if (ready.file.startsWith("audio/sample-")) url.searchParams.set("voice", ready.voiceId);
    return url.href;
  }
  const clip = clips.find((c) => c.text === text);
  if (clip) return clip.audio;
  const recording = sentence?.recordings?.find(
    (r) => r.text === text && isProjectAudioUrl(r.url),
  );
  if (recording) return recording.url;
  const relative = (bundled as Record<string, string>)[text];
  return typeof relative === "string"
    ? resolveAudio(relative).href
    : null;
}

export function audioLabel(text: string, clips: AudioClip[], sentence?: Sentence) {
  const ready = generatedClip(text);
  if (ready) return `ElevenLabs · ${ready.voice} · 英音`;
  const clip = clips.find(c => c.text === text);
  if (clip) return clip.voice ? `导入配音 · ${clip.voice}` : "导入配音";
  const recording = sentence?.recordings?.find(r => r.text === text && isProjectAudioUrl(r.url));
  if (recording) return recording.label || "原项目录音";
  if (typeof (bundled as Record<string, string>)[text] === "string") return "ElevenLabs · George · 英音";
  return "设备朗读";
}
