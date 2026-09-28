import {describe,it,expect,vi,afterAll} from 'vitest';
import {readFileSync,statSync} from 'node:fs';
import generated from './generated-tracks.json';
import {trackAudio} from './audio';
import {ttsModel,ttsVoices} from './tts-voices';
vi.stubGlobal('document',{baseURI:'https://example.test/sentence-garden/'});
afterAll(()=>vi.unstubAllGlobals());
describe('converted complete listening tracks',()=>{
  it('maps each published conversion to an existing source and a reviewed, playable ElevenLabs file',()=>{
    const index=JSON.parse(readFileSync(new URL('../public/library/index.json',import.meta.url),'utf8'));
    const sources=new Set<string>();
    for(const collection of index.collections){
      const data=JSON.parse(readFileSync(new URL(`../public/${collection.file}`,import.meta.url),'utf8'));
      for(const track of data.tracks) sources.add(track.url);
    }
    for(const [url,entry] of Object.entries(generated)){
      expect(sources.has(url)).toBe(true);
      expect(entry.model).toBe(ttsModel);
      expect(ttsVoices.some(v=>v.id===entry.voiceId&&v.name===entry.voice)).toBe(true);
      expect(entry.reviewed).toBe(true);
      expect(entry.characters).toBeGreaterThan(0);
      expect(entry.chunks).toBeGreaterThan(0);
      expect(entry.transcriptHash).toMatch(/^[a-f0-9]{24}$/);
      expect(entry.file).toMatch(/^audio\/tracks\/[a-f0-9]{24}\.mp3$/);
      expect(statSync(new URL(`../public/${entry.file}`,import.meta.url)).size).toBeGreaterThan(1000);
      expect(trackAudio(url)).toEqual({url:new URL(entry.file,document.baseURI).href,label:`ElevenLabs · ${entry.voice} · 英音`});
    }
  });
});
