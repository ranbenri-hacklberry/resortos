import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tailwindcss()],
  logLevel: 'info',
  cacheDir: path.join(root, 'node_modules/.vite-agents'),
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react'
  },
  build: {
    outDir: 'dist-agents',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      input: path.join(root, 'agents.html'),
      output: {
        entryFileNames: 'assets/agent-[name]-[hash].js',
        chunkFileNames: 'assets/agent-[name]-[hash].js',
        assetFileNames: 'assets/agent-[name]-[hash][extname]'
      }
    }
  }
});
