import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { ttsModel, voiceForText, ttsVoices } from '../src/tts-voices.ts';

// Only this local script reads the key. Never use a VITE_ prefix for credentials.
const args=process.argv.slice(2);
const option=(name)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const input=option('--input'),output=option('--output');
if(!input||!output)throw Error('Usage: node scripts/generate-audio.mjs --input /absolute/records.json --output /absolute/audio-pack.json');
if(!process.env.ELEVENLABS_API_KEY)throw Error('Set ELEVENLABS_API_KEY in the local environment. Do not put it in frontend configuration.');
const state=JSON.parse(await readFile(resolve(input),'utf8'));
const sentences=[...new Map(state.decks.flatMap(d=>d.sentences).map(s=>[s.en,s])).values()];
if(!sentences.length||sentences.some(s=>typeof s.en!=='string'||!s.en.trim()||s.en.length>600))throw Error('Expected a Sentence Garden export with valid English sentences.');
const destination=dirname(resolve(output));
await mkdir(destination,{recursive:true});
const target=resolve(output);
let previous;
try{previous=JSON.parse(await readFile(target,'utf8'));}catch{/* First generation. */}
const clips=[];
console.log(`Preparing ${sentences.length} sentences (${sentences.reduce((n,s)=>n+s.en.length,0)} characters), Alice / Lily / George / Daniel, ${ttsModel}.`);
for(const [i,s] of sentences.entries()){
  const voice=voiceForText(s.en);
  let bytes;
  const cached=previous?.clips?.find(c=>c.text===s.en && c.voice===voice.name && c.model===ttsModel);
  if(cached?.audio){clips.push(cached);console.log(`${i+1}/${sentences.length}: reused ${voice.name}`);}
  else {
    const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=mp3_44100_128`,{
      method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({text:s.en,model_id:ttsModel,voice_settings:{stability:0.65,similarity_boost:0.75,style:0,use_speaker_boost:true}}),signal:AbortSignal.timeout(90000)
    });
    if(!response.ok){const err=await response.json().catch(()=>({}));throw Error(`ElevenLabs HTTP ${response.status}: ${err.detail?.status??'generation_failed'}. No automatic retry was made.`);}
    bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length<1000||!(response.headers.get('content-type')??'').includes('audio'))throw Error('The API did not return a usable audio file.');
    clips.push({text:s.en,voice:voice.name,model:ttsModel,audio:`data:audio/mpeg;base64,${bytes.toString('base64')}`});
  }
  await writeFile(target,JSON.stringify({format:'sentence-garden-audio',version:1,voice:`${ttsVoices.map(v=>v.name).join(' / ')} · British English`,clips},null,2)+'\n');
  console.log(`${i+1}/${sentences.length}: ${voice.name} ready`);
}
console.log(`Saved: ${target}`);
