import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  logLevel: 'info',
  base: './',
  cacheDir: path.join(root, 'node_modules/.vite-landing'),
  publicDir: false,
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react'
  },
  resolve: {
    alias: {
      'lucide-react': path.join(root, 'src/lib/lucide-landing.js')
    }
  },
  build: {
    outDir: 'dist-landing',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    minify: 'esbuild',
    reportCompressedSize: false,
    rollupOptions: {
      input: path.join(root, 'landing.html')
    }
  }
});
