import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState } from '../src/engine.ts';

// Only this local script reads the key. Never use a VITE_ prefix for credentials.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args=process.argv.slice(2), demo=args.includes('--demo');
const option=(name)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const input=option('--input'),output=option('--output');
if(!demo&&(!input||!output))throw Error('Usage: node scripts/generate-audio.mjs --input /absolute/records.json --output /absolute/audio-pack.json');
if(!process.env.ELEVENLABS_API_KEY)throw Error('Set ELEVENLABS_API_KEY in the local environment. Do not put it in frontend configuration.');
const state=demo?initialState():JSON.parse(await readFile(resolve(input),'utf8'));
const sentences=[...new Map(state.decks.flatMap(d=>d.sentences).map(s=>[s.en,s])).values()];
if(!sentences.length||sentences.some(s=>typeof s.en!=='string'||!s.en.trim()||s.en.length>600))throw Error('Expected a Sentence Garden export with valid English sentences.');
const voice='JBFqnCBsd6RMkjVDRZzb'; // George, the British voice in the official ElevenLabs quickstart.
const destination=demo?resolve(root,'public/audio'):dirname(resolve(output));
await mkdir(destination,{recursive:true});
const target=demo?resolve(root,'src/demo-audio.json'):resolve(output);
let previous;
try{previous=JSON.parse(await readFile(target,'utf8'));}catch{/* First generation. */}
const clips=[];
const manifest={};
console.log(`Preparing ${sentences.length} sentences (${sentences.reduce((n,s)=>n+s.en.length,0)} characters), voice George / eleven_multilingual_v2.`);
for(const [i,s] of sentences.entries()){
  const name=demo?`${s.id}.mp3`:null;
  let bytes;
  if(demo&&previous?.[s.en]){try{bytes=await readFile(resolve(root,'public',previous[s.en]));}catch{/* Regenerate a missing asset. */}}
  if(!demo){const cached=previous?.clips?.find(c=>c.text===s.en);if(cached?.audio){clips.push(cached);console.log(`${i+1}/${sentences.length}: reused`);continue;}}
  if(!bytes){
    const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,{
      method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({text:s.en,model_id:'eleven_multilingual_v2',voice_settings:{stability:0.65,similarity_boost:0.75,style:0,use_speaker_boost:true}}),signal:AbortSignal.timeout(90000)
    });
    if(!response.ok){const err=await response.json().catch(()=>({}));throw Error(`ElevenLabs HTTP ${response.status}: ${err.detail?.status??'generation_failed'}. No automatic retry was made.`);}
    bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length<1000||!(response.headers.get('content-type')??'').includes('audio'))throw Error('The API did not return a usable audio file.');
  }
  if(demo){await writeFile(resolve(destination,name),bytes);manifest[s.en]=`audio/${name}`;await writeFile(target,JSON.stringify({...previous,...manifest},null,2)+'\n');}
  else {clips.push({text:s.en,audio:`data:audio/mpeg;base64,${bytes.toString('base64')}`});await writeFile(target,JSON.stringify({format:'sentence-garden-audio',version:1,voice:'George · British English',clips},null,2)+'\n');}
  console.log(`${i+1}/${sentences.length}: ready (${bytes.length} bytes)`);
}
console.log(`Saved: ${target}`);
