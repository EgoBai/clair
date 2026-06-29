import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => ({
  base: mode === 'github' ? '/clair/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
      '@': path.resolve(__dirname, 'src'),
    },
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
            // React核心
            if (id.includes('react/') || id.includes('react-dom/') || id.includes('react-router')) {
              return 'vendor-react';
            }
            // Ant Design
            if (id.includes('antd/') || id.includes('@ant-design/')) {
              return 'vendor-antd';
            }
            // ECharts
            if (id.includes('echarts')) {
              return 'vendor-echarts';
            }
            // Recharts
            if (id.includes('recharts')) {
              return 'vendor-recharts';
            }
            // 工具库
            if (id.includes('axios') || id.includes('dayjs') || id.includes('zustand')) {
              return 'vendor-utils';
            }
            // 其他第三方
            return 'vendor-misc';
          }
        },
        // 文件名带hash用于长期缓存
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
    // CSS代码分割
    cssCodeSplit: true,
    // 预加载模块
    modulePreload: {
      polyfill: true,
    },
    // 报告压缩详情
    reportCompressedSize: true,
  },
  // 预构建优化
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'antd',
      '@ant-design/icons',
      'echarts',
      'echarts-for-react',
      'axios',
      'dayjs',
      'zustand',
      'recharts',
    ],
    exclude: [],
  },
  // CSS预处理
  css: {
    preprocessorOptions: {},
    devSourcemap: true,
  },
}))
