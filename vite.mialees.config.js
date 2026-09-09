import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  logLevel: 'info',
  cacheDir: path.join(root, 'node_modules/.vite-mialees'),
  plugins: [
    tailwindcss()
  ],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react'
  },
  resolve: {
    alias: {
      'lucide-react': path.join(root, 'src/lib/lucide-mialees.js')
    }
  },
  build: {
    outDir: 'dist-mialees',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    minify: 'esbuild',
    reportCompressedSize: false,
    rollupOptions: {
      input: path.join(root, 'mialees.html')
    }
  }
});
