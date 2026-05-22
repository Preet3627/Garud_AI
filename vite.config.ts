import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
    return {
      base: './',
      plugins: [
        viteStaticCopy({
          targets: [
            { src: 'node_modules/piper-tts-web/dist/onnx', dest: '.' },
            { src: 'node_modules/piper-tts-web/dist/piper', dest: '.' },
            { src: 'node_modules/piper-tts-web/dist/worker', dest: '.' },
          ],
        }),
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.APP_VERSION': JSON.stringify(pkg.version)
      },
      resolve: {
        alias: {
          '@': fileURLToPath(new URL('.', import.meta.url))
        }
      }
    };
});
