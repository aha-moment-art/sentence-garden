import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const audioBase = process.env.VITE_AUDIO_BASE_URL;
export default defineConfig({
  plugins: [react(), ...(audioBase ? [{
    name: 'public-files-with-external-audio',
    closeBundle() {
      for (const name of readdirSync(resolve('public'))) {
        if (name !== 'audio') cpSync(resolve('public', name), resolve('dist', name), {recursive:true});
      }
    },
  }] : [])],
  publicDir: audioBase ? false : 'public',
  define: { __AUDIO_BASE_URL__: JSON.stringify(audioBase || '') },
  base: './',
});
