import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  logLevel: 'info',
  cacheDir: path.join(root, 'node_modules/.vite-guest'),
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react'
  },
  resolve: {
    alias: {
      'lucide-react': path.join(root, 'src/lib/lucide-guest.js')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    minify: 'esbuild',
    reportCompressedSize: false,
    rollupOptions: {
      input: {
        guest: path.join(root, 'guest.html'),
        desk: path.join(root, 'desk.html')
      }
    }
  }
});
