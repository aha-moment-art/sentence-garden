// Local-only conversion of the complete listening tracks. Transcripts stay outside the repository.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, renameSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { ttsModel, voiceForText } from '../src/tts-voices.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 24);
const manifestPath = resolve(root, 'src/generated-tracks.json');
const manifest = existsSync(manifestPath) ? read(manifestPath) : {};
const tracks = new Map();
for (const collection of read(resolve(root, 'public/library/index.json')).collections) {
  for (const track of read(resolve(root, 'public', collection.file)).tracks) tracks.set(track.url, track);
}
const valid = url => {
  const entry = manifest[url];
  return entry?.model === ttsModel && entry?.transcriptHash && entry?.file
    && existsSync(resolve(root, 'public', entry.file)) && statSync(resolve(root, 'public', entry.file)).size > 1000;
};
const pending = [...tracks.values()].filter(t => !valid(t.url));
console.log(JSON.stringify({ total: tracks.size, cached: tracks.size - pending.length, pending: pending.length }));
if (process.argv.includes('--audit')) {
  if (pending.length) process.exitCode = 1;
} else {
  const cache = process.argv[process.argv.indexOf('--cache') + 1];
  if (!process.argv.includes('--cache') || !cache || !isAbsolute(cache) || cache.startsWith(root + '/'))
    throw Error('Provide --cache /absolute/path/outside-repository for private transcription intermediates.');
  if (!process.env.ELEVENLABS_API_KEY) throw Error('ELEVENLABS_API_KEY is missing.');
  mkdirSync(cache, { recursive: true });
  mkdirSync(resolve(root, 'public/audio/tracks'), { recursive: true });
  const headers = { 'xi-api-key': process.env.ELEVENLABS_API_KEY };
  const checked = async response => {
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw Error(`HTTP ${response.status}: ${error.detail?.status ?? error.detail?.code ?? 'generation_failed'}`);
    }
    return response;
  };
  for (const [i, track] of pending.entries()) {
    const transcriptPath = resolve(cache, `${hash(track.url)}.json`);
    let transcript;
    if (existsSync(transcriptPath)) transcript = read(transcriptPath);
    else {
      const body = new FormData();
      body.set('model_id', 'scribe_v2');
      body.set('cloud_storage_url', track.url);
      body.set('language_code', 'eng');
      body.set('tag_audio_events', 'false');
      const response = await checked(await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST', headers, body, signal: AbortSignal.timeout(180000),
      }));
      transcript = await response.json();
      if (!transcript.text?.trim()) throw Error('Empty transcript; stopped without generating.');
      writeFileSync(transcriptPath, JSON.stringify(transcript));
    }
    // Do not truncate a track or replace it with a summary.
    if (transcript.text.length > 10000) throw Error(`Track exceeds one-request limit: ${track.title}; split and verify before continuing.`);
    const voice = voiceForText(track.url);
    const response = await checked(await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: transcript.text, model_id: ttsModel, voice_settings: { stability: 0.65, similarity_boost: 0.75, style: 0, use_speaker_boost: true } }),
      signal: AbortSignal.timeout(180000),
    }));
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.headers.get('content-type')?.includes('audio') || bytes.length < 1000) throw Error('Invalid audio response');
    const file = `audio/tracks/${hash(`${ttsModel}:${voice.id}:${transcript.text}`)}.mp3`;
    writeFileSync(resolve(root, 'public', file), bytes);
    manifest[track.url] = { file, voice: voice.name, voiceId: voice.id, model: ttsModel, transcriptHash: hash(transcript.text) };
    writeFileSync(`${manifestPath}.tmp`, JSON.stringify(manifest) + '\n');
    renameSync(`${manifestPath}.tmp`, manifestPath);
    console.log(`${i + 1}/${pending.length} complete tracks generated`);
  }
}
