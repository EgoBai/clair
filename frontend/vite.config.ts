import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        // 超时时间
        timeout: 15000,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
      },
    },
  },
  build: {
    // 代码分割
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-antd': ['antd', '@ant-design/icons'],
          'vendor-charts': ['echarts', 'echarts-for-react'],
          'vendor-utils': ['axios', 'dayjs', 'zustand'],
        },
      },
    },
    // 压缩
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,  // 生产环境去掉console
        drop_debugger: true,
      },
    },
    // sourcemap
    sourcemap: false,
    // chunk 大小警告阈值
    chunkSizeWarningLimit: 1000,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
