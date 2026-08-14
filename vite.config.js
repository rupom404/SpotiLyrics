import { defineConfig } from 'vite';
import { resolve } from 'path';

// Plugin to sanitize all non-ASCII / noncharacter sequences for Chromium
const asciiSanitizer = () => ({
  name: 'ascii-sanitizer',
  generateBundle(options, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type === 'chunk') {
        file.code = file.code.replace(/[^\x00-\x7F]/g, (char) =>
          '\\u' + ('0000' + char.charCodeAt(0).toString(16)).slice(-4)
        );
      }
    }
  }
});

export default defineConfig({
  plugins: [asciiSanitizer()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content.js'),
      },
      output: {
        entryFileNames: '[name].bundle.js',
        format: 'iife'
      }
    }
  }
});