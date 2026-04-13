import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'SKAUS',
      // Use a function so Vite doesn't append ".iife" to the filename
      fileName: (_format) => 'skaus-widget.js',
      formats: ['iife'],
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
        // Inline everything — no external chunks
        inlineDynamicImports: true,
      },
    },
    // Target < 10KB: minify aggressively
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        passes: 3,
        pure_funcs: [],
        unsafe: true,
        unsafe_arrows: true,
      },
      mangle: {
        toplevel: true,
      },
      format: {
        comments: false,
      },
    },
    target: 'es2022',
    sourcemap: false,
    outDir: 'dist',
    emptyOutDir: true,
  },
});
