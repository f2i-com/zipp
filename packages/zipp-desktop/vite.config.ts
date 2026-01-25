import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', '@xyflow/react'],
    alias: {
      // Force all react imports to use the same instance
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      // Resolve zipp packages
      'zipp-ui-components': path.resolve(__dirname, '../zipp-ui-components/src'),
      'zipp-core': path.resolve(__dirname, '../zipp-core'),
      // Resolve monaco editor
      '@monaco-editor/react': path.resolve(__dirname, 'node_modules/@monaco-editor/react'),
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Code splitting - separate large dependencies into their own chunks
        manualChunks: {
          // Monaco editor is huge - load separately
          'monaco': ['@monaco-editor/react'],
          // Flow diagram library
          'xyflow': ['@xyflow/react', 'dagre'],
          // React core (usually cached)
          'react-vendor': ['react', 'react-dom'],
          // esbuild wasm (for plugin compilation)
          'esbuild': ['esbuild-wasm'],
        }
      }
    },
    // Increase chunk size warning limit since we're intentionally creating large chunks
    chunkSizeWarningLimit: 600,
  }
})
