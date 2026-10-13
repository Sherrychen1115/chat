# 匿名聊天室

不用登入的匿名聊天室。前端放在 GitHub Pages,階段二用 Supabase 做即時傳訊。

開始工作前請先讀 `docs/architecture.md`(架構)和 `docs/design.md`(畫面設計)。目前在**階段一**:只有前端,通訊層是假的(`MockChatService`),不連 Supabase。

## 在自己的電腦上跑

```
npm install        # 第一次才需要
npm run dev        # 開發用,改程式會自動更新,網址 http://localhost:5173/
```

要確認 GitHub Pages 上會是什麼樣子,用正式建置的版本預覽:

```
npm run build      # 建置,會同時檢查型別錯誤
npm run preview    # 網址 http://localhost:4173/chat/
```

## 展示開關

網址後面加 `?demo=1`,畫面左上角會出現「展示開關」,可以模擬斷線、恢復連線、代號被別人拿走、讓機器人說話。階段二會移除。

## 發佈

推到 `main` 分支後,`.github/workflows/deploy.yml` 會自動建置並發佈到 GitHub Pages。第一次要到 repo 的 Settings > Pages,把來源(Source)選成「GitHub Actions」。詳見 `docs/architecture.md` 第 12 節。

## 金鑰

階段一不需要任何金鑰。階段二的規則見 `docs/architecture.md` 第 8 節:`.env*` 不能 commit,只有 `.env.example` 可以。
