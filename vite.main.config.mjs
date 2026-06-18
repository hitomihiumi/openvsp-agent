import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'express',
        'cors',
        'ai',
        '@ai-sdk/google',
        '@ai-sdk-tool/parser',
        'child_process',
        'path',
        'fs',
        'os',
        'url',
        'electron',
        'electron-squirrel-startup',
        'dotenv',
      ],
    },
  },
});
