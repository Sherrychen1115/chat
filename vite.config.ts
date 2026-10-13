import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 的專案網站網址是「帳號.github.io/chat/」,
// 所以正式建置時要告訴 Vite 網站放在 /chat/ 底下,否則找不到自己的 JS 和 CSS。
// 本機開發(npm run dev)維持根目錄;建置和 npm run preview(預覽建置結果)都要用 /chat/,
// 這樣預覽看到的才會和 GitHub Pages 上一樣。若 repo 改名,這裡的 /chat/ 也要一起改。
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/chat/' : '/',
  plugins: [react()],
}))
