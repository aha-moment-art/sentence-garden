import {describe,it,expect} from 'vitest';
import {validateAudio,mergeAudio} from './audio';
describe('portable audio packs',()=>{
  it('supports old exports without audio and merges by exact sentence',()=>{expect(validateAudio(undefined)).toEqual([]);const c={text:'Hello.',audio:'data:audio/mpeg;base64,SUQz'};expect(mergeAudio([c],[c])).toEqual([c]);});
  it('rejects arbitrary URLs, duplicate text and unsupported payloads',()=>{expect(()=>validateAudio([{text:'Hello.',audio:'https://example.com/audio.mp3'}])).toThrow();const c={text:'Hello.',audio:'data:audio/mpeg;base64,SUQz'};expect(()=>validateAudio([c,c])).toThrow();expect(()=>validateAudio([{text:'Hi',audio:'data:text/html;base64,AAAA'}])).toThrow();});
});
