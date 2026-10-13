# 匿名聊天室

一個不用登入的匿名聊天室,前端放在 GitHub Pages,即時傳訊用 Supabase。

- 開始任何工作前,先讀 `docs/architecture.md`。
- 做畫面或前端前,也要讀 `docs/design.md`(畫面設計結果:顏色、尺寸、元件規格)。
- 目前在「階段一」:只做前端,通訊層用假的 `MockChatService`,還不接 Supabase。
- 不可以把金鑰檔案 commit 進 git(`.env`、`.env.local` 等所有 `.env*`,只有 `.env.example` 可以 commit)。Secret key 和資料庫密碼不可以出現在 repo 的任何地方。
