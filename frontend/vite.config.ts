import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * 生产构建必须显式配置 VITE_API_BASE（P0-CONFIG · 后端地址单一真源）
 * ---------------------------------------------------------------------------
 * 背景：后端地址的默认值历史上写在两处（main.tsx 的 fallback +
 * deploy.yml 的 `vars.VITE_API_BASE || 'https://clair-api.pages.dev'`），
 * 漏改任一处都不报错，只会静默指向错误的后端——而后端换域名/换平台
 * 恰恰是最容易漏改的场景。
 *
 * 为什么守卫放在这里，而不放main.tsx：
 *   曾尝试在 main.tsx 里用「顶层 throw」让构建失败，**实测无效**——
 *   Vite 8（rolldown）构建期不执行模块顶层代码，throw 会被原样留在产物里，
 *   构建照样 exit 0。
 *   后来改成「缺失分支里 import 一个不存在的模块」，构建期确实会失败，
 *   但 **dev server 会白屏**：`vite dev` 的 import-analysis 会静态解析
 *   所有 import 语句（dev 不做 DCE / 常量折叠），于是 /src/main.tsx 直接 500。
 *   即「build 通过≠ dev 能跑」，这种技巧过于脆弱。
 *   配置层校验没有这个问题：dev 不校验、build 才校验，两者行为彻底分离。
 *
 * 判定依据是 `command`（build / serve），**不是** `import.meta.env`——
 * 后者在配置文件里拿不到（那是浏览器侧的产物）。
 *
 * @param command vite 的启动命令：'build' | 'serve'
 * @param mode    当前的vite mode（如 'github' / 'production' / 'development'）
 */
function requireApiBasePlugin(command: string, mode: string): Plugin {
  // 只在生产构建时校验；serve（vite dev）永不阻断本地开发
  const isBuild = command === 'build'
  // mode 为 development 时同样视为本地构建（vite build --mode development），
  // 那种场景也不该强制要求线上后端地址
  const isLocalMode = mode === 'development'

  // ⚠️ 必须用 loadEnv 而非只看 process.env：
  // VITE_API_BASE 既可能来自 shell / CI 环境变量，也可能写在 frontend/.env 里。
  // 若只看 process.env，开发者在 .env 中配好后本地构建仍会被判为「漏配」而失败。
  const fileEnv = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    name: 'clair-require-api-base',
    // buildStart 早于任何模块转换，报错能直接出现在 CI 日志开头
    buildStart() {
      if (!isBuild || isLocalMode) return

      const value = (process.env.VITE_API_BASE ?? fileEnv.VITE_API_BASE)?.trim()
      if (value) return

      // 说明为何不能「顺手给个默认值」——那正是这次要根治的病根
      throw new Error(
        [
          '[config] 生产构建缺少 VITE_API_BASE，已中止。',
          '',
          '  线上前端必须显式指定后端地址，不要依赖代码里的默认兜底：',
          '  默认值写在多处时，任何一处漏改都不会报错，只会静默指向错误后端。',
          '',
          '  注入方式（任选其一）：',
          '    · GitHub Actions：在仓库 Settings → Actions → Variables 配置 VITE_API_BASE',
          '    · 本地/自建：构建前 export VITE_API_BASE=https://<你的后端域名>',
          '    · 本地文件：在 frontend/.env 中写 VITE_API_BASE=https://<你的后端域名>',
          '',
          '  注意：dev（vite dev）不校验，本地开发照常走 vite proxy 到 127.0.0.1:3001。',
          '  变量清单与缺失后果见仓库根目录 .env.example。',
        ].join('\n'),
      )
    },
  }
}

export default defineConfig(({ mode, command }) => ({
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
    // 生产构建缺 VITE_API_BASE 即失败；dev 不校验（见上方注释）
    requireApiBasePlugin(command, mode),
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
        // LLM 网关超时 30s + 重试，代理必须留足余量避免掐断慢请求
        timeout: 60000,
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
            if (id.includes('dayjs')) {
              return 'vendor-dayjs';
            }
            if (id.includes('axios') || id.includes('zustand')) {
              return 'vendor-utils';
            }
            if (id.includes('reactflow')) {
              return 'vendor-reactflow';
            }
            if (id.includes('xlsx')) {
              return 'vendor-xlsx';
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
