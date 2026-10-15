import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/mss-pd-planner/',
  plugins: [react()],
  server: {
    proxy: {
      // 팀 공용 데이터·로그인은 배포된 Worker를 그대로 사용
      '/jira-proxy': {
        target: 'https://jira-proxy.ye-park.workers.dev',
        changeOrigin: true,
      },
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
