import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  logLevel: 'info',
  base: './',
  cacheDir: path.join(root, 'node_modules/.vite-reviews'),
  publicDir: false,
  plugins: [tailwindcss()],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react'
  },
  resolve: {
    alias: {
      'lucide-react': path.join(root, 'src/lib/lucide-reviews.js')
    }
  },
  build: {
    outDir: 'dist-reviews',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    minify: 'esbuild',
    reportCompressedSize: false,
    rollupOptions: {
      input: path.join(root, 'reviews.html')
    }
  }
});
