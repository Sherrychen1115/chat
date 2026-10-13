# 匿名聊天室

不用登入的匿名聊天室。前端放在 GitHub Pages,階段二用 Supabase 做即時傳訊。

開始工作前請先讀 `docs/architecture.md`(架構)和 `docs/design.md`(畫面設計)。目前在**階段二**:前端已接上 Supabase(`SupabaseChatService`)。

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

## 發佈

推到 `main` 分支後,`.github/workflows/deploy.yml` 會自動建置並發佈到 GitHub Pages。第一次要到 repo 的 Settings > Pages,把來源(Source)選成「GitHub Actions」。詳見 `docs/architecture.md` 第 12 節。

## 金鑰

要先建立 `.env.local`(複製 `.env.example`),填入 Supabase 的專案網址和 Publishable key,不然聊天室會顯示「缺少 Supabase 設定」。規則見 `docs/architecture.md` 第 8 節:`.env*` 不能 commit,只有 `.env.example` 可以;Secret key 和資料庫密碼絕對不能放進來。

## 資料庫

不用 Supabase CLI。`supabase/migrations/` 裡的 SQL 檔,依檔名順序貼到 Supabase 後台的 SQL Editor 執行即可。可以重複執行。

## 新增功能

`docs/requirements.md` 沒有寫,但已經做好的功能:

| 功能 | 等級 | 說明 | 檔案 |
|---|---|---|---|
| 資料庫端限速 | C | 同一個人 3 秒內最多 5 則,超過由資料庫直接拒絕(`rate_limited`),繞過網頁也擋得住。前端另有一份同樣的限速,只是為了馬上提示使用者。 | `supabase/migrations/20261013000000_chat.sql` 的 `send_message`;前端 `src/lib/rateLimit.ts` |
| 伺服器端字元過濾與保留字 | C | 資料庫會自己清掉代號和訊息裡的不可見字元、控制字元、會讓排版方向反過來的字元,把長得像空白的字元換成一般空白;代號不分大小寫比對,並拒絕「系統」「system」這類保留字。 | `supabase/migrations/20261013000000_chat.sql` 的 `claim_nickname`、`send_message`;前端同樣的規則在 `src/lib/text.ts` |
| 分頁標題未讀數 | A | 切到別的分頁時有新訊息,分頁標題會變成「(3) 匿名聊天室」;回到分頁後清掉。 | `src/hooks/useUnreadTitle.ts`、`src/hooks/useChat.ts` |
| 收到的訊息先檢查再顯示 | | 即時推來的和載入的歷史訊息,都先檢查欄位型別與長度,不合格就丟掉。 | `src/services/SupabaseChatService.ts` 的 `toMessage` |

細節見 `docs/architecture.md` 第 9 節。
