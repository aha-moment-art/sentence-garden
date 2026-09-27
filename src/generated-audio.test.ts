import { describe, expect, it, vi, afterAll } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import generated from './generated-audio.json';
import demo from './demo-audio.json';
import { audioSource, audioLabel } from './audio';
import { ttsModel, voiceForText } from './tts-voices';

const entries = generated as Record<string, {file:string; voice:string; voiceId:string; model:string}>;
const base = 'https://example.test/sentence-garden/';
vi.stubGlobal('document', {baseURI:base});
afterAll(()=>vi.unstubAllGlobals());
describe('published four-voice corpus', () => {
  it('covers every public sentence that has no original recording, plus all five demos', () => {
    const index = JSON.parse(readFileSync(new URL('../public/library/index.json',import.meta.url),'utf8'));
    const needed = new Set(Object.keys(demo));
    for (const collection of index.collections) {
      const data = JSON.parse(readFileSync(new URL(`../public/${collection.file}`,import.meta.url),'utf8'));
      for (const s of data.sentences) if(!s.recordings?.some((r:{text:string})=>r.text===s.en)) needed.add(s.en);
    }
    expect(needed.size).toBe(2292);
    expect(Object.keys(entries).sort()).toEqual([...needed].sort());
    const counts:Record<string,number> = {};
    for (const text of needed) {
      const entry=entries[text];
      const voice=voiceForText(text);
      expect(entry.voiceId,text).toBe(voice.id);
      expect(entry.voice,text).toBe(voice.name);
      expect(entry.model,text).toBe(ttsModel);
      const file = (demo as Record<string,string>)[text] || `audio/generated/${createHash('sha256').update(`${ttsModel}:${voice.id}:${text}`).digest('hex').slice(0,24)}.mp3`;
      expect(entry.file,text).toBe(file);
      expect(statSync(new URL(`../public/${file}`,import.meta.url)).size,text).toBeGreaterThan(1000);
      const url = new URL(file,base);
      if (file.startsWith('audio/sample-')) url.searchParams.set('voice',voice.id);
      expect(audioSource(text,[])).toBe(url.href);
      expect(audioLabel(text,[])).toBe(`ElevenLabs · ${voice.name} · 英音`);
      counts[voice.name]=(counts[voice.name]||0)+1;
    }
    expect(counts).toEqual({Alice:566,Lily:596,George:554,Daniel:576});
  });
  it('never plays a generated recording for a changed or unknown sentence', () => {
    for (const text of ['A completely new personal sentence, for this test only.', 'constructor', '__proto__']) {
      expect(audioSource(text,[])).toBeNull();
      expect(audioLabel(text,[])).toBe('设备朗读');
    }
  });
});
