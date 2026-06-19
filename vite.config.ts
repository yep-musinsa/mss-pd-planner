import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/cbd-pd-planner/',
  plugins: [react()],
  server: {
    proxy: {
      '/jira-api': {
        target: 'https://musinsa-oneteam.atlassian.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/jira-api/, ''),
        headers: { 'X-Atlassian-Token': 'no-check' },
        secure: false, // 사내 인증서 무시 옵션
      },
    },
  },
})
