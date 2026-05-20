import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
    return {
      base: './',
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
