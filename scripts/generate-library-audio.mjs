// Local only. No credential or private learner material is written to the site.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { ttsModel, ttsVoices, voiceForText } from '../src/tts-voices.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const manifestPath = resolve(root, 'src/generated-audio.json');
const manifest = read('src/generated-audio.json');
const demo = read('src/demo-audio.json');
const requests = new Map();
const demoVoices = ['George', 'Alice', 'Lily', 'Daniel', 'George'];
for (const [[text, file], i] of Object.entries(demo).map((entry, i) => [entry, i])) {
  const voice = ttsVoices.find(v => v.name === demoVoices[i]);
  requests.set(text, { text, file, voice });
  // The first and last originals already used this exact voice and model.
  if (!manifest[text] && voice.name === 'George' && existsSync(resolve(root, 'public', file)))
    manifest[text] = { file, voice: voice.name, voiceId: voice.id, model: ttsModel };
}
for (const collection of read('public/library/index.json').collections) {
  for (const sentence of read(`public/${collection.file}`).sentences) {
    if (sentence.recordings?.some(r => r.text === sentence.en)) continue;
    const text = sentence.en;
    if (requests.has(text)) continue;
    const voice = voiceForText(text);
    const hash = createHash('sha256').update(`${ttsModel}:${voice.id}:${text}`).digest('hex').slice(0,24);
    requests.set(text, { text, voice, file: `audio/generated/${hash}.mp3` });
  }
}
const valid = (r) => {
  const entry = manifest[r.text];
  return entry?.voiceId === r.voice.id && entry?.model === ttsModel && entry?.file === r.file
    && existsSync(resolve(root, 'public', r.file)) && statSync(resolve(root, 'public', r.file)).size > 1000;
};
const pending = [...requests.values()].filter(r => !valid(r));
console.log(JSON.stringify({ total: requests.size, cached: requests.size - pending.length, pending: pending.length, characters: pending.reduce((n,r) => n+r.text.length,0), voices: Object.fromEntries(ttsVoices.map(v => [v.name, [...requests.values()].filter(r=>r.voice.id===v.id).length])) }));
if (process.argv.includes('--audit')) {
  if (pending.length) process.exitCode = 1;
} else {
  if (!process.env.ELEVENLABS_API_KEY) throw Error('ELEVENLABS_API_KEY is missing.');
  mkdirSync(resolve(root, 'public/audio/generated'), { recursive: true });
  let index = 0, completed = 0, failed = false;
  const save = () => {
    writeFileSync(`${manifestPath}.tmp`, JSON.stringify(manifest) + '\n');
    renameSync(`${manifestPath}.tmp`, manifestPath);
  };
  save();
  async function worker() {
    while (!failed && index < pending.length) {
      const item = pending[index++];
      try {
        const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${item.voice.id}?output_format=mp3_44100_128`, {
          method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: item.text, model_id: ttsModel, voice_settings: { stability: 0.65, similarity_boost: 0.75, style: 0, use_speaker_boost: true } }),
          signal: AbortSignal.timeout(90000),
        });
        if (!r.ok) {
          const error = await r.json().catch(()=>({}));
          throw Error(`HTTP ${r.status}: ${error.detail?.status ?? 'generation_failed'} ${error.detail?.message ?? ''}`);
        }
        const bytes = Buffer.from(await r.arrayBuffer());
        if (!r.headers.get('content-type')?.includes('audio') || bytes.length < 1000) throw Error('Invalid audio response');
        writeFileSync(resolve(root, 'public', item.file), bytes);
        manifest[item.text] = { file: item.file, voice: item.voice.name, voiceId: item.voice.id, model: ttsModel };
        save(); completed++;
        if (completed <= 4 || completed % 25 === 0) console.log(`${completed}/${pending.length} generated; latest voice ${item.voice.name}`);
      } catch (error) {
        failed = true;
        console.error(`Stopped without retry: ${error.message}`);
        process.exitCode = 1;
      }
    }
  }
  await Promise.all([worker(), worker()]);
  console.log(JSON.stringify({ completed, remaining: [...requests.values()].filter(r=>!valid(r)).length }));
}
