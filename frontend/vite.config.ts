import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => ({
  base: mode === 'github' ? '/clair/' : '/',
  plugins: [
    {
      name: 'echarts-tree-shaking',
      resolveId(id) {
        if (id === 'echarts') {
          return path.resolve(__dirname, 'src/utils/echarts.ts');
        }
        return null;
      },
    },
    react(),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
      '@': path.resolve(__dirname, 'src'),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        timeout: 15000,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react/') || id.includes('react-dom/') || id.includes('react-router')) {
              return 'vendor-react';
            }
            if (id.includes('@ant-design/icons')) {
              return 'vendor-antd-icons';
            }
            if (id.includes('antd/') || id.includes('antd')) {
              return 'vendor-antd';
            }
            // recharts must come before echarts (recharts contains 'echarts' substring)
            if (id.includes('recharts')) {
              return 'vendor-recharts';
            }
            if (id.includes('echarts') && !id.includes('echarts-for-react')) {
              return 'vendor-echarts';
            }
            if (id.includes('axios') || id.includes('dayjs') || id.includes('zustand')) {
              return 'vendor-utils';
            }
            return 'vendor-misc';
          }
        },
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info'],
      },
    },
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    cssCodeSplit: true,
    modulePreload: {
      polyfill: true,
    },
    reportCompressedSize: true,
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'echarts-for-react',
      'axios',
      'dayjs',
      'zustand',
    ],
    exclude: [],
  },
  css: {
    preprocessorOptions: {},
    devSourcemap: true,
  },
}))
