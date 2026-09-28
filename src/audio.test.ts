import {describe,it,expect} from 'vitest';
import {validateAudio,mergeAudio,audioLabel} from './audio';
import {voiceForText,ttsVoices} from './tts-voices';
describe('portable audio packs',()=>{
  it('keeps imported provenance but prefers verified ElevenLabs library audio',()=>{
    const clip={text:'Small steps lead to meaningful progress.',audio:'data:audio/mpeg;base64,SUQz',voice:'Alice',model:'eleven_multilingual_v2'};
    expect(validateAudio([clip])).toEqual([clip]);
    expect(audioLabel(clip.text,[clip])).toBe('ElevenLabs · George · 英音');
    expect(audioLabel('A private sentence.',[{...clip,text:'A private sentence.'}])).toBe('导入配音 · Alice');
    expect(()=>validateAudio([{...clip,voice:{name:'Alice'}}])).toThrow();
  });
  it('assigns all four voices deterministically, including when order changes',()=>{
    const sentences=Array.from({length:100},(_,i)=>`This is example number ${i}.`);
    const assignments=new Map(sentences.map(s=>[s,voiceForText(s).id]));
    expect(new Set(assignments.values()).size).toBe(ttsVoices.length);
    for(const s of sentences.reverse()) expect(voiceForText(s).id).toBe(assignments.get(s));
  });
  it('supports old exports without audio and merges by exact sentence',()=>{expect(validateAudio(undefined)).toEqual([]);const c={text:'Hello.',audio:'data:audio/mpeg;base64,SUQz'};expect(mergeAudio([c],[c])).toEqual([c]);});
  it('rejects arbitrary URLs, duplicate text and unsupported payloads',()=>{expect(()=>validateAudio([{text:'Hello.',audio:'https://example.com/audio.mp3'}])).toThrow();const c={text:'Hello.',audio:'data:audio/mpeg;base64,SUQz'};expect(()=>validateAudio([c,c])).toThrow();expect(()=>validateAudio([{text:'Hi',audio:'data:text/html;base64,AAAA'}])).toThrow();});
});
