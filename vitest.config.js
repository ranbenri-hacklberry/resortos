import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /.*\/pipeline(\.js)?$/,
        replacement: path.resolve(__dirname, 'services/resortos-agent/src/mockPipeline.js')
      },
      {
        find: '@whiskeysockets/baileys',
        replacement: path.resolve(__dirname, 'services/resortos-agent/src/whatsapp/mockBaileys.js')
      },
      {
        find: 'qrcode-terminal',
        replacement: path.resolve(__dirname, 'services/resortos-agent/src/whatsapp/mockQrcodeTerminal.js')
      }
    ]
  },
  test: {
    include: ['src/**/*.test.js'],
    exclude: ['**/node_modules/**', 'services/**'],
    environment: 'node'
  }
});
